const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AgentRegistryService,
  SupervisorService,
} = require('../src/modules/agents');

function createRequestContext(message, overrides = {}) {
  return {
    requestId: 'req_secondary',
    conversationId: 'web:user_secondary',
    message,
    ...overrides,
  };
}

test('no secondary domains are returned when no other domain matches', () => {
  const service = new SupervisorService();

  assert.deepEqual(
    service.detectSecondaryDomains(createRequestContext('salary employer payroll')),
    []
  );
});

test('one secondary domain is detected', () => {
  const service = new SupervisorService();

  assert.deepEqual(
    service.detectSecondaryDomains(createRequestContext('salary employer bank')),
    ['finance_consumer']
  );
});

test('two secondary domains are detected', () => {
  const service = new SupervisorService();

  assert.deepEqual(
    service.detectSecondaryDomains(createRequestContext('salary employer bank doctor')),
    ['finance_consumer', 'health_life_community']
  );
});

test('duplicate keywords are removed', () => {
  const service = new SupervisorService();

  assert.deepEqual(
    service.detectSecondaryDomains(createRequestContext('salary employer bank bank bank doctor doctor')),
    ['finance_consumer', 'health_life_community']
  );
});

test('primary domain is excluded', () => {
  const service = new SupervisorService();

  assert.deepEqual(
    service.detectSecondaryDomains(createRequestContext('salary employer bank', {
      primaryDomain: 'employment_salary',
    })),
    ['finance_consumer']
  );
});

test('deterministic ordering is preserved', () => {
  const service = new SupervisorService();

  assert.deepEqual(
    service.detectSecondaryDomains(createRequestContext('doctor bank salary', {
      primaryDomain: 'health_life_community',
    })),
    ['employment_salary', 'finance_consumer']
  );
});

test('secondary domains are limited to two', () => {
  const service = new SupervisorService();

  assert.deepEqual(
    service.detectSecondaryDomains(createRequestContext('salary bank doctor')),
    ['employment_salary', 'finance_consumer']
  );
});

test('plan is updated with secondary domains', () => {
  const service = new SupervisorService();
  const plan = service.createPlan(createRequestContext('salary employer bank doctor'));

  assert.equal(plan.primaryDomain, 'employment_salary');
  assert.deepEqual(plan.secondaryDomains, ['finance_consumer', 'health_life_community']);
  assert.deepEqual(plan.tasks, []);
});

test('plan has no secondary domains when there are no secondary matches', () => {
  const service = new SupervisorService();
  const plan = service.createPlan(createRequestContext('salary employer'));

  assert.equal(plan.primaryDomain, 'employment_salary');
  assert.deepEqual(plan.secondaryDomains, []);
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

  const secondaryDomains = service.detectSecondaryDomains(createRequestContext('salary bank doctor'));

  assert.deepEqual(secondaryDomains, ['employment_salary', 'finance_consumer']);
  assert.equal(executed, false);
});
