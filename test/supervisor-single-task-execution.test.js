const test = require('node:test');
const assert = require('node:assert/strict');

const { SupervisorService } = require('../src/modules/agents');
const { validateAgentInterface } = require('../src/modules/agents/contracts/agent.interface');
const { validateResultContract } = require('../src/modules/agents/contracts/result.contract');

function createTask(overrides = {}) {
  return {
    taskId: 'task_single_execution',
    requestId: 'req_single_execution',
    conversationId: 'web:user_single_execution',
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

function createExecutorAgent({ id, domain, capability, calls, result, throws = false }) {
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
      calls.push({
        agentId: id,
        taskId: task.taskId,
      });
      if (throws) throw new Error('planned executor failure');
      return {
        taskId: task.taskId,
        status: 'success',
        output: {
          capability,
          message: `${id} executed`,
        },
        factsLearned: [],
        suggestedProfileUpdates: [],
        followUpQuestions: [],
        warnings: [],
        completedAt: new Date().toISOString(),
        ...result,
      };
    },
  };
  validateAgentInterface(agent);
  return agent;
}

function mockRegistry(service, agents) {
  service.agentRegistry.getAgent = (agentId) => agents[agentId] || null;
}

test('employment task executes Employment executor exactly once and returns valid result', async () => {
  const service = new SupervisorService();
  const calls = [];
  mockRegistry(service, {
    employment_salary_agent: createExecutorAgent({
      id: 'employment_salary_agent',
      domain: 'employment_salary',
      capability: 'jobs.salary',
      calls,
    }),
  });
  const task = createTask();
  const result = await service.executeTask(task, service.selectExecutorForTask(task));

  assert.equal(calls.length, 1);
  assert.equal(calls[0].agentId, 'employment_salary_agent');
  assert.equal(validateResultContract(result), true);
  assert.equal(result.taskId, task.taskId);
});

test('finance task executes Finance executor exactly once and returns valid result', async () => {
  const service = new SupervisorService();
  const calls = [];
  mockRegistry(service, {
    finance_consumer_agent: createExecutorAgent({
      id: 'finance_consumer_agent',
      domain: 'finance_consumer',
      capability: 'finance.transfer',
      calls,
    }),
  });
  const task = createTask({
    domain: 'finance_consumer',
    intent: 'money_transfer',
    capability: 'finance.transfer',
    metadata: {
      intent: 'money_transfer',
    },
  });
  const result = await service.executeTask(task, service.selectExecutorForTask(task));

  assert.equal(calls.length, 1);
  assert.equal(calls[0].agentId, 'finance_consumer_agent');
  assert.equal(validateResultContract(result), true);
  assert.equal(result.domain, 'finance_consumer');
});

test('health life community task executes correct executor exactly once and returns valid result', async () => {
  const service = new SupervisorService();
  const calls = [];
  mockRegistry(service, {
    health_life_community_agent: createExecutorAgent({
      id: 'health_life_community_agent',
      domain: 'health_life_community',
      capability: 'health.support',
      calls,
    }),
  });
  const task = createTask({
    domain: 'health_life_community',
    intent: 'health_request',
    capability: 'health.support',
    metadata: {
      intent: 'health_request',
    },
  });
  const result = await service.executeTask(task, service.selectExecutorForTask(task));

  assert.equal(calls.length, 1);
  assert.equal(calls[0].agentId, 'health_life_community_agent');
  assert.equal(validateResultContract(result), true);
  assert.equal(result.domain, 'health_life_community');
});

test('profile-memory task uses Core Profile Memory executor and returns valid result', async () => {
  const service = new SupervisorService();
  const task = createTask({
    domain: 'profile_memory',
    intent: 'profile_field_recall',
    capability: 'profile.field_recall',
    metadata: {
      intent: 'profile_field_recall',
    },
  });
  const result = await service.executeTask(task, service.selectExecutorForTask(task));

  assert.equal(validateResultContract(result), true);
  assert.equal(result.status, 'success');
  assert.equal(result.output.handledBy, 'core_profile_memory');
  assert.equal(result.taskId, task.taskId);
});

test('unsupported executor returns safe blocked result and no fallback Domain Agent executes', async () => {
  const service = new SupervisorService();
  let fallbackExecuted = false;
  mockRegistry(service, {
    employment_salary_agent: createExecutorAgent({
      id: 'employment_salary_agent',
      domain: 'employment_salary',
      capability: 'jobs.salary',
      calls: [],
      result: {},
    }),
  });
  service.executeAgent = async () => {
    fallbackExecuted = true;
  };
  const task = createTask({
    domain: 'unknown_domain',
    intent: 'unknown',
    capability: 'unknown.capability',
  });
  const result = await service.executeTask(task, {
    executorType: 'unresolved',
    executorId: '',
  });

  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.warnings, ['unsupported_executor']);
  assert.equal(validateResultContract(result), true);
  assert.equal(fallbackExecuted, false);
});

test('one executeTask call never executes more than one executor', async () => {
  const service = new SupervisorService();
  const calls = [];
  mockRegistry(service, {
    employment_salary_agent: createExecutorAgent({
      id: 'employment_salary_agent',
      domain: 'employment_salary',
      capability: 'jobs.salary',
      calls,
    }),
    finance_consumer_agent: createExecutorAgent({
      id: 'finance_consumer_agent',
      domain: 'finance_consumer',
      capability: 'finance.transfer',
      calls,
    }),
  });
  const task = createTask();
  const result = await service.executeTask(task, {
    executorType: 'domain_agent',
    executorId: 'employment_salary_agent',
  });

  assert.equal(validateResultContract(result), true);
  assert.deepEqual(calls.map((call) => call.agentId), ['employment_salary_agent']);
});

test('taskId requestId and conversationId correlation is preserved', async () => {
  const service = new SupervisorService();
  const calls = [];
  mockRegistry(service, {
    employment_salary_agent: createExecutorAgent({
      id: 'employment_salary_agent',
      domain: 'employment_salary',
      capability: 'jobs.salary',
      calls,
    }),
  });
  const task = createTask({
    taskId: 'task_correlation',
    requestId: 'req_correlation',
    conversationId: 'web:correlation',
  });
  const result = await service.executeTask(task, service.selectExecutorForTask(task));

  assert.equal(result.taskId, 'task_correlation');
  assert.equal(result.requestId, 'req_correlation');
  assert.equal(result.conversationId, 'web:correlation');
  assert.equal(result.intent, 'salary_question');
});

test('executor failure returns normalized failure result without escaping', async () => {
  const service = new SupervisorService();
  const calls = [];
  mockRegistry(service, {
    employment_salary_agent: createExecutorAgent({
      id: 'employment_salary_agent',
      domain: 'employment_salary',
      capability: 'jobs.salary',
      calls,
      throws: true,
    }),
  });
  const task = createTask();
  const result = await service.executeTask(task, service.selectExecutorForTask(task));

  assert.equal(calls.length, 1);
  assert.equal(result.status, 'failed');
  assert.deepEqual(result.warnings, ['execution_failed']);
  assert.equal(validateResultContract(result), true);
});

test('single task execution returns one result and does not merge results', async () => {
  const service = new SupervisorService();
  const calls = [];
  mockRegistry(service, {
    employment_salary_agent: createExecutorAgent({
      id: 'employment_salary_agent',
      domain: 'employment_salary',
      capability: 'jobs.salary',
      calls,
    }),
  });
  const result = await service.executeTask(createTask(), {
    executorType: 'domain_agent',
    executorId: 'employment_salary_agent',
  });

  assert.equal(Array.isArray(result), false);
  assert.equal(Object.hasOwn(result, 'domainResults'), false);
  assert.equal(calls.length, 1);
});

test('live Web Chat behavior is not wired to executeTask in this sprint', () => {
  const { coreAgentService } = require('../src/modules/core-agent');

  assert.equal(Object.hasOwn(coreAgentService, 'executeTask'), false);
});
