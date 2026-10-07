const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AgentRegistryService,
  SupervisorService,
} = require('../src/modules/agents');

function createPlan(overrides = {}) {
  return {
    planId: 'plan_type',
    requestId: 'req_type',
    conversationId: 'web:user_type',
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

test('unknown request type is detected', () => {
  const service = new SupervisorService();
  const plan = createPlan({ message: 'hello' });

  assert.equal(service.detectRequestType(plan), 'unknown');
  assert.equal(plan.requestType, 'unknown');
});

test('simple request type is detected', () => {
  const service = new SupervisorService();
  const plan = createPlan({
    primaryDomain: 'employment_salary',
    message: 'salary help',
  });

  assert.equal(service.detectRequestType(plan), 'simple');
  assert.equal(plan.requestType, 'simple');
});

test('multi_domain request type is detected', () => {
  const service = new SupervisorService();
  const plan = createPlan({
    primaryDomain: 'employment_salary',
    secondaryDomains: ['finance_consumer'],
    message: 'salary and bank help',
  });

  assert.equal(service.detectRequestType(plan), 'multi_domain');
  assert.equal(plan.requestType, 'multi_domain');
});

test('workflow request type is detected', () => {
  const service = new SupervisorService();
  const plan = createPlan({
    primaryDomain: 'employment_salary',
    message: 'setup my salary process',
  });

  assert.equal(service.detectRequestType(plan), 'workflow');
  assert.equal(plan.requestType, 'workflow');
});

test('urgent request type is detected', () => {
  const service = new SupervisorService();
  const plan = createPlan({
    primaryDomain: 'health_life_community',
    message: 'urgent doctor help',
  });

  assert.equal(service.detectRequestType(plan), 'urgent');
  assert.equal(plan.requestType, 'urgent');
});

test('priority order is respected', () => {
  const service = new SupervisorService();
  const plan = createPlan({
    primaryDomain: 'employment_salary',
    secondaryDomains: ['finance_consumer'],
    message: 'urgent setup salary and bank project',
  });

  assert.equal(service.detectRequestType(plan), 'urgent');
  assert.equal(plan.requestType, 'urgent');
});

test('workflow outranks multi_domain', () => {
  const service = new SupervisorService();
  const plan = createPlan({
    primaryDomain: 'employment_salary',
    secondaryDomains: ['finance_consumer'],
    message: 'setup salary and bank process',
  });

  assert.equal(service.detectRequestType(plan), 'workflow');
});

test('requestType is updated by createPlan', () => {
  const service = new SupervisorService();
  const plan = service.createPlan({
    requestId: 'req_created_type',
    conversationId: 'web:user_created_type',
    message: 'salary employer bank',
  });

  assert.equal(plan.requestType, 'multi_domain');
});

test('unrelated fields remain unchanged', () => {
  const service = new SupervisorService();
  const plan = createPlan({
    primaryDomain: 'employment_salary',
    message: 'salary help',
    status: 'ready',
    urgency: 'high',
    requiresApproval: true,
  });
  const before = {
    planId: plan.planId,
    requestId: plan.requestId,
    conversationId: plan.conversationId,
    status: plan.status,
    urgency: plan.urgency,
    requiresApproval: plan.requiresApproval,
    tasks: JSON.stringify(plan.tasks),
  };

  service.detectRequestType(plan);

  assert.equal(plan.planId, before.planId);
  assert.equal(plan.requestId, before.requestId);
  assert.equal(plan.conversationId, before.conversationId);
  assert.equal(plan.status, before.status);
  assert.equal(plan.urgency, before.urgency);
  assert.equal(plan.requiresApproval, before.requiresApproval);
  assert.equal(JSON.stringify(plan.tasks), before.tasks);
});

test('no task is created', () => {
  const service = new SupervisorService();
  const plan = createPlan({
    primaryDomain: 'employment_salary',
    message: 'setup salary process',
  });

  service.detectRequestType(plan);

  assert.deepEqual(plan.tasks, []);
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

  const requestType = service.detectRequestType(createPlan({
    primaryDomain: 'employment_salary',
    message: 'salary help',
  }));

  assert.equal(requestType, 'simple');
  assert.equal(executed, false);
});
