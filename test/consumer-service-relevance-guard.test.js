const test = require('node:test');
const assert = require('node:assert/strict');

const { SupervisorService } = require('../src/modules/agents');
const { financeConsumerAgent } = require('../src/modules/agents/domains/finance-consumer.agent');
const { healthLifeCommunityAgent } = require('../src/modules/agents/domains/health-life-community.agent');
const serviceService = require('../src/modules/services/service.service');
const knowledgeAgentService = require('../src/modules/knowledge-agent/knowledge-agent.service');

function profile() {
  return {
    userId: 'user_service_relevance',
    city: 'Tel Aviv',
    preferredCurrency: 'THB',
  };
}

function task(overrides = {}) {
  return {
    taskId: 'task_service_relevance',
    requestId: 'req_service_relevance',
    conversationId: 'web:service_relevance',
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

function context(message) {
  return {
    requestId: 'req_service_relevance',
    conversationId: 'web:service_relevance',
    userId: 'user_service_relevance',
    message,
    profile: profile(),
  };
}

async function financeServicesFor(question) {
  return financeConsumerAgent.execute(task({
    input: {
      question,
      profile: profile(),
    },
  }));
}

test('bank card problem rejects unrelated service list', async () => {
  const result = await financeServicesFor('I have a problem with my bank card.');

  assert.equal(result.status, 'partial');
  assert.equal(result.output.capability, 'consumer.services');
  assert.equal(result.output.services, undefined);
  assert.equal(result.output.genericFinanceRequestType, 'bank_card_problem');
});

test('bank account question rejects unrelated service list', async () => {
  const result = await financeServicesFor('Which bank account is better for me?');

  assert.equal(result.status, 'partial');
  assert.equal(result.output.services, undefined);
  assert.equal(result.output.genericFinanceRequestType, 'bank_account_problem');
});

test('credit card question rejects unrelated service list', async () => {
  const result = await financeServicesFor('Which credit card should I use?');

  assert.equal(result.status, 'partial');
  assert.equal(result.output.services, undefined);
  assert.equal(result.output.genericFinanceRequestType, 'bank_card_problem');
});

test('cheap phone shopping question rejects unrelated service list', async () => {
  const result = await financeServicesFor('Where can I buy a cheap phone?');

  assert.equal(result.status, 'partial');
  assert.equal(result.output.services, undefined);
  assert.equal(result.output.genericFinanceRequestType, 'shopping_price_help');
});

test('unsupported bill question rejects unrelated service list', async () => {
  const result = await financeServicesFor('How should I pay this bill?');

  assert.equal(result.status, 'partial');
  assert.equal(result.output.services, undefined);
  assert.equal(result.output.genericFinanceRequestType, 'bill_payment_problem');
});

test('doctor service behavior remains available through Health', async () => {
  const result = await healthLifeCommunityAgent.execute(task({
    domain: 'health_life_community',
    intent: 'health_request',
    capability: 'health.support',
    input: {
      question: 'I need a doctor.',
      profile: profile(),
    },
  }));

  assert.equal(result.status, 'success');
  assert.equal(result.output.capability, 'health.support');
  assert.equal(result.output.services.length > 0, true);
  assert.equal(result.output.services.every((service) => service.category === 'Medical'), true);
});

test('government service behavior remains available', async () => {
  const result = await healthLifeCommunityAgent.execute(task({
    domain: 'health_life_community',
    intent: 'life_community_request',
    capability: 'government.services',
    input: {
      question: 'I need help with a government service.',
      profile: profile(),
    },
  }));

  assert.equal(result.status, 'success');
  assert.equal(result.output.capability, 'government.services');
  assert.equal(result.output.services.length > 0, true);
  assert.equal(result.output.services.every((service) => service.category === 'Government'), true);
});

test('transport service behavior remains available', async () => {
  const search = serviceService.inferServiceSearch('I need transport help in Tel Aviv.', profile());
  const services = await serviceService.findMatchingServices(profile(), search);

  assert.equal(search.category, 'Transportation');
  assert.equal(services.length > 0, true);
  assert.equal(services.every((service) => service.category === 'Transportation'), true);
});

test('money transfer behavior remains available without service lookup', async () => {
  const result = await financeConsumerAgent.execute(task({
    intent: 'money_transfer',
    capability: 'finance.transfer',
    input: {
      question: 'How can I send 2,000 ILS to Thailand?',
      amount: 2000,
      sourceCurrency: 'ILS',
      targetCurrency: 'THB',
      profile: profile(),
    },
  }));

  assert.equal(result.status, 'partial');
  assert.equal(result.output.capability, 'finance.transfer');
  assert.match(result.output.message, /not currently have enough real reported observations/i);
  assert.doesNotMatch(result.output.message, /Demo data/i);
});

test('multi-intent salary plus bank card keeps focused Finance service lookup empty', async () => {
  const service = new SupervisorService();
  const message = 'My salary was not paid and I have a problem with my bank card.';
  const requestContext = context(message);
  const detected = service.detectIntents(requestContext);
  const tasks = service.createTasksFromIntents(requestContext, detected);
  const financeTask = tasks.find((item) => item.domain === 'finance_consumer');

  assert.deepEqual(detected.intents.map((intent) => intent.domain), ['employment_salary', 'finance_consumer']);
  assert.equal(tasks.every((item) => item.metadata.sourceMessage === message), true);
  assert.equal(financeTask.input.question, 'i have a problem with my bank card');

  const financeResult = await financeConsumerAgent.execute(financeTask);

  assert.equal(financeResult.status, 'partial');
  assert.equal(financeResult.output.services, undefined);
  assert.equal(financeResult.output.genericFinanceRequestType, 'bank_card_problem');
});

test('focused task controls service relevance instead of sourceMessage', async () => {
  const focusedSearch = serviceService.inferServiceSearch('i have a problem with my bank card', profile());
  const sourceSearch = serviceService.inferServiceSearch('My salary was not paid and I have a problem with my bank card.', profile());

  assert.deepEqual(await serviceService.findMatchingServices(profile(), focusedSearch), []);
  assert.deepEqual(await serviceService.findMatchingServices(profile(), sourceSearch), []);
});

test('knowledge relevance guard remains preserved', async () => {
  const result = await knowledgeAgentService.answerQuestion({ question: 'I have a problem with my bank card.' });

  assert.equal(result.status, 'NOT_FOUND');
  assert.deepEqual(result.relevantKnowledge, []);
});

test('urgent Health behavior remains preserved', async () => {
  const result = await healthLifeCommunityAgent.execute(task({
    domain: 'health_life_community',
    intent: 'health_request',
    capability: 'health.support',
    input: {
      question: 'I need urgent medical help.',
      profile: profile(),
    },
  }));

  assert.equal(result.status, 'partial');
  assert.equal(result.output.urgent, true);
  assert.match(result.output.nextStep, /emergency/i);
});
