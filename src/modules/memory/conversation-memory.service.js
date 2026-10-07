const { env } = require('../../config/env');
const {
  DEFAULT_CONVERSATION_MEMORY_ENABLED,
  DEFAULT_CONVERSATION_MEMORY_MAX_MESSAGES,
  MAX_CONVERSATION_MEMORY_MAX_MESSAGES,
  MEMORY_ROLES,
  MIN_CONVERSATION_MEMORY_MAX_MESSAGES,
  SENSITIVE_METADATA_PATTERNS,
} = require('./memory.constants');

const SENSITIVE_TEXT_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\b[A-Z0-9_]*(?:API_KEY|ACCESS_TOKEN|BOT_TOKEN|PRIVATE_KEY|SECRET|PASSWORD)\s*=\s*\S+/gi,
];

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function isEnabled(value) {
  return value !== false;
}

function normalizeMaxMessages(value) {
  const number = Number(value);
  if (!Number.isInteger(number)) return DEFAULT_CONVERSATION_MEMORY_MAX_MESSAGES;
  return Math.min(
    MAX_CONVERSATION_MEMORY_MAX_MESSAGES,
    Math.max(MIN_CONVERSATION_MEMORY_MAX_MESSAGES, number)
  );
}

function normalizeRole(value) {
  const role = cleanText(value).toLowerCase();
  return Object.values(MEMORY_ROLES).includes(role) ? role : MEMORY_ROLES.USER;
}

function redactSensitiveText(value) {
  let text = cleanText(value);
  for (const pattern of SENSITIVE_TEXT_PATTERNS) {
    text = text.replace(pattern, '[redacted]');
  }
  return text;
}

function shouldKeepMetadataKey(key) {
  return !SENSITIVE_METADATA_PATTERNS.some((pattern) => pattern.test(key));
}

function sanitizeMetadata(metadata = {}) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};

  const sanitized = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!shouldKeepMetadataKey(key)) continue;
    if (value === undefined || typeof value === 'function') continue;
    sanitized[key] = typeof value === 'string' ? redactSensitiveText(value) : value;
  }
  return { ...sanitized };
}

function cloneMessage(message = {}) {
  return {
    role: message.role,
    content: message.content,
    timestamp: message.timestamp,
    metadata: sanitizeMetadata(message.metadata),
  };
}

class ConversationMemoryService {
  constructor(options = {}) {
    this.enabled = isEnabled(
      Object.prototype.hasOwnProperty.call(options, 'enabled')
        ? options.enabled
        : env.conversationMemory?.enabled ?? DEFAULT_CONVERSATION_MEMORY_ENABLED
    );
    this.maxMessages = normalizeMaxMessages(
      options.maxMessages || env.conversationMemory?.maxMessages || DEFAULT_CONVERSATION_MEMORY_MAX_MESSAGES
    );
    this.conversations = new Map();
  }

  addMessage(conversationId, message = {}) {
    if (!this.enabled) return null;

    const id = cleanText(conversationId);
    const content = redactSensitiveText(message.content);
    if (!id || !content) return null;

    const entry = {
      role: normalizeRole(message.role),
      content,
      timestamp: cleanText(message.timestamp) || new Date().toISOString(),
      metadata: sanitizeMetadata(message.metadata),
    };
    const messages = this.conversations.get(id) || [];
    messages.push(entry);

    while (messages.length > this.maxMessages) {
      messages.shift();
    }

    this.conversations.set(id, messages);
    return cloneMessage(entry);
  }

  getRecentMessages(conversationId, limit) {
    const id = cleanText(conversationId);
    if (!id || !this.conversations.has(id)) return [];

    const messages = this.conversations.get(id) || [];
    const max = limit === undefined || limit === null ? messages.length : normalizeMaxMessages(limit);
    return messages.slice(Math.max(0, messages.length - max)).map(cloneMessage);
  }

  clearConversation(conversationId) {
    const id = cleanText(conversationId);
    if (!id) return false;
    return this.conversations.delete(id);
  }

  getConversationSummary(conversationId) {
    const messages = this.getRecentMessages(conversationId);
    const roleCounts = messages.reduce((counts, message) => {
      counts[message.role] = (counts[message.role] || 0) + 1;
      return counts;
    }, {});

    return {
      conversationId: cleanText(conversationId),
      messageCount: messages.length,
      firstMessageAt: messages[0]?.timestamp || '',
      lastMessageAt: messages.at(-1)?.timestamp || '',
      roles: {
        user: roleCounts.user || 0,
        assistant: roleCounts.assistant || 0,
        system: roleCounts.system || 0,
      },
    };
  }
}

const conversationMemoryService = new ConversationMemoryService();

module.exports = {
  ConversationMemoryService,
  conversationMemoryService,
};
