const fs = require('fs');
const path = require('path');
const telegramClient = require('./telegram-client.service');
const telegramMessageService = require('./telegram-message.service');
const { communicationService } = require('../communication');
const { safeTelegramWarning } = require('./telegram-errors');
const { getUnsupportedPrivateChat, mapCallbackQuery, mapPrivateTextUpdate } = require('./telegram-message.mapper');

const STATE_FILE = path.join(process.cwd(), '.tools', 'telegram-state.json');

let memoryState = {
  lastProcessedUpdateId: 0,
  processedUpdateIds: [],
  processedCallbackKeys: [],
};

function readState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    memoryState = { ...memoryState, ...JSON.parse(raw) };
  } catch (error) {
    // Local state is optional. Memory state still prevents duplicates while running.
  }
  return memoryState;
}

function writeState(state) {
  memoryState = {
    lastProcessedUpdateId: Number(state.lastProcessedUpdateId || 0),
    processedUpdateIds: [...new Set(state.processedUpdateIds || [])].slice(-200),
    processedCallbackKeys: [...new Set(state.processedCallbackKeys || [])].slice(-200),
  };
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(memoryState, null, 2));
  } catch (error) {
    // Keep Telegram connector running even if local state cannot be written.
  }
}

function callbackKey(callback = {}) {
  return [callback.callbackQueryId, callback.channelUserId, callback.callbackData].map(String).join(':');
}

function wasCallbackProcessed(callback = {}) {
  const state = readState();
  return (state.processedCallbackKeys || []).includes(callbackKey(callback));
}

function markCallbackProcessed(callback = {}) {
  const state = readState();
  writeState({
    ...state,
    processedCallbackKeys: [...(state.processedCallbackKeys || []), callbackKey(callback)],
  });
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
      const result = await telegramMessageService.processCallback(adaptedCallback, {
        duplicate: wasCallbackProcessed(callback),
      });
      if (!result.duplicate) markCallbackProcessed(callback);
      markProcessed(callback.updateId);
      return { processed: true, updateId: callback.updateId, type: 'callback', duplicate: Boolean(result.duplicate) };
    }

    if (mapped) {
      const adaptedMessage = communicationService.receiveMessage('telegram', mapped);
      const result = await telegramMessageService.processTelegramMessage(adaptedMessage);
      try {
        await communicationService.sendInteractiveMessage({
          channel: 'telegram',
          to: adaptedMessage.channelChatId,
          text: result.reply,
          options: { replyMarkup: result.replyMarkup },
        });
        await telegramMessageService.recordDeliveryStatus(adaptedMessage, result.user?.userId, result.reply, result.status || 'TELEGRAM_DELIVERED', 'delivered');
      } catch (deliveryError) {
        await telegramMessageService.recordDeliveryStatus(adaptedMessage, result.user?.userId, result.reply, 'TELEGRAM_DELIVERY_FAILED', 'failed');
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
      await telegramMessageService.recordDeliveryStatus(
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
