const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AgentRegistryService,
  supervisorService,
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

test('valid draft plan is accepted', () => {
  const result = supervisorService.validatePlan(createValidPlan());

  assert.deepEqual(result, { valid: true, errors: [] });
});

test('missing plan is rejected', () => {
  const result = supervisorService.validatePlan();

  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, ['plan must be an object']);
});

test('missing identifiers are rejected', () => {
  const result = supervisorService.validatePlan(createValidPlan({
    planId: '',
    requestId: ' ',
    conversationId: null,
  }));

  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, [
    'planId is required',
    'requestId is required',
    'conversationId is required',
  ]);
});

test('invalid requestType is rejected', () => {
  const result = supervisorService.validatePlan(createValidPlan({ requestType: 'chatty' }));

  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, ['requestType is invalid']);
});

test('invalid primaryDomain is rejected', () => {
  const result = supervisorService.validatePlan(createValidPlan({ primaryDomain: 'unknown_domain' }));

  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, ['primaryDomain is invalid']);
});

test('invalid secondaryDomain is rejected', () => {
  const result = supervisorService.validatePlan(createValidPlan({
    secondaryDomains: ['employment_salary', 'bad_domain'],
  }));

  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, ['secondaryDomains contains invalid domain']);
});

test('duplicate secondary domains are rejected', () => {
  const result = supervisorService.validatePlan(createValidPlan({
    secondaryDomains: ['finance_consumer', 'finance_consumer'],
  }));

  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, ['secondaryDomains contains duplicate domain']);
});

test('primary domain repeated as secondary is rejected', () => {
  const result = supervisorService.validatePlan(createValidPlan({
    primaryDomain: 'employment_salary',
    secondaryDomains: ['employment_salary'],
  }));

  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, ['primaryDomain cannot repeat as secondaryDomain']);
});

test('invalid urgency is rejected', () => {
  const result = supervisorService.validatePlan(createValidPlan({ urgency: 'whenever' }));

  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, ['urgency is invalid']);
});

test('invalid status is rejected', () => {
  const result = supervisorService.validatePlan(createValidPlan({ status: 'running' }));

  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, ['status is invalid']);
});

test('invalid array fields are rejected', () => {
  const result = supervisorService.validatePlan(createValidPlan({
    secondaryDomains: 'employment_salary',
    tasks: {},
    missingInformation: {},
  }));

  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, [
    'secondaryDomains must be an array',
    'tasks must be an array',
    'missingInformation must be an array',
  ]);
});

test('invalid boolean fields are rejected', () => {
  const result = supervisorService.validatePlan(createValidPlan({
    requiresUserInput: 'yes',
    requiresApproval: 1,
  }));

  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, [
    'requiresUserInput must be boolean',
    'requiresApproval must be boolean',
  ]);
});

test('validation does not mutate the plan', () => {
  const plan = createValidPlan({
    primaryDomain: 'employment_salary',
    secondaryDomains: ['finance_consumer'],
  });
  const before = JSON.stringify(plan);

  supervisorService.validatePlan(plan);

  assert.equal(JSON.stringify(plan), before);
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

  const result = supervisorService.validatePlan(createValidPlan());

  assert.equal(result.valid, true);
  assert.equal(executed, false);
});
