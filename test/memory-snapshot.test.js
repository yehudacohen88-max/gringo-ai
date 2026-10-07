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
  conversationMemoryService,
  conversationSummaryService,
  memorySnapshotService,
} = require('../src/modules/memory');

function createServices() {
  const memory = new ConversationMemoryService({ maxMessages: 100 });
  const contextManager = new ContextManagerService({ memoryService: memory, maxMessages: 12 });
  const summaryService = new ConversationSummaryService({ memoryService: memory, contextManager });
  const snapshotService = new MemorySnapshotService({ contextManager, summaryService });
  return { contextManager, memory, snapshotService, summaryService };
}

function add(memory, conversationId, role, content, index, metadata = {}) {
  return memory.addMessage(conversationId, {
    role,
    content,
    timestamp: `2026-07-28T08:${String(index).padStart(2, '0')}:00.000Z`,
    metadata,
  });
}

function completeProfile(overrides = {}) {
  return {
    userId: 'usr_snapshot',
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

test('snapshot is created from summary and recent context', () => {
  const { memory, snapshotService, summaryService } = createServices();

  add(memory, 'conv_1', 'user', 'I am looking for construction work in Tel Aviv', 1);
  summaryService.createSummary('conv_1');

  const snapshot = snapshotService.buildSnapshot('conv_1');

  assert.equal(snapshot.version, 1);
  assert.equal(snapshot.conversationId, 'conv_1');
  assert.equal(snapshot.conversationState, 'active');
  assert.equal(snapshot.lastIntent, 'Jobs');
  assert.match(snapshot.freeTextSummary, /construction work in Tel Aviv/);
  assert.deepEqual(snapshot.importantEntities, ['construction', 'Tel Aviv']);
  assert.ok(snapshot.updatedAt);
});

test('default state is idle for missing conversation', () => {
  const { snapshotService } = createServices();

  assert.equal(snapshotService.getSnapshot('missing').conversationState, 'idle');
  assert.deepEqual(snapshotService.getSnapshot('missing').userGoals, []);
});

test('partial update preserves existing fields', () => {
  const { snapshotService } = createServices();

  snapshotService.updateSnapshot('conv_1', {
    conversationState: 'active',
    userGoals: ['Find Job'],
    preferences: { city: 'Tel Aviv' },
  });
  const updated = snapshotService.updateSnapshot('conv_1', {
    openTasks: ['Call employer'],
  });

  assert.equal(updated.conversationState, 'active');
  assert.deepEqual(updated.userGoals, ['Find Job']);
  assert.deepEqual(updated.openTasks, ['Call employer']);
  assert.deepEqual(updated.preferences, { city: 'Tel Aviv' });
});

test('duplicate values are removed', () => {
  const { snapshotService } = createServices();

  const snapshot = snapshotService.updateSnapshot('conv_1', {
    userGoals: ['Find Job', 'find job', 'Find Housing'],
    importantEntities: ['Tel Aviv', 'tel aviv'],
  });

  assert.deepEqual(snapshot.userGoals, ['Find Job', 'Find Housing']);
  assert.deepEqual(snapshot.importantEntities, ['Tel Aviv']);
});

test('empty and sensitive values are ignored', () => {
  const { snapshotService } = createServices();

  const snapshot = snapshotService.updateSnapshot('conv_1', {
    userGoals: ['', '  ', 'Find Job', 'api key should be removed'],
    preferences: {
      city: 'Tel Aviv',
      accessToken: 'secret-token',
      empty: '',
    },
    importantFacts: ['provider error with raw details', 'Preferred currency is THB'],
  });

  assert.deepEqual(snapshot.userGoals, ['Find Job']);
  assert.deepEqual(snapshot.preferences, { city: 'Tel Aviv' });
  assert.deepEqual(snapshot.importantFacts, ['Preferred currency is THB']);
});

test('invalid state falls back safely to active', () => {
  const { snapshotService } = createServices();

  const snapshot = snapshotService.updateSnapshot('conv_1', {
    conversationState: 'surprising-new-state',
  });

  assert.equal(snapshot.conversationState, 'active');
});

test('conversations remain isolated', () => {
  const { snapshotService } = createServices();

  snapshotService.updateSnapshot('conv_1', { userGoals: ['Find Job'] });
  snapshotService.updateSnapshot('conv_2', { userGoals: ['Find Housing'] });

  assert.deepEqual(snapshotService.getSnapshot('conv_1').userGoals, ['Find Job']);
  assert.deepEqual(snapshotService.getSnapshot('conv_2').userGoals, ['Find Housing']);
});

test('original memory and summary are unchanged', () => {
  const { memory, snapshotService, summaryService } = createServices();

  add(memory, 'conv_1', 'user', 'I need to renew my visa', 1);
  summaryService.createSummary('conv_1');
  const messagesBefore = memory.getRecentMessages('conv_1');
  const summaryBefore = summaryService.getSummary('conv_1');

  snapshotService.buildSnapshot('conv_1');

  assert.deepEqual(memory.getRecentMessages('conv_1'), messagesBefore);
  assert.deepEqual(summaryService.getSummary('conv_1'), summaryBefore);
});

test('missing summary returns a valid empty snapshot', () => {
  const { snapshotService } = createServices();

  const snapshot = snapshotService.buildSnapshot('missing');

  assert.equal(snapshot.freeTextSummary, '');
  assert.equal(snapshot.conversationState, 'idle');
  assert.equal(snapshot.version, 1);
});

test('Core Agent receives the snapshot', async () => {
  const profile = completeProfile();
  const conversationId = 'web:snapshot-core-user';
  const aiContexts = [];

  conversationMemoryService.clearConversation(conversationId);
  conversationSummaryService.clearSummary(conversationId);
  memorySnapshotService.clearSnapshot(conversationId);
  conversationMemoryService.addMessage(conversationId, {
    role: 'user',
    content: 'I need a job in Tel Aviv',
    timestamp: '2026-07-28T08:00:00.000Z',
  });
  conversationSummaryService.createSummary(conversationId);

  crmAgentService.findOrCreateUser = async () => ({
    userId: profile.userId,
    channel: 'web',
    channelUserId: 'snapshot-core-user',
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
    channelUserId: 'snapshot-core-user',
  });

  assert.equal(aiContexts.length, 1);
  assert.equal(aiContexts[0].memorySnapshot.conversationId, conversationId);
  assert.equal(aiContexts[0].memorySnapshot.version, 1);
  assert.match(aiContexts[0].memorySnapshot.freeTextSummary, /job in Tel Aviv/);
});

test('input changes object is not mutated', () => {
  const { snapshotService } = createServices();
  const changes = {
    userGoals: ['Find Job', 'Find Job'],
    preferences: {
      city: 'Tel Aviv',
      token: 'secret',
    },
  };
  const before = JSON.parse(JSON.stringify(changes));

  snapshotService.updateSnapshot('conv_1', changes);

  assert.deepEqual(changes, before);
});
