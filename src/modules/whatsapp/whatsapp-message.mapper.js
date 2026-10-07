function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function entries(payload = {}) {
  return Array.isArray(payload.entry) ? payload.entry : [];
}

function changes(entry = {}) {
  return Array.isArray(entry.changes) ? entry.changes : [];
}

function valueFromChange(change = {}) {
  return change.value || {};
}

function contactFor(value = {}, waId = '') {
  const contacts = Array.isArray(value.contacts) ? value.contacts : [];
  return contacts.find((contact) => cleanText(contact.wa_id) === cleanText(waId)) || contacts[0] || {};
}

function isPrivateUserId(waId = '') {
  const value = cleanText(waId);
  return Boolean(value && !value.includes('@g.us') && !value.includes('broadcast'));
}

function mapMessage(value = {}, message = {}) {
  const waId = cleanText(message.from);
  const contact = contactFor(value, waId);
  const profileName = cleanText(contact.profile?.name);
  const receivedAt = message.timestamp ? new Date(Number(message.timestamp) * 1000).toISOString() : new Date().toISOString();

  return {
    channel: 'whatsapp',
    channelUserId: waId,
    phoneNumber: waId,
    profileName,
    messageId: cleanText(message.id),
    messageText: cleanText(message.text?.body || message.interactive?.button_reply?.title || message.interactive?.list_reply?.title),
    actionId: cleanText(message.interactive?.button_reply?.id || message.interactive?.list_reply?.id),
    actionTitle: cleanText(message.interactive?.button_reply?.title || message.interactive?.list_reply?.title),
    receivedAt,
  };
}

function extractIncomingMessages(payload = {}) {
  const messages = [];
  for (const entry of entries(payload)) {
    for (const change of changes(entry)) {
      const value = valueFromChange(change);
      const incoming = Array.isArray(value.messages) ? value.messages : [];
      for (const message of incoming) {
        messages.push({
          rawType: cleanText(message.type),
          mapped: mapMessage(value, message),
        });
      }
    }
  }
  return messages;
}

function getTextMessages(payload = {}) {
  return extractIncomingMessages(payload)
    .filter((message) => message.rawType === 'text' && message.mapped.messageText && isPrivateUserId(message.mapped.channelUserId))
    .map((message) => message.mapped);
}

function getInteractiveMessages(payload = {}) {
  return extractIncomingMessages(payload)
    .filter((message) => message.rawType === 'interactive' && message.mapped.actionId && isPrivateUserId(message.mapped.channelUserId))
    .map((message) => message.mapped);
}

function getUnsupportedMessages(payload = {}) {
  return extractIncomingMessages(payload)
    .filter((message) => message.rawType && message.rawType !== 'text' && message.rawType !== 'interactive' && isPrivateUserId(message.mapped.channelUserId))
    .map((message) => ({
      ...message.mapped,
      unsupportedType: message.rawType,
    }));
}

function safeFailureCode(error = {}) {
  const code = cleanText(error.code);
  if (code) return `whatsapp_${code}`;
  return 'whatsapp_delivery_failed';
}

function getStatusEvents(payload = {}) {
  const events = [];
  for (const entry of entries(payload)) {
    for (const change of changes(entry)) {
      const value = valueFromChange(change);
      const statuses = Array.isArray(value.statuses) ? value.statuses : [];
      for (const status of statuses) {
        events.push({
          whatsappMessageId: cleanText(status.id),
          status: cleanText(status.status),
          eventAt: status.timestamp ? new Date(Number(status.timestamp) * 1000).toISOString() : new Date().toISOString(),
          safeFailureCode: status.errors?.[0] ? safeFailureCode(status.errors[0]) : '',
        });
      }
    }
  }
  return events;
}

module.exports = {
  extractIncomingMessages,
  getInteractiveMessages,
  getStatusEvents,
  getTextMessages,
  getUnsupportedMessages,
  isPrivateUserId,
};
