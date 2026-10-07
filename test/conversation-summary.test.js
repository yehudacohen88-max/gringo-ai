const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ContextManagerService,
  ConversationMemoryService,
  ConversationSummaryService,
} = require('../src/modules/memory');

function createServices(options = {}) {
  const memory = new ConversationMemoryService({ maxMessages: options.memoryMaxMessages || 100 });
  const contextManager = new ContextManagerService({
    memoryService: memory,
    maxMessages: options.contextMaxMessages || 12,
    maxCharacters: options.contextMaxCharacters || 12000,
  });
  const summary = new ConversationSummaryService({
    memoryService: memory,
    contextManager,
    triggerMessages: options.triggerMessages || 20,
    maxCharacters: options.maxCharacters || 2500,
  });
  return { contextManager, memory, summary };
}

function add(memory, conversationId, role, content, index, metadata = {}) {
  return memory.addMessage(conversationId, {
    role,
    content,
    timestamp: `2026-07-28T08:${String(index).padStart(2, '0')}:00.000Z`,
    metadata,
  });
}

test('summary is created', () => {
  const { memory, summary } = createServices();

  add(memory, 'conv_1', 'user', 'I am looking for construction work in Tel Aviv', 1);
  const result = summary.createSummary('conv_1');

  assert.equal(result.conversationId, 'conv_1');
  assert.match(result.summary, /construction work in Tel Aviv/);
  assert.equal(result.messageCount, 1);
  assert.equal(result.version, 1);
  assert.ok(result.createdAt);
  assert.ok(result.updatedAt);
});

test('summary is updated when explicitly refreshed', () => {
  const { memory, summary } = createServices();

  add(memory, 'conv_1', 'user', 'I need a room in Tel Aviv', 1);
  const first = summary.createSummary('conv_1');
  add(memory, 'conv_1', 'user', 'My housing budget is 2000 shekels', 2);
  const second = summary.updateSummary('conv_1', { force: true });

  assert.match(first.summary, /room in Tel Aviv/);
  assert.match(second.summary, /housing budget is 2000/);
  assert.equal(second.createdAt, first.createdAt);
  assert.ok(second.updatedAt >= first.updatedAt);
  assert.equal(second.messageCount, 2);
});

test('empty conversation returns an empty summary', () => {
  const { summary } = createServices();

  const result = summary.createSummary('missing');

  assert.equal(result.summary, '');
  assert.equal(result.messageCount, 0);
});

test('long conversation triggers summary refresh', () => {
  const { memory, summary } = createServices({ triggerMessages: 2 });

  add(memory, 'conv_1', 'user', 'I need a job in Tel Aviv', 1);
  const first = summary.updateSummary('conv_1');
  add(memory, 'conv_1', 'assistant', 'I found construction jobs', 2);
  add(memory, 'conv_1', 'user', 'I prefer construction worker jobs', 3);
  const second = summary.updateSummary('conv_1');

  assert.equal(first.messageCount, 1);
  assert.equal(second.messageCount, 3);
  assert.match(second.summary, /construction worker jobs/);
});

test('duplicate information is removed', () => {
  const { memory, summary } = createServices();

  add(memory, 'conv_1', 'user', 'I need a job in Tel Aviv', 1);
  add(memory, 'conv_1', 'user', 'I need a job in Tel Aviv', 2);

  const result = summary.createSummary('conv_1');
  const matches = result.summary.match(/I need a job in Tel Aviv/g) || [];

  assert.equal(matches.length, 1);
});

test('greetings are excluded', () => {
  const { memory, summary } = createServices();

  add(memory, 'conv_1', 'user', 'Hello', 1);
  add(memory, 'conv_1', 'assistant', 'Hi', 2);
  add(memory, 'conv_1', 'user', 'I want to send money to Thailand', 3);

  const result = summary.createSummary('conv_1');

  assert.doesNotMatch(result.summary, /Hello|Hi/);
  assert.match(result.summary, /send money to Thailand/);
});

test('original messages are preserved', () => {
  const { memory, summary } = createServices();

  add(memory, 'conv_1', 'user', 'I need to renew my visa', 1);
  const before = memory.getRecentMessages('conv_1');

  summary.createSummary('conv_1');
  const after = memory.getRecentMessages('conv_1');

  assert.deepEqual(after, before);
});

test('separate conversations remain isolated', () => {
  const { memory, summary } = createServices();

  add(memory, 'conv_1', 'user', 'I need a job in Tel Aviv', 1);
  add(memory, 'conv_2', 'user', 'I need housing in Ashdod', 1);

  assert.match(summary.createSummary('conv_1').summary, /job in Tel Aviv/);
  assert.doesNotMatch(summary.getSummary('conv_1').summary, /housing in Ashdod/);
  assert.match(summary.createSummary('conv_2').summary, /housing in Ashdod/);
});

test('summary size limit is respected', () => {
  const { memory, summary } = createServices({ maxCharacters: 90 });

  add(memory, 'conv_1', 'user', 'I need a construction job in Tel Aviv with morning hours and weekly payment', 1);
  add(memory, 'conv_1', 'user', 'I prefer housing near the bus station with a budget of 2000 shekels', 2);
  add(memory, 'conv_1', 'user', 'I want to send money to Thailand every Friday', 3);

  const result = summary.createSummary('conv_1');

  assert.equal(result.summary.length <= 90, true);
});

test('summary is not refreshed before trigger when an existing summary is present', () => {
  const { memory, summary } = createServices({ triggerMessages: 10 });

  add(memory, 'conv_1', 'user', 'I need a job in Tel Aviv', 1);
  const first = summary.createSummary('conv_1');
  add(memory, 'conv_1', 'user', 'I prefer construction work', 2);
  const second = summary.updateSummary('conv_1');

  assert.deepEqual(second, first);
});
