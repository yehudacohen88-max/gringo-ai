const { env } = require('../../config/env');
const { MEMORY_ROLES, SENSITIVE_METADATA_PATTERNS } = require('./memory.constants');
const { conversationMemoryService } = require('./conversation-memory.service');

const DEFAULT_CONTEXT_MAX_MESSAGES = 12;
const DEFAULT_CONTEXT_MAX_CHARACTERS = 12000;
const INTERNAL_CURRENT_MESSAGE = Symbol('currentContextMessage');

const CHANNEL_METADATA_PATTERNS = [
  /^channel$/i,
  /^channel[A-Z_ -]?/i,
  /chatId/i,
  /messageId/i,
  /telegram/i,
  /whatsapp/i,
  /line/i,
];

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function normalizeLimit(value, fallback, min = 1) {
  const number = Number(value);
  return Number.isInteger(number) && number >= min ? number : fallback;
}

function isInternalOnly(message = {}) {
  return message.role === MEMORY_ROLES.SYSTEM && message.metadata?.internalOnly === true;
}

function shouldKeepMetadataKey(key) {
  return ![...SENSITIVE_METADATA_PATTERNS, ...CHANNEL_METADATA_PATTERNS].some((pattern) => pattern.test(key));
}

function sanitizeMetadata(metadata = {}) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};

  const sanitized = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!shouldKeepMetadataKey(key)) continue;
    if (value === undefined || typeof value === 'function') continue;
    sanitized[key] = value;
  }
  return sanitized;
}

function normalizeMessage(message = {}) {
  const content = cleanText(message.content);
  if (!content) return null;

  const role = Object.values(MEMORY_ROLES).includes(message.role) ? message.role : MEMORY_ROLES.USER;
  const normalized = {
    role,
    content,
    timestamp: cleanText(message.timestamp) || new Date().toISOString(),
    metadata: sanitizeMetadata(message.metadata),
  };

  if (message[INTERNAL_CURRENT_MESSAGE]) {
    Object.defineProperty(normalized, INTERNAL_CURRENT_MESSAGE, {
      enumerable: false,
      value: true,
    });
  }

  return normalized;
}

function publicMessage(message = {}) {
  return {
    role: message.role,
    content: message.content,
    timestamp: message.timestamp,
    metadata: sanitizeMetadata(message.metadata),
  };
}

function createEmptyContext(conversationId) {
  return {
    conversationId: cleanText(conversationId),
    messages: [],
    messageCount: 0,
    truncated: false,
    estimatedSize: 0,
  };
}

class ContextManagerService {
  constructor(options = {}) {
    this.memoryService = options.memoryService || conversationMemoryService;
    this.enabled = options.enabled ?? env.contextManager?.enabled ?? true;
    this.defaultLimits = {
      maxMessages: normalizeLimit(
        options.maxMessages || env.contextManager?.maxMessages,
        DEFAULT_CONTEXT_MAX_MESSAGES
      ),
      maxCharacters: normalizeLimit(
        options.maxCharacters || env.contextManager?.maxCharacters,
        DEFAULT_CONTEXT_MAX_CHARACTERS
      ),
    };
  }

  estimateContextSize(messages = []) {
    return messages.reduce((total, message) => {
      const normalized = normalizeMessage(message);
      if (!normalized) return total;
      return total + normalized.role.length + normalized.content.length + normalized.timestamp.length;
    }, 0);
  }

  selectRelevantMessages(messages = [], options = {}) {
    const selected = [];

    for (const message of messages || []) {
      if (isInternalOnly(message)) continue;
      const normalized = normalizeMessage(message);
      if (normalized) selected.push(normalized);
    }

    if (options.currentMessage) {
      const currentMessage = normalizeMessage({
        role: MEMORY_ROLES.USER,
        ...options.currentMessage,
      });
      if (currentMessage) {
        Object.defineProperty(currentMessage, INTERNAL_CURRENT_MESSAGE, {
          enumerable: false,
          value: true,
        });
        selected.push(currentMessage);
      }
    }

    selected.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
    return selected;
  }

  trimContext(messages = [], limits = {}) {
    const maxMessages = normalizeLimit(limits.maxMessages, this.defaultLimits.maxMessages);
    const maxCharacters = normalizeLimit(limits.maxCharacters, this.defaultLimits.maxCharacters);
    const selected = messages.map(normalizeMessage).filter(Boolean);
    let trimmed = selected.slice();
    let truncated = false;
    const currentMessage = [...selected].reverse().find((message) => message[INTERNAL_CURRENT_MESSAGE]);

    function removeOldestNonCurrent() {
      const index = trimmed.findIndex((message) => message !== currentMessage);
      if (index >= 0) {
        trimmed.splice(index, 1);
        truncated = true;
        return true;
      }
      return false;
    }

    while (trimmed.length > maxMessages && removeOldestNonCurrent()) {
      // Keep trimming until the message-count limit is satisfied.
    }

    while (this.estimateContextSize(trimmed) > maxCharacters && removeOldestNonCurrent()) {
      // Keep trimming until the character limit is satisfied.
    }

    return {
      messages: trimmed.map(publicMessage),
      truncated,
      estimatedSize: this.estimateContextSize(trimmed),
    };
  }

  buildContext(conversationId, options = {}) {
    if (!this.enabled) return createEmptyContext(conversationId);

    try {
      const limits = {
        maxMessages: normalizeLimit(options.maxMessages, this.defaultLimits.maxMessages),
        maxCharacters: normalizeLimit(options.maxCharacters, this.defaultLimits.maxCharacters),
      };
      const memoryMessages = this.memoryService.getRecentMessages(conversationId, limits.maxMessages + 1);
      const selected = this.selectRelevantMessages(memoryMessages, options);
      const trimmed = this.trimContext(selected, limits);

      return {
        conversationId: cleanText(conversationId),
        messages: trimmed.messages,
        messageCount: trimmed.messages.length,
        truncated: trimmed.truncated,
        estimatedSize: trimmed.estimatedSize,
      };
    } catch (error) {
      return createEmptyContext(conversationId);
    }
  }
}

const contextManagerService = new ContextManagerService();

module.exports = {
  ContextManagerService,
  contextManagerService,
};
