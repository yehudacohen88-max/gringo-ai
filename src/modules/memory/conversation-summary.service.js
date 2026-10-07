const { env } = require('../../config/env');
const {
  DEFAULT_CONVERSATION_SUMMARY_ENABLED,
  DEFAULT_SUMMARY_MAX_CHARACTERS,
  DEFAULT_SUMMARY_TRIGGER_MESSAGES,
  MEMORY_ROLES,
} = require('./memory.constants');
const { contextManagerService } = require('./context-manager.service');
const { conversationMemoryService } = require('./conversation-memory.service');

const SUMMARY_VERSION = 1;
const MAX_SOURCE_MESSAGES = 200;

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function normalizeLimit(value, fallback, min = 1) {
  const number = Number(value);
  return Number.isInteger(number) && number >= min ? number : fallback;
}

function createEmptySummary(conversationId) {
  return {
    conversationId: cleanText(conversationId),
    summary: '',
    createdAt: '',
    updatedAt: '',
    messageCount: 0,
    version: SUMMARY_VERSION,
  };
}

function normalizeContent(value) {
  return cleanText(value).replace(/\s+/g, ' ');
}

function isGreetingOrSmallTalk(content) {
  return /^(hi|hello|hey|shalom|good morning|good afternoon|good evening|thanks|thank you|ok|okay|yes|no|bye|שלום|היי|תודה)\.?!?$/i.test(
    normalizeContent(content)
  );
}

function isRetryOrError(content) {
  const normalized = normalizeContent(content).toLowerCase();
  if (/^(retry|try again|failed|error|something went wrong|provider unavailable)\b/.test(normalized)) return true;
  return /\b(stack trace|internal error|technical error)\b/.test(normalized);
}

function isInternalSystemMessage(message = {}) {
  return message.role === MEMORY_ROLES.SYSTEM || message.metadata?.internalOnly === true;
}

function isImportant(content) {
  const normalized = normalizeContent(content).toLowerCase();
  return /\b(goal|looking for|need|want|prefer|preference|city|country|language|job|work|housing|room|apartment|task|remind|renew|visa|passport|document|money|send|transfer|decision|decided|completed|found a job|found housing|employer|budget|currency)\b/.test(
    normalized
  );
}

function labelFor(content) {
  const normalized = normalizeContent(content).toLowerCase();
  if (/\b(task|remind|renew|call|complete)\b/.test(normalized)) return 'Task';
  if (/\b(decision|decided|completed|found a job|found housing)\b/.test(normalized)) return 'Decision';
  if (/\b(prefer|preference|language|currency|budget|city|country)\b/.test(normalized)) return 'Preference';
  if (/\b(goal|looking for|need|want|job|housing|room|apartment|money|document)\b/.test(normalized)) return 'Goal';
  return 'Fact';
}

function summarizeMessages(messages = [], maxCharacters = DEFAULT_SUMMARY_MAX_CHARACTERS) {
  const lines = [];
  const seen = new Set();

  for (const message of messages) {
    if (isInternalSystemMessage(message)) continue;

    const content = normalizeContent(message.content);
    if (!content || isGreetingOrSmallTalk(content) || isRetryOrError(content) || !isImportant(content)) continue;

    const key = content.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    lines.push(`- ${labelFor(content)}: ${content}`);
  }

  let summary = lines.join('\n');
  if (summary.length > maxCharacters) {
    summary = `${summary.slice(0, Math.max(0, maxCharacters - 3)).trimEnd()}...`;
  }

  return summary;
}

class ConversationSummaryService {
  constructor(options = {}) {
    this.memoryService = options.memoryService || conversationMemoryService;
    this.contextManager = options.contextManager || contextManagerService;
    this.enabled = options.enabled ?? env.conversationSummary?.enabled ?? DEFAULT_CONVERSATION_SUMMARY_ENABLED;
    this.triggerMessages = normalizeLimit(
      options.triggerMessages || env.conversationSummary?.triggerMessages,
      DEFAULT_SUMMARY_TRIGGER_MESSAGES
    );
    this.maxCharacters = normalizeLimit(
      options.maxCharacters || env.conversationSummary?.maxCharacters,
      DEFAULT_SUMMARY_MAX_CHARACTERS
    );
    this.summaries = new Map();
  }

  readMessages(conversationId) {
    return this.memoryService.getRecentMessages(conversationId, MAX_SOURCE_MESSAGES);
  }

  createSummary(conversationId) {
    if (!this.enabled) return createEmptySummary(conversationId);

    const id = cleanText(conversationId);
    const messages = this.readMessages(id);
    const now = new Date().toISOString();
    const existing = this.summaries.get(id);
    const summary = {
      conversationId: id,
      summary: summarizeMessages(messages, this.maxCharacters),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      messageCount: messages.length,
      version: SUMMARY_VERSION,
    };

    if (id) this.summaries.set(id, summary);
    return { ...summary };
  }

  updateSummary(conversationId, options = {}) {
    if (!this.enabled) return createEmptySummary(conversationId);

    const id = cleanText(conversationId);
    const existing = this.summaries.get(id);
    const messages = this.readMessages(id);
    const context = this.contextManager.buildContext(id);
    const shouldRefresh = Boolean(
      options.force || !existing || messages.length > this.triggerMessages || context.truncated
    );

    if (!shouldRefresh) return { ...existing };
    return this.createSummary(id);
  }

  getSummary(conversationId) {
    const id = cleanText(conversationId);
    const summary = this.summaries.get(id);
    return summary ? { ...summary } : createEmptySummary(id);
  }

  clearSummary(conversationId) {
    const id = cleanText(conversationId);
    if (!id) return false;
    return this.summaries.delete(id);
  }
}

const conversationSummaryService = new ConversationSummaryService();

module.exports = {
  ConversationSummaryService,
  conversationSummaryService,
};
