const test = require('node:test');
const assert = require('node:assert/strict');

const { SupervisorService } = require('../src/modules/agents');
const { employmentSalaryAgent } = require('../src/modules/agents/domains/employment-salary.agent');
const { financeConsumerAgent } = require('../src/modules/agents/domains/finance-consumer.agent');
const { healthLifeCommunityAgent } = require('../src/modules/agents/domains/health-life-community.agent');
const knowledgeAgentService = require('../src/modules/knowledge-agent/knowledge-agent.service');
const knowledgeBaseService = require('../src/modules/knowledge-agent/knowledge-base.service');

async function answer(question) {
  return knowledgeAgentService.answerQuestion({ question });
}

function createTask(overrides = {}) {
  return {
    taskId: 'task_relevance_guard',
    requestId: 'req_relevance_guard',
    conversationId: 'web:relevance_guard',
    domain: 'employment_salary',
    intent: 'salary_question',
    capability: 'jobs.salary',
    status: 'pending',
    input: {},
    metadata: {},
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function createContext(message) {
  return {
    requestId: 'req_relevance_guard',
    conversationId: 'web:relevance_guard',
    userId: 'user_relevance_guard',
    message,
    profile: {
      userId: 'user_relevance_guard',
      preferredCurrency: 'THB',
      city: 'Tel Aviv',
    },
  };
}

test('salary payment timing knowledge remains available when the question has direct relevance evidence', async () => {
  const result = await answer('What is the salary payment date for monthly salary in Israel?');

  assert.equal(result.status, 'FOUND');
  assert.equal(result.relevantKnowledge.some((item) => item.id === 'israel_salary_payment_timing_monthly'), true);
});

test('missing salary knowledge remains available when the question has direct relevance evidence', async () => {
  const result = await answer('I have missing salary and unpaid salary for monthly salary.');

  assert.equal(result.status, 'FOUND');
  assert.equal(result.relevantKnowledge.some((item) => item.id === 'israel_missing_salary_monthly_foundation'), true);
});

test('overtime knowledge remains available when the question has direct relevance evidence', async () => {
  const result = await answer('How do overtime pay and overtime multiplier rules work?');

  assert.equal(result.status, 'FOUND');
  assert.equal(result.relevantKnowledge.some((item) => item.id === 'israel_overtime_pay_multipliers_section_16a'), true);
});

test('bank account question rejects unrelated Employment knowledge', async () => {
  const result = await answer('Which bank account is better for me?');

  assert.equal(result.status, 'NOT_FOUND');
  assert.equal(result.relevantKnowledge.some((item) => item.category === 'Workers Rights'), false);
});

test('bank card problem rejects unrelated worker-rights knowledge', async () => {
  const result = await answer('I have a problem with my bank card.');

  assert.equal(result.status, 'NOT_FOUND');
  assert.equal(result.relevantKnowledge.some((item) => item.category === 'Workers Rights'), false);
});

test('consumer shopping question rejects unrelated knowledge', async () => {
  const result = await answer('Where can I buy a cheap phone?');

  assert.equal(result.status, 'NOT_FOUND');
  assert.deepEqual(result.relevantKnowledge, []);
});

test('language help question rejects unrelated worker-rights knowledge', async () => {
  const result = await answer('Help me understand this language.');

  assert.equal(result.status, 'NOT_FOUND');
  assert.equal(result.relevantKnowledge.some((item) => item.category === 'Workers Rights'), false);
});

test('unsupported bill payment question rejects weak pay-only worker-rights match', async () => {
  const result = await answer('What is the best way to pay this bill?');

  assert.equal(result.status, 'NOT_FOUND');
  assert.equal(result.relevantKnowledge.some((item) => item.category === 'Workers Rights'), false);
});

test('Health doctor request does not use Employment knowledge', async () => {
  const result = await healthLifeCommunityAgent.execute(createTask({
    domain: 'health_life_community',
    intent: 'health_request',
    capability: 'health.support',
    input: { question: 'I need a doctor.' },
  }));

  assert.equal(['success', 'partial'].includes(result.status), true);
  assert.notEqual(result.output?.knowledge?.category, 'Workers Rights');
});

test('urgent Health request does not retrieve unrelated knowledge', async () => {
  const result = await healthLifeCommunityAgent.execute(createTask({
    domain: 'health_life_community',
    intent: 'health_request',
    capability: 'health.support',
    input: { question: 'I need urgent medical help.' },
  }));

  assert.equal(result.status, 'partial');
  assert.equal(result.output.urgent, true);
  assert.equal(result.output.knowledge, null);
});

test('Finance transfer behavior remains supported without generic knowledge', async () => {
  const result = await financeConsumerAgent.execute(createTask({
    domain: 'finance_consumer',
    intent: 'money_transfer',
    capability: 'finance.transfer',
    input: {
      question: 'How can I send 2,000 ILS to Thailand?',
      amount: 2000,
      sourceCurrency: 'ILS',
      targetCurrency: 'THB',
    },
  }));

  assert.equal(result.status, 'partial');
  assert.equal(result.output.capability, 'finance.transfer');
  assert.match(result.output.message, /not currently have enough real reported observations/i);
  assert.doesNotMatch(result.output.message, /Demo data/i);
});

test('Government and document knowledge remains available when directly relevant', async () => {
  const result = await answer('How do I renew my visa documents?');

  assert.equal(result.status, 'FOUND');
  assert.equal(result.relevantKnowledge.some((item) => item.category === 'Documents'), true);
});

test('multi-intent task isolation prevents salary sourceMessage from contaminating Finance relevance', async () => {
  const service = new SupervisorService();
  const message = 'My salary was not paid and I need help with my bank card.';
  const context = createContext(message);
  const detected = service.detectIntents(context);
  const tasks = service.createTasksFromIntents(context, detected);

  assert.deepEqual(detected.intents.map((intent) => intent.domain), ['employment_salary', 'finance_consumer']);
  assert.equal(tasks.every((task) => task.metadata.sourceMessage === message), true);
  assert.equal(tasks[0].input.question, 'my salary was not paid');
  assert.equal(tasks[1].input.question, 'i need help with my bank card');

  const employmentResult = await employmentSalaryAgent.execute(tasks[0]);
  const financeResult = await financeConsumerAgent.execute(tasks[1]);
  const focusedKnowledge = await answer(tasks[1].input.question);

  assert.notEqual(employmentResult.status, 'failed');
  assert.equal(focusedKnowledge.status, 'NOT_FOUND');
  assert.equal(focusedKnowledge.relevantKnowledge.some((item) => item.category === 'Workers Rights'), false);
  assert.equal(financeResult.output?.knowledge, undefined);
});

test('focused task question controls knowledge relevance instead of sourceMessage', async () => {
  const focusedFinanceQuestion = 'i need help with my bank card';
  const contaminatedSourceMessage = 'My salary was not paid and I need help with my bank card.';
  const focusedResult = await answer(focusedFinanceQuestion);
  const contaminatedResult = await answer(contaminatedSourceMessage);

  assert.equal(focusedResult.status, 'NOT_FOUND');
  assert.equal(focusedResult.relevantKnowledge.some((item) => item.category === 'Workers Rights'), false);
  assert.equal(contaminatedResult.status, 'FOUND');
});

test('single-word weak relevance terms are insufficient evidence', () => {
  const item = {
    category: 'Workers Rights',
    keywords: ['pay'],
    title: 'Basic worker rights',
  };

  assert.equal(
    knowledgeBaseService.hasPositiveRelevanceEvidence(item, 'What is the best way to pay this bill?', 'Workers Rights'),
    false
  );
});

test('non-weak category keyword is positive relevance evidence', () => {
  const item = {
    category: 'Workers Rights',
    keywords: ['salary'],
    title: 'Basic worker rights',
  };

  assert.equal(
    knowledgeBaseService.hasPositiveRelevanceEvidence(item, 'What are my salary rights?', 'Workers Rights'),
    true
  );
});

test('bad-match rejection does not execute duplicate tasks', async () => {
  const service = new SupervisorService();
  const context = createContext('My salary was not paid and I need help with my bank card.');
  const tasks = service.createTasksFromIntents(context, service.detectIntents(context));
  const executed = [];
  const originalExecuteTask = service.executeTask.bind(service);

  service.executeTask = async (task, executor, requestContext) => {
    executed.push(task.domain);
    return originalExecuteTask(task, executor, requestContext);
  };

  await service.executeTasksSequentially(tasks);

  assert.deepEqual(executed, ['employment_salary', 'finance_consumer']);
});
