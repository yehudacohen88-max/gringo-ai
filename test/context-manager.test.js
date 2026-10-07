const test = require('node:test');
const assert = require('node:assert/strict');

const { aiProviderService } = require('../src/modules/ai-provider');
const { coreAgentService } = require('../src/modules/core-agent');
const { crmAgentService } = require('../src/modules/crm-agent');
const { knowledgeAgentService } = require('../src/modules/knowledge-agent');
const {
  ContextManagerService,
  ConversationMemoryService,
  conversationMemoryService,
} = require('../src/modules/memory');

function add(service, conversationId, role, content, timestamp, metadata = {}) {
  return service.addMessage(conversationId, {
    role,
    content,
    timestamp,
    metadata,
  });
}

function completeProfile(overrides = {}) {
  return {
    userId: 'usr_context_manager',
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

test('recent messages are selected', () => {
  const memory = new ConversationMemoryService();
  const manager = new ContextManagerService({ memoryService: memory, maxMessages: 2 });

  add(memory, 'conv_1', 'user', 'old', '2026-07-28T08:00:00.000Z');
  add(memory, 'conv_1', 'assistant', 'recent one', '2026-07-28T08:01:00.000Z');
  add(memory, 'conv_1', 'user', 'recent two', '2026-07-28T08:02:00.000Z');

  assert.deepEqual(
    manager.buildContext('conv_1').messages.map((message) => message.content),
    ['recent one', 'recent two']
  );
});

test('chronological order is preserved', () => {
  const memory = new ConversationMemoryService();
  const manager = new ContextManagerService({ memoryService: memory });

  add(memory, 'conv_1', 'assistant', 'second', '2026-07-28T08:01:00.000Z');
  add(memory, 'conv_1', 'user', 'first', '2026-07-28T08:00:00.000Z');

  assert.deepEqual(
    manager.buildContext('conv_1').messages.map((message) => message.content),
    ['first', 'second']
  );
});

test('oldest messages are removed when limits are exceeded', () => {
  const memory = new ConversationMemoryService();
  const manager = new ContextManagerService({ memoryService: memory, maxMessages: 2 });

  add(memory, 'conv_1', 'user', 'oldest', '2026-07-28T08:00:00.000Z');
  add(memory, 'conv_1', 'assistant', 'middle', '2026-07-28T08:01:00.000Z');
  add(memory, 'conv_1', 'user', 'newest', '2026-07-28T08:02:00.000Z');

  const context = manager.buildContext('conv_1');

  assert.equal(context.truncated, true);
  assert.deepEqual(context.messages.map((message) => message.content), ['middle', 'newest']);
});

test('current user message is preserved when trimming', () => {
  const memory = new ConversationMemoryService();
  const manager = new ContextManagerService({ memoryService: memory, maxMessages: 1 });

  add(memory, 'conv_1', 'assistant', 'previous answer', '2026-07-28T08:00:00.000Z');
  const context = manager.buildContext('conv_1', {
    currentMessage: {
      role: 'user',
      content: 'current question',
      timestamp: '2026-07-28T08:01:00.000Z',
    },
  });

  assert.deepEqual(context.messages.map((message) => message.content), ['current question']);
});

test('empty messages are ignored', () => {
  const manager = new ContextManagerService({ memoryService: new ConversationMemoryService() });

  const selected = manager.selectRelevantMessages([
    { role: 'user', content: 'Hello', timestamp: '2026-07-28T08:00:00.000Z' },
    { role: 'assistant', content: '   ', timestamp: '2026-07-28T08:01:00.000Z' },
  ]);

  assert.equal(selected.length, 1);
  assert.equal(selected[0].content, 'Hello');
});

test('internal-only system messages are excluded', () => {
  const manager = new ContextManagerService({ memoryService: new ConversationMemoryService() });

  const selected = manager.selectRelevantMessages([
    {
      role: 'system',
      content: 'internal note',
      timestamp: '2026-07-28T08:00:00.000Z',
      metadata: { internalOnly: true },
    },
    { role: 'user', content: 'visible', timestamp: '2026-07-28T08:01:00.000Z' },
  ]);

  assert.deepEqual(selected.map((message) => message.content), ['visible']);
});

test('separate conversations remain isolated', () => {
  const memory = new ConversationMemoryService();
  const manager = new ContextManagerService({ memoryService: memory });

  add(memory, 'conv_1', 'user', 'one', '2026-07-28T08:00:00.000Z');
  add(memory, 'conv_2', 'user', 'two', '2026-07-28T08:00:00.000Z');

  assert.equal(manager.buildContext('conv_1').messages[0].content, 'one');
  assert.equal(manager.buildContext('conv_2').messages[0].content, 'two');
});

test('stored messages are not mutated and sensitive metadata is excluded', () => {
  const memory = new ConversationMemoryService();
  const manager = new ContextManagerService({ memoryService: memory });

  add(memory, 'conv_1', 'user', 'hello', '2026-07-28T08:00:00.000Z', {
    source: 'web',
    channel: 'telegram',
    accessToken: 'secret',
  });
  const before = memory.getRecentMessages('conv_1')[0];
  const context = manager.buildContext('conv_1');
  const after = memory.getRecentMessages('conv_1')[0];

  assert.deepEqual(after, before);
  assert.equal(context.messages[0].metadata.source, 'web');
  assert.equal(Object.prototype.hasOwnProperty.call(context.messages[0].metadata, 'channel'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(context.messages[0].metadata, 'accessToken'), false);
});

test('missing conversation returns empty context', () => {
  const manager = new ContextManagerService({ memoryService: new ConversationMemoryService() });

  assert.deepEqual(manager.buildContext('missing'), {
    conversationId: 'missing',
    messages: [],
    messageCount: 0,
    truncated: false,
    estimatedSize: 0,
  });
});

test('memory failure returns safe empty context', () => {
  const manager = new ContextManagerService({
    memoryService: {
      getRecentMessages: () => {
        throw new Error('memory unavailable');
      },
    },
  });

  assert.deepEqual(manager.buildContext('conv_1'), {
    conversationId: 'conv_1',
    messages: [],
    messageCount: 0,
    truncated: false,
    estimatedSize: 0,
  });
});

test('Core Agent receives the built context', async () => {
  const profile = completeProfile();
  const aiContexts = [];
  const conversationId = 'web:core-context-user';
  conversationMemoryService.clearConversation(conversationId);
  conversationMemoryService.addMessage(conversationId, {
    role: 'user',
    content: 'Earlier question',
    timestamp: '2026-07-28T08:00:00.000Z',
  });

  crmAgentService.findOrCreateUser = async () => ({
    userId: profile.userId,
    channel: 'web',
    channelUserId: 'core-context-user',
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
    channelUserId: 'core-context-user',
  });

  assert.equal(aiContexts.length, 1);
  assert.equal(aiContexts[0].conversationContext.conversationId, conversationId);
  assert.deepEqual(
    aiContexts[0].conversationContext.messages.map((message) => message.content),
    ['Earlier question', 'Hi Gringo']
  );
});

test('existing intent routing remains unchanged', async () => {
  const profile = completeProfile();

  crmAgentService.findOrCreateUser = async () => ({
    userId: profile.userId,
    channel: 'web',
    channelUserId: 'intent-context-user',
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

  const result = await coreAgentService.processWebMessage({
    message: 'I am looking for construction work in Tel Aviv',
    channel: 'web',
    channelUserId: 'intent-context-user',
  });

  assert.equal(result.category, 'Jobs');
  assert.match(result.reply, /job/i);
});
