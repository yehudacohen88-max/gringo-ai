const { env } = require('../../config/env');
const { TelegramConnectorError, safeTelegramWarning } = require('./telegram-errors');

const TELEGRAM_API_BASE_URL = 'https://api.telegram.org';
const MAX_TELEGRAM_TEXT_LENGTH = 3900;

let polling = false;
let pollingTimer = null;
let updateHandler = null;

function getConfig() {
  return {
    enabled: env.telegram?.enabled === true,
    token: env.telegram?.botToken || '',
    mode: env.telegram?.mode || 'polling',
    timeoutSeconds: Number(env.telegram?.pollingTimeoutSeconds || 30),
  };
}

function assertToken(config = getConfig()) {
  if (!config.token) {
    throw new TelegramConnectorError('Telegram bot token is missing.', { statusCode: 400, retryable: false });
  }
}

function getTelegramUrl(method, config = getConfig()) {
  assertToken(config);
  return `${TELEGRAM_API_BASE_URL}/bot${config.token}/${method}`;
}

async function callTelegram(method, payload = {}) {
  const config = getConfig();
  const response = await fetch(getTelegramUrl(method, config), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  let body = {};
  try {
    body = await response.json();
  } catch (error) {
    throw new TelegramConnectorError('Telegram returned an unreadable response.', {
      statusCode: response.status,
      retryable: response.status >= 500,
    });
  }

  if (!response.ok || !body.ok) {
    throw new TelegramConnectorError('Telegram request failed.', {
      statusCode: response.status,
      retryable: response.status >= 500 || response.status === 429,
    });
  }

  return body.result;
}

function sanitizeOutgoingText(text) {
  return String(text || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
}

function splitMessage(text) {
  const safeText = sanitizeOutgoingText(text) || 'Gringo could not create a response right now.';
  const parts = [];
  for (let index = 0; index < safeText.length; index += MAX_TELEGRAM_TEXT_LENGTH) {
    parts.push(safeText.slice(index, index + MAX_TELEGRAM_TEXT_LENGTH));
  }
  return parts.length ? parts : ['Gringo could not create a response right now.'];
}

async function getUpdates(offset) {
  const config = getConfig();
  return callTelegram('getUpdates', {
    offset: offset || undefined,
    timeout: config.timeoutSeconds,
    allowed_updates: ['message', 'callback_query'],
  });
}

async function sendTextMessage(chatId, text, options = {}) {
  const messages = splitMessage(text);
  const sent = [];

  for (const [index, messageText] of messages.entries()) {
    sent.push(
      await callTelegram('sendMessage', {
        chat_id: chatId,
        text: messageText,
        disable_web_page_preview: true,
        reply_markup: index === messages.length - 1 ? options.replyMarkup || undefined : undefined,
      })
    );
  }

  return sent;
}

async function answerCallbackQuery(callbackQueryId, text = '') {
  return callTelegram('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text: sanitizeOutgoingText(text).slice(0, 180) || undefined,
    show_alert: false,
  });
}

async function editMessageText(chatId, messageId, text, options = {}) {
  return callTelegram('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text: sanitizeOutgoingText(text).slice(0, 4096) || 'Done.',
    disable_web_page_preview: true,
    reply_markup: options.replyMarkup || undefined,
  });
}

async function editMessageReplyMarkup(chatId, messageId, replyMarkup = null) {
  return callTelegram('editMessageReplyMarkup', {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: replyMarkup || undefined,
  });
}

async function testConnection() {
  return callTelegram('getMe');
}

async function pollOnce() {
  if (typeof updateHandler !== 'function') return [];
  return updateHandler();
}

function scheduleNextPoll(delayMs = 1000) {
  if (!polling) return;
  pollingTimer = setTimeout(async () => {
    try {
      await pollOnce();
      scheduleNextPoll(100);
    } catch (error) {
      safeTelegramWarning('Temporary polling problem. Gringo web app is still running.');
      scheduleNextPoll(5000);
    }
  }, delayMs);
}

async function startPolling(handler) {
  const config = getConfig();
  if (!config.enabled) {
    safeTelegramWarning('Polling is disabled.');
    return { started: false, reason: 'disabled' };
  }

  if (config.mode !== 'polling') {
    safeTelegramWarning('Only polling mode is supported in this connector.');
    return { started: false, reason: 'unsupported_mode' };
  }

  if (!config.token) {
    safeTelegramWarning('Telegram bot is enabled but TELEGRAM_BOT_TOKEN is missing.');
    return { started: false, reason: 'missing_token' };
  }

  updateHandler = handler;
  polling = true;
  scheduleNextPoll(0);
  return { started: true, mode: 'polling' };
}

function stopPolling() {
  polling = false;
  if (pollingTimer) clearTimeout(pollingTimer);
  pollingTimer = null;
  return { stopped: true };
}

function getPollingStatus() {
  const config = getConfig();
  return {
    enabled: config.enabled,
    mode: config.mode,
    polling,
    hasToken: Boolean(config.token),
  };
}

module.exports = {
  getPollingStatus,
  getUpdates,
  answerCallbackQuery,
  editMessageReplyMarkup,
  editMessageText,
  sendTextMessage,
  startPolling,
  stopPolling,
  testConnection,
};
