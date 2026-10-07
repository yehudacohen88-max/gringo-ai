const { AgentRegistryService } = require('./registry/agent-registry.service');
const { employmentSalaryAgent } = require('./domains/employment-salary.agent');
const {
  financeConsumerAgent,
  setUserSubmittedTransferQuoteRepositoryForTest,
} = require('./domains/finance-consumer.agent');
const { healthLifeCommunityAgent } = require('./domains/health-life-community.agent');
const agentInterface = require('./contracts/agent.interface');
const taskContract = require('./contracts/task.contract');
const resultContract = require('./contracts/result.contract');
const { SupervisorService, supervisorService } = require('./supervisor/supervisor.service');

function createDefaultAgentRegistry() {
  const registry = new AgentRegistryService();
  registry.registerAgent(employmentSalaryAgent);
  registry.registerAgent(financeConsumerAgent);
  registry.registerAgent(healthLifeCommunityAgent);
  return registry;
}

const agentRegistryService = createDefaultAgentRegistry();

module.exports = {
  AgentRegistryService,
  agentInterface,
  agentRegistryService,
  createDefaultAgentRegistry,
  employmentSalaryAgent,
  financeConsumerAgent,
  healthLifeCommunityAgent,
  resultContract,
  setUserSubmittedTransferQuoteRepositoryForTest,
  SupervisorService,
  supervisorService,
  taskContract,
};
