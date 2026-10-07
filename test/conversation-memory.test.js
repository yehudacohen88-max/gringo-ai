const test = require('node:test');
const assert = require('node:assert/strict');

const { ConversationMemoryService } = require('../src/modules/memory');

function createService(options = {}) {
  return new ConversationMemoryService({ maxMessages: 20, ...options });
}

test('adds user messages', () => {
  const service = createService();

  const saved = service.addMessage('conv_1', {
    role: 'user',
    content: 'Hello Gringo',
    timestamp: '2026-07-28T08:00:00.000Z',
  });

  assert.equal(saved.role, 'user');
  assert.equal(saved.content, 'Hello Gringo');
  assert.equal(service.getRecentMessages('conv_1').length, 1);
});

test('adds assistant messages', () => {
  const service = createService();

  service.addMessage('conv_1', {
    role: 'assistant',
    content: 'I can help.',
  });

  assert.equal(service.getRecentMessages('conv_1')[0].role, 'assistant');
});

test('preserves message order', () => {
  const service = createService();

  service.addMessage('conv_1', { role: 'user', content: 'first' });
  service.addMessage('conv_1', { role: 'assistant', content: 'second' });
  service.addMessage('conv_1', { role: 'user', content: 'third' });

  assert.deepEqual(
    service.getRecentMessages('conv_1').map((message) => message.content),
    ['first', 'second', 'third']
  );
});

test('ignores empty messages', () => {
  const service = createService();

  assert.equal(service.addMessage('conv_1', { role: 'user', content: '   ' }), null);
  assert.deepEqual(service.getRecentMessages('conv_1'), []);
});

test('applies maximum message limit', () => {
  const service = createService({ maxMessages: 3 });

  service.addMessage('conv_1', { role: 'user', content: 'one' });
  service.addMessage('conv_1', { role: 'assistant', content: 'two' });
  service.addMessage('conv_1', { role: 'user', content: 'three' });

  assert.equal(service.getRecentMessages('conv_1').length, 3);
});

test('removes oldest message when limit is exceeded', () => {
  const service = createService({ maxMessages: 2 });

  service.addMessage('conv_1', { role: 'user', content: 'oldest' });
  service.addMessage('conv_1', { role: 'assistant', content: 'middle' });
  service.addMessage('conv_1', { role: 'user', content: 'newest' });

  assert.deepEqual(
    service.getRecentMessages('conv_1').map((message) => message.content),
    ['middle', 'newest']
  );
});

test('clears a conversation', () => {
  const service = createService();

  service.addMessage('conv_1', { role: 'user', content: 'Hello' });

  assert.equal(service.clearConversation('conv_1'), true);
  assert.deepEqual(service.getRecentMessages('conv_1'), []);
});

test('keeps separate conversations isolated', () => {
  const service = createService();

  service.addMessage('conv_1', { role: 'user', content: 'One' });
  service.addMessage('conv_2', { role: 'user', content: 'Two' });

  assert.equal(service.getRecentMessages('conv_1')[0].content, 'One');
  assert.equal(service.getRecentMessages('conv_2')[0].content, 'Two');
});

test('missing conversation returns an empty result and safe summary', () => {
  const service = createService();

  assert.deepEqual(service.getRecentMessages('missing'), []);
  assert.deepEqual(service.getConversationSummary('missing'), {
    conversationId: 'missing',
    messageCount: 0,
    firstMessageAt: '',
    lastMessageAt: '',
    roles: {
      user: 0,
      assistant: 0,
      system: 0,
    },
  });
});

test('input objects are not mutated', () => {
  const service = createService();
  const input = {
    role: 'user',
    content: 'Hello',
    timestamp: '2026-07-28T08:00:00.000Z',
    metadata: {
      source: 'web',
      apiKey: 'should-not-be-stored',
    },
  };
  const snapshot = JSON.parse(JSON.stringify(input));

  service.addMessage('conv_1', input);
  const saved = service.getRecentMessages('conv_1')[0];

  assert.deepEqual(input, snapshot);
  assert.equal(saved.metadata.source, 'web');
  assert.equal(Object.prototype.hasOwnProperty.call(saved.metadata, 'apiKey'), false);
});
