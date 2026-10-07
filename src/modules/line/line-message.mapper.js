function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function getEvents(payload = {}) {
  return Array.isArray(payload.events) ? payload.events : [];
}

function isPrivateUserSource(source = {}) {
  return source.type === 'user' && Boolean(cleanText(source.userId));
}

function receivedAtFrom(event = {}) {
  const timestamp = Number(event.timestamp);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date().toISOString();
}

function mapEvent(event = {}) {
  const source = event.source || {};
  const message = event.message || {};
  return {
    channel: 'line',
    channelUserId: cleanText(source.userId),
    displayName: cleanText(source.displayName),
    language: cleanText(source.language),
    messageId: cleanText(message.id || event.webhookEventId),
    messageText: cleanText(message.text),
    actionId: cleanText(event.postback?.data),
    actionText: cleanText(event.postback?.params?.text || event.postback?.data),
    replyToken: cleanText(event.replyToken),
    receivedAt: receivedAtFrom(event),
    unsupportedType: message.type && message.type !== 'text' ? cleanText(message.type) : '',
  };
}

function extractIncomingMessages(payload = {}) {
  return getEvents(payload)
    .filter((event) => event.type === 'message' && isPrivateUserSource(event.source || {}))
    .map((event) => ({
      rawType: cleanText(event.message?.type),
      mapped: mapEvent(event),
    }));
}

function extractPostbackEvents(payload = {}) {
  return getEvents(payload)
    .filter((event) => event.type === 'postback' && isPrivateUserSource(event.source || {}))
    .map((event) => ({
      ...mapEvent(event),
      messageId: cleanText(event.webhookEventId || event.postback?.data),
      messageText: cleanText(event.postback?.params?.text || event.postback?.data),
      actionId: cleanText(event.postback?.data),
    }));
}

function getTextMessages(payload = {}) {
  return extractIncomingMessages(payload)
    .filter((message) => message.rawType === 'text' && message.mapped.messageText)
    .map((message) => message.mapped);
}

function getUnsupportedMessages(payload = {}) {
  const supportedUnsupportedTypes = ['image', 'sticker', 'location', 'audio', 'video', 'file', 'contact'];
  return extractIncomingMessages(payload)
    .filter((message) => supportedUnsupportedTypes.includes(message.rawType))
    .map((message) => ({
      ...message.mapped,
      unsupportedType: message.rawType,
    }));
}

module.exports = {
  extractIncomingMessages,
  extractPostbackEvents,
  getEvents,
  getTextMessages,
  getUnsupportedMessages,
  isPrivateUserSource,
};
