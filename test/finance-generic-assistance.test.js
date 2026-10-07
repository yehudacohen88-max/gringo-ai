const test = require('node:test');
const assert = require('node:assert/strict');

const { SupervisorService } = require('../src/modules/agents');
const { financeConsumerAgent } = require('../src/modules/agents/domains/finance-consumer.agent');
const { healthLifeCommunityAgent } = require('../src/modules/agents/domains/health-life-community.agent');
const knowledgeAgentService = require('../src/modules/knowledge-agent/knowledge-agent.service');
const serviceService = require('../src/modules/services/service.service');

function createTask(overrides = {}) {
  return {
    taskId: 'task_finance_generic',
    requestId: 'req_finance_generic',
    conversationId: 'web:finance_generic',
    domain: 'finance_consumer',
    intent: 'consumer_finance_request',
    capability: 'consumer.services',
    status: 'pending',
    input: {},
    metadata: {},
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function createContext(message) {
  return {
    requestId: 'req_finance_generic',
    conversationId: 'web:finance_generic',
    userId: 'user_finance_generic',
    message,
    profile: {
      userId: 'user_finance_generic',
      preferredCurrency: 'THB',
      city: 'Tel Aviv',
    },
  };
}

async function executeMessage(message) {
  const service = new SupervisorService();
  const context = createContext(message);
  const detected = service.detectIntents(context);
  const tasks = service.createTasksFromIntents(context, detected);
  const results = await service.executeTasksSequentially(tasks);
  const response = service.composeResponse(service.synthesizeResults(results));
  return { service, context, detected, tasks, results, response };
}

async function financeFallback(question) {
  return financeConsumerAgent.execute(createTask({
    input: {
      question,
      profile: createContext(question).profile,
    },
  }));
}

async function withPatchedServices(patches, callback) {
  const originals = [];

  for (const [service, methods] of patches) {
    for (const [name, replacement] of Object.entries(methods)) {
      originals.push([service, name, service[name]]);
      service[name] = replacement;
    }
  }

  try {
    return await callback();
  } finally {
    originals.reverse().forEach(([service, name, original]) => {
      service[name] = original;
    });
  }
}

function assertSingleQuestionFallback(result, type, pattern) {
  assert.equal(result.status, 'partial');
  assert.equal(result.output.genericFinanceRequestType, type);
  assert.match(result.output.message, pattern);
  assert.equal(result.followUpQuestions.length, 1);
  assert.equal(result.followUpQuestions[0], result.output.message);
}

test('bank card problem routes to Finance and returns useful one-question fallback', async () => {
  const result = await executeMessage('My bank card is not working.');

  assert.deepEqual(result.detected.intents, [
    { domain: 'finance_consumer', intent: 'consumer_finance_request' },
  ]);
  assertSingleQuestionFallback(result.results[0], 'bank_card_problem', /declined, blocked, lost or stolen/i);
});

test('bank account problem routes to Finance and returns useful one-question fallback', async () => {
  const result = await executeMessage('I have a problem with my bank account.');

  assert.deepEqual(result.detected.intents, [
    { domain: 'finance_consumer', intent: 'consumer_finance_request' },
  ]);
  assertSingleQuestionFallback(result.results[0], 'bank_account_problem', /access to the account, a transfer, a charge/i);
});

test('bill payment problem routes to Finance and asks which bill', async () => {
  const result = await executeMessage('I need help paying a bill.');

  assert.deepEqual(result.detected.intents, [
    { domain: 'finance_consumer', intent: 'consumer_finance_request' },
  ]);
  assertSingleQuestionFallback(result.results[0], 'bill_payment_problem', /what bill/i);
});

test('loan question routes to Finance and asks amount and purpose', async () => {
  const result = await executeMessage('I need a loan.');

  assert.deepEqual(result.detected.intents, [
    { domain: 'finance_consumer', intent: 'consumer_finance_request' },
  ]);
  assertSingleQuestionFallback(result.results[0], 'loan_question', /how much do you need.*what is the loan for/i);
});

test('shopping price help routes to Finance and asks budget', async () => {
  const result = await executeMessage('I want to buy a cheap phone.');

  assert.deepEqual(result.detected.intents, [
    { domain: 'finance_consumer', intent: 'consumer_finance_request' },
  ]);
  assertSingleQuestionFallback(result.results[0], 'shopping_price_help', /what is your budget/i);
});

test('money transfer keeps existing behavior before generic fallback', async () => {
  const result = await executeMessage('I want to send 2,000 ILS to Thailand.');

  assert.equal(result.tasks[0].capability, 'finance.transfer');
  assert.equal(result.results[0].status, 'partial');
  assert.equal(result.results[0].output.capability, 'finance.transfer');
  assert.equal(result.results[0].output.genericFinanceRequestType, undefined);
  assert.match(result.response, /not currently have enough real reported observations/i);
  assert.doesNotMatch(result.response, /Demo data - not a live rate/i);
});

test('unsupported Finance question remains safe and does not invent an answer', async () => {
  const result = await financeFallback('Can you improve my credit score immediately?');

  assert.equal(result.status, 'partial');
  assert.equal(result.output.capability, 'consumer.services');
  assert.equal(result.output.count, 0);
  assert.deepEqual(result.output.services, []);
  assert.doesNotMatch(result.output.message, /provider|interest|rate|approved|score/i);
});

test('generic Finance fallback does not return unrelated services or knowledge', async () => {
  const serviceResult = await financeFallback('My bank card is not working.');
  const knowledge = await knowledgeAgentService.answerQuestion({ question: 'My bank card is not working.' });

  assert.equal(serviceResult.output.services, undefined);
  assert.equal(serviceResult.output.knowledge, undefined);
  assert.equal(knowledge.status, 'NOT_FOUND');
  assert.deepEqual(knowledge.relevantKnowledge, []);
});

test('verified knowledge precedence is preserved for Finance knowledge capability', async () => {
  await withPatchedServices([
    [knowledgeAgentService, {
      answerQuestion: async () => ({
        status: 'FOUND',
        category: 'Finance',
        answer: 'Verified bank account answer.',
      }),
    }],
  ], async () => {
    const result = await financeConsumerAgent.execute(createTask({
      capability: 'finance.bank',
      input: { question: 'I have a problem with my bank account.' },
    }));

    assert.equal(result.status, 'success');
    assert.equal(result.output.knowledge.answer, 'Verified bank account answer.');
    assert.equal(result.output.genericFinanceRequestType, undefined);
  });
});

test('trusted service precedence is preserved before generic fallback', async () => {
  await withPatchedServices([
    [serviceService, {
      inferServiceSearch: () => ({ query: 'I need help with a government service.', category: 'Government' }),
      findMatchingServices: async () => [{ id: 'svc_gov', title: 'Government Desk', category: 'Government', match: { score: 90 } }],
      formatServicesForChat: () => 'Found Government Desk',
    }],
  ], async () => {
    const result = await financeConsumerAgent.execute(createTask({
      input: { question: 'I need help with a government service.' },
    }));

    assert.equal(result.status, 'success');
    assert.equal(result.output.message, 'Found Government Desk');
    assert.equal(result.output.genericFinanceRequestType, undefined);
  });
});

test('salary plus bank card multi-intent preserves Employment and Finance fallback', async () => {
  const result = await executeMessage('My salary was not paid and my bank card is not working.');

  assert.deepEqual(result.detected.intents.map((intent) => intent.domain), ['employment_salary', 'finance_consumer']);
  assert.equal(result.tasks.every((task) => task.metadata.sourceMessage === 'My salary was not paid and my bank card is not working.'), true);
  assert.equal(result.tasks.find((task) => task.domain === 'finance_consumer').input.question, 'my bank card is not working');
  assert.equal(result.results[0].domain, 'employment_salary');
  assert.equal(result.results[1].output.genericFinanceRequestType, 'bank_card_problem');
  assert.match(result.response, /Which month's salary or payment period/i);
  assert.match(result.response, /declined, blocked, lost or stolen/i);
});

test('urgent Health behavior remains preserved', async () => {
  const result = await healthLifeCommunityAgent.execute(createTask({
    domain: 'health_life_community',
    intent: 'health_request',
    capability: 'health.support',
    input: { question: 'I need urgent medical help.' },
  }));

  assert.equal(result.status, 'partial');
  assert.equal(result.output.urgent, true);
  assert.match(result.output.nextStep, /emergency/i);
});
