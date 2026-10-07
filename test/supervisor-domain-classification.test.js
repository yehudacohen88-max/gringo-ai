const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AgentRegistryService,
  SupervisorService,
} = require('../src/modules/agents');

function createRequestContext(message, overrides = {}) {
  return {
    requestId: 'req_domain',
    conversationId: 'web:user_domain',
    message,
    ...overrides,
  };
}

test('employment domain is detected', () => {
  const service = new SupervisorService();

  assert.equal(
    service.detectPrimaryDomain(createRequestContext('My employer did not pay my salary')),
    'employment_salary'
  );
});

test('finance domain is detected', () => {
  const service = new SupervisorService();

  assert.equal(
    service.detectPrimaryDomain(createRequestContext('I need help with a bank transfer payment')),
    'finance_consumer'
  );
});

test('exchange-rate question is detected as finance domain', () => {
  const service = new SupervisorService();

  assert.equal(
    service.detectPrimaryDomain(createRequestContext('What is the current ILS to THB exchange rate?')),
    'finance_consumer'
  );
});

test('Hebrew exchange-rate question is detected as finance domain', () => {
  const service = new SupervisorService();

  assert.equal(
    service.detectPrimaryDomain(createRequestContext('מה שער ההמרה הנוכחי משקל לבאט תאילנדי?')),
    'finance_consumer'
  );
});

test('health and life domain is detected', () => {
  const service = new SupervisorService();

  assert.equal(
    service.detectPrimaryDomain(createRequestContext('I need a doctor near my apartment')),
    'health_life_community'
  );
});

test('unknown request returns null', () => {
  const service = new SupervisorService();

  assert.equal(service.detectPrimaryDomain(createRequestContext('Hello Gringo')), null);
});

test('non-finance Hebrew message is not classified as exchange-rate finance', () => {
  const service = new SupervisorService();

  assert.equal(service.detectPrimaryDomain(createRequestContext('שלום גרינגו אני צריך עזרה')), null);
});

test('mixed request with clear winner returns highest scoring domain', () => {
  const service = new SupervisorService();

  assert.equal(
    service.detectPrimaryDomain(createRequestContext('I need salary help from my employer and a bank account')),
    'employment_salary'
  );
});

test('tie returns null', () => {
  const service = new SupervisorService();

  assert.equal(
    service.detectPrimaryDomain(createRequestContext('I need a job and a bank account')),
    null
  );
});

test('matching is case-insensitive', () => {
  const service = new SupervisorService();

  assert.equal(
    service.detectPrimaryDomain(createRequestContext('CONSTRUCTION Work Permit')),
    'employment_salary'
  );
});

test('duplicate keywords are counted once', () => {
  const service = new SupervisorService();

  assert.equal(
    service.detectPrimaryDomain(createRequestContext('job job job bank')),
    null
  );
});

test('plan is updated with detected primary domain', () => {
  const service = new SupervisorService();
  const plan = service.createPlan(createRequestContext('I need a clinic'));

  assert.equal(plan.primaryDomain, 'health_life_community');
  assert.deepEqual(plan.secondaryDomains, []);
  assert.deepEqual(plan.tasks, []);
});

test('plan leaves primary domain null when no domain is detected', () => {
  const service = new SupervisorService();
  const plan = service.createPlan(createRequestContext('Hello Gringo'));

  assert.equal(plan.primaryDomain, null);
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

  const domain = service.detectPrimaryDomain(createRequestContext('salary'));

  assert.equal(domain, 'employment_salary');
  assert.equal(executed, false);
});
