const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AgentRegistryService,
  agentInterface,
  agentRegistryService,
  createDefaultAgentRegistry,
  employmentSalaryAgent,
  resultContract,
  taskContract,
} = require('../src/modules/agents');

function createValidAgent(overrides = {}) {
  return {
    id: 'test_agent',
    name: 'Test Agent',
    version: '1',
    domain: 'test_domain',
    capabilities: ['test.run'],
    initialize: async () => ({ initialized: true }),
    health: async () => ({ status: 'ok' }),
    validate: async () => ({ valid: true }),
    execute: async () => ({ status: 'blocked' }),
    ...overrides,
  };
}

function createValidTask(overrides = {}) {
  return {
    taskId: 'task_1',
    conversationId: 'web:user',
    requestId: 'req_1',
    domain: 'employment_salary',
    capability: 'jobs.search',
    priority: 'normal',
    input: {},
    metadata: {},
    createdAt: '2026-07-28T08:00:00.000Z',
    ...overrides,
  };
}

function createValidResult(overrides = {}) {
  return {
    taskId: 'task_1',
    status: 'success',
    output: {},
    factsLearned: [],
    suggestedProfileUpdates: [],
    followUpQuestions: [],
    warnings: [],
    completedAt: '2026-07-28T08:01:00.000Z',
    ...overrides,
  };
}

test('registers an agent', () => {
  const registry = new AgentRegistryService();
  const agent = registry.registerAgent(createValidAgent());

  assert.equal(agent.id, 'test_agent');
  assert.equal(registry.hasAgent('test_agent'), true);
});

test('duplicate id is rejected', () => {
  const registry = new AgentRegistryService();

  registry.registerAgent(createValidAgent());

  assert.throws(
    () => registry.registerAgent(createValidAgent({ domain: 'another_domain' })),
    /already registered/
  );
});

test('duplicate domain is rejected', () => {
  const registry = new AgentRegistryService();

  registry.registerAgent(createValidAgent());

  assert.throws(
    () => registry.registerAgent(createValidAgent({ id: 'another_agent' })),
    /domain already registered/
  );
});

test('registry lookup returns a registered agent', () => {
  const registry = new AgentRegistryService();

  registry.registerAgent(createValidAgent());

  assert.equal(registry.getAgent('test_agent').domain, 'test_domain');
  assert.equal(registry.getAgent('missing'), null);
});

test('registry list returns all registered agents', () => {
  const registry = new AgentRegistryService();

  registry.registerAgent(createValidAgent());
  registry.registerAgent(createValidAgent({
    id: 'second_agent',
    domain: 'second_domain',
    capabilities: ['second.run'],
  }));

  assert.deepEqual(
    registry.listAgents().map((agent) => agent.id),
    ['test_agent', 'second_agent']
  );
});

test('interface validation accepts compliant agents', () => {
  assert.equal(agentInterface.validateAgentInterface(createValidAgent()), true);
});

test('invalid contract is rejected', () => {
  assert.throws(
    () => agentInterface.validateAgentInterface(createValidAgent({ execute: undefined })),
    /execute/
  );
});

test('task contract validation accepts valid tasks and rejects invalid priority', () => {
  assert.equal(taskContract.validateTaskContract(createValidTask()), true);
  assert.equal(taskContract.normalizePriority('urgent'), 'urgent');

  assert.throws(
    () => taskContract.validateTaskContract(createValidTask({ priority: 'whenever' })),
    /Invalid task priority/
  );
});

test('result contract validation accepts valid results and rejects invalid status', () => {
  assert.equal(resultContract.validateResultContract(createValidResult()), true);
  assert.equal(resultContract.normalizeResultStatus('partial'), 'partial');

  assert.throws(
    () => resultContract.validateResultContract(createValidResult({ status: 'done' })),
    /Invalid result status/
  );
});

test('three default agents are registered', () => {
  const registry = createDefaultAgentRegistry();
  const agents = registry.listAgents();

  assert.equal(agents.length, 3);
  assert.deepEqual(
    agents.map((agent) => agent.domain).sort(),
    ['employment_salary', 'finance_consumer', 'health_life_community']
  );
  assert.equal(agentRegistryService.listAgents().length, 3);
});

test('default employment agent exposes supported live execution capabilities', async () => {
  assert.equal(employmentSalaryAgent.id, 'employment_salary_agent');
  assert.equal(employmentSalaryAgent.domain, 'employment_salary');
  assert.deepEqual(employmentSalaryAgent.capabilities, [
    'jobs.search',
    'jobs.match',
    'jobs.salary',
    'employment.documents',
    'employment.support',
  ]);
  assert.deepEqual(await employmentSalaryAgent.validate(createValidTask()), { valid: true });
});

test('default finance agent exposes supported live execution capabilities', async () => {
  const { financeConsumerAgent } = require('../src/modules/agents');

  assert.equal(financeConsumerAgent.id, 'finance_consumer_agent');
  assert.equal(financeConsumerAgent.domain, 'finance_consumer');
  assert.deepEqual(financeConsumerAgent.capabilities, [
    'finance.budget',
    'finance.exchange_rate',
    'finance.transfer',
    'finance.user_submitted_quote',
    'finance.saved_user_submitted_quote',
    'finance.saved_user_submitted_quote_comparison',
    'finance.bank',
    'consumer.compare',
    'consumer.services',
  ]);
  assert.deepEqual(await financeConsumerAgent.validate(createValidTask({
    domain: 'finance_consumer',
    capability: 'finance.transfer',
  })), { valid: true });
});

test('default health life community agent exposes supported live execution capabilities', async () => {
  const { healthLifeCommunityAgent } = require('../src/modules/agents');

  assert.equal(healthLifeCommunityAgent.id, 'health_life_community_agent');
  assert.equal(healthLifeCommunityAgent.domain, 'health_life_community');
  assert.deepEqual(healthLifeCommunityAgent.capabilities, [
    'health.support',
    'housing.support',
    'community.support',
    'government.services',
    'life.general',
  ]);
  assert.deepEqual(await healthLifeCommunityAgent.validate(createValidTask({
    domain: 'health_life_community',
    capability: 'health.support',
  })), { valid: true });
});
