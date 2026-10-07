const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AgentRegistryService,
  SupervisorService,
} = require('../src/modules/agents');

function createPlan(overrides = {}) {
  return {
    planId: 'plan_route',
    requestId: 'req_route',
    conversationId: 'web:user_route',
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

test('no primary domain returns routeType none', () => {
  const service = new SupervisorService();

  assert.deepEqual(service.createRoutingDecision(createPlan()), {
    routeType: 'none',
    targetDomains: [],
  });
});

test('one primary domain returns single_domain', () => {
  const service = new SupervisorService();

  assert.deepEqual(service.createRoutingDecision(createPlan({
    primaryDomain: 'employment_salary',
  })), {
    routeType: 'single_domain',
    targetDomains: ['employment_salary'],
  });
});

test('primary plus one secondary returns multi_domain', () => {
  const service = new SupervisorService();

  assert.deepEqual(service.createRoutingDecision(createPlan({
    primaryDomain: 'employment_salary',
    secondaryDomains: ['finance_consumer'],
  })), {
    routeType: 'multi_domain',
    targetDomains: ['employment_salary', 'finance_consumer'],
  });
});

test('primary plus two secondary domains returns multi_domain', () => {
  const service = new SupervisorService();

  assert.deepEqual(service.createRoutingDecision(createPlan({
    primaryDomain: 'employment_salary',
    secondaryDomains: ['finance_consumer', 'health_life_community'],
  })), {
    routeType: 'multi_domain',
    targetDomains: ['employment_salary', 'finance_consumer', 'health_life_community'],
  });
});

test('primary domain appears first', () => {
  const service = new SupervisorService();
  const decision = service.createRoutingDecision(createPlan({
    primaryDomain: 'health_life_community',
    secondaryDomains: ['employment_salary', 'finance_consumer'],
  }));

  assert.equal(decision.targetDomains[0], 'health_life_community');
});

test('duplicate domains are removed', () => {
  const service = new SupervisorService();

  assert.deepEqual(service.createRoutingDecision(createPlan({
    primaryDomain: 'employment_salary',
    secondaryDomains: ['employment_salary', 'finance_consumer', 'finance_consumer'],
  })), {
    routeType: 'multi_domain',
    targetDomains: ['employment_salary', 'finance_consumer'],
  });
});

test('deterministic ordering is preserved', () => {
  const service = new SupervisorService();

  assert.deepEqual(service.createRoutingDecision(createPlan({
    primaryDomain: 'finance_consumer',
    secondaryDomains: ['employment_salary', 'health_life_community'],
  })).targetDomains, [
    'finance_consumer',
    'employment_salary',
    'health_life_community',
  ]);
});

test('plan is not mutated unexpectedly', () => {
  const service = new SupervisorService();
  const plan = createPlan({
    primaryDomain: 'employment_salary',
    secondaryDomains: ['finance_consumer'],
  });
  const before = JSON.stringify(plan);

  service.createRoutingDecision(plan);

  assert.equal(JSON.stringify(plan), before);
});

test('routing decision is attached to the plan', () => {
  const service = new SupervisorService();
  const plan = service.createPlan({
    requestId: 'req_attached',
    conversationId: 'web:user_attached',
    message: 'salary employer bank doctor',
  });

  assert.deepEqual(plan.routingDecision, {
    routeType: 'multi_domain',
    targetDomains: ['employment_salary', 'finance_consumer', 'health_life_community'],
  });
});

test('maximum three target domains are returned', () => {
  const service = new SupervisorService();

  assert.deepEqual(service.createRoutingDecision(createPlan({
    primaryDomain: 'employment_salary',
    secondaryDomains: ['finance_consumer', 'health_life_community', 'employment_salary'],
  })).targetDomains, [
    'employment_salary',
    'finance_consumer',
    'health_life_community',
  ]);
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

  const decision = service.createRoutingDecision(createPlan({
    primaryDomain: 'employment_salary',
  }));

  assert.equal(decision.routeType, 'single_domain');
  assert.equal(executed, false);
});
