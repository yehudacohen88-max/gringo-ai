const test = require('node:test');
const assert = require('node:assert/strict');

const { SupervisorService } = require('../src/modules/agents');
const { validateAgentInterface } = require('../src/modules/agents/contracts/agent.interface');
const { validateResultContract } = require('../src/modules/agents/contracts/result.contract');

function createTask(overrides = {}) {
  return {
    taskId: 'task_sequence',
    requestId: 'req_sequence',
    conversationId: 'web:user_sequence',
    domain: 'employment_salary',
    intent: 'salary_question',
    capability: 'jobs.salary',
    status: 'pending',
    input: {
      question: 'When should my salary be paid?',
      profile: {
        fullName: 'David Levi',
      },
    },
    metadata: {
      intent: 'salary_question',
    },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function createAgent({ id, domain, capability, events, resultStatus = 'success', throws = false, delayMs = 0 }) {
  const agent = {
    id,
    name: `${id} test agent`,
    version: 'test',
    domain,
    capabilities: [capability],
    initialize: async () => ({ initialized: true }),
    health: async () => ({ status: 'ok' }),
    validate: async () => ({ valid: true }),
    execute: async (task) => {
      events.push(`start:${task.taskId}`);
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      if (throws) {
        events.push(`throw:${task.taskId}`);
        throw new Error('planned sequence failure');
      }
      events.push(`end:${task.taskId}`);
      return {
        taskId: task.taskId,
        status: resultStatus,
        output: {
          message: `${id} result`,
        },
        factsLearned: [],
        suggestedProfileUpdates: [],
        followUpQuestions: [],
        warnings: resultStatus === 'failed' ? ['execution_failed'] : [],
        completedAt: new Date().toISOString(),
      };
    },
  };
  validateAgentInterface(agent);
  return agent;
}

function mockRegistry(service, agents) {
  service.agentRegistry.getAgent = (agentId) => agents[agentId] || null;
}

function domainTasks() {
  return [
    createTask({
      taskId: 'task_employment',
      domain: 'employment_salary',
      intent: 'salary_question',
      capability: 'jobs.salary',
      metadata: { intent: 'salary_question' },
    }),
    createTask({
      taskId: 'task_finance',
      domain: 'finance_consumer',
      intent: 'money_transfer',
      capability: 'finance.transfer',
      metadata: { intent: 'money_transfer' },
    }),
    createTask({
      taskId: 'task_health',
      domain: 'health_life_community',
      intent: 'health_request',
      capability: 'health.support',
      metadata: { intent: 'health_request' },
    }),
  ];
}

function setupDomainAgents(service, events, overrides = {}) {
  mockRegistry(service, {
    employment_salary_agent: createAgent({
      id: 'employment_salary_agent',
      domain: 'employment_salary',
      capability: 'jobs.salary',
      events,
      ...overrides.employment,
    }),
    finance_consumer_agent: createAgent({
      id: 'finance_consumer_agent',
      domain: 'finance_consumer',
      capability: 'finance.transfer',
      events,
      ...overrides.finance,
    }),
    health_life_community_agent: createAgent({
      id: 'health_life_community_agent',
      domain: 'health_life_community',
      capability: 'health.support',
      events,
      ...overrides.health,
    }),
  });
}

test('two tasks both execute exactly once', async () => {
  const service = new SupervisorService();
  const events = [];
  setupDomainAgents(service, events);
  const tasks = domainTasks().slice(0, 2);
  const results = await service.executeTasksSequentially(tasks);

  assert.equal(results.length, 2);
  assert.deepEqual(events, ['start:task_employment', 'end:task_employment', 'start:task_finance', 'end:task_finance']);
  assert.equal(results.every((result) => validateResultContract(result)), true);
});

test('three tasks all execute exactly once through mixed-domain executors', async () => {
  const service = new SupervisorService();
  const events = [];
  setupDomainAgents(service, events);
  const results = await service.executeTasksSequentially(domainTasks());

  assert.equal(results.length, 3);
  assert.deepEqual(results.map((result) => result.domain), [
    'employment_salary',
    'finance_consumer',
    'health_life_community',
  ]);
  assert.equal(events.filter((event) => event.startsWith('start:')).length, 3);
});

test('execution is strictly sequential and result order matches task order', async () => {
  const service = new SupervisorService();
  const events = [];
  setupDomainAgents(service, events, {
    employment: { delayMs: 15 },
    finance: { delayMs: 5 },
    health: { delayMs: 1 },
  });
  const tasks = domainTasks();
  const results = await service.executeTasksSequentially(tasks);

  assert.deepEqual(events, [
    'start:task_employment',
    'end:task_employment',
    'start:task_finance',
    'end:task_finance',
    'start:task_health',
    'end:task_health',
  ]);
  assert.deepEqual(results.map((result) => result.taskId), tasks.map((task) => task.taskId));
});

test('profile-memory and domain tasks execute correctly in sequence', async () => {
  const service = new SupervisorService();
  const events = [];
  setupDomainAgents(service, events);
  const tasks = [
    createTask({
      taskId: 'task_profile',
      domain: 'profile_memory',
      intent: 'profile_field_recall',
      capability: 'profile.field_recall',
      metadata: { intent: 'profile_field_recall' },
    }),
    domainTasks()[0],
  ];
  const results = await service.executeTasksSequentially(tasks);

  assert.equal(results.length, 2);
  assert.equal(results[0].output.handledBy, 'core_profile_memory');
  assert.equal(results[1].domain, 'employment_salary');
  assert.deepEqual(events, ['start:task_employment', 'end:task_employment']);
});

test('middle task failure is isolated and later task still executes', async () => {
  const service = new SupervisorService();
  const events = [];
  setupDomainAgents(service, events, {
    finance: { throws: true },
  });
  const results = await service.executeTasksSequentially(domainTasks());

  assert.deepEqual(results.map((result) => result.status), ['success', 'failed', 'success']);
  assert.deepEqual(results.map((result) => result.taskId), ['task_employment', 'task_finance', 'task_health']);
  assert.equal(events.includes('start:task_health'), true);
});

test('unknown executor returns normalized result and next task still executes', async () => {
  const service = new SupervisorService();
  const events = [];
  setupDomainAgents(service, events);
  const tasks = [
    createTask({
      taskId: 'task_unknown',
      domain: 'unknown_domain',
      intent: 'unknown',
      capability: 'unknown.capability',
      metadata: { intent: 'unknown' },
    }),
    domainTasks()[0],
  ];
  const results = await service.executeTasksSequentially(tasks);

  assert.equal(results.length, 2);
  assert.equal(results[0].status, 'blocked');
  assert.deepEqual(results[0].warnings, ['unsupported_executor']);
  assert.equal(results[1].status, 'success');
  assert.deepEqual(events, ['start:task_employment', 'end:task_employment']);
});

test('empty task array returns an empty result list without executor calls', async () => {
  const service = new SupervisorService();
  const events = [];
  setupDomainAgents(service, events);
  const results = await service.executeTasksSequentially([]);

  assert.deepEqual(results, []);
  assert.deepEqual(events, []);
});

test('single-task array returns one result and exactly one executor call', async () => {
  const service = new SupervisorService();
  const events = [];
  setupDomainAgents(service, events);
  const results = await service.executeTasksSequentially([domainTasks()[0]]);

  assert.equal(results.length, 1);
  assert.deepEqual(events, ['start:task_employment', 'end:task_employment']);
});

test('original tasks array and task objects are not mutated', async () => {
  const service = new SupervisorService();
  const events = [];
  setupDomainAgents(service, events);
  const tasks = domainTasks();
  const before = JSON.stringify(tasks);

  await service.executeTasksSequentially(tasks);

  assert.equal(JSON.stringify(tasks), before);
});

test('no result merging occurs', async () => {
  const service = new SupervisorService();
  const events = [];
  setupDomainAgents(service, events);
  const results = await service.executeTasksSequentially(domainTasks().slice(0, 2));

  assert.equal(Array.isArray(results), true);
  assert.equal(Object.hasOwn(results, 'domainResults'), false);
  assert.equal(results.every((result) => !Object.hasOwn(result, 'domainResults')), true);
});

test('no parallel execution occurs', async () => {
  const service = new SupervisorService();
  const events = [];
  let activeExecutors = 0;
  let maxActiveExecutors = 0;
  const createSequentialProbe = (agentConfig) => createAgent({
    ...agentConfig,
    delayMs: 10,
    events,
    resultStatus: 'success',
  });
  const wrapExecute = (agent) => ({
    ...agent,
    execute: async (task) => {
      activeExecutors += 1;
      maxActiveExecutors = Math.max(maxActiveExecutors, activeExecutors);
      try {
        return await agent.execute(task);
      } finally {
        activeExecutors -= 1;
      }
    },
  });
  mockRegistry(service, {
    employment_salary_agent: wrapExecute(createSequentialProbe({
      id: 'employment_salary_agent',
      domain: 'employment_salary',
      capability: 'jobs.salary',
    })),
    finance_consumer_agent: wrapExecute(createSequentialProbe({
      id: 'finance_consumer_agent',
      domain: 'finance_consumer',
      capability: 'finance.transfer',
    })),
    health_life_community_agent: wrapExecute(createSequentialProbe({
      id: 'health_life_community_agent',
      domain: 'health_life_community',
      capability: 'health.support',
    })),
  });

  await service.executeTasksSequentially(domainTasks());

  assert.equal(maxActiveExecutors, 1);
});

test('live Web Chat behavior is not wired to sequential execution in this sprint', () => {
  const { coreAgentService } = require('../src/modules/core-agent');

  assert.equal(Object.hasOwn(coreAgentService, 'executeTasksSequentially'), false);
});
