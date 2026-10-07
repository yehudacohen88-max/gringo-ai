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
  MemorySnapshotService,
  WorkingMemoryService,
  conversationMemoryService,
  conversationSummaryService,
  memorySnapshotService,
  workingMemoryService,
} = require('../src/modules/memory');

function createSnapshotServices() {
  const memory = new ConversationMemoryService({ maxMessages: 100 });
  const contextManager = new ContextManagerService({ memoryService: memory });
  const summaryService = new ConversationSummaryService({ memoryService: memory, contextManager });
  const workingMemory = new WorkingMemoryService();
  const snapshotService = new MemorySnapshotService({
    contextManager,
    summaryService,
    workingMemoryService: workingMemory,
  });
  return { memory, snapshotService, summaryService, workingMemory };
}

function completeProfile(overrides = {}) {
  return {
    userId: 'usr_working_memory',
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

test('creates a task', () => {
  const service = new WorkingMemoryService();

  const task = service.createTask('conv_1', {
    taskId: 'task_1',
    type: 'job_search',
    input: { city: 'Tel Aviv' },
    assignedTo: 'core',
  });

  assert.equal(task.taskId, 'task_1');
  assert.equal(task.status, 'pending');
  assert.equal(task.input.city, 'Tel Aviv');
});

test('generates taskId when missing', () => {
  const service = new WorkingMemoryService();

  const task = service.createTask('conv_1', {
    type: 'housing_search',
  });

  assert.match(task.taskId, /^wm_task_/);
});

test('updates task status', () => {
  const service = new WorkingMemoryService();
  const task = service.createTask('conv_1', { type: 'documents' });

  const updated = service.updateTask('conv_1', task.taskId, { status: 'in_progress' });

  assert.equal(updated.status, 'in_progress');
});

test('partial updates preserve unrelated fields', () => {
  const service = new WorkingMemoryService();
  const task = service.createTask('conv_1', {
    type: 'money_support',
    input: { amount: 2000, currency: 'ILS' },
    assignedTo: 'money',
  });

  const updated = service.updateTask('conv_1', task.taskId, { status: 'waiting' });

  assert.equal(updated.type, 'money_support');
  assert.equal(updated.input.amount, 2000);
  assert.equal(updated.assignedTo, 'money');
});

test('invalid status is rejected', () => {
  const service = new WorkingMemoryService();
  const task = service.createTask('conv_1', { type: 'job_search' });

  assert.throws(() => service.updateTask('conv_1', task.taskId, { status: 'almost_done' }), /Invalid/);
});

test('completed task is removed from active tasks', () => {
  const service = new WorkingMemoryService();
  const task = service.createTask('conv_1', { type: 'job_search' });

  service.updateTask('conv_1', task.taskId, { status: 'completed' });

  assert.deepEqual(service.getWorkingMemory('conv_1').activeTasks, []);
  assert.equal(service.getTask('conv_1', task.taskId).status, 'completed');
});

test('intermediate result is saved', () => {
  const service = new WorkingMemoryService();

  const result = service.addIntermediateResult('conv_1', { module: 'jobs', count: 3 });

  assert.deepEqual(result, { module: 'jobs', count: 3 });
  assert.deepEqual(service.getWorkingMemory('conv_1').intermediateResults, [{ module: 'jobs', count: 3 }]);
});

test('dependency is saved and duplicate dependency is ignored', () => {
  const service = new WorkingMemoryService();

  service.addDependency('conv_1', 'profile city');
  service.addDependency('conv_1', 'profile city');

  assert.deepEqual(service.getWorkingMemory('conv_1').dependencies, ['profile city']);
});

test('blocker is saved', () => {
  const service = new WorkingMemoryService();

  service.addBlocker('conv_1', 'missing visa expiry date');

  assert.deepEqual(service.getWorkingMemory('conv_1').blockers, ['missing visa expiry date']);
});

test('conversations remain isolated', () => {
  const service = new WorkingMemoryService();

  service.createTask('conv_1', { type: 'job_search' });
  service.createTask('conv_2', { type: 'housing_search' });

  assert.equal(service.listTasks('conv_1')[0].type, 'job_search');
  assert.equal(service.listTasks('conv_2')[0].type, 'housing_search');
});

test('input objects are not mutated and sensitive values are not stored', () => {
  const service = new WorkingMemoryService();
  const input = {
    type: 'service_search',
    input: {
      city: 'Tel Aviv',
      accessToken: 'secret-token',
      note: 'api key should be removed',
    },
  };
  const before = JSON.parse(JSON.stringify(input));

  const task = service.createTask('conv_1', input);

  assert.deepEqual(input, before);
  assert.deepEqual(task.input, { city: 'Tel Aviv' });
});

test('snapshot receives working-memory fields', () => {
  const { snapshotService, workingMemory } = createSnapshotServices();
  const task = workingMemory.createTask('conv_1', {
    type: 'job_search',
    input: { city: 'Tel Aviv' },
  });
  workingMemory.createTask('conv_1', {
    type: 'housing_search',
    input: { city: 'Tel Aviv' },
  });
  workingMemory.updateTask('conv_1', task.taskId, { status: 'completed' });
  workingMemory.addPendingAction('conv_1', 'ask user for budget');
  workingMemory.addBlocker('conv_1', 'missing profile profession');

  const snapshot = snapshotService.buildSnapshot('conv_1');

  assert.equal(snapshot.openTasks.length, 1);
  assert.match(snapshot.openTasks[0], /housing_search/);
  assert.equal(snapshot.completedTasks.length, 1);
  assert.match(snapshot.completedTasks[0], /job_search/);
  assert.deepEqual(snapshot.pendingActions, ['ask user for budget']);
  assert.deepEqual(snapshot.blockers, ['missing profile profession']);
});

test('Core Agent receives working memory', async () => {
  const profile = completeProfile();
  const conversationId = 'web:working-memory-core-user';
  const aiContexts = [];

  conversationMemoryService.clearConversation(conversationId);
  conversationSummaryService.clearSummary(conversationId);
  memorySnapshotService.clearSnapshot(conversationId);
  workingMemoryService.clearWorkingMemory(conversationId);
  workingMemoryService.createTask(conversationId, {
    type: 'job_search',
    input: { city: 'Tel Aviv' },
  });

  crmAgentService.findOrCreateUser = async () => ({
    userId: profile.userId,
    channel: 'web',
    channelUserId: 'working-memory-core-user',
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
    answer: '',
    category: 'Other',
    status: 'NOT_FOUND',
    relevantKnowledge: [],
  });
  aiProviderService.generateReply = async (context) => {
    aiContexts.push(context);
    return {
      provider: 'mock',
      model: 'mock-model',
      text: 'AI answer',
    };
  };

  await coreAgentService.processWebMessage({
    message: 'Hi Gringo',
    channel: 'web',
    channelUserId: 'working-memory-core-user',
  });

  assert.equal(aiContexts.length, 1);
  assert.equal(aiContexts[0].workingMemory.conversationId, conversationId);
  assert.equal(aiContexts[0].workingMemory.activeTasks.length, 1);
  assert.match(aiContexts[0].memorySnapshot.openTasks[0], /job_search/);
});

test('missing conversation returns valid empty working memory', () => {
  const service = new WorkingMemoryService();

  assert.deepEqual(service.getWorkingMemory('missing'), {
    conversationId: 'missing',
    activeTasks: [],
    intermediateResults: [],
    dependencies: [],
    pendingActions: [],
    blockers: [],
    updatedAt: '',
  });
});
