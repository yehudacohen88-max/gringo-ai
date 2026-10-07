const test = require('node:test');
const assert = require('node:assert/strict');

const { SupervisorService } = require('../src/modules/agents');

function createResult(overrides = {}) {
  return {
    taskId: 'task_1',
    status: 'success',
    output: { answer: 'ok' },
    factsLearned: [],
    suggestedProfileUpdates: [],
    followUpQuestions: [],
    warnings: [],
    completedAt: '2026-08-02T08:01:00.000Z',
    ...overrides,
  };
}

function createTask(overrides = {}) {
  return {
    taskId: 'task_1',
    domain: 'employment_salary',
    capability: 'jobs.search',
    status: 'completed',
    result: createResult(),
    ...overrides,
  };
}

function createPlan(overrides = {}) {
  return {
    planId: 'plan_1',
    requestId: 'req_1',
    conversationId: 'web:user',
    status: 'completed',
    tasks: [],
    ...overrides,
  };
}

test('one result aggregated', () => {
  const service = new SupervisorService();
  const aggregate = service.aggregatePlanResults(createPlan({ tasks: [createTask()] }));

  assert.equal(aggregate.planId, 'plan_1');
  assert.equal(aggregate.status, 'completed');
  assert.deepEqual(aggregate.domainResults, [{
    taskId: 'task_1',
    domain: 'employment_salary',
    status: 'completed',
    output: { answer: 'ok' },
  }]);
});

test('multiple results preserve task order', () => {
  const service = new SupervisorService();
  const aggregate = service.aggregatePlanResults(createPlan({
    tasks: [
      createTask({ taskId: 'task_1', domain: 'employment_salary', result: createResult({ taskId: 'task_1' }) }),
      createTask({ taskId: 'task_2', domain: 'finance_consumer', result: createResult({ taskId: 'task_2' }) }),
      createTask({ taskId: 'task_3', domain: 'health_life_community', result: createResult({ taskId: 'task_3' }) }),
    ],
  }));

  assert.deepEqual(aggregate.domainResults.map((result) => result.taskId), ['task_1', 'task_2', 'task_3']);
});

test('facts are combined and duplicate facts are removed', () => {
  const service = new SupervisorService();
  const aggregate = service.aggregatePlanResults(createPlan({
    tasks: [
      createTask({ result: createResult({ factsLearned: ['salary due', '', 'rent needed'] }) }),
      createTask({ taskId: 'task_2', domain: 'finance_consumer', result: createResult({ taskId: 'task_2', factsLearned: ['salary due', 'budget known'] }) }),
    ],
  }));

  assert.deepEqual(aggregate.combinedFacts, ['salary due', 'rent needed', 'budget known']);
});

test('suggested updates, follow-up questions, and warnings are combined', () => {
  const service = new SupervisorService();
  const update = { field: 'city', value: 'Tel Aviv' };
  const aggregate = service.aggregatePlanResults(createPlan({
    tasks: [
      createTask({
        result: createResult({
          suggestedProfileUpdates: [update, update],
          followUpQuestions: ['Which city?', ''],
          warnings: ['demo_data'],
        }),
      }),
      createTask({
        taskId: 'task_2',
        domain: 'finance_consumer',
        result: createResult({
          taskId: 'task_2',
          suggestedProfileUpdates: [{ field: 'currency', value: 'THB' }],
          followUpQuestions: ['Which city?', 'What amount?'],
          warnings: ['demo_data', 'verify_details'],
        }),
      }),
    ],
  }));

  assert.deepEqual(aggregate.suggestedProfileUpdates, [update, { field: 'currency', value: 'THB' }]);
  assert.deepEqual(aggregate.followUpQuestions, ['Which city?', 'What amount?']);
  assert.deepEqual(aggregate.warnings, ['demo_data', 'verify_details']);
});

test('blocked and failed domains are recorded without duplicates', () => {
  const service = new SupervisorService();
  const aggregate = service.aggregatePlanResults(createPlan({
    tasks: [
      createTask({ status: 'blocked', result: createResult({ status: 'blocked' }) }),
      createTask({ taskId: 'task_2', domain: 'employment_salary', status: 'blocked', result: createResult({ taskId: 'task_2', status: 'blocked' }) }),
      createTask({ taskId: 'task_3', domain: 'finance_consumer', status: 'failed', result: createResult({ taskId: 'task_3', status: 'failed' }) }),
    ],
  }));

  assert.deepEqual(aggregate.blockedDomains, ['employment_salary']);
  assert.deepEqual(aggregate.failedDomains, ['finance_consumer']);
});

test('all completed status', () => {
  const service = new SupervisorService();
  const aggregate = service.aggregatePlanResults(createPlan({
    tasks: [
      createTask(),
      createTask({ taskId: 'task_2', domain: 'finance_consumer', result: createResult({ taskId: 'task_2' }) }),
    ],
  }));

  assert.equal(aggregate.status, 'completed');
});

test('mixed status returns partial', () => {
  const service = new SupervisorService();
  const aggregate = service.aggregatePlanResults(createPlan({
    tasks: [
      createTask(),
      createTask({ taskId: 'task_2', domain: 'finance_consumer', status: 'blocked', result: createResult({ taskId: 'task_2', status: 'blocked' }) }),
    ],
  }));

  assert.equal(aggregate.status, 'partial');
});

test('all failed status', () => {
  const service = new SupervisorService();
  const aggregate = service.aggregatePlanResults(createPlan({
    tasks: [
      createTask({ status: 'failed', result: createResult({ status: 'failed' }) }),
      createTask({ taskId: 'task_2', domain: 'finance_consumer', status: 'failed', result: createResult({ taskId: 'task_2', status: 'failed' }) }),
    ],
  }));

  assert.equal(aggregate.status, 'failed');
});

test('all blocked status', () => {
  const service = new SupervisorService();
  const aggregate = service.aggregatePlanResults(createPlan({
    tasks: [
      createTask({ status: 'blocked', result: createResult({ status: 'blocked' }) }),
      createTask({ taskId: 'task_2', domain: 'finance_consumer', status: 'blocked', result: createResult({ taskId: 'task_2', status: 'blocked' }) }),
    ],
  }));

  assert.equal(aggregate.status, 'blocked');
});

test('no results returns empty', () => {
  const service = new SupervisorService();
  const aggregate = service.aggregatePlanResults(createPlan({
    status: 'ready',
    tasks: [createTask({ result: undefined }), createTask({ taskId: 'task_2', result: null })],
  }));

  assert.equal(aggregate.status, 'empty');
  assert.deepEqual(aggregate.domainResults, []);
});

test('original plan and task results are not mutated', () => {
  const service = new SupervisorService();
  const plan = createPlan({
    tasks: [createTask({ result: createResult({ factsLearned: ['one'] }) })],
  });
  const before = JSON.stringify(plan);

  const aggregate = service.aggregatePlanResults(plan);
  aggregate.domainResults[0].output.answer = 'changed';
  aggregate.combinedFacts.push('changed');

  assert.equal(JSON.stringify(plan), before);
});

test('no LLM call occurs during aggregation', () => {
  const service = new SupervisorService();
  let executed = false;
  service.executeAgent = async () => {
    executed = true;
  };

  service.aggregatePlanResults(createPlan({ tasks: [createTask()] }));

  assert.equal(executed, false);
});
