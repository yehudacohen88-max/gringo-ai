const { handleChannelPrivacy, resolvePrivacyLanguage } = require('../privacy/privacy-channel');
const privacyService = require('../privacy/privacy.service');
const privacyNotice = require('../privacy/privacy-notice');
const fs = require('fs');
const path = require('path');
const telegramClient = require('./telegram-client.service');
const telegramMessageService = require('./telegram-message.service');
const { communicationService } = require('../communication');
const { safeTelegramWarning } = require('./telegram-errors');
const { getUnsupportedPrivateChat, mapCallbackQuery, mapPrivateTextUpdate } = require('./telegram-message.mapper');

// TELEGRAM_STATE_FILE lets hosted deploys keep the duplicate guard on a persistent disk.
// A callback query id is unique for that query and is not a user id, so the
// persisted dedup key is only `cq:<callbackQueryId>`. Older files may still
// contain callbackQueryId:channelUserId:callbackData. Those are recognized in
// memory so a replay is still dropped, and the next save rewrites them to the
// query id alone. A missing WEB_SESSION_SECRET never causes a raw id to be
// written. lastProcessedUpdateId and processedUpdateIds are not user
// identifiers and are never cleared by erasure.
const CALLBACK_KEY_PREFIX = 'cq:';
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

function durableCallbackKey(callbackQueryId) {
  const id = String(callbackQueryId || '').trim();
  if (!id || id.includes(':')) return '';
  return `${CALLBACK_KEY_PREFIX}${id}`;
}

// Historical keys are `queryId:userId:data` or `queryId:hmac:data`. Keep the
// query id and drop everything after it. Anything else is discarded so a raw
// user id cannot be written back.
function migrateCallbackKey(stored) {
  const key = String(stored || '');
  if (key.startsWith(CALLBACK_KEY_PREFIX)) {
    const rest = key.slice(CALLBACK_KEY_PREFIX.length);
    return rest && !rest.includes(':') ? key : '';
  }
  const queryId = key.split(':')[0];
  if (!queryId || key.split(':').length < 3) return '';
  return durableCallbackKey(queryId);
}

function sanitizeCallbackKeys(keys) {
  const kept = [];
  for (const key of keys || []) {
    const next = migrateCallbackKey(key);
    if (next && !kept.includes(next)) kept.push(next);
  }
  return kept;
}

function normalizeState(state) {
  return {
    lastProcessedUpdateId: Number(state.lastProcessedUpdateId || 0),
    processedUpdateIds: [...new Set(state.processedUpdateIds || [])].slice(-200),
    processedCallbackKeys: sanitizeCallbackKeys(state.processedCallbackKeys).slice(-200),
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

function splitCallbackKey(stored) {
  const parts = String(stored).split(':');
  if (parts.length < 3 || !parts[0] || !parts[1]) return null;
  return {
    callbackQueryId: parts[0],
    channelUserId: parts[1],
    callbackData: parts.slice(2).join(':'),
  };
}

function legacyCallbackKey(callback = {}) {
  return [callback.callbackQueryId, callback.channelUserId, callback.callbackData].map(String).join(':');
}

function wasCallbackProcessed(callback = {}) {
  const state = readState();
  const keys = state.processedCallbackKeys || [];
  const durable = durableCallbackKey(callback.callbackQueryId);
  if (durable && keys.includes(durable)) return true;
  // Read-only match for a key that has not been migrated yet. This does not
  // write the raw id back; the next save stores only the query id.
  const queryId = String(callback.callbackQueryId || '').trim();
  if (!queryId) return false;
  return keys.some((key) => {
    const stored = String(key);
    return stored === legacyCallbackKey(callback) || stored.startsWith(`${queryId}:`);
  });
}

function markCallbackProcessed(callback = {}) {
  const next = durableCallbackKey(callback.callbackQueryId);
  if (!next) {
    console.error('[telegram] REFUSING to record a callback without a callback query id. A raw user id was not stored.');
    return false;
  }
  const state = readState();
  const keys = sanitizeCallbackKeys(state.processedCallbackKeys);
  if (!keys.includes(next)) keys.push(next);
  return writeState({ ...state, processedCallbackKeys: keys });
}

// Drop raw ids from callback keys. The query id stays, so a replay is still
// ignored. This does not need WEB_SESSION_SECRET: there is no HMAC fallback
// that could store the user id instead.
function anonymizeCallbackKeysForUsers(channelUserIds = []) {
  const ids = new Set(channelUserIds.map((id) => String(id || '').trim()).filter(Boolean));
  if (!ids.size) return { ok: true, rekeyed: 0 };
  const state = readState();
  const before = state.processedCallbackKeys || [];
  let rekeyed = 0;
  for (const key of before) {
    const parsed = splitCallbackKey(key);
    const mentionsSubject = parsed && ids.has(parsed.channelUserId);
    const migrated = migrateCallbackKey(key);
    if (mentionsSubject && migrated && migrated !== key) rekeyed += 1;
  }
  if (!rekeyed) return { ok: true, rekeyed: 0 };
  const snapshot = {
    lastProcessedUpdateId: memoryState.lastProcessedUpdateId,
    processedUpdateIds: [...(memoryState.processedUpdateIds || [])],
    processedCallbackKeys: [...before],
  };
  const saved = writeState(state);
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
    const resolution = await resolvePrivacyLanguage('telegram', {
      channelUserId: callback.channelUserId,
      languageCode: callback.languageCode,
      messageText: '',
    });
    const language = resolution.language;
    await communicationService.sendMessage({
      channel: 'telegram',
      to: callback.channelChatId,
      text: `${privacyNotice.reply(language, 'consentRequired')}\n\n${privacyNotice.channelNoticeText(language)}`,
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
