const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AgentRegistryService,
  SupervisorService,
  supervisorService,
} = require('../src/modules/agents');

function createRequiredInput(overrides = {}) {
  return {
    requestId: 'req_1',
    conversationId: 'web:user_1',
    ...overrides,
  };
}

test('valid request context is created', () => {
  const context = supervisorService.createRequestContext(createRequiredInput({
    userId: 'user_1',
    message: 'hello',
  }));

  assert.equal(context.requestId, 'req_1');
  assert.equal(context.conversationId, 'web:user_1');
  assert.equal(context.userId, 'user_1');
  assert.equal(context.message, 'hello');
  assert.match(context.createdAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('missing requestId is rejected', () => {
  assert.throws(
    () => supervisorService.createRequestContext({ conversationId: 'web:user_1' }),
    /requestId is required/
  );
});

test('empty requestId is rejected', () => {
  assert.throws(
    () => supervisorService.createRequestContext(createRequiredInput({ requestId: '   ' })),
    /requestId is required/
  );
});

test('missing conversationId is rejected', () => {
  assert.throws(
    () => supervisorService.createRequestContext({ requestId: 'req_1' }),
    /conversationId is required/
  );
});

test('empty conversationId is rejected', () => {
  assert.throws(
    () => supervisorService.createRequestContext(createRequiredInput({ conversationId: '   ' })),
    /conversationId is required/
  );
});

test('safe defaults are applied', () => {
  const context = supervisorService.createRequestContext(createRequiredInput());

  assert.equal(context.userId, null);
  assert.equal(context.message, '');
  assert.equal(context.detectedLanguage, null);
  assert.equal(context.preferredLanguage, null);
  assert.equal(context.memorySnapshot, null);
  assert.equal(context.workingMemory, null);
  assert.deepEqual(context.recentContext, []);
  assert.deepEqual(context.metadata, {});
});

test('message is converted to a string', () => {
  const context = supervisorService.createRequestContext(createRequiredInput({ message: 12345 }));

  assert.equal(context.message, '12345');
});

test('message is trimmed', () => {
  const context = supervisorService.createRequestContext(createRequiredInput({ message: '  hello  ' }));

  assert.equal(context.message, 'hello');
});

test('recentContext defaults to an empty array', () => {
  const context = supervisorService.createRequestContext(createRequiredInput());

  assert.deepEqual(context.recentContext, []);
});

test('invalid recentContext is replaced safely', () => {
  const context = supervisorService.createRequestContext(createRequiredInput({ recentContext: 'not-array' }));

  assert.deepEqual(context.recentContext, []);
});

test('metadata defaults to an empty object', () => {
  const context = supervisorService.createRequestContext(createRequiredInput());

  assert.deepEqual(context.metadata, {});
});

test('invalid metadata is replaced safely', () => {
  const context = supervisorService.createRequestContext(createRequiredInput({ metadata: ['not-object'] }));

  assert.deepEqual(context.metadata, {});
});

test('sensitive metadata is removed', () => {
  const context = supervisorService.createRequestContext(createRequiredInput({
    metadata: {
      accessToken: 'secret',
      refreshToken: 'secret',
      password: 'secret',
      authorization: 'Bearer secret',
      apiKey: 'secret',
      credentials: { token: 'secret' },
      rawProviderError: 'full error',
      safeTraceId: 'trace_1',
    },
  }));

  assert.deepEqual(context.metadata, { safeTraceId: 'trace_1' });
});

test('input object is not mutated', () => {
  const input = createRequiredInput({
    message: '  hello  ',
    recentContext: [{ role: 'user', content: 'hi' }],
    metadata: { accessToken: 'secret', safeTraceId: 'trace_1' },
  });
  const before = JSON.stringify(input);

  supervisorService.createRequestContext(input);

  assert.equal(JSON.stringify(input), before);
});

test('unique conversations remain isolated', () => {
  const first = supervisorService.createRequestContext(createRequiredInput({
    requestId: 'req_1',
    conversationId: 'web:user_1',
    metadata: { safeTraceId: 'first' },
  }));
  const second = supervisorService.createRequestContext(createRequiredInput({
    requestId: 'req_2',
    conversationId: 'telegram:user_2',
    metadata: { safeTraceId: 'second' },
  }));

  assert.equal(first.conversationId, 'web:user_1');
  assert.equal(second.conversationId, 'telegram:user_2');
  assert.notDeepEqual(first.metadata, second.metadata);
});

test('request context does not include a plan', () => {
  const context = supervisorService.createRequestContext(createRequiredInput());

  assert.equal(Object.hasOwn(context, 'plan'), false);
});

test('no Domain Agent is executed', () => {
  const registry = new AgentRegistryService();
  let executed = false;

  registry.registerAgent({
    id: 'spy_agent',
    name: 'Spy Agent',
    version: '1',
    domain: 'spy',
    capabilities: ['spy.run'],
    initialize: async () => ({ initialized: true }),
    health: async () => ({ status: 'ok' }),
    validate: async () => ({ valid: true }),
    execute: async () => {
      executed = true;
      return { status: 'success' };
    },
  });

  supervisorService.createRequestContext(createRequiredInput());

  assert.equal(registry.hasAgent('spy_agent'), true);
  assert.equal(executed, false);
});

test('no additional LLM call occurs', () => {
  const service = new SupervisorService();
  const context = service.createRequestContext(createRequiredInput({
    message: 'I need work',
    metadata: { safeTraceId: 'trace_1' },
  }));

  assert.equal(context.message, 'I need work');
  assert.equal(typeof service.callLlm, 'undefined');
  assert.equal(typeof service.executeAgent, 'function');
});
