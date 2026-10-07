const channelRegistry = require('./channel-registry');
const { CommunicationError, safeCommunicationLog } = require('./communication-errors');

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function isYes(value) {
  return cleanText(value).toLowerCase() === 'yes' || value === true;
}

function normalizeChannel(channel = '') {
  const value = cleanText(channel).toLowerCase();
  if (value === 'web') return 'web';
  if (value === 'telegram') return 'telegram';
  if (value === 'whatsapp') return 'whatsapp';
  if (value === 'line') return 'line';
  if (value === 'none') return '';
  return value;
}

function isConnectedChannel(profile = {}, channel = '') {
  const normalized = normalizeChannel(channel);
  if (!normalized) return false;
  if (normalized === 'web') return true;
  if (normalized === 'telegram') return Boolean(cleanText(profile.telegramUserId) && cleanText(profile.telegramChatId));
  if (normalized === 'whatsapp') return Boolean(cleanText(profile.whatsappPhone || profile.channelUserId) && cleanText(profile.whatsappConnectedAt));
  if (normalized === 'line') return Boolean(cleanText(profile.lineUserId) && cleanText(profile.lineLinkStatus || 'Connected') === 'Connected');
  return false;
}

function allowedByPreference(profile = {}, channel = '', notificationType = '') {
  if (!notificationType) return true;
  if (channel === 'telegram') return isYes(profile.telegramNotificationsEnabled);
  if (channel === 'whatsapp') return isYes(profile.whatsappNotificationsEnabled);
  if (channel === 'line') return isYes(profile.lineNotificationsEnabled);
  return true;
}

function targetForChannel(profile = {}, channel = '') {
  if (channel === 'telegram') return cleanText(profile.telegramChatId);
  if (channel === 'whatsapp') return cleanText(profile.whatsappPhone || profile.channelUserId);
  if (channel === 'line') return cleanText(profile.lineReplyToken || profile.channelReplyToken);
  return '';
}

function channelAvailable(channel = '') {
  const adapter = channelRegistry.getChannel(channel);
  if (!adapter) return false;
  const health = adapter.healthCheck();
  return Boolean(health.enabled !== false && (health.configured !== false));
}

function selectChannel({ channel, profile = {}, feature = 'text', notificationType = '', allowFallback = true } = {}) {
  const requestedChannel = normalizeChannel(channel);
  const preferredCandidate = requestedChannel || normalizeChannel(profile.preferredChannel) || normalizeChannel(profile.channel);
  const fallbackCandidate = allowFallback ? normalizeChannel(profile.fallbackChannel) : '';
  const candidates = [
    requestedChannel,
    normalizeChannel(profile.preferredChannel),
    normalizeChannel(profile.channel),
    fallbackCandidate,
  ].filter(Boolean);
  const uniqueCandidates = [...new Set(candidates)];

  for (const candidate of uniqueCandidates) {
    const adapter = channelRegistry.getChannel(candidate);
    if (!adapter) continue;
    if (!adapter.supportsFeature(feature)) {
      safeCommunicationLog({ type: 'unsupported_feature', channel: candidate, feature, status: 'fallback' });
      continue;
    }
    if (profile.userId && !isConnectedChannel(profile, candidate)) continue;
    if (!allowedByPreference(profile, candidate, notificationType)) continue;
    if (!channelAvailable(candidate)) continue;
    return {
      channel: candidate,
      adapter,
      fallbackUsed: Boolean(fallbackCandidate && candidate === fallbackCandidate && candidate !== preferredCandidate),
    };
  }

  throw new CommunicationError('No available communication channel.', {
    channel: cleanText(channel),
    feature,
    retryable: true,
    failureCode: 'no_available_channel',
  });
}

async function initialize() {
  return channelRegistry.registerDefaultChannels().map((adapter) => adapter.initialize());
}

function receiveMessage(channel, message = {}) {
  const adapter = channelRegistry.getChannel(channel);
  if (!adapter) {
    throw new CommunicationError('Communication channel is not registered.', {
      channel,
      retryable: false,
      failureCode: 'channel_not_registered',
    });
  }
  safeCommunicationLog({ type: 'incoming', channel, status: 'received' });
  return adapter.receiveMessage(message);
}

async function sendMessage({ channel, to, text, options = {}, profile = {}, feature = 'text' } = {}) {
  const selected = selectChannel({ channel, profile, feature, allowFallback: options.allowFallback !== false });
  const target = cleanText(to) || targetForChannel(profile, selected.channel);
  if (!target) {
    throw new CommunicationError('Communication target is missing.', {
      channel: selected.channel,
      feature,
      retryable: false,
      failureCode: 'target_missing',
    });
  }
  try {
    const result = await selected.adapter.sendMessage({ to: target, text, options, profile });
    safeCommunicationLog({ type: 'outgoing', channel: selected.channel, fallbackUsed: selected.fallbackUsed, feature, status: 'success' });
    return result;
  } catch (error) {
    safeCommunicationLog({
      type: 'outgoing',
      channel: selected.channel,
      fallbackUsed: selected.fallbackUsed,
      feature,
      status: 'failure',
      failureCode: error.failureCode || 'delivery_failed',
    });
    throw error;
  }
}

async function sendInteractiveMessage({ channel, to, text, options = {}, profile = {} } = {}) {
  const feature = options.listRows?.length ? 'lists' : options.buttons?.length || options.replyMarkup ? 'buttons' : 'text';
  let selected = null;
  let textFallback = false;
  try {
    selected = selectChannel({ channel, profile, feature, allowFallback: options.allowFallback !== false });
  } catch (error) {
    if (feature === 'text') throw error;
    selected = selectChannel({ channel, profile, feature: 'text', allowFallback: options.allowFallback !== false });
    textFallback = true;
  }
  const target = cleanText(to) || targetForChannel(profile, selected.channel);
  if (!target) return sendMessage({ channel: selected.channel, to, text, options, profile, feature: 'text' });
  try {
    const result = textFallback
      ? await selected.adapter.sendMessage({ to: target, text, options: {}, profile })
      : await selected.adapter.sendInteractiveMessage({ to: target, text, options, profile });
    safeCommunicationLog({
      type: textFallback ? 'unsupported_feature' : 'interactive',
      channel: selected.channel,
      fallbackUsed: selected.fallbackUsed || textFallback,
      feature,
      status: 'success',
    });
    return result;
  } catch (error) {
    safeCommunicationLog({ type: 'interactive', channel: selected.channel, fallbackUsed: selected.fallbackUsed, feature, status: 'failure', failureCode: error.failureCode || 'delivery_failed' });
    throw error;
  }
}

async function sendNotification({ channel, to, text, notification = {}, options = {}, profile = {} } = {}) {
  const selected = selectChannel({
    channel,
    profile,
    feature: options.templateName ? 'templates' : 'text',
    notificationType: notification.type,
    allowFallback: options.allowFallback === true,
  });
  const target = cleanText(to) || targetForChannel(profile, selected.channel);
  if (!target) {
    throw new CommunicationError('Notification target is missing.', {
      channel: selected.channel,
      retryable: false,
      failureCode: 'target_missing',
    });
  }
  const result = await selected.adapter.sendNotification({ to: target, text, notification, options, profile });
  safeCommunicationLog({ type: 'notification', channel: selected.channel, fallbackUsed: selected.fallbackUsed, feature: 'text', status: 'success' });
  return result;
}

function linkAccount(channel, user, identity) {
  const adapter = channelRegistry.getChannel(channel);
  if (!adapter) throw new CommunicationError('Communication channel is not registered.', { channel, retryable: false });
  return adapter.linkAccount(user, identity);
}

function unlinkAccount(channel, user) {
  const adapter = channelRegistry.getChannel(channel);
  if (!adapter) throw new CommunicationError('Communication channel is not registered.', { channel, retryable: false });
  return adapter.unlinkAccount(user);
}

function supportsFeature(channel, feature) {
  const adapter = channelRegistry.getChannel(channel);
  return Boolean(adapter && adapter.supportsFeature(feature));
}

function healthCheck(channel) {
  if (channel) {
    const adapter = channelRegistry.getChannel(channel);
    return adapter ? adapter.healthCheck() : null;
  }
  return channelRegistry.getChannels().reduce((summary, adapter) => {
    summary[adapter.channel] = adapter.healthCheck();
    return summary;
  }, {});
}

module.exports = {
  healthCheck,
  initialize,
  isConnectedChannel,
  linkAccount,
  receiveMessage,
  selectChannel,
  sendInteractiveMessage,
  sendMessage,
  sendNotification,
  supportsFeature,
  unlinkAccount,
};
