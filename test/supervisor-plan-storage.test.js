const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AgentRegistryService,
  SupervisorService,
} = require('../src/modules/agents');

function createValidPlan(overrides = {}) {
  return {
    planId: 'plan_1',
    requestId: 'req_1',
    conversationId: 'web:user_1',
    requestType: 'unknown',
    primaryDomain: null,
    secondaryDomains: [],
    tasks: [],
    requiresUserInput: false,
    missingInformation: [],
    requiresApproval: false,
    urgency: 'normal',
    status: 'draft',
    createdAt: '2026-07-28T08:00:00.000Z',
    updatedAt: '2026-07-28T08:00:00.000Z',
    ...overrides,
  };
}

test('valid plan is stored', () => {
  const service = new SupervisorService();
  const result = service.storePlan(createValidPlan());

  assert.deepEqual(result, { stored: true, errors: [] });
});

test('invalid plan is rejected', () => {
  const service = new SupervisorService();
  const result = service.storePlan(createValidPlan({ status: 'running' }));

  assert.equal(result.stored, false);
  assert.deepEqual(result.errors, ['status is invalid']);
  assert.equal(service.getPlan('req_1'), null);
});

test('stored plan is retrieved', () => {
  const service = new SupervisorService();
  const plan = createValidPlan();

  service.storePlan(plan);

  assert.deepEqual(service.getPlan('req_1'), plan);
});

test('unknown requestId returns null', () => {
  const service = new SupervisorService();

  assert.equal(service.getPlan('missing'), null);
});

test('same requestId replaces previous plan', () => {
  const service = new SupervisorService();

  service.storePlan(createValidPlan({ planId: 'plan_1', requestType: 'unknown' }));
  service.storePlan(createValidPlan({ planId: 'plan_2', requestType: 'simple' }));

  const stored = service.getPlan('req_1');
  assert.equal(stored.planId, 'plan_2');
  assert.equal(stored.requestType, 'simple');
});

test('different requestIds remain isolated', () => {
  const service = new SupervisorService();

  service.storePlan(createValidPlan({ requestId: 'req_1', planId: 'plan_1' }));
  service.storePlan(createValidPlan({ requestId: 'req_2', planId: 'plan_2' }));

  assert.equal(service.getPlan('req_1').planId, 'plan_1');
  assert.equal(service.getPlan('req_2').planId, 'plan_2');
});

test('clearPlan removes the requested plan only', () => {
  const service = new SupervisorService();

  service.storePlan(createValidPlan({ requestId: 'req_1', planId: 'plan_1' }));
  service.storePlan(createValidPlan({ requestId: 'req_2', planId: 'plan_2' }));

  const result = service.clearPlan('req_1');

  assert.deepEqual(result, { cleared: true, errors: [] });
  assert.equal(service.getPlan('req_1'), null);
  assert.equal(service.getPlan('req_2').planId, 'plan_2');
});

test('clearing missing plan does not fail', () => {
  const service = new SupervisorService();

  assert.deepEqual(service.clearPlan('missing'), { cleared: true, errors: [] });
});

test('input plan is not mutated', () => {
  const service = new SupervisorService();
  const plan = createValidPlan({
    secondaryDomains: ['finance_consumer'],
    tasks: [{ taskId: 'task_1' }],
  });
  const before = JSON.stringify(plan);

  service.storePlan(plan);

  assert.equal(JSON.stringify(plan), before);
});

test('input plan mutation after storage does not affect storage', () => {
  const service = new SupervisorService();
  const plan = createValidPlan({
    tasks: [{ taskId: 'task_1', input: { city: 'Tel Aviv' } }],
  });

  service.storePlan(plan);
  plan.tasks[0].input.city = 'Changed';

  assert.equal(service.getPlan('req_1').tasks[0].input.city, 'Tel Aviv');
});

test('retrieved plan mutation does not affect storage', () => {
  const service = new SupervisorService();

  service.storePlan(createValidPlan({
    secondaryDomains: ['finance_consumer'],
    tasks: [{ taskId: 'task_1', input: { city: 'Tel Aviv' } }],
  }));

  const retrieved = service.getPlan('req_1');
  retrieved.planId = 'changed';
  retrieved.secondaryDomains.push('health_life_community');
  retrieved.tasks.push({ taskId: 'task_2' });
  retrieved.tasks[0].input.city = 'Changed';

  const storedAgain = service.getPlan('req_1');
  assert.equal(storedAgain.planId, 'plan_1');
  assert.deepEqual(storedAgain.secondaryDomains, ['finance_consumer']);
  assert.deepEqual(storedAgain.tasks, [{ taskId: 'task_1', input: { city: 'Tel Aviv' } }]);
});

test('no routing or agent execution occurs', () => {
  const service = new SupervisorService();
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

  const result = service.storePlan(createValidPlan());

  assert.equal(result.stored, true);
  assert.equal(executed, false);
});
