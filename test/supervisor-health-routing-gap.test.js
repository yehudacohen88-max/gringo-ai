const test = require('node:test');
const assert = require('node:assert/strict');

const { SupervisorService } = require('../src/modules/agents');

function createRequestContext(message, overrides = {}) {
  return {
    requestId: 'req_health_routing_gap',
    conversationId: 'web:user_health_routing_gap',
    userId: 'user_health_routing_gap',
    message,
    profile: {
      fullName: 'David Levi',
      city: 'Tel Aviv',
      preferredCurrency: 'THB',
    },
    ...overrides,
  };
}

function route(message) {
  const service = new SupervisorService();
  const context = createRequestContext(message);
  const detected = service.detectIntents(context);
  const tasks = service.createTasksFromIntents(context, detected);
  return { service, context, detected, tasks };
}

function domains(detected) {
  return detected.intents.map((intent) => intent.domain);
}

function intents(detected) {
  return detected.intents.map((intent) => intent.intent);
}

test('urgent medical help routes to Health without router urgency classification', () => {
  const message = 'I need urgent medical help.';
  const { detected, tasks } = route(message);

  assert.deepEqual(detected.intents, [
    {
      domain: 'health_life_community',
      intent: 'health_request',
    },
  ]);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].capability, 'health.support');
  assert.equal(tasks[0].metadata.sourceMessage, message);
  assert.equal(Object.hasOwn(tasks[0].input, 'urgent'), false);
  assert.equal(Object.hasOwn(tasks[0].metadata, 'urgent'), false);
});

test('medical help routes to Health', () => {
  const { detected, tasks } = route('I need medical help.');

  assert.deepEqual(detected.intents, [
    {
      domain: 'health_life_community',
      intent: 'health_request',
    },
  ]);
  assert.equal(tasks[0].capability, 'health.support');
});

test('doctor and clinic routing remain Health requests', () => {
  assert.deepEqual(route('I need a doctor.').detected.intents, [
    {
      domain: 'health_life_community',
      intent: 'health_request',
    },
  ]);
  assert.deepEqual(route('I need a clinic.').detected.intents, [
    {
      domain: 'health_life_community',
      intent: 'health_request',
    },
  ]);
});

test('urgent medical help and money transfer produce Health then Finance intents and tasks', () => {
  const message = 'I need urgent medical help and I also want to send 2,000 ILS to Thailand.';
  const { detected, tasks } = route(message);

  assert.equal(detected.isMultiIntent, true);
  assert.deepEqual(domains(detected), ['health_life_community', 'finance_consumer']);
  assert.deepEqual(intents(detected), ['health_request', 'money_transfer']);
  assert.deepEqual(tasks.map((task) => task.domain), ['health_life_community', 'finance_consumer']);
  assert.equal(tasks[0].input.question, 'i need urgent medical help');
  assert.equal(tasks[1].input.question, 'want to send 2,000 ils to thailand');
  assert.equal(tasks.every((task) => task.metadata.sourceMessage === message), true);
});

test('medical help and unpaid salary produce Health plus Employment in user order', () => {
  const { detected, tasks } = route('I need medical help and my salary was not paid.');

  assert.equal(detected.isMultiIntent, true);
  assert.deepEqual(domains(detected), ['health_life_community', 'employment_salary']);
  assert.deepEqual(intents(detected), ['health_request', 'salary_question']);
  assert.deepEqual(tasks.map((task) => task.domain), ['health_life_community', 'employment_salary']);
});

test('unpaid salary and medical help produce Employment plus Health in user order', () => {
  const { detected, tasks } = route('My salary was not paid and I need medical help.');

  assert.equal(detected.isMultiIntent, true);
  assert.deepEqual(domains(detected), ['employment_salary', 'health_life_community']);
  assert.deepEqual(intents(detected), ['salary_question', 'health_request']);
  assert.deepEqual(tasks.map((task) => task.domain), ['employment_salary', 'health_life_community']);
});

test('finance-only routing remains unchanged', () => {
  const { detected } = route('I want to send 2,000 ILS to Thailand.');

  assert.deepEqual(detected.intents, [
    {
      domain: 'finance_consumer',
      intent: 'money_transfer',
    },
  ]);
});

test('employment-only routing remains unchanged', () => {
  const { detected } = route('My salary was not paid.');

  assert.deepEqual(detected.intents, [
    {
      domain: 'employment_salary',
      intent: 'salary_question',
    },
  ]);
});

test('financial health does not route to Health', () => {
  const { detected } = route('I need help with my financial health.');

  assert.equal(detected.intents.some((intent) => intent.domain === 'health_life_community'), false);
});

test('system health check does not route to Health', () => {
  const { detected } = route('Run a system health check.');

  assert.equal(detected.intents.some((intent) => intent.domain === 'health_life_community'), false);
});

test('Health and Finance multi-intent executes each task exactly once', async () => {
  const message = 'I need urgent medical help and I also want to send 2,000 ILS to Thailand.';
  const { service, tasks } = route(message);
  const executed = [];
  const originalExecuteTask = service.executeTask.bind(service);

  service.executeTask = async (task, executor, context) => {
    executed.push(task.domain);
    return originalExecuteTask(task, executor, context);
  };

  const results = await service.executeTasksSequentially(tasks);

  assert.deepEqual(executed, ['health_life_community', 'finance_consumer']);
  assert.deepEqual(results.map((result) => result.domain), ['health_life_community', 'finance_consumer']);
});

test('urgent next step composition remains preserved after Health routing', async () => {
  const message = 'I need urgent medical help.';
  const { service, tasks } = route(message);
  const results = await service.executeTasksSequentially(tasks);
  const synthesis = service.synthesizeResults(results);
  const response = service.composeResponse(synthesis);

  assert.equal(results[0].domain, 'health_life_community');
  assert.equal(results[0].output.urgent, true);
  assert.match(response, /does not diagnose medical conditions/i);
  assert.match(response, /emergency services/i);
});
