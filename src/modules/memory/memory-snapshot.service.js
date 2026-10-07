const {
  CONVERSATION_STATES,
  MEMORY_ROLES,
  MEMORY_SNAPSHOT_VERSION,
  SENSITIVE_METADATA_PATTERNS,
} = require('./memory.constants');
const { contextManagerService } = require('./context-manager.service');
const { conversationSummaryService } = require('./conversation-summary.service');
const { workingMemoryService } = require('./working-memory.service');

const CHANNEL_FIELD_PATTERNS = [
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

function normalizeState(value, fallback = 'active') {
  const state = cleanText(value).toLowerCase();
  if (!state) return 'idle';
  return CONVERSATION_STATES.includes(state) ? state : fallback;
}

function isSensitiveKey(key) {
  return [...SENSITIVE_METADATA_PATTERNS, ...CHANNEL_FIELD_PATTERNS].some((pattern) => pattern.test(key));
}

function sanitizeText(value) {
  const text = cleanText(value);
  if (!text) return '';
  if (/\bsk-[A-Za-z0-9_-]{20,}\b/.test(text)) return '';
  if (/\b(?:api[\s_-]?key|access[\s_-]?token|bot[\s_-]?token|private[\s_-]?key|secret|password)\b/i.test(text)) {
    return '';
  }
  if (/\b(stack trace|raw error|provider error|internal error)\b/i.test(text)) return '';
  return text;
}

function uniqueList(value) {
  const list = Array.isArray(value) ? value : cleanText(value) ? [value] : [];
  const seen = new Set();
  const result = [];

  for (const item of list) {
    const text = sanitizeText(item);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }

  return result;
}

function sanitizeObject(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};

  for (const [key, rawValue] of Object.entries(value)) {
    if (isSensitiveKey(key)) continue;
    const text = sanitizeText(rawValue);
    if (!text) continue;
    result[key] = text;
  }

  return result;
}

function createEmptySnapshot(conversationId) {
  return {
    version: MEMORY_SNAPSHOT_VERSION,
    conversationId: cleanText(conversationId),
    conversationState: 'idle',
    lastIntent: '',
    userGoals: [],
    openTasks: [],
    completedTasks: [],
    importantFacts: [],
    preferences: {},
    importantEntities: [],
    pendingQuestions: [],
    pendingActions: [],
    blockers: [],
    freeTextSummary: '',
    updatedAt: '',
  };
}

function inferStateFromMessages(messages = []) {
  const latest = [...messages].reverse().find((message) => cleanText(message.content));
  const content = cleanText(latest?.content).toLowerCase();

  if (!content) return 'idle';
  if (latest?.role === MEMORY_ROLES.ASSISTANT && /\?$/.test(content)) return 'waiting_for_user';
  if (/\b(found a job|found housing|completed|done)\b/.test(content)) return 'completed';
  return 'active';
}

function inferLastIntent(messages = []) {
  const latestUser = [...messages].reverse().find((message) => message.role === MEMORY_ROLES.USER);
  const content = cleanText(latestUser?.content).toLowerCase();

  if (/\b(job|work|construction)\b/.test(content)) return 'Jobs';
  if (/\b(housing|room|apartment)\b/.test(content)) return 'Housing';
  if (/\b(money|send|transfer|currency)\b/.test(content)) return 'Money';
  if (/\b(document|passport|visa|permit)\b/.test(content)) return 'Documents';
  if (/\b(service|doctor|lawyer|clinic|sim)\b/.test(content)) return 'Services';
  if (/\b(task|remind|call)\b/.test(content)) return 'Tasks';
  return content ? 'General' : '';
}

function collectStructuredFields(messages = [], freeTextSummary = '') {
  const userGoals = [];
  const openTasks = [];
  const completedTasks = [];
  const importantFacts = [];
  const importantEntities = [];
  const pendingQuestions = [];
  const preferences = {};

  for (const message of messages) {
    const content = sanitizeText(message.content);
    const normalized = content.toLowerCase();
    if (!content) continue;

    if (/\b(looking for|need|want|goal|job|work|housing|room|apartment|send money|document)\b/.test(normalized)) {
      userGoals.push(content);
    }
    if (/\b(task|remind|call|renew|apply|visit)\b/.test(normalized) && !/\b(completed|done|found)\b/.test(normalized)) {
      openTasks.push(content);
    }
    if (/\b(completed|done|found a job|found housing|found an apartment)\b/.test(normalized)) {
      completedTasks.push(content);
    }
    if (/\b(prefer|preference|language|currency|budget|city|country)\b/.test(normalized)) {
      importantFacts.push(content);
      if (/\bbudget\b/.test(normalized)) preferences.budget = content;
      if (/\bcurrency\b/.test(normalized)) preferences.currency = content;
      if (/\blanguage\b/.test(normalized)) preferences.language = content;
      if (/\bcity\b/.test(normalized)) preferences.city = content;
    }
    if (/\b(Tel Aviv|Thailand|Jerusalem|Ashdod|Ashkelon|Construction|Agriculture|Caregiving)\b/i.test(content)) {
      importantEntities.push(...(content.match(/\b(Tel Aviv|Thailand|Jerusalem|Ashdod|Ashkelon|Construction|Agriculture|Caregiving)\b/gi) || []));
    }
    if (message.role === MEMORY_ROLES.ASSISTANT && /\?$/.test(content)) {
      pendingQuestions.push(content);
    }
  }

  for (const line of cleanText(freeTextSummary).split('\n')) {
    const text = sanitizeText(line.replace(/^-\s*(Goal|Task|Decision|Preference|Fact):\s*/i, ''));
    if (!text) continue;
    if (/\b(task|remind|renew|call)\b/i.test(text)) openTasks.push(text);
    if (/\b(decision|decided|completed|found a job|found housing)\b/i.test(text)) completedTasks.push(text);
    if (/\b(prefer|preference|language|currency|budget|city|country)\b/i.test(text)) importantFacts.push(text);
    if (/\b(goal|looking for|need|want|job|housing|room|apartment|money|document)\b/i.test(text)) userGoals.push(text);
  }

  return {
    userGoals: uniqueList(userGoals),
    openTasks: uniqueList(openTasks),
    completedTasks: uniqueList(completedTasks),
    importantFacts: uniqueList(importantFacts),
    preferences: sanitizeObject(preferences),
    importantEntities: uniqueList(importantEntities),
    pendingQuestions: uniqueList(pendingQuestions),
  };
}

function cloneSnapshot(snapshot = {}) {
  return {
    version: MEMORY_SNAPSHOT_VERSION,
    conversationId: cleanText(snapshot.conversationId),
    conversationState: normalizeState(snapshot.conversationState, 'active'),
    lastIntent: sanitizeText(snapshot.lastIntent),
    userGoals: uniqueList(snapshot.userGoals),
    openTasks: uniqueList(snapshot.openTasks),
    completedTasks: uniqueList(snapshot.completedTasks),
    importantFacts: uniqueList(snapshot.importantFacts),
    preferences: sanitizeObject(snapshot.preferences),
    importantEntities: uniqueList(snapshot.importantEntities),
    pendingQuestions: uniqueList(snapshot.pendingQuestions),
    pendingActions: uniqueList(snapshot.pendingActions),
    blockers: uniqueList(snapshot.blockers),
    freeTextSummary: sanitizeText(snapshot.freeTextSummary),
    updatedAt: cleanText(snapshot.updatedAt),
  };
}

function taskLabel(task = {}) {
  const type = sanitizeText(task.type);
  const assignedTo = sanitizeText(task.assignedTo);
  const status = sanitizeText(task.status);
  const input = task.input && typeof task.input === 'object'
    ? Object.values(task.input).map(sanitizeText).filter(Boolean).join(' ')
    : sanitizeText(task.input);
  return [type, input, assignedTo ? `assigned to ${assignedTo}` : '', status ? `status ${status}` : '']
    .filter(Boolean)
    .join(' - ');
}

class MemorySnapshotService {
  constructor(options = {}) {
    this.contextManager = options.contextManager || contextManagerService;
    this.summaryService = options.summaryService || conversationSummaryService;
    this.workingMemoryService = options.workingMemoryService || workingMemoryService;
    this.snapshots = new Map();
  }

  buildSnapshot(conversationId) {
    const id = cleanText(conversationId);
    const existing = this.snapshots.get(id);
    const context = this.contextManager.buildContext(id);
    const summary = this.summaryService.getSummary(id);
    const workingMemory = this.workingMemoryService.getWorkingMemory(id);
    const structured = collectStructuredFields(context.messages, summary.summary);
    const snapshot = cloneSnapshot({
      ...createEmptySnapshot(id),
      ...existing,
      conversationId: id,
      conversationState: existing?.conversationState || inferStateFromMessages(context.messages),
      lastIntent: existing?.lastIntent || inferLastIntent(context.messages),
      ...structured,
      openTasks: workingMemory.activeTasks.map(taskLabel),
      completedTasks: this.workingMemoryService.listTasks(id, { status: 'completed' }).map(taskLabel),
      pendingActions: workingMemory.pendingActions,
      blockers: workingMemory.blockers,
      freeTextSummary: summary.summary,
      updatedAt: new Date().toISOString(),
    });

    if (id) this.snapshots.set(id, snapshot);
    return cloneSnapshot(snapshot);
  }

  getSnapshot(conversationId) {
    const id = cleanText(conversationId);
    const snapshot = this.snapshots.get(id);
    return snapshot ? cloneSnapshot(snapshot) : createEmptySnapshot(id);
  }

  updateSnapshot(conversationId, changes = {}) {
    const id = cleanText(conversationId);
    const current = this.snapshots.get(id) || createEmptySnapshot(id);
    const next = cloneSnapshot({
      ...current,
      ...changes,
      conversationId: id,
      conversationState: Object.prototype.hasOwnProperty.call(changes, 'conversationState')
        ? normalizeState(changes.conversationState, 'active')
        : current.conversationState,
      preferences: {
        ...current.preferences,
        ...sanitizeObject(changes.preferences),
      },
      userGoals: uniqueList([...(current.userGoals || []), ...(Array.isArray(changes.userGoals) ? changes.userGoals : [])]),
      openTasks: uniqueList([...(current.openTasks || []), ...(Array.isArray(changes.openTasks) ? changes.openTasks : [])]),
      completedTasks: uniqueList([
        ...(current.completedTasks || []),
        ...(Array.isArray(changes.completedTasks) ? changes.completedTasks : []),
      ]),
      importantFacts: uniqueList([
        ...(current.importantFacts || []),
        ...(Array.isArray(changes.importantFacts) ? changes.importantFacts : []),
      ]),
      importantEntities: uniqueList([
        ...(current.importantEntities || []),
        ...(Array.isArray(changes.importantEntities) ? changes.importantEntities : []),
      ]),
      pendingQuestions: uniqueList([
        ...(current.pendingQuestions || []),
        ...(Array.isArray(changes.pendingQuestions) ? changes.pendingQuestions : []),
      ]),
      pendingActions: uniqueList([
        ...(current.pendingActions || []),
        ...(Array.isArray(changes.pendingActions) ? changes.pendingActions : []),
      ]),
      blockers: uniqueList([
        ...(current.blockers || []),
        ...(Array.isArray(changes.blockers) ? changes.blockers : []),
      ]),
      updatedAt: new Date().toISOString(),
    });

    if (id) this.snapshots.set(id, next);
    return cloneSnapshot(next);
  }

  clearSnapshot(conversationId) {
    const id = cleanText(conversationId);
    if (!id) return false;
    return this.snapshots.delete(id);
  }
}

const memorySnapshotService = new MemorySnapshotService();

module.exports = {
  MemorySnapshotService,
  memorySnapshotService,
};
