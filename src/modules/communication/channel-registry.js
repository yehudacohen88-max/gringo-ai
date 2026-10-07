const telegramClient = require('../telegram/telegram-client.service');
const whatsappClient = require('../whatsapp/whatsapp-client.service');
const lineClient = require('../line/line-client.service');
const { createChannelAdapter } = require('./channel-adapter');

const FEATURE_MAP = {
  web: ['text', 'buttons', 'lists', 'media', 'documents', 'location'],
  telegram: ['text', 'buttons', 'documents', 'media'],
  whatsapp: ['text', 'buttons', 'lists', 'templates', 'media', 'documents', 'location', 'voice', 'read receipts'],
  line: ['text', 'buttons', 'media'],
};

function supports(channel, feature) {
  return (FEATURE_MAP[channel] || []).includes(feature);
}

function createWebAdapter() {
  return createChannelAdapter('web', {
    initialize: () => ({ initialized: true, channel: 'web' }),
    receiveMessage: (message) => message,
    sendMessage: ({ text }) => ({
      skipped: true,
      status: 'WEB_IN_APP_ONLY',
      text,
    }),
    sendInteractiveMessage: ({ text }) => ({
      skipped: true,
      status: 'WEB_IN_APP_ONLY',
      text,
    }),
    sendNotification: ({ text }) => ({
      skipped: true,
      status: 'WEB_NOTIFICATION_CENTER_ONLY',
      text,
    }),
    linkAccount: (user, identity) => ({ user, identity, linked: true }),
    unlinkAccount: (user) => ({ user, unlinked: true }),
    supportsFeature: (feature) => supports('web', feature),
    healthCheck: () => ({ enabled: true, configured: true, status: 'in_app' }),
  });
}

function createTelegramAdapter() {
  return createChannelAdapter('telegram', {
    initialize: () => ({ initialized: true, channel: 'telegram' }),
    receiveMessage: (message) => message,
    sendMessage: ({ to, text, options = {} }) => telegramClient.sendTextMessage(to, text, options),
    sendInteractiveMessage: ({ to, text, options = {} }) =>
      telegramClient.sendTextMessage(to, text, { replyMarkup: options.replyMarkup }),
    sendNotification: ({ to, text, options = {} }) =>
      telegramClient.sendTextMessage(to, text, { replyMarkup: options.replyMarkup }),
    linkAccount: (user, identity) => ({ user, identity, linked: true }),
    unlinkAccount: (user) => ({ user, unlinked: true }),
    supportsFeature: (feature) => supports('telegram', feature),
    healthCheck: () => telegramClient.getPollingStatus(),
  });
}

function createWhatsAppAdapter() {
  return createChannelAdapter('whatsapp', {
    initialize: () => ({ initialized: true, channel: 'whatsapp' }),
    receiveMessage: (message) => message,
    sendMessage: ({ to, text }) => whatsappClient.sendTextMessage(to, text),
    sendInteractiveMessage: ({ to, text, options = {} }) => {
      if (options.listRows?.length) return whatsappClient.sendListMessage(to, text, 'Choose', options.listRows);
      if (options.buttons?.length) return whatsappClient.sendReplyButtons(to, text, options.buttons);
      return whatsappClient.sendTextMessage(to, text);
    },
    sendNotification: ({ to, text, options = {} }) => {
      if (options.templateName) {
        return whatsappClient.sendTemplateMessage(to, options.templateName, options.languageCode || 'en', options.parameters || []);
      }
      if (options.buttons?.length) return whatsappClient.sendReplyButtons(to, text, options.buttons);
      return whatsappClient.sendTextMessage(to, text);
    },
    linkAccount: (user, identity) => ({ user, identity, linked: true }),
    unlinkAccount: (user) => ({ user, unlinked: true }),
    supportsFeature: (feature) => supports('whatsapp', feature),
    healthCheck: () => whatsappClient.getHealth(),
  });
}

function createLineAdapter() {
  return createChannelAdapter('line', {
    initialize: () => ({ initialized: true, channel: 'line' }),
    receiveMessage: (message) => message,
    sendMessage: ({ to, text, options = {} }) => lineClient.sendTextMessage(to, text, options),
    sendInteractiveMessage: ({ to, text, options = {} }) => lineClient.sendTextMessage(to, text, options),
    sendNotification: () => ({
      skipped: true,
      status: 'LINE_PUSH_NOT_SUPPORTED_YET',
      reason: 'line_push_delivery_not_enabled',
    }),
    linkAccount: (user, identity) => ({ user, identity, linked: true }),
    unlinkAccount: (user) => ({ user, unlinked: true }),
    supportsFeature: (feature) => supports('line', feature),
    healthCheck: () => lineClient.getHealth(),
  });
}

const channels = new Map();

function registerChannel(channel, adapter) {
  channels.set(channel, adapter);
  return adapter;
}

function registerDefaultChannels() {
  if (!channels.has('web')) registerChannel('web', createWebAdapter());
  if (!channels.has('telegram')) registerChannel('telegram', createTelegramAdapter());
  if (!channels.has('whatsapp')) registerChannel('whatsapp', createWhatsAppAdapter());
  if (!channels.has('line')) registerChannel('line', createLineAdapter());
  return getChannels();
}

function getChannel(channel) {
  registerDefaultChannels();
  return channels.get(channel) || null;
}

function getChannels() {
  return Array.from(channels.values());
}

module.exports = {
  getChannel,
  getChannels,
  registerChannel,
  registerDefaultChannels,
};
