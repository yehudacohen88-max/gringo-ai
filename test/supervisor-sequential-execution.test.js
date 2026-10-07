const test = require('node:test');
const assert = require('node:assert/strict');

const { SupervisorService } = require('../src/modules/agents');

function createTask(overrides = {}) {
  return {
    taskId: 'task_1',
    conversationId: 'web:user',
    requestId: 'req_1',
    domain: 'employment_salary',
    capability: 'jobs.search',
    status: 'pending',
    input: {},
    createdAt: '2026-08-02T08:00:00.000Z',
    ...overrides,
  };
}

function createPlan(overrides = {}) {
  return {
    planId: 'plan_1',
    requestId: 'req_1',
    conversationId: 'web:user',
    requestType: 'multi_domain',
    primaryDomain: 'employment_salary',
    secondaryDomains: ['finance_consumer'],
    routingDecision: {
      routeType: 'multi_domain',
      targetDomains: ['employment_salary', 'finance_consumer'],
    },
    tasks: [],
    requiresUserInput: false,
    missingInformation: [],
    requiresApproval: false,
    urgency: 'normal',
    status: 'ready',
    createdAt: '2026-08-02T08:00:00.000Z',
    updatedAt: '2026-08-02T08:00:00.000Z',
    ...overrides,
  };
}

function result(taskId, status = 'success') {
  return {
    taskId,
    status,
    output: {},
    factsLearned: [],
    suggestedProfileUpdates: [],
    followUpQuestions: [],
    warnings: [],
    completedAt: `2026-08-02T08:00:0${taskId.slice(-1)}.000Z`,
  };
}

function createServiceWithExecutor(executor) {
  const service = new SupervisorService();
  service.executeAgent = executor;
  return service;
}

test('one task executed', async () => {
  const calls = [];
  const service = createServiceWithExecutor(async (task) => {
    calls.push(task.taskId);
    return result(task.taskId);
  });

  const plan = createPlan({ tasks: [createTask()] });
  const executed = await service.executePlanTasks(plan);

  assert.deepEqual(calls, ['task_1']);
  assert.equal(executed.tasks[0].status, 'completed');
  assert.equal(executed.status, 'completed');
});

test('two tasks executed in order', async () => {
  const calls = [];
  const service = createServiceWithExecutor(async (task) => {
    calls.push(task.taskId);
    return result(task.taskId);
  });

  await service.executePlanTasks(createPlan({
    tasks: [
      createTask({ taskId: 'task_1' }),
      createTask({ taskId: 'task_2', domain: 'finance_consumer', capability: 'finance.budget' }),
    ],
  }));

  assert.deepEqual(calls, ['task_1', 'task_2']);
});

test('three tasks executed in order and sequentially', async () => {
  const calls = [];
  let active = 0;
  let maxActive = 0;
  const service = createServiceWithExecutor(async (task) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    calls.push(task.taskId);
    await Promise.resolve();
    active -= 1;
    return result(task.taskId);
  });

  await service.executePlanTasks(createPlan({
    tasks: [
      createTask({ taskId: 'task_1' }),
      createTask({ taskId: 'task_2', domain: 'finance_consumer', capability: 'finance.budget' }),
      createTask({ taskId: 'task_3', domain: 'health_life_community', capability: 'community.support' }),
    ],
  }));

  assert.deepEqual(calls, ['task_1', 'task_2', 'task_3']);
  assert.equal(maxActive, 1);
});

test('completed and blocked tasks are skipped', async () => {
  const calls = [];
  const service = createServiceWithExecutor(async (task) => {
    calls.push(task.taskId);
    return result(task.taskId);
  });

  const executed = await service.executePlanTasks(createPlan({
    tasks: [
      createTask({ taskId: 'task_1', status: 'completed' }),
      createTask({ taskId: 'task_2', status: 'blocked' }),
      createTask({ taskId: 'task_3' }),
    ],
  }));

  assert.deepEqual(calls, ['task_3']);
  assert.deepEqual(executed.tasks.map((task) => task.status), ['completed', 'blocked', 'completed']);
});

test('failed task does not stop later independent tasks', async () => {
  const calls = [];
  const service = createServiceWithExecutor(async (task) => {
    calls.push(task.taskId);
    if (task.taskId === 'task_1') throw new Error('first failed');
    return result(task.taskId);
  });

  const executed = await service.executePlanTasks(createPlan({
    tasks: [
      createTask({ taskId: 'task_1' }),
      createTask({ taskId: 'task_2', domain: 'finance_consumer', capability: 'finance.budget' }),
    ],
  }));

  assert.deepEqual(calls, ['task_1', 'task_2']);
  assert.equal(executed.tasks[0].status, 'failed');
  assert.equal(executed.tasks[0].error.message, 'first failed');
  assert.equal(executed.tasks[1].status, 'completed');
  assert.equal(executed.status, 'partial');
});

test('all completed sets plan completed', async () => {
  const service = createServiceWithExecutor(async (task) => result(task.taskId));

  const executed = await service.executePlanTasks(createPlan({
    tasks: [createTask({ taskId: 'task_1' }), createTask({ taskId: 'task_2' })],
  }));

  assert.equal(executed.status, 'completed');
});

test('mixed results set plan partial', async () => {
  const service = createServiceWithExecutor(async (task) => {
    if (task.taskId === 'task_2') return result(task.taskId, 'blocked');
    return result(task.taskId);
  });

  const executed = await service.executePlanTasks(createPlan({
    tasks: [createTask({ taskId: 'task_1' }), createTask({ taskId: 'task_2' })],
  }));

  assert.deepEqual(executed.tasks.map((task) => task.status), ['completed', 'blocked']);
  assert.equal(executed.status, 'partial');
});

test('all failed sets plan failed', async () => {
  const service = createServiceWithExecutor(async (task) => result(task.taskId, 'failed'));

  const executed = await service.executePlanTasks(createPlan({
    tasks: [createTask({ taskId: 'task_1' }), createTask({ taskId: 'task_2' })],
  }));

  assert.equal(executed.status, 'failed');
});

test('all blocked sets waiting_for_user', async () => {
  const service = createServiceWithExecutor(async (task) => result(task.taskId, 'blocked'));

  const executed = await service.executePlanTasks(createPlan({
    tasks: [createTask({ taskId: 'task_1' }), createTask({ taskId: 'task_2' })],
  }));

  assert.equal(executed.status, 'waiting_for_user');
});

test('original plan is not mutated', async () => {
  const service = createServiceWithExecutor(async (task) => result(task.taskId));
  const plan = createPlan({ tasks: [createTask({ taskId: 'task_1' })] });
  const before = JSON.stringify(plan);

  await service.executePlanTasks(plan);

  assert.equal(JSON.stringify(plan), before);
});

test('each pending task executed once', async () => {
  const counts = new Map();
  const service = createServiceWithExecutor(async (task) => {
    counts.set(task.taskId, (counts.get(task.taskId) || 0) + 1);
    return result(task.taskId);
  });

  await service.executePlanTasks(createPlan({
    tasks: [
      createTask({ taskId: 'task_1' }),
      createTask({ taskId: 'task_2' }),
      createTask({ taskId: 'task_3', status: 'failed' }),
    ],
  }));

  assert.deepEqual([...counts.entries()], [['task_1', 1], ['task_2', 1]]);
});
