const { handleChannelPrivacy } = require('../privacy/privacy-channel');
const privacyService = require('../privacy/privacy.service');
const privacyNotice = require('../privacy/privacy-notice');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { env } = require('../../config/env');
const telegramClient = require('./telegram-client.service');
const telegramMessageService = require('./telegram-message.service');
const { communicationService } = require('../communication');
const { safeTelegramWarning } = require('./telegram-errors');
const { getUnsupportedPrivateChat, mapCallbackQuery, mapPrivateTextUpdate } = require('./telegram-message.mapper');

// TELEGRAM_STATE_FILE lets hosted deploys keep the duplicate guard on a persistent disk.
// Callback keys store an HMAC of the channel user id, not the raw id. Older
// files may still contain callbackQueryId:channelUserId:callbackData; lookups
// accept both forms so a replay is still dropped. Erasure rewrites only the
// subject's keys. lastProcessedUpdateId and processedUpdateIds are not user
// identifiers and are never cleared by erasure.
function statePath() {
  return process.env.TELEGRAM_STATE_FILE || path.join(process.cwd(), '.tools', 'telegram-state.json');
}

let memoryState = {
  lastProcessedUpdateId: 0,
  processedUpdateIds: [],
  processedCallbackKeys: [],
};

function readState() {
  try {
    const raw = fs.readFileSync(statePath(), 'utf8');
    memoryState = { ...memoryState, ...JSON.parse(raw) };
  } catch (error) {
    // Local state is optional. Memory state still prevents duplicates while running.
  }
  return memoryState;
}

function normalizeState(state) {
  return {
    lastProcessedUpdateId: Number(state.lastProcessedUpdateId || 0),
    processedUpdateIds: [...new Set(state.processedUpdateIds || [])].slice(-200),
    processedCallbackKeys: [...new Set(state.processedCallbackKeys || [])].slice(-200),
  };
}

function writeState(state) {
  memoryState = normalizeState(state);
  const file = statePath();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(memoryState, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, file);
    return true;
  } catch (error) {
    // Memory still blocks duplicates in this process. The caller that must
    // survive a restart treats a false return as a failed erasure.
    return false;
  }
}

function callbackUserTokenWith(secret, channelUserId) {
  return crypto.createHmac('sha256', secret).update(`telegram-callback:${channelUserId}`).digest('hex').slice(0, 24);
}

function callbackUserToken(channelUserId) {
  const secret = env.webSessionSecret;
  if (!secret) {
    const error = new Error('WEB_SESSION_SECRET is required to key Telegram callback dedup.');
    error.code = 'PRIVACY_KEY_UNAVAILABLE';
    throw error;
  }
  return callbackUserTokenWith(secret, channelUserId);
}

function splitCallbackKey(stored) {
  const parts = String(stored).split(':');
  if (parts.length < 3 || !parts[0] || !parts[1]) return null;
  return {
    callbackQueryId: parts[0],
    channelUserId: parts[1],
    callbackData: parts.slice(2).join(':'),
  };
}

function replaceBounded(text, needle, replacement) {
  const raw = String(text);
  const id = String(needle || '');
  if (id.length < 5 || !raw.includes(id)) return raw;
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return raw.replace(new RegExp(`(^|[^A-Za-z0-9_])${escaped}(?=$|[^A-Za-z0-9_])`, 'g'), `$1${replacement}`);
}

function callbackDataToken(callbackData, channelUserId, token) {
  return replaceBounded(callbackData, channelUserId, token);
}

function callbackKey(callback = {}) {
  const token = callbackUserToken(callback.channelUserId);
  const data = callbackDataToken(callback.callbackData, callback.channelUserId, token);
  return [callback.callbackQueryId, token, data].map(String).join(':');
}

function legacyCallbackKey(callback = {}) {
  return [callback.callbackQueryId, callback.channelUserId, callback.callbackData].map(String).join(':');
}

function wasCallbackProcessed(callback = {}) {
  const state = readState();
  const keys = state.processedCallbackKeys || [];
  let current = '';
  try {
    current = callbackKey(callback);
  } catch (error) {
    current = '';
  }
  if (current && keys.includes(current)) return true;
  if (keys.includes(legacyCallbackKey(callback))) return true;
  if (env.webSessionSecretPrevious && callback.channelUserId) {
    const previous = callbackUserTokenWith(env.webSessionSecretPrevious, callback.channelUserId);
    const data = callbackDataToken(callback.callbackData, callback.channelUserId, previous);
    if (keys.includes([callback.callbackQueryId, previous, data].map(String).join(':'))) return true;
  }
  return false;
}

function markCallbackProcessed(callback = {}) {
  const state = readState();
  let next = '';
  try {
    next = callbackKey(callback);
  } catch (error) {
    next = legacyCallbackKey(callback);
  }
  const legacy = legacyCallbackKey(callback);
  const keys = (state.processedCallbackKeys || []).filter((key) => key !== legacy && key !== next);
  writeState({
    ...state,
    processedCallbackKeys: [...keys, next],
  });
}

// Rewrite this subject's raw callback keys to the HMAC form and keep them,
// so a replay is still ignored and other users' keys stay as they are.
function anonymizeCallbackKeysForUsers(channelUserIds = []) {
  const ids = [...new Set(channelUserIds.map((id) => String(id || '').trim()).filter(Boolean))];
  if (!ids.length) return { ok: true, rekeyed: 0 };
  const tokens = new Map();
  try {
    for (const id of ids) {
      const current = callbackUserToken(id);
      tokens.set(id, current);
      if (env.webSessionSecretPrevious) tokens.set(callbackUserTokenWith(env.webSessionSecretPrevious, id), current);
    }
  } catch (error) {
    console.error('[telegram] REFUSING to anonymize callback keys without WEB_SESSION_SECRET. A known fallback key is not used.');
    return { ok: false, rekeyed: 0 };
  }
  const state = readState();
  const next = [];
  let rekeyed = 0;
  for (const key of state.processedCallbackKeys || []) {
    const parsed = splitCallbackKey(key);
    const token = parsed ? tokens.get(parsed.channelUserId) : '';
    if (!parsed || !token) {
      next.push(key);
      continue;
    }
    const rawId = ids.find((id) => id === parsed.channelUserId || tokens.get(id) === token || (env.webSessionSecretPrevious && callbackUserTokenWith(env.webSessionSecretPrevious, id) === parsed.channelUserId));
    let data = parsed.callbackData;
    if (rawId) {
      data = callbackDataToken(data, rawId, token);
      if (env.webSessionSecretPrevious) {
        const previous = callbackUserTokenWith(env.webSessionSecretPrevious, rawId);
        if (previous) data = replaceBounded(data, previous, token);
      }
    }
    const rewritten = [parsed.callbackQueryId, token, data].join(':');
    if (rewritten !== key) rekeyed += 1;
    if (!next.includes(rewritten)) next.push(rewritten);
  }
  if (!rekeyed) return { ok: true, rekeyed: 0 };
  const snapshot = {
    lastProcessedUpdateId: memoryState.lastProcessedUpdateId,
    processedUpdateIds: [...(memoryState.processedUpdateIds || [])],
    processedCallbackKeys: [...(memoryState.processedCallbackKeys || [])],
  };
  const saved = writeState({ ...state, processedCallbackKeys: next });
  if (!saved) {
    memoryState = snapshot;
    return { ok: false, rekeyed: 0 };
  }
  return { ok: true, rekeyed };
}

function forgetMemoryForTests() {
  memoryState = {
    lastProcessedUpdateId: 0,
    processedUpdateIds: [],
    processedCallbackKeys: [],
  };
}

function markProcessed(updateId) {
  const state = readState();
  const numericUpdateId = Number(updateId || 0);
  if (!numericUpdateId) return;
  writeState({
    ...state,
    lastProcessedUpdateId: Math.max(Number(state.lastProcessedUpdateId || 0), numericUpdateId),
    processedUpdateIds: [...(state.processedUpdateIds || []), numericUpdateId],
  });
}

function wasProcessed(updateId) {
  const state = readState();
  const numericUpdateId = Number(updateId || 0);
  return numericUpdateId <= Number(state.lastProcessedUpdateId || 0) || (state.processedUpdateIds || []).includes(numericUpdateId);
}

function getOffset() {
  const state = readState();
  return Number(state.lastProcessedUpdateId || 0) + 1;
}

async function sendConsentNotice(callback = {}) {
  if (!callback.channelChatId) return;
  try {
    await communicationService.sendMessage({
      channel: 'telegram',
      to: callback.channelChatId,
      text: `${privacyNotice.reply(callback.languageCode, 'consentRequired')}\n\n${privacyNotice.channelNoticeText(callback.languageCode)}`,
    });
  } catch (error) {
    safeTelegramWarning('Telegram delivery failed for the consent notice.');
  }
}

async function processUpdate(update = {}) {
  if (wasProcessed(update.update_id)) {
    return { processed: false, duplicate: true, updateId: update.update_id };
  }

  const callback = mapCallbackQuery(update);
  const mapped = mapPrivateTextUpdate(update);
  const unsupported = getUnsupportedPrivateChat(update);

  try {
    if (callback) {
      const adaptedCallback = communicationService.receiveMessage('telegram', callback);
      if (!(await privacyService.allowsPersonalProcessing({ channel: 'telegram', channelUserId: adaptedCallback.channelUserId }))) {
        await sendConsentNotice(adaptedCallback);
        markCallbackProcessed(callback);
        markProcessed(callback.updateId);
        return { processed: true, updateId: callback.updateId, type: 'callback', consentRequired: true };
      }
      const result = await telegramMessageService.processCallback(adaptedCallback, {
        duplicate: wasCallbackProcessed(callback),
      });
      if (!result.duplicate) markCallbackProcessed(callback);
      markProcessed(callback.updateId);
      return { processed: true, updateId: callback.updateId, type: 'callback', duplicate: Boolean(result.duplicate) };
    }

    if (mapped) {
      const adaptedMessage = communicationService.receiveMessage('telegram', mapped);
      // Consent and privacy commands run first. Without consent nothing personal is stored.
      const privacyResult = await handleChannelPrivacy('telegram', adaptedMessage);
      const result = privacyResult || (await telegramMessageService.processTelegramMessage(adaptedMessage));
      try {
        await communicationService.sendInteractiveMessage({
          channel: 'telegram',
          to: adaptedMessage.channelChatId,
          text: result.reply,
          options: { replyMarkup: result.replyMarkup },
        });
        if (!result.privacy) await telegramMessageService.recordDeliveryStatus(adaptedMessage, result.user?.userId, result.reply, result.status || 'TELEGRAM_DELIVERED', 'delivered');
      } catch (deliveryError) {
        if (!result.privacy) await telegramMessageService.recordDeliveryStatus(adaptedMessage, result.user?.userId, result.reply, 'TELEGRAM_DELIVERY_FAILED', 'failed');
        safeTelegramWarning('Telegram delivery failed for one reply.');
      }
      markProcessed(mapped.updateId);
      return { processed: true, updateId: mapped.updateId, type: 'text' };
    }

    if (unsupported?.channelChatId) {
      const adaptedUnsupported = communicationService.receiveMessage('telegram', unsupported);
      try {
        await communicationService.sendMessage({
          channel: 'telegram',
          to: adaptedUnsupported.channelChatId,
          text: 'I can currently read text messages only.',
        });
      } catch (deliveryError) {
        safeTelegramWarning('Telegram delivery failed for unsupported-content reply.');
      }
      markProcessed(unsupported.updateId);
      return { processed: true, updateId: unsupported.updateId, type: 'unsupported' };
    }

    markProcessed(update.update_id);
    return { processed: false, ignored: true, updateId: update.update_id };
  } catch (error) {
    safeTelegramWarning('Core Agent failed while processing one Telegram update.');
    if (mapped?.channelChatId) {
      try {
        await communicationService.sendMessage({
          channel: 'telegram',
          to: mapped.channelChatId,
          text: 'Sorry, Gringo had a temporary problem. Please try again soon.',
        });
      } catch (deliveryError) {
        safeTelegramWarning('Telegram delivery failed for safe error reply.');
      }
      const consented = await privacyService
        .allowsPersonalProcessing({ channel: 'telegram', channelUserId: mapped.channelUserId })
        .catch(() => false);
      if (consented) await telegramMessageService.recordDeliveryStatus(
        mapped,
        mapped.channelUserId,
        'Sorry, Gringo had a temporary problem. Please try again soon.',
        'TELEGRAM_CORE_ERROR',
        'failed'
      );
      markProcessed(mapped.updateId);
      return { processed: true, updateId: mapped.updateId, type: 'error' };
    }
    markProcessed(update.update_id);
    return { processed: false, ignored: true, updateId: update.update_id };
  }
}

async function processUpdates(updates = []) {
  const ordered = [...updates].sort((a, b) => Number(a.update_id || 0) - Number(b.update_id || 0));
  const results = [];
  for (const update of ordered) {
    results.push(await processUpdate(update));
  }
  return results;
}

async function pollOnce() {
  const updates = await telegramClient.getUpdates(getOffset());
  return processUpdates(updates || []);
}

async function startPolling() {
  return telegramClient.startPolling(pollOnce);
}

function stopPolling() {
  return telegramClient.stopPolling();
}

function getStatus() {
  return {
    ...telegramClient.getPollingStatus(),
    lastProcessedUpdateId: readState().lastProcessedUpdateId,
  };
}

module.exports = {
  anonymizeCallbackKeysForUsers,
  forgetMemoryForTests,
  getOffset,
  getStatus,
  markCallbackProcessed,
  pollOnce,
  processUpdate,
  processUpdates,
  readState,
  startPolling,
  stopPolling,
  wasCallbackProcessed,
};
