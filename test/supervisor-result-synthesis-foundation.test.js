const test = require('node:test');
const assert = require('node:assert/strict');

const { SupervisorService } = require('../src/modules/agents');

function createResult(overrides = {}) {
  return {
    taskId: 'task_result',
    requestId: 'req_result',
    conversationId: 'web:user_result',
    domain: 'employment_salary',
    intent: 'salary_question',
    status: 'success',
    output: {
      message: 'Employment result',
      nested: {
        value: 'kept',
      },
    },
    factsLearned: ['fact_one'],
    suggestedProfileUpdates: [],
    followUpQuestions: [],
    warnings: [],
    completedAt: '2026-08-31T08:00:00.000Z',
    ...overrides,
  };
}

test('empty Result array returns valid empty synthesis with zero counts', () => {
  const service = new SupervisorService();
  const synthesis = service.synthesizeResults([]);

  assert.deepEqual(synthesis, {
    status: 'empty',
    items: [],
    successCount: 0,
    failureCount: 0,
  });
});

test('one successful Result returns success status and 1/0 counts', () => {
  const service = new SupervisorService();
  const synthesis = service.synthesizeResults([createResult()]);

  assert.equal(synthesis.status, 'success');
  assert.equal(synthesis.successCount, 1);
  assert.equal(synthesis.failureCount, 0);
});

test('one failed Result returns failure status and 0/1 counts', () => {
  const service = new SupervisorService();
  const synthesis = service.synthesizeResults([createResult({ status: 'failed' })]);

  assert.equal(synthesis.status, 'failure');
  assert.equal(synthesis.successCount, 0);
  assert.equal(synthesis.failureCount, 1);
});

test('multiple successful Results return success status with correct counts', () => {
  const service = new SupervisorService();
  const synthesis = service.synthesizeResults([
    createResult({ taskId: 'task_one' }),
    createResult({ taskId: 'task_two', domain: 'finance_consumer', intent: 'money_transfer' }),
  ]);

  assert.equal(synthesis.status, 'success');
  assert.equal(synthesis.successCount, 2);
  assert.equal(synthesis.failureCount, 0);
});

test('mixed success and failure returns partial status with correct counts', () => {
  const service = new SupervisorService();
  const synthesis = service.synthesizeResults([
    createResult({ taskId: 'task_one', status: 'success' }),
    createResult({ taskId: 'task_two', status: 'failed' }),
    createResult({ taskId: 'task_three', status: 'blocked' }),
  ]);

  assert.equal(synthesis.status, 'partial');
  assert.equal(synthesis.successCount, 1);
  assert.equal(synthesis.failureCount, 2);
});

test('all failed or blocked Results return failure status with correct counts', () => {
  const service = new SupervisorService();
  const synthesis = service.synthesizeResults([
    createResult({ taskId: 'task_one', status: 'failed' }),
    createResult({ taskId: 'task_two', status: 'blocked' }),
  ]);

  assert.equal(synthesis.status, 'failure');
  assert.equal(synthesis.successCount, 0);
  assert.equal(synthesis.failureCount, 2);
});

test('original Result order is preserved', () => {
  const service = new SupervisorService();
  const results = [
    createResult({ taskId: 'task_first' }),
    createResult({ taskId: 'task_second', domain: 'finance_consumer' }),
    createResult({ taskId: 'task_third', domain: 'health_life_community' }),
  ];
  const synthesis = service.synthesizeResults(results);

  assert.deepEqual(synthesis.items.map((result) => result.taskId), ['task_first', 'task_second', 'task_third']);
});

test('every Result appears exactly once', () => {
  const service = new SupervisorService();
  const results = [
    createResult({ taskId: 'task_alpha' }),
    createResult({ taskId: 'task_beta' }),
    createResult({ taskId: 'task_gamma' }),
  ];
  const synthesis = service.synthesizeResults(results);

  assert.equal(synthesis.items.length, 3);
  assert.deepEqual(synthesis.items.map((result) => result.taskId).sort(), ['task_alpha', 'task_beta', 'task_gamma']);
});

test('original Results array and Result objects are not mutated', () => {
  const service = new SupervisorService();
  const results = [createResult()];
  const before = JSON.stringify(results);
  const synthesis = service.synthesizeResults(results);

  synthesis.items[0].output.nested.value = 'changed';

  assert.equal(JSON.stringify(results), before);
});

test('correlation identifiers are preserved', () => {
  const service = new SupervisorService();
  const result = createResult({
    taskId: 'task_correlation',
    requestId: 'req_correlation',
    conversationId: 'web:user_correlation',
  });
  const synthesis = service.synthesizeResults([result]);

  assert.equal(synthesis.items[0].taskId, 'task_correlation');
  assert.equal(synthesis.items[0].requestId, 'req_correlation');
  assert.equal(synthesis.items[0].conversationId, 'web:user_correlation');
});

test('mixed-domain identifiers are preserved', () => {
  const service = new SupervisorService();
  const synthesis = service.synthesizeResults([
    createResult({ taskId: 'task_employment', domain: 'employment_salary' }),
    createResult({ taskId: 'task_finance', domain: 'finance_consumer' }),
    createResult({ taskId: 'task_health', domain: 'health_life_community' }),
  ]);

  assert.deepEqual(synthesis.items.map((result) => result.domain), [
    'employment_salary',
    'finance_consumer',
    'health_life_community',
  ]);
});

test('individual Result content remains unchanged', () => {
  const service = new SupervisorService();
  const result = createResult({
    output: {
      message: 'Do not rewrite this answer.',
      list: ['first', 'second'],
    },
    factsLearned: ['specific fact'],
    warnings: ['safe_warning'],
  });
  const synthesis = service.synthesizeResults([result]);

  assert.deepEqual(synthesis.items[0], result);
});

test('synthesis does not execute tasks', () => {
  const service = new SupervisorService();
  let executed = false;
  service.executeTask = async () => {
    executed = true;
  };
  service.executeTasksSequentially = async () => {
    executed = true;
  };

  service.synthesizeResults([createResult()]);

  assert.equal(executed, false);
});

test('synthesis does not call an LLM or response builder', () => {
  const service = new SupervisorService();
  let responseBuilt = false;
  service.buildUserResponse = async () => {
    responseBuilt = true;
  };
  service.composeEnglishResponse = () => {
    responseBuilt = true;
  };

  service.synthesizeResults([createResult()]);

  assert.equal(responseBuilt, false);
});

test('live Web Chat behavior is not wired to result synthesis in this sprint', () => {
  const { coreAgentService } = require('../src/modules/core-agent');

  assert.equal(Object.hasOwn(coreAgentService, 'synthesizeResults'), false);
});
