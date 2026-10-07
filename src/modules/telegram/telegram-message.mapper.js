function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function isPrivateTextUpdate(update = {}) {
  const message = update.message;
  return Boolean(message && message.chat?.type === 'private' && typeof message.text === 'string');
}

function mapPrivateTextUpdate(update = {}) {
  if (!isPrivateTextUpdate(update)) return null;

  const message = update.message;
  const from = message.from || {};
  return {
    channel: 'telegram',
    channelUserId: cleanText(from.id),
    channelChatId: cleanText(message.chat?.id),
    telegramMessageId: cleanText(message.message_id),
    username: cleanText(from.username),
    firstName: cleanText(from.first_name),
    lastName: cleanText(from.last_name),
    languageCode: cleanText(from.language_code),
    messageText: cleanText(message.text),
    receivedAt: message.date ? new Date(message.date * 1000).toISOString() : new Date().toISOString(),
    updateId: cleanText(update.update_id),
  };
}

function getUnsupportedPrivateChat(update = {}) {
  const message = update.message;
  if (!message || message.chat?.type !== 'private') return null;
  if (typeof message.text === 'string') return null;
  return {
    channelChatId: cleanText(message.chat?.id),
    updateId: cleanText(update.update_id),
  };
}

function mapCallbackQuery(update = {}) {
  const callback = update.callback_query;
  if (!callback) return null;
  const message = callback.message || {};
  const chat = message.chat || {};
  const from = callback.from || {};
  return {
    channel: 'telegram',
    channelUserId: cleanText(from.id),
    channelChatId: cleanText(chat.id),
    telegramMessageId: cleanText(message.message_id),
    callbackQueryId: cleanText(callback.id),
    callbackData: cleanText(callback.data),
    chatType: cleanText(chat.type),
    username: cleanText(from.username),
    firstName: cleanText(from.first_name),
    lastName: cleanText(from.last_name),
    languageCode: cleanText(from.language_code),
    receivedAt: new Date().toISOString(),
    updateId: cleanText(update.update_id),
  };
}

module.exports = {
  getUnsupportedPrivateChat,
  isPrivateTextUpdate,
  mapCallbackQuery,
  mapPrivateTextUpdate,
};
