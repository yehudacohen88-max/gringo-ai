const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AgentRegistryService,
  SupervisorService,
} = require('../src/modules/agents');

function createPlan(overrides = {}) {
  return {
    planId: 'plan_clarify',
    requestId: 'req_clarify',
    conversationId: 'web:user_clarify',
    requestType: 'unknown',
    primaryDomain: null,
    secondaryDomains: [],
    routingDecision: {
      routeType: 'none',
      targetDomains: [],
    },
    tasks: [],
    requiresUserInput: true,
    missingInformation: ['business_domain'],
    requiresApproval: false,
    urgency: 'normal',
    status: 'waiting_for_user',
    createdAt: '2026-07-28T08:00:00.000Z',
    updatedAt: '2026-07-28T08:00:00.000Z',
    ...overrides,
  };
}

test('question is created for missing business_domain', () => {
  const service = new SupervisorService();
  const question = service.buildClarificationQuestion(createPlan());

  assert.equal(question.question, 'Which area do you need help with?');
});

test('null is returned when user input is not required', () => {
  const service = new SupervisorService();

  assert.equal(service.buildClarificationQuestion(createPlan({ requiresUserInput: false })), null);
});

test('null is returned when business_domain is not missing', () => {
  const service = new SupervisorService();

  assert.equal(service.buildClarificationQuestion(createPlan({ missingInformation: ['city'] })), null);
});

test('question type is correct', () => {
  const service = new SupervisorService();
  const question = service.buildClarificationQuestion(createPlan());

  assert.equal(question.type, 'business_domain');
});

test('all three options are returned', () => {
  const service = new SupervisorService();
  const question = service.buildClarificationQuestion(createPlan());

  assert.equal(question.options.length, 3);
});

test('option values are correct', () => {
  const service = new SupervisorService();
  const question = service.buildClarificationQuestion(createPlan());

  assert.deepEqual(question.options.map((option) => option.value), [
    'employment_salary',
    'finance_consumer',
    'health_life_community',
  ]);
});

test('option order is deterministic', () => {
  const service = new SupervisorService();
  const first = service.buildClarificationQuestion(createPlan());
  const second = service.buildClarificationQuestion(createPlan());

  assert.deepEqual(first.options, second.options);
});

test('question is attached to the plan', () => {
  const service = new SupervisorService();
  const plan = createPlan();
  const question = service.buildClarificationQuestion(plan);

  assert.deepEqual(plan.clarificationQuestion, question);
});

test('unrelated plan fields remain unchanged', () => {
  const service = new SupervisorService();
  const plan = createPlan({
    planId: 'plan_keep',
    requestId: 'req_keep',
    conversationId: 'telegram:user_keep',
    urgency: 'high',
    requiresApproval: true,
  });

  service.buildClarificationQuestion(plan);

  assert.equal(plan.planId, 'plan_keep');
  assert.equal(plan.requestId, 'req_keep');
  assert.equal(plan.conversationId, 'telegram:user_keep');
  assert.equal(plan.urgency, 'high');
  assert.equal(plan.requiresApproval, true);
  assert.deepEqual(plan.tasks, []);
});

test('no message is sent', () => {
  const service = new SupervisorService();
  const plan = createPlan();

  service.buildClarificationQuestion(plan);

  assert.equal(Object.hasOwn(plan, 'reply'), false);
  assert.equal(Object.hasOwn(plan, 'sent'), false);
  assert.equal(Object.hasOwn(plan, 'delivered'), false);
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

  service.buildClarificationQuestion(createPlan());

  assert.equal(executed, false);
});

test('createPlan attaches clarification question for unknown requests', () => {
  const service = new SupervisorService();
  const plan = service.createPlan({
    requestId: 'req_unknown_clarify',
    conversationId: 'web:user_unknown_clarify',
    message: 'Hello Gringo',
  });

  assert.equal(plan.clarificationQuestion.type, 'business_domain');
  assert.deepEqual(plan.clarificationQuestion.options.map((option) => option.value), [
    'employment_salary',
    'finance_consumer',
    'health_life_community',
  ]);
});

test('known-domain plans do not receive a clarification question', () => {
  const service = new SupervisorService();
  const plan = service.createPlan({
    requestId: 'req_known_clarify',
    conversationId: 'web:user_known_clarify',
    message: 'salary employer',
  });

  assert.equal(Object.hasOwn(plan, 'clarificationQuestion'), false);
});
