const { env } = require('../../config/env');
const { MEMORY_LIFECYCLE_STATES } = require('./memory.constants');
const { contextManagerService } = require('./context-manager.service');
const { conversationSummaryService } = require('./conversation-summary.service');
const { memorySnapshotService } = require('./memory-snapshot.service');
const { workingMemoryService } = require('./working-memory.service');

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function nowIso(now = new Date()) {
  return now.toISOString();
}

function normalizeState(value, fallback = 'active') {
  const state = cleanText(value).toLowerCase();
  return MEMORY_LIFECYCLE_STATES.includes(state) ? state : fallback;
}

function minutesMs(value, fallback) {
  const number = Number(value);
  return (Number.isFinite(number) && number >= 0 ? number : fallback) * 60 * 1000;
}

function hoursMs(value, fallback) {
  const number = Number(value);
  return (Number.isFinite(number) && number >= 0 ? number : fallback) * 60 * 60 * 1000;
}

function isOlderThan(isoDate, durationMs, now = new Date()) {
  const time = Date.parse(cleanText(isoDate));
  if (!Number.isFinite(time)) return false;
  return now.getTime() - time >= durationMs;
}

function createRecord(conversationId, now = new Date()) {
  const timestamp = nowIso(now);
  return {
    conversationId: cleanText(conversationId),
    state: 'new',
    createdAt: timestamp,
    lastActivityAt: timestamp,
    archivedAt: '',
    closedAt: '',
    updatedAt: timestamp,
  };
}

function cloneRecord(record) {
  return {
    conversationId: cleanText(record.conversationId),
    state: normalizeState(record.state, 'active'),
    createdAt: cleanText(record.createdAt),
    lastActivityAt: cleanText(record.lastActivityAt),
    archivedAt: cleanText(record.archivedAt),
    closedAt: cleanText(record.closedAt),
    updatedAt: cleanText(record.updatedAt),
  };
}

function safeLogFailure(operation, error) {
  if (process.env.MEMORY_LIFECYCLE_LOG_FAILURES !== 'true') return;
  console.warn('[memory-lifecycle] maintenance failure', {
    operation,
    error: cleanText(error?.message) || 'unknown',
  });
}

class MemoryLifecycleService {
  constructor(options = {}) {
    this.contextManager = options.contextManager || contextManagerService;
    this.summaryService = options.summaryService || conversationSummaryService;
    this.snapshotService = options.snapshotService || memorySnapshotService;
    this.workingMemoryService = options.workingMemoryService || workingMemoryService;
    this.idleMs = minutesMs(options.idleMinutes ?? env.memoryLifecycle?.idleMinutes, 30);
    this.archiveMs = hoursMs(options.archiveHours ?? env.memoryLifecycle?.archiveHours, 24);
    this.cleanupEnabled = options.cleanupEnabled ?? env.memoryLifecycle?.cleanupEnabled ?? true;
    this.records = new Map();
  }

  initializeConversation(conversationId, options = {}) {
    const id = cleanText(conversationId);
    const now = options.now instanceof Date ? options.now : new Date();
    const existing = this.records.get(id);
    if (existing) return cloneRecord(existing);

    const record = createRecord(id, now);
    if (id) this.records.set(id, record);
    return cloneRecord(record);
  }

  getLifecycle(conversationId) {
    const id = cleanText(conversationId);
    const record = this.records.get(id);
    return record ? cloneRecord(record) : null;
  }

  touchConversation(conversationId, options = {}) {
    const id = cleanText(conversationId);
    const now = options.now instanceof Date ? options.now : new Date();
    const record = this.records.get(id) || createRecord(id, now);

    if (!['archived', 'closed'].includes(record.state)) {
      record.state = normalizeState(options.state || 'active', 'active');
    }

    record.lastActivityAt = nowIso(now);
    record.updatedAt = nowIso(now);
    if (id) this.records.set(id, record);
    return cloneRecord(record);
  }

  refreshSummaryIfNeeded(conversationId, options = {}) {
    try {
      return this.summaryService.updateSummary(conversationId, {
        force: Boolean(options.force),
      });
    } catch (error) {
      safeLogFailure('refreshSummaryIfNeeded', error);
      return this.summaryService.getSummary?.(conversationId) || null;
    }
  }

  refreshSnapshotIfNeeded(conversationId, options = {}) {
    try {
      const existing = this.snapshotService.getSnapshot(conversationId);
      if (options.force || !existing.updatedAt) return this.snapshotService.buildSnapshot(conversationId);

      const context = this.contextManager.buildContext(conversationId);
      if (context.truncated) return this.snapshotService.buildSnapshot(conversationId);

      return existing;
    } catch (error) {
      safeLogFailure('refreshSnapshotIfNeeded', error);
      return this.snapshotService.getSnapshot?.(conversationId) || null;
    }
  }

  cleanupConversation(conversationId, options = {}) {
    const id = cleanText(conversationId);
    const now = options.now instanceof Date ? options.now : new Date();
    const record = this.records.get(id) || createRecord(id, now);
    const result = {
      conversationId: id,
      expiredTemporaryContext: 0,
      removedIntermediateResults: 0,
      removedTasks: 0,
      state: record.state,
    };

    try {
      if (isOlderThan(record.lastActivityAt, this.idleMs, now) && ['new', 'active', 'waiting'].includes(record.state)) {
        record.state = 'idle';
      }

      if (this.cleanupEnabled) {
        const cleanup = this.workingMemoryService.cleanupConversation(id, { now });
        result.removedIntermediateResults = cleanup.removedIntermediateResults || 0;
        result.removedTasks = cleanup.removedTasks || 0;
      }

      record.updatedAt = nowIso(now);
      result.state = record.state;
      if (id) this.records.set(id, record);
      return result;
    } catch (error) {
      safeLogFailure('cleanupConversation', error);
      return result;
    }
  }

  archiveConversation(conversationId, options = {}) {
    const id = cleanText(conversationId);
    const now = options.now instanceof Date ? options.now : new Date();
    const record = this.records.get(id) || createRecord(id, now);
    const shouldArchive = options.force || isOlderThan(record.lastActivityAt, this.archiveMs, now);

    if (shouldArchive && record.state !== 'closed') {
      record.state = 'archived';
      record.archivedAt = nowIso(now);
      record.updatedAt = nowIso(now);
      if (id) this.records.set(id, record);
    }

    return cloneRecord(record);
  }

  closeConversation(conversationId, options = {}) {
    const id = cleanText(conversationId);
    const now = options.now instanceof Date ? options.now : new Date();
    const record = this.records.get(id) || createRecord(id, now);

    record.state = 'closed';
    record.closedAt = nowIso(now);
    record.updatedAt = nowIso(now);
    if (id) this.records.set(id, record);
    return cloneRecord(record);
  }

  notifyRequestCompleted(conversationId, options = {}) {
    try {
      this.initializeConversation(conversationId, options);
      const lifecycle = this.touchConversation(conversationId, {
        ...options,
        state: options.waitingForUser ? 'waiting' : 'active',
      });
      const summary = this.refreshSummaryIfNeeded(conversationId);
      const snapshot = this.refreshSnapshotIfNeeded(conversationId);
      const cleanup = this.cleanupConversation(conversationId);
      return {
        lifecycle,
        summary,
        snapshot,
        cleanup,
      };
    } catch (error) {
      safeLogFailure('notifyRequestCompleted', error);
      return {
        lifecycle: this.getLifecycle(conversationId),
        summary: null,
        snapshot: null,
        cleanup: null,
      };
    }
  }
}

const memoryLifecycleService = new MemoryLifecycleService();

module.exports = {
  MemoryLifecycleService,
  memoryLifecycleService,
};
