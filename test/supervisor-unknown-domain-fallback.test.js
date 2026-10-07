const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AgentRegistryService,
  SupervisorService,
} = require('../src/modules/agents');

function createPlan(overrides = {}) {
  return {
    planId: 'plan_unknown',
    requestId: 'req_unknown',
    conversationId: 'web:user_unknown',
    requestType: 'unknown',
    primaryDomain: null,
    secondaryDomains: [],
    routingDecision: {
      routeType: 'none',
      targetDomains: [],
    },
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

test('routeType none requires user input', () => {
  const service = new SupervisorService();
  const updated = service.applyUnknownDomainFallback(createPlan());

  assert.equal(updated.requiresUserInput, true);
});

test('status changes to waiting_for_user', () => {
  const service = new SupervisorService();
  const updated = service.applyUnknownDomainFallback(createPlan());

  assert.equal(updated.status, 'waiting_for_user');
});

test('missingInformation contains business_domain', () => {
  const service = new SupervisorService();
  const updated = service.applyUnknownDomainFallback(createPlan());

  assert.deepEqual(updated.missingInformation, ['business_domain']);
});

test('routed plan remains unchanged', () => {
  const service = new SupervisorService();
  const plan = createPlan({
    primaryDomain: 'employment_salary',
    routingDecision: {
      routeType: 'single_domain',
      targetDomains: ['employment_salary'],
    },
  });

  assert.deepEqual(service.applyUnknownDomainFallback(plan), plan);
});

test('unrelated fields remain unchanged', () => {
  const service = new SupervisorService();
  const updated = service.applyUnknownDomainFallback(createPlan({
    planId: 'plan_keep',
    requestId: 'req_keep',
    conversationId: 'telegram:user_keep',
    requestType: 'simple',
    requiresApproval: true,
    urgency: 'high',
    createdAt: '2026-07-28T09:00:00.000Z',
    updatedAt: '2026-07-28T09:00:00.000Z',
  }));

  assert.equal(updated.planId, 'plan_keep');
  assert.equal(updated.requestId, 'req_keep');
  assert.equal(updated.conversationId, 'telegram:user_keep');
  assert.equal(updated.requestType, 'simple');
  assert.equal(updated.requiresApproval, true);
  assert.equal(updated.urgency, 'high');
  assert.equal(updated.createdAt, '2026-07-28T09:00:00.000Z');
  assert.equal(updated.updatedAt, '2026-07-28T09:00:00.000Z');
});

test('no task is created', () => {
  const service = new SupervisorService();
  const updated = service.applyUnknownDomainFallback(createPlan());

  assert.deepEqual(updated.tasks, []);
});

test('no Domain Agent is executed', () => {
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

  service.applyUnknownDomainFallback(createPlan());

  assert.equal(executed, false);
});

test('no user-facing message is generated', () => {
  const service = new SupervisorService();
  const updated = service.applyUnknownDomainFallback(createPlan());

  assert.equal(Object.hasOwn(updated, 'reply'), false);
  assert.equal(Object.hasOwn(updated, 'message'), false);
  assert.equal(Object.hasOwn(updated, 'question'), false);
});

test('createPlan applies unknown-domain fallback for unknown requests', () => {
  const service = new SupervisorService();
  const plan = service.createPlan({
    requestId: 'req_created_unknown',
    conversationId: 'web:user_created_unknown',
    message: 'Hello Gringo',
  });

  assert.deepEqual(plan.routingDecision, {
    routeType: 'none',
    targetDomains: [],
  });
  assert.equal(plan.requiresUserInput, true);
  assert.equal(plan.status, 'waiting_for_user');
  assert.deepEqual(plan.missingInformation, ['business_domain']);
});
