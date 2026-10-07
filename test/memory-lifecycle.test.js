const test = require('node:test');
const assert = require('node:assert/strict');

const { aiProviderService } = require('../src/modules/ai-provider');
const { coreAgentService } = require('../src/modules/core-agent');
const { crmAgentService } = require('../src/modules/crm-agent');
const { knowledgeAgentService } = require('../src/modules/knowledge-agent');
const {
  ContextManagerService,
  ConversationMemoryService,
  ConversationSummaryService,
  MemoryLifecycleService,
  MemorySnapshotService,
  WorkingMemoryService,
  memoryLifecycleService,
} = require('../src/modules/memory');

function createServices(options = {}) {
  const memory = new ConversationMemoryService({ maxMessages: 100 });
  const contextManager = new ContextManagerService({ memoryService: memory, maxMessages: options.contextMaxMessages || 12 });
  const summaryService = new ConversationSummaryService({
    memoryService: memory,
    contextManager,
    triggerMessages: options.summaryTriggerMessages || 2,
  });
  const workingMemoryService = new WorkingMemoryService();
  const snapshotService = new MemorySnapshotService({
    contextManager,
    summaryService,
    workingMemoryService,
  });
  const lifecycle = new MemoryLifecycleService({
    contextManager,
    summaryService,
    snapshotService,
    workingMemoryService,
    idleMinutes: options.idleMinutes ?? 30,
    archiveHours: options.archiveHours ?? 24,
    cleanupEnabled: options.cleanupEnabled ?? true,
  });
  return { lifecycle, memory, snapshotService, summaryService, workingMemoryService };
}

function add(memory, conversationId, role, content, index) {
  return memory.addMessage(conversationId, {
    role,
    content,
    timestamp: `2026-07-28T08:${String(index).padStart(2, '0')}:00.000Z`,
  });
}

function completeProfile(overrides = {}) {
  return {
    userId: 'usr_lifecycle',
    fullName: 'Somchai',
    country: 'Thailand',
    preferredLanguage: 'en',
    detectedLanguage: '',
    languageSource: '',
    language: '',
    workSector: 'Construction',
    profession: 'Construction worker',
    city: 'Tel Aviv',
    wantsJobAlerts: 'Yes',
    preferredCurrency: 'THB',
    wantsExchangeRateAlerts: 'Yes',
    ...overrides,
  };
}

test('new conversation is initialized', () => {
  const { lifecycle } = createServices();

  const record = lifecycle.initializeConversation('conv_1', {
    now: new Date('2026-07-28T08:00:00.000Z'),
  });

  assert.equal(record.conversationId, 'conv_1');
  assert.equal(record.state, 'new');
  assert.equal(record.createdAt, '2026-07-28T08:00:00.000Z');
});

test('active conversation is touched', () => {
  const { lifecycle } = createServices();

  lifecycle.initializeConversation('conv_1', { now: new Date('2026-07-28T08:00:00.000Z') });
  const record = lifecycle.touchConversation('conv_1', {
    now: new Date('2026-07-28T08:05:00.000Z'),
  });

  assert.equal(record.state, 'active');
  assert.equal(record.lastActivityAt, '2026-07-28T08:05:00.000Z');
});

test('idle transition occurs during cleanup', () => {
  const { lifecycle } = createServices({ idleMinutes: 30 });

  lifecycle.touchConversation('conv_1', { now: new Date('2026-07-28T08:00:00.000Z') });
  const cleanup = lifecycle.cleanupConversation('conv_1', {
    now: new Date('2026-07-28T08:31:00.000Z'),
  });

  assert.equal(cleanup.state, 'idle');
  assert.equal(lifecycle.getLifecycle('conv_1').state, 'idle');
});

test('archive transition occurs for inactive conversation', () => {
  const { lifecycle } = createServices({ archiveHours: 24 });

  lifecycle.touchConversation('conv_1', { now: new Date('2026-07-27T08:00:00.000Z') });
  const record = lifecycle.archiveConversation('conv_1', {
    now: new Date('2026-07-28T08:01:00.000Z'),
  });

  assert.equal(record.state, 'archived');
  assert.equal(record.archivedAt, '2026-07-28T08:01:00.000Z');
});

test('close transition marks conversation closed', () => {
  const { lifecycle } = createServices();

  lifecycle.touchConversation('conv_1', { now: new Date('2026-07-28T08:00:00.000Z') });
  const record = lifecycle.closeConversation('conv_1', {
    now: new Date('2026-07-28T08:10:00.000Z'),
  });

  assert.equal(record.state, 'closed');
  assert.equal(record.closedAt, '2026-07-28T08:10:00.000Z');
});

test('summary refresh trigger creates summary when needed', () => {
  const { lifecycle, memory } = createServices({ summaryTriggerMessages: 1 });

  add(memory, 'conv_1', 'user', 'I need a job in Tel Aviv', 1);
  const summary = lifecycle.refreshSummaryIfNeeded('conv_1');

  assert.match(summary.summary, /job in Tel Aviv/);
  assert.equal(summary.messageCount, 1);
});

test('snapshot refresh trigger creates snapshot when needed', () => {
  const { lifecycle, memory, summaryService } = createServices();

  add(memory, 'conv_1', 'user', 'I need housing in Tel Aviv', 1);
  summaryService.createSummary('conv_1');
  const snapshot = lifecycle.refreshSnapshotIfNeeded('conv_1');

  assert.equal(snapshot.conversationId, 'conv_1');
  assert.match(snapshot.freeTextSummary, /housing in Tel Aviv/);
});

test('cleanup removes only expired items and completed temporary tasks', () => {
  const { lifecycle, workingMemoryService } = createServices();
  const active = workingMemoryService.createTask('conv_1', {
    type: 'job_search',
    input: { temporary: true },
    status: 'in_progress',
  });
  const completedTemporary = workingMemoryService.createTask('conv_1', {
    type: 'temporary_lookup',
    input: { temporary: true },
    status: 'completed',
  });
  const completedPermanent = workingMemoryService.createTask('conv_1', {
    type: 'document_renewal',
    input: { temporary: false },
    status: 'completed',
  });
  workingMemoryService.addIntermediateResult('conv_1', {
    value: 'expired result',
    expiresAt: '2026-07-28T07:00:00.000Z',
  });
  workingMemoryService.addIntermediateResult('conv_1', {
    value: 'fresh result',
    expiresAt: '2026-07-28T09:00:00.000Z',
  });

  const cleanup = lifecycle.cleanupConversation('conv_1', {
    now: new Date('2026-07-28T08:00:00.000Z'),
  });

  assert.equal(cleanup.removedIntermediateResults, 1);
  assert.equal(cleanup.removedTasks, 1);
  assert.equal(workingMemoryService.getTask('conv_1', active.taskId).status, 'in_progress');
  assert.equal(workingMemoryService.getTask('conv_1', completedTemporary.taskId), null);
  assert.equal(workingMemoryService.getTask('conv_1', completedPermanent.taskId).status, 'completed');
  assert.deepEqual(workingMemoryService.getWorkingMemory('conv_1').intermediateResults, [
    { value: 'fresh result', expiresAt: '2026-07-28T09:00:00.000Z' },
  ]);
});

test('active tasks are preserved during cleanup', () => {
  const { lifecycle, workingMemoryService } = createServices();
  const task = workingMemoryService.createTask('conv_1', {
    type: 'temporary_lookup',
    input: { temporary: true },
    status: 'waiting',
  });

  lifecycle.cleanupConversation('conv_1');

  assert.equal(workingMemoryService.getTask('conv_1', task.taskId).status, 'waiting');
});

test('maintenance failures never affect user requests', async () => {
  const profile = completeProfile();
  const originalNotify = memoryLifecycleService.notifyRequestCompleted;
  memoryLifecycleService.notifyRequestCompleted = () => {
    throw new Error('maintenance unavailable');
  };

  crmAgentService.findOrCreateUser = async () => ({
    userId: profile.userId,
    channel: 'web',
    channelUserId: 'lifecycle-failure-user',
  });
  crmAgentService.getUserMemory = async () => profile;
  crmAgentService.getUserLanguage = async () => ({
    preferredLanguage: 'en',
    detectedLanguage: '',
    languageSource: '',
    languageUpdatedAt: '',
    language: 'en',
  });
  crmAgentService.updateDetectedLanguage = async () => ({});
  crmAgentService.updateUserProfile = async (userId, updates) => ({ ...profile, ...updates, userId });
  crmAgentService.saveConversation = async (event) => event;
  crmAgentService.extractAndUpdateMemory = async () => ({ signals: { interests: [] } });
  knowledgeAgentService.answerQuestion = async () => ({
    answer: 'Knowledge answer',
    category: 'Rights',
    status: 'FOUND',
    relevantKnowledge: [],
  });
  aiProviderService.generateReply = async () => ({
    provider: 'mock',
    model: 'mock-model',
    text: 'AI answer',
  });

  try {
    const result = await coreAgentService.processWebMessage({
      message: 'What are my rights?',
      channel: 'web',
      channelUserId: 'lifecycle-failure-user',
    });

    assert.equal(result.reply, 'Knowledge answer');
  } finally {
    memoryLifecycleService.notifyRequestCompleted = originalNotify;
  }
});

test('conversations remain isolated', () => {
  const { lifecycle } = createServices();

  lifecycle.touchConversation('conv_1', { state: 'waiting' });
  lifecycle.archiveConversation('conv_2', { force: true });

  assert.equal(lifecycle.getLifecycle('conv_1').state, 'waiting');
  assert.equal(lifecycle.getLifecycle('conv_2').state, 'archived');
});
