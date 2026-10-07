const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AgentRegistryService,
  supervisorService,
} = require('../src/modules/agents');

function createRequestContext(overrides = {}) {
  return {
    requestId: 'req_1',
    conversationId: 'web:user_1',
    message: 'I need salary help',
    metadata: { safeTraceId: 'trace_1' },
    ...overrides,
  };
}

test('valid draft plan is created', () => {
  const plan = supervisorService.createPlan(createRequestContext());

  assert.match(plan.planId, /^plan_/);
  assert.equal(plan.requestId, 'req_1');
  assert.equal(plan.conversationId, 'web:user_1');
  assert.equal(plan.status, 'draft');
});

test('missing requestId is rejected', () => {
  assert.throws(
    () => supervisorService.createPlan({ conversationId: 'web:user_1' }),
    /requestId is required/
  );
});

test('missing conversationId is rejected', () => {
  assert.throws(
    () => supervisorService.createPlan({ requestId: 'req_1' }),
    /conversationId is required/
  );
});

test('empty identifiers are rejected', () => {
  assert.throws(
    () => supervisorService.createPlan(createRequestContext({ requestId: ' ' })),
    /requestId is required/
  );
  assert.throws(
    () => supervisorService.createPlan(createRequestContext({ conversationId: ' ' })),
    /conversationId is required/
  );
});

test('unique planId is generated', () => {
  const first = supervisorService.createPlan(createRequestContext({ requestId: 'req_1' }));
  const second = supervisorService.createPlan(createRequestContext({ requestId: 'req_2' }));

  assert.notEqual(first.planId, second.planId);
});

test('identifiers are preserved', () => {
  const plan = supervisorService.createPlan(createRequestContext({
    requestId: '  req_42  ',
    conversationId: '  telegram:user_42  ',
  }));

  assert.equal(plan.requestId, 'req_42');
  assert.equal(plan.conversationId, 'telegram:user_42');
});

test('default values are correct', () => {
  const plan = supervisorService.createPlan(createRequestContext());

  assert.equal(plan.requestType, 'simple');
  assert.equal(plan.primaryDomain, 'employment_salary');
  assert.deepEqual(plan.secondaryDomains, []);
  assert.deepEqual(plan.routingDecision, {
    routeType: 'single_domain',
    targetDomains: ['employment_salary'],
  });
  assert.deepEqual(plan.tasks, []);
  assert.equal(plan.requiresUserInput, false);
  assert.deepEqual(plan.missingInformation, []);
  assert.equal(plan.requiresApproval, false);
  assert.equal(plan.urgency, 'normal');
  assert.equal(plan.status, 'draft');
});

test('valid timestamps are created', () => {
  const plan = supervisorService.createPlan(createRequestContext());

  assert.doesNotThrow(() => new Date(plan.createdAt).toISOString());
  assert.equal(plan.updatedAt, plan.createdAt);
});

test('requestContext is not mutated', () => {
  const requestContext = createRequestContext();
  const before = JSON.stringify(requestContext);

  supervisorService.createPlan(requestContext);

  assert.equal(JSON.stringify(requestContext), before);
});

test('no tasks are created', () => {
  const plan = supervisorService.createPlan(createRequestContext());

  assert.deepEqual(plan.tasks, []);
});

test('no routing or agent execution occurs', () => {
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

  const plan = supervisorService.createPlan(createRequestContext());

  assert.equal(plan.primaryDomain, 'employment_salary');
  assert.deepEqual(plan.routingDecision, {
    routeType: 'single_domain',
    targetDomains: ['employment_salary'],
  });
  assert.deepEqual(plan.secondaryDomains, []);
  assert.deepEqual(plan.tasks, []);
  assert.equal(executed, false);
});
