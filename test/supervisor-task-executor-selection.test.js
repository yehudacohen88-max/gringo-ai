const test = require('node:test');
const assert = require('node:assert/strict');

const { SupervisorService } = require('../src/modules/agents');

function createTask(overrides = {}) {
  return {
    taskId: 'task_executor_selection',
    requestId: 'req_executor_selection',
    conversationId: 'web:user_executor_selection',
    domain: 'employment_salary',
    intent: 'salary_question',
    capability: 'jobs.salary',
    status: 'pending',
    input: {
      question: 'When should my salary be paid?',
    },
    metadata: {
      intent: 'salary_question',
    },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

test('employment_salary task selects Employment and Salary Domain Agent executor', () => {
  const service = new SupervisorService();
  const executor = service.selectExecutorForTask(createTask());

  assert.deepEqual(executor, {
    executorType: 'domain_agent',
    executorId: 'employment_salary_agent',
    domain: 'employment_salary',
    capability: 'jobs.salary',
    intent: 'salary_question',
  });
});

test('finance_consumer task selects Finance and Consumer Domain Agent executor', () => {
  const service = new SupervisorService();
  const executor = service.selectExecutorForTask(createTask({
    domain: 'finance_consumer',
    intent: 'money_transfer',
    capability: 'finance.transfer',
    metadata: {
      intent: 'money_transfer',
    },
  }));

  assert.deepEqual(executor, {
    executorType: 'domain_agent',
    executorId: 'finance_consumer_agent',
    domain: 'finance_consumer',
    capability: 'finance.transfer',
    intent: 'money_transfer',
  });
});

test('health_life_community task selects Health Life Community Domain Agent executor', () => {
  const service = new SupervisorService();
  const executor = service.selectExecutorForTask(createTask({
    domain: 'health_life_community',
    intent: 'health_request',
    capability: 'health.support',
    metadata: {
      intent: 'health_request',
    },
  }));

  assert.deepEqual(executor, {
    executorType: 'domain_agent',
    executorId: 'health_life_community_agent',
    domain: 'health_life_community',
    capability: 'health.support',
    intent: 'health_request',
  });
});

test('profile_update task selects Core Profile Memory executor', () => {
  const service = new SupervisorService();
  const executor = service.selectExecutorForTask(createTask({
    domain: 'profile_memory',
    intent: 'profile_update',
    capability: 'profile.memory_update',
    metadata: {
      intent: 'profile_update',
    },
  }));

  assert.deepEqual(executor, {
    executorType: 'core_profile_memory',
    executorId: 'core_agent_profile_memory',
    domain: 'profile_memory',
    capability: 'profile.memory_update',
    intent: 'profile_update',
  });
});

test('profile_recall task selects Core Profile Memory executor', () => {
  const service = new SupervisorService();
  const executor = service.selectExecutorForTask(createTask({
    domain: 'profile_memory',
    intent: 'profile_summary_recall',
    capability: 'profile.recall',
    metadata: {
      intent: 'profile_summary_recall',
    },
  }));

  assert.equal(executor.executorType, 'core_profile_memory');
  assert.equal(executor.executorId, 'core_agent_profile_memory');
  assert.equal(executor.capability, 'profile.recall');
});

test('profile_field_recall task selects Core Profile Memory executor', () => {
  const service = new SupervisorService();
  const executor = service.selectExecutorForTask(createTask({
    domain: 'profile_memory',
    intent: 'profile_field_recall',
    capability: 'profile.field_recall',
    metadata: {
      intent: 'profile_field_recall',
    },
  }));

  assert.equal(executor.executorType, 'core_profile_memory');
  assert.equal(executor.executorId, 'core_agent_profile_memory');
  assert.equal(executor.capability, 'profile.field_recall');
});

test('unknown task is unresolved and no Domain Agent is selected', () => {
  const service = new SupervisorService();
  const executor = service.selectExecutorForTask(createTask({
    domain: 'unknown_domain',
    intent: 'unknown',
    capability: 'unknown.capability',
    metadata: {
      intent: 'unknown',
    },
  }));

  assert.deepEqual(executor, {
    executorType: 'unresolved',
    executorId: '',
    reason: 'unsupported_task',
  });
});

test('executor selection does not execute the selected executor', () => {
  const service = new SupervisorService();
  let executed = false;
  service.executeAgent = async () => {
    executed = true;
  };

  const executor = service.selectExecutorForTask(createTask());

  assert.equal(executor.executorId, 'employment_salary_agent');
  assert.equal(executed, false);
});

test('multiple tasks are independently assigned while preserving task order', () => {
  const service = new SupervisorService();
  const context = {
    requestId: 'req_ordered_executors',
    conversationId: 'web:ordered_executors',
    message: 'What is my profession? How much salary should I receive and where can I transfer money to Thailand?',
  };
  const detectedIntents = service.detectIntents(context);
  const tasks = service.createTasksFromIntents(context, detectedIntents);
  const executors = tasks.map((task) => service.selectExecutorForTask(task));

  assert.deepEqual(executors.map((executor) => executor.executorId), [
    'core_agent_profile_memory',
    'employment_salary_agent',
    'finance_consumer_agent',
  ]);
  assert.deepEqual(
    executors.map((executor) => executor.intent),
    tasks.map((task) => task.intent)
  );
});
