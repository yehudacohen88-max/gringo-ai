const { env } = require('../../config/env');
const { WhatsAppConnectorError } = require('./whatsapp-errors');

const GRAPH_API_VERSION = 'v20.0';
const GRAPH_API_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const MAX_WHATSAPP_TEXT_LENGTH = 3900;
const health = {
  lastSuccessfulRequestAt: '',
  lastFailedRequestAt: '',
  lastFailureCode: '',
};

function getConfig() {
  return {
    enabled: env.whatsapp?.enabled === true,
    accessToken: env.whatsapp?.accessToken || '',
    phoneNumberId: env.whatsapp?.phoneNumberId || '',
  };
}

function assertConfigured(config = getConfig()) {
  if (!config.accessToken || !config.phoneNumberId) {
    throw new WhatsAppConnectorError('WhatsApp credentials are missing.', { statusCode: 400, retryable: false });
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
  for (let index = 0; index < safeText.length; index += MAX_WHATSAPP_TEXT_LENGTH) {
    parts.push(safeText.slice(index, index + MAX_WHATSAPP_TEXT_LENGTH));
  }
  return parts.length ? parts : ['Gringo could not create a response right now.'];
}

async function sendTextMessage(to, text) {
  const config = getConfig();
  assertConfigured(config);
  const sent = [];

  for (const messageText of splitMessage(text)) {
    const response = await fetch(`${GRAPH_API_BASE_URL}/${config.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: {
          preview_url: false,
          body: messageText,
        },
      }),
    });

    let body = {};
    try {
      body = await response.json();
    } catch (error) {
      throw new WhatsAppConnectorError('WhatsApp returned an unreadable response.', {
        statusCode: response.status,
        retryable: response.status >= 500,
      });
    }

    if (!response.ok || body.error) {
      throw new WhatsAppConnectorError('WhatsApp request failed.', {
        statusCode: response.status,
        retryable: response.status >= 500 || response.status === 429,
      });
    }

    sent.push(body);
  }

  return sent;
}

async function callMessagesApi(payload = {}) {
  const config = getConfig();
  assertConfigured(config);
  const response = await fetch(`${GRAPH_API_BASE_URL}/${config.phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      ...payload,
    }),
  });

  let body = {};
  try {
    body = await response.json();
  } catch (error) {
    throw new WhatsAppConnectorError('WhatsApp returned an unreadable response.', {
      statusCode: response.status,
      retryable: response.status >= 500,
    });
  }

  if (!response.ok || body.error) {
    health.lastFailedRequestAt = new Date().toISOString();
    health.lastFailureCode = response.status ? `whatsapp_${response.status}` : 'whatsapp_request_failed';
    throw new WhatsAppConnectorError('WhatsApp request failed.', {
      statusCode: response.status,
      retryable: response.status >= 500 || response.status === 429,
    });
  }

  health.lastSuccessfulRequestAt = new Date().toISOString();
  health.lastFailureCode = '';
  return body;
}

function getHealth() {
  const config = getConfig();
  return {
    enabled: config.enabled,
    apiReachable: Boolean(config.enabled && config.accessToken && config.phoneNumberId && !health.lastFailureCode),
    configured: Boolean(config.accessToken && config.phoneNumberId),
    lastSuccessfulRequestAt: health.lastSuccessfulRequestAt,
    lastFailedRequestAt: health.lastFailedRequestAt,
    lastFailureCode: health.lastFailureCode,
  };
}

function safeButtonTitle(value) {
  return sanitizeOutgoingText(value).slice(0, 20) || 'Open';
}

function safeButtonId(value) {
  return sanitizeOutgoingText(value).slice(0, 256);
}

async function sendReplyButtons(to, text, buttons = []) {
  const cleanButtons = buttons.slice(0, 3).map((button) => ({
    type: 'reply',
    reply: {
      id: safeButtonId(button.id),
      title: safeButtonTitle(button.title),
    },
  }));

  if (!cleanButtons.length) return sendTextMessage(to, text);

  return [
    await callMessagesApi({
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: sanitizeOutgoingText(text).slice(0, 1024) || 'Gringo has an update.' },
        action: {
          buttons: cleanButtons,
        },
      },
    }),
  ];
}

async function sendListMessage(to, text, buttonText, rows = []) {
  const cleanRows = rows.slice(0, 10).map((row) => ({
    id: safeButtonId(row.id),
    title: sanitizeOutgoingText(row.title).slice(0, 24) || 'Open',
    description: sanitizeOutgoingText(row.description).slice(0, 72) || undefined,
  }));

  if (!cleanRows.length) return sendTextMessage(to, text);

  return [
    await callMessagesApi({
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: sanitizeOutgoingText(text).slice(0, 1024) || 'Choose an option.' },
        action: {
          button: sanitizeOutgoingText(buttonText).slice(0, 20) || 'Choose',
          sections: [
            {
              title: 'Gringo',
              rows: cleanRows,
            },
          ],
        },
      },
    }),
  ];
}

function templateParameters(parameters = []) {
  const values = parameters.map((value) => ({
    type: 'text',
    text: sanitizeOutgoingText(value).slice(0, 1024),
  }));
  return values.length
    ? [
        {
          type: 'body',
          parameters: values,
        },
      ]
    : [];
}

async function sendTemplateMessage(to, templateName, languageCode = 'en', parameters = []) {
  return [
    await callMessagesApi({
      to,
      type: 'template',
      template: {
        name: sanitizeOutgoingText(templateName),
        language: {
          code: sanitizeOutgoingText(languageCode) || 'en',
        },
        components: templateParameters(parameters),
      },
    }),
  ];
}

module.exports = {
  getConfig,
  getHealth,
  sendListMessage,
  sendReplyButtons,
  sendTemplateMessage,
  sendTextMessage,
};
