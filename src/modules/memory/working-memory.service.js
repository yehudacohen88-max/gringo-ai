const crypto = require('node:crypto');
const {
  SENSITIVE_METADATA_PATTERNS,
  WORKING_MEMORY_TASK_STATUSES,
} = require('./memory.constants');

const CHANNEL_FIELD_PATTERNS = [
  /^channel$/i,
  /^channel[A-Z_ -]?/i,
  /chatId/i,
  /messageId/i,
  /telegram/i,
  /whatsapp/i,
  /line/i,
];

const ACTIVE_TASK_STATUSES = ['pending', 'in_progress', 'waiting', 'failed'];

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function nowIso() {
  return new Date().toISOString();
}

function generateTaskId() {
  if (typeof crypto.randomUUID === 'function') return `wm_task_${crypto.randomUUID()}`;
  return `wm_task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createValidationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
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

function sanitizeValue(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeValue).filter((item) => item !== '' && item !== undefined);
  }
  if (value && typeof value === 'object') {
    const result = {};
    for (const [key, rawValue] of Object.entries(value)) {
      if (isSensitiveKey(key)) continue;
      const sanitized = sanitizeValue(rawValue);
      if (sanitized === '' || sanitized === undefined) continue;
      if (Array.isArray(sanitized) && sanitized.length === 0) continue;
      if (sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized) && Object.keys(sanitized).length === 0) continue;
      result[key] = sanitized;
    }
    return result;
  }
  if (typeof value === 'string' || value === undefined || value === null) return sanitizeText(value);
  return value;
}

function normalizeStatus(value, fallback = 'pending') {
  const status = cleanText(value || fallback).toLowerCase();
  if (!WORKING_MEMORY_TASK_STATUSES.includes(status)) {
    throw createValidationError('Invalid working-memory task status.');
  }
  return status;
}

function cloneTask(task = {}) {
  return {
    taskId: cleanText(task.taskId),
    type: sanitizeText(task.type),
    status: normalizeStatus(task.status),
    input: sanitizeValue(task.input || {}),
    assignedTo: sanitizeText(task.assignedTo),
    createdAt: cleanText(task.createdAt),
    updatedAt: cleanText(task.updatedAt),
  };
}

function isActiveTask(task = {}) {
  return ACTIVE_TASK_STATUSES.includes(task.status);
}

function isExpired(value = {}, now = new Date()) {
  const expiresAt = cleanText(value.expiresAt);
  if (!expiresAt) return false;
  const expiresTime = Date.parse(expiresAt);
  return Number.isFinite(expiresTime) && expiresTime <= now.getTime();
}

function isTemporaryCompletedTask(task = {}) {
  const temporary = task.input?.temporary === true || /^temporary\b/i.test(task.type);
  return temporary && ['completed', 'cancelled'].includes(task.status);
}

function uniqueItems(items = []) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    const sanitized = sanitizeValue(item);
    if (sanitized === '' || sanitized === undefined) continue;
    const key = JSON.stringify(sanitized).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(sanitized);
  }

  return result;
}

function createEmptyWorkingMemory(conversationId) {
  return {
    conversationId: cleanText(conversationId),
    activeTasks: [],
    intermediateResults: [],
    dependencies: [],
    pendingActions: [],
    blockers: [],
    updatedAt: '',
  };
}

class WorkingMemoryService {
  constructor() {
    this.records = new Map();
  }

  ensureRecord(conversationId) {
    const id = cleanText(conversationId);
    const existing = this.records.get(id);
    if (existing) return existing;

    const record = {
      ...createEmptyWorkingMemory(id),
      tasksById: new Map(),
    };
    if (id) this.records.set(id, record);
    return record;
  }

  getWorkingMemory(conversationId) {
    const id = cleanText(conversationId);
    const record = this.records.get(id);
    if (!record) return createEmptyWorkingMemory(id);

    return {
      conversationId: id,
      activeTasks: [...record.tasksById.values()].filter(isActiveTask).map(cloneTask),
      intermediateResults: record.intermediateResults.map(sanitizeValue),
      dependencies: record.dependencies.map(sanitizeValue),
      pendingActions: record.pendingActions.map(sanitizeValue),
      blockers: record.blockers.map(sanitizeValue),
      updatedAt: cleanText(record.updatedAt),
    };
  }

  createTask(conversationId, task = {}) {
    const record = this.ensureRecord(conversationId);
    const timestamp = nowIso();
    const created = cloneTask({
      taskId: task.taskId || generateTaskId(),
      type: task.type,
      status: task.status || 'pending',
      input: task.input || {},
      assignedTo: task.assignedTo,
      createdAt: task.createdAt || timestamp,
      updatedAt: task.updatedAt || timestamp,
    });

    if (!created.type) {
      throw createValidationError('Working-memory task type is required.');
    }

    record.tasksById.set(created.taskId, created);
    record.updatedAt = timestamp;
    return cloneTask(created);
  }

  updateTask(conversationId, taskId, changes = {}) {
    const record = this.ensureRecord(conversationId);
    const id = cleanText(taskId);
    const existing = record.tasksById.get(id);
    if (!existing) return null;

    const updated = cloneTask({
      ...existing,
      ...changes,
      taskId: existing.taskId,
      status: Object.prototype.hasOwnProperty.call(changes, 'status')
        ? normalizeStatus(changes.status)
        : existing.status,
      input: Object.prototype.hasOwnProperty.call(changes, 'input') ? sanitizeValue(changes.input) : existing.input,
      createdAt: existing.createdAt,
      updatedAt: nowIso(),
    });

    record.tasksById.set(id, updated);
    record.updatedAt = updated.updatedAt;
    return cloneTask(updated);
  }

  getTask(conversationId, taskId) {
    const record = this.records.get(cleanText(conversationId));
    const task = record?.tasksById.get(cleanText(taskId));
    return task ? cloneTask(task) : null;
  }

  listTasks(conversationId, filters = {}) {
    const record = this.records.get(cleanText(conversationId));
    if (!record) return [];

    let tasks = [...record.tasksById.values()];
    if (filters.status) {
      const status = normalizeStatus(filters.status);
      tasks = tasks.filter((task) => task.status === status);
    }
    if (filters.active === true) tasks = tasks.filter(isActiveTask);
    if (filters.active === false) tasks = tasks.filter((task) => !isActiveTask(task));
    return tasks.map(cloneTask);
  }

  addIntermediateResult(conversationId, result) {
    const record = this.ensureRecord(conversationId);
    const sanitized = sanitizeValue(result);
    if (sanitized === '' || sanitized === undefined) return null;

    record.intermediateResults.push(sanitized);
    record.updatedAt = nowIso();
    return sanitizeValue(sanitized);
  }

  addDependency(conversationId, dependency) {
    const record = this.ensureRecord(conversationId);
    const next = uniqueItems([...record.dependencies, dependency]);
    const changed = next.length !== record.dependencies.length;
    record.dependencies = next;
    if (changed) record.updatedAt = nowIso();
    return sanitizeValue(record.dependencies.at(-1));
  }

  addBlocker(conversationId, blocker) {
    const record = this.ensureRecord(conversationId);
    const next = uniqueItems([...record.blockers, blocker]);
    const changed = next.length !== record.blockers.length;
    record.blockers = next;
    if (changed) record.updatedAt = nowIso();
    return sanitizeValue(record.blockers.at(-1));
  }

  addPendingAction(conversationId, action) {
    const record = this.ensureRecord(conversationId);
    const sanitized = sanitizeValue(action);
    if (sanitized === '' || sanitized === undefined) return null;

    record.pendingActions = uniqueItems([...record.pendingActions, sanitized]);
    record.updatedAt = nowIso();
    return sanitizeValue(sanitized);
  }

  cleanupConversation(conversationId, options = {}) {
    const record = this.records.get(cleanText(conversationId));
    if (!record) {
      return {
        removedIntermediateResults: 0,
        removedTasks: 0,
      };
    }

    const now = options.now instanceof Date ? options.now : new Date();
    const previousResults = record.intermediateResults.length;
    record.intermediateResults = record.intermediateResults.filter((result) => {
      if (result?.obsolete === true) return false;
      if (isExpired(result, now)) return false;
      return true;
    });

    let removedTasks = 0;
    for (const [taskId, task] of record.tasksById.entries()) {
      if (isTemporaryCompletedTask(task)) {
        record.tasksById.delete(taskId);
        removedTasks += 1;
      }
    }

    if (previousResults !== record.intermediateResults.length || removedTasks > 0) {
      record.updatedAt = nowIso();
    }

    return {
      removedIntermediateResults: previousResults - record.intermediateResults.length,
      removedTasks,
    };
  }

  clearWorkingMemory(conversationId) {
    const id = cleanText(conversationId);
    if (!id) return false;
    return this.records.delete(id);
  }
}

const workingMemoryService = new WorkingMemoryService();

module.exports = {
  WORKING_MEMORY_TASK_STATUSES,
  WorkingMemoryService,
  workingMemoryService,
};
