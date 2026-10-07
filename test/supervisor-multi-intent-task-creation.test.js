const test = require('node:test');
const assert = require('node:assert/strict');

const { SupervisorService } = require('../src/modules/agents');
const { validateTaskContract } = require('../src/modules/agents/contracts/task.contract');

function createRequestContext(message, overrides = {}) {
  return {
    requestId: 'req_multi_intent_tasks',
    conversationId: 'web:user_multi_intent_tasks',
    userId: 'usr_multi_intent_tasks',
    message,
    profile: {
      userId: 'usr_multi_intent_tasks',
      fullName: 'David Levi',
    },
    ...overrides,
  };
}

function createTasks(message, overrides = {}) {
  const service = new SupervisorService();
  const context = createRequestContext(message, overrides);
  const detectedIntents = service.detectIntents(context);
  return {
    service,
    context,
    detectedIntents,
    tasks: service.createTasksFromIntents(context, detectedIntents),
  };
}

function createActiveSupervisorTasks(message, overrides = {}) {
  const service = new SupervisorService();
  const context = createRequestContext(message, overrides);
  const plan = service.createPlan(context);
  const taskPlan = service.buildTaskSkeleton(plan, context);
  return {
    service,
    context,
    plan,
    tasks: taskPlan.tasks,
  };
}

test('two detected intents create exactly two tasks', () => {
  const { tasks } = createTasks('How much salary should I receive and where can I transfer money to Thailand?');

  assert.equal(tasks.length, 2);
  assert.equal(tasks.every((task) => validateTaskContract(task)), true);
});

test('three detected intents create exactly three tasks', () => {
  const { tasks } = createTasks('How much salary should I receive and where can I transfer money to Thailand and I need a doctor.');

  assert.equal(tasks.length, 3);
  assert.deepEqual(tasks.map((task) => task.domain), [
    'employment_salary',
    'finance_consumer',
    'health_life_community',
  ]);
});

test('task order matches detected intent order', () => {
  const { detectedIntents, tasks } = createTasks('I moved to Haifa. Can you find construction jobs near me?');

  assert.deepEqual(
    tasks.map((task) => ({ domain: task.domain, intent: task.intent })),
    detectedIntents.intents
  );
});

test('each task has a unique taskId', () => {
  const { tasks } = createTasks('What is my profession? What do you remember about me?');
  const taskIds = tasks.map((task) => task.taskId);

  assert.equal(new Set(taskIds).size, taskIds.length);
});

test('all tasks contain the current requestId and conversationId', () => {
  const { tasks } = createTasks('I need a doctor and I also need help finding housing.', {
    requestId: 'req_linked_tasks',
    conversationId: 'web:linked_tasks',
  });

  assert.equal(tasks.every((task) => task.requestId === 'req_linked_tasks'), true);
  assert.equal(tasks.every((task) => task.conversationId === 'web:linked_tasks'), true);
});

test('domain mapping and capabilities are preserved', () => {
  const { tasks } = createTasks('How much salary should I receive and where can I transfer money to Thailand?');

  assert.deepEqual(
    tasks.map((task) => [task.domain, task.intent, task.capability]),
    [
      ['employment_salary', 'salary_question', 'jobs.salary'],
      ['finance_consumer', 'money_transfer', 'finance.transfer'],
    ]
  );
});

test('salary plus money-transfer task isolation is preserved after exchange-rate routing', () => {
  const { tasks } = createTasks('When should my salary be paid and how can I send money to Thailand?');

  assert.deepEqual(
    tasks.map((task) => [task.domain, task.intent, task.capability]),
    [
      ['employment_salary', 'salary_question', 'jobs.salary'],
      ['finance_consumer', 'money_transfer', 'finance.transfer'],
    ]
  );
  assert.match(tasks[0].input.question, /salary/i);
  assert.doesNotMatch(tasks[0].input.question, /send money|Thailand/i);
  assert.match(tasks[1].input.question, /send money|Thailand/i);
  assert.doesNotMatch(tasks[1].input.question, /salary/i);
});

test('Hebrew Thailand transfer request creates finance transfer task with ILS to THB corridor', () => {
  const { tasks } = createTasks('אני רוצה לשלוח 2000 שקל לתאילנד, איפה הכי משתלם?');

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].capability, 'finance.transfer');
  assert.equal(tasks[0].input.amount, 2000);
  assert.equal(tasks[0].input.sourceCurrency, 'ILS');
  assert.equal(tasks[0].input.targetCurrency, 'THB');
  assert.equal(tasks[0].input.country, 'Thailand');
});

test('Hebrew Thailand transfer variants preserve explicit amount and corridor extraction', () => {
  const examples = [
    'אני רוצה לשלוח 2000 שקל לתאילנד',
    'אני רוצה להעביר 2000 שקלים לתאילנד',
    'אני רוצה לשלוח 2000 ILS לתאילנד',
  ];

  for (const message of examples) {
    const { tasks } = createTasks(message);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].capability, 'finance.transfer');
    assert.equal(tasks[0].input.amount, 2000);
    assert.equal(tasks[0].input.sourceCurrency, 'ILS');
    assert.equal(tasks[0].input.targetCurrency, 'THB');
  }
});

test('Hebrew Thailand transfer without amount does not invent amount', () => {
  const { tasks } = createTasks('אני רוצה לשלוח כסף לתאילנד');

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].capability, 'finance.transfer');
  assert.equal(tasks[0].input.amount, undefined);
  assert.equal(tasks[0].input.targetCurrency, 'THB');
  assert.equal(tasks[0].input.country, 'Thailand');
});

test('English Thailand transfer behavior remains intact', () => {
  const { tasks } = createTasks('I want to send 2000 ILS to Thailand');

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].capability, 'finance.transfer');
  assert.equal(tasks[0].input.amount, 2000);
  assert.equal(tasks[0].input.sourceCurrency, 'ILS');
  assert.equal(tasks[0].input.targetCurrency, 'THB');
});

test('Hebrew transfer message without Thailand does not infer THB from Hebrew alone', () => {
  const { tasks } = createTasks('אני רוצה לשלוח 2000 שקל למשפחה');

  assert.equal(tasks[0].input.targetCurrency, undefined);
});

test('active Supervisor path maps exact Hebrew Thailand transfer request to finance.transfer', () => {
  const { plan, tasks } = createActiveSupervisorTasks('אני רוצה לשלוח 2000 שקל לתאילנד, איפה הכי משתלם?');

  assert.equal(plan.primaryDomain, 'finance_consumer');
  assert.deepEqual(plan.detectedIntents.intents, [
    { domain: 'finance_consumer', intent: 'money_transfer' },
  ]);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].capability, 'finance.transfer');
  assert.equal(tasks[0].input.amount, 2000);
  assert.equal(tasks[0].input.sourceCurrency, 'ILS');
  assert.equal(tasks[0].input.country, 'Thailand');
  assert.equal(tasks[0].input.targetCurrency, 'THB');
});

test('active Supervisor path maps Hebrew Thailand transfer without amount without inventing amount', () => {
  const { tasks } = createActiveSupervisorTasks('אני רוצה לשלוח כסף לתאילנד');

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].capability, 'finance.transfer');
  assert.equal(tasks[0].input.amount, undefined);
  assert.equal(tasks[0].input.country, 'Thailand');
  assert.equal(tasks[0].input.targetCurrency, 'THB');
});

test('active Supervisor path preserves English Thailand transfer routing', () => {
  const { tasks } = createActiveSupervisorTasks('I want to send 2000 ILS to Thailand');

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].capability, 'finance.transfer');
  assert.equal(tasks[0].input.amount, 2000);
  assert.equal(tasks[0].input.sourceCurrency, 'ILS');
  assert.equal(tasks[0].input.targetCurrency, 'THB');
});

test('active Supervisor path keeps genuine consumer service requests on consumer.services', () => {
  const { tasks } = createActiveSupervisorTasks('I need shopping help in Tel Aviv');

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].capability, 'consumer.services');
});

test('active Supervisor path preserves Hebrew exchange-rate routing', () => {
  const { tasks } = createActiveSupervisorTasks('מה שער ההמרה הנוכחי משקל לבאט תאילנדי?');

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].capability, 'finance.exchange_rate');
  assert.equal(tasks[0].input.sourceCurrency, 'ILS');
  assert.equal(tasks[0].input.targetCurrency, 'THB');
});

test('profile-memory intent creates a valid task without a Domain Agent', () => {
  const { tasks } = createTasks('What is my profession? What do you remember about me?');

  assert.deepEqual(
    tasks.map((task) => [task.domain, task.intent, task.capability, task.status]),
    [
      ['profile_memory', 'profile_field_recall', 'profile.field_recall', 'pending'],
      ['profile_memory', 'profile_summary_recall', 'profile.recall', 'pending'],
    ]
  );
  assert.equal(tasks.every((task) => validateTaskContract(task)), true);
});

test('single intent creates exactly one task', () => {
  const { tasks } = createTasks('When should my salary be paid?');

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].domain, 'employment_salary');
  assert.equal(tasks[0].intent, 'salary_question');
});

test('task creation does not execute Domain Agents', () => {
  const service = new SupervisorService();
  const context = createRequestContext('How much salary should I receive and where can I transfer money to Thailand?');
  const detectedIntents = service.detectIntents(context);
  let executed = false;
  service.executeAgent = async () => {
    executed = true;
  };

  const tasks = service.createTasksFromIntents(context, detectedIntents);

  assert.equal(tasks.length, 2);
  assert.equal(executed, false);
});
