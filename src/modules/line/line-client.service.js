const { env } = require('../../config/env');
const { LineConnectorError } = require('./line-errors');

const LINE_REPLY_URL = 'https://api.line.me/v2/bot/message/reply';
const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';
const LINE_RICH_MENU_URL = 'https://api.line.me/v2/bot/richmenu';
const LINE_USER_RICH_MENU_URL = 'https://api.line.me/v2/bot/user/all/richmenu';
const MAX_LINE_TEXT_LENGTH = 4900;
const health = {
  lastSuccessfulRequestAt: '',
  lastFailedRequestAt: '',
  lastFailureCode: '',
};

function getConfig() {
  return {
    enabled: env.line?.enabled === true,
    channelId: env.line?.channelId || '',
    channelSecret: env.line?.channelSecret || '',
    channelAccessToken: env.line?.channelAccessToken || '',
  };
}

function assertConfigured(config = getConfig()) {
  if (!config.channelAccessToken) {
    throw new LineConnectorError('LINE credentials are missing.', {
      statusCode: 400,
      retryable: false,
      failureCode: 'line_credentials_missing',
    });
  }
}

function sanitizeOutgoingText(text) {
  return String(text || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
}

function splitMessage(text) {
  const safeText = sanitizeOutgoingText(text) || 'Gringo could not create a response right now.';
  const parts = [];
  for (let index = 0; index < safeText.length; index += MAX_LINE_TEXT_LENGTH) {
    parts.push(safeText.slice(index, index + MAX_LINE_TEXT_LENGTH));
  }
  return parts.length ? parts : ['Gringo could not create a response right now.'];
}

async function replyWithMessages(replyToken, messages = []) {
  const config = getConfig();
  assertConfigured(config);

  if (!replyToken) {
    throw new LineConnectorError('LINE reply token is missing.', {
      statusCode: 400,
      retryable: false,
      failureCode: 'line_reply_token_missing',
    });
  }

  const response = await fetch(LINE_REPLY_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.channelAccessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      replyToken,
      messages,
    }),
  });

  let body = {};
  try {
    body = await response.json();
  } catch (error) {
    body = {};
  }

  if (!response.ok) {
    health.lastFailedRequestAt = new Date().toISOString();
    health.lastFailureCode = response.status ? `line_${response.status}` : 'line_request_failed';
    throw new LineConnectorError('LINE request failed.', {
      statusCode: response.status,
      retryable: response.status >= 500 || response.status === 429,
      failureCode: health.lastFailureCode,
    });
  }

  health.lastSuccessfulRequestAt = new Date().toISOString();
  health.lastFailureCode = '';
  return {
    ok: true,
    status: 'LINE_DELIVERED',
    body,
  };
}

function makeQuickReply(options = {}) {
  const items = (options.quickReplies || [])
    .slice(0, 13)
    .map((item) => {
      const label = sanitizeOutgoingText(item.label).slice(0, 20) || 'Open';
      const text = sanitizeOutgoingText(item.text || item.label).slice(0, 300) || 'help';
      const data = sanitizeOutgoingText(item.data).slice(0, 300);
      return {
        type: 'action',
        action: data
          ? {
              type: 'postback',
              label,
              data,
              displayText: text,
            }
          : {
              type: 'message',
              label,
              text,
            },
      };
    });

  return items.length ? { items } : undefined;
}

async function sendTextMessage(replyToken, text, options = {}) {
  const messages = splitMessage(text)
    .slice(0, 5)
    .map((messageText, index, parts) => ({
      type: 'text',
      text: messageText,
      quickReply: index === parts.length - 1 ? makeQuickReply(options) : undefined,
    }));

  return replyWithMessages(replyToken, messages);
}

async function callLineApi(url, payload = {}) {
  const config = getConfig();
  assertConfigured(config);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.channelAccessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  let body = {};
  try {
    body = await response.json();
  } catch (error) {
    body = {};
  }

  if (!response.ok) {
    health.lastFailedRequestAt = new Date().toISOString();
    health.lastFailureCode = response.status ? `line_${response.status}` : 'line_request_failed';
    throw new LineConnectorError('LINE request failed.', {
      statusCode: response.status,
      retryable: response.status >= 500 || response.status === 429,
      failureCode: health.lastFailureCode,
    });
  }

  health.lastSuccessfulRequestAt = new Date().toISOString();
  health.lastFailureCode = '';
  return {
    ok: true,
    status: 'LINE_REQUEST_OK',
    lineRequestId: response.headers?.get ? response.headers.get('x-line-request-id') || '' : '',
    body,
  };
}

async function pushTextMessage(lineUserId, text, options = {}) {
  const messages = splitMessage(text)
    .slice(0, 5)
    .map((messageText, index, parts) => ({
      type: 'text',
      text: messageText,
      quickReply: index === parts.length - 1 ? makeQuickReply(options) : undefined,
    }));
  return callLineApi(LINE_PUSH_URL, {
    to: lineUserId,
    messages,
  });
}

function richMenuArea(x, y, width, height, label, data) {
  return {
    bounds: { x, y, width, height },
    action: {
      type: 'postback',
      label,
      data,
      displayText: label,
    },
  };
}

function buildDefaultRichMenu() {
  return {
    size: { width: 2500, height: 1686 },
    selected: true,
    name: 'Gringo Default Menu',
    chatBarText: 'Gringo menu',
    areas: [
      richMenuArea(0, 0, 625, 843, '🏠 Home', 'line:home'),
      richMenuArea(625, 0, 625, 843, '💼 Jobs', 'line:jobs'),
      richMenuArea(1250, 0, 625, 843, '🏡 Housing', 'line:housing'),
      richMenuArea(1875, 0, 625, 843, '📄 Documents', 'line:documents'),
      richMenuArea(0, 843, 625, 843, '✅ Tasks', 'line:tasks'),
      richMenuArea(625, 843, 625, 843, '🔔 Notifications', 'line:notifications'),
      richMenuArea(1250, 843, 625, 843, '🛠 Services', 'line:services'),
      richMenuArea(1875, 843, 625, 843, '👤 My Profile', 'line:profile'),
    ],
  };
}

async function createDefaultRichMenu() {
  return callLineApi(LINE_RICH_MENU_URL, buildDefaultRichMenu());
}

async function setDefaultRichMenu(richMenuId) {
  const config = getConfig();
  assertConfigured(config);
  const response = await fetch(`${LINE_USER_RICH_MENU_URL}/${encodeURIComponent(richMenuId)}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.channelAccessToken}`,
    },
  });

  if (!response.ok) {
    health.lastFailedRequestAt = new Date().toISOString();
    health.lastFailureCode = response.status ? `line_${response.status}` : 'line_request_failed';
    throw new LineConnectorError('LINE set default rich menu failed.', {
      statusCode: response.status,
      retryable: response.status >= 500 || response.status === 429,
      failureCode: health.lastFailureCode,
    });
  }

  health.lastSuccessfulRequestAt = new Date().toISOString();
  health.lastFailureCode = '';
  return { ok: true, status: 'LINE_DEFAULT_RICH_MENU_SET' };
}

function getHealth() {
  const config = getConfig();
  return {
    enabled: config.enabled,
    apiReachable: Boolean(config.enabled && config.channelAccessToken && !health.lastFailureCode),
    configured: Boolean(config.channelAccessToken),
    lastSuccessfulRequestAt: health.lastSuccessfulRequestAt,
    lastFailedRequestAt: health.lastFailedRequestAt,
    lastFailureCode: health.lastFailureCode,
  };
}

module.exports = {
  getConfig,
  getHealth,
  buildDefaultRichMenu,
  createDefaultRichMenu,
  pushTextMessage,
  sendTextMessage,
  setDefaultRichMenu,
  sanitizeOutgoingText,
  splitMessage,
};
