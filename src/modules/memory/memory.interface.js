const { MEMORY_ROLES } = require('./memory.constants');

const MESSAGE_SHAPE = Object.freeze({
  role: Object.values(MEMORY_ROLES).join(' | '),
  content: 'string',
  timestamp: 'ISO date',
  metadata: 'object',
});

const CONVERSATION_MEMORY_METHODS = Object.freeze([
  'addMessage(conversationId, message)',
  'getRecentMessages(conversationId, limit)',
  'clearConversation(conversationId)',
  'getConversationSummary(conversationId)',
]);

module.exports = {
  CONVERSATION_MEMORY_METHODS,
  MESSAGE_SHAPE,
};
