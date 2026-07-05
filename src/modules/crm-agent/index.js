const crmAgentInterface = require('./crm-agent.interface');
const crmAgentService = require('./crm-agent.service');
const crmAgentRepository = require('./crm-agent.repository');
const memoryExtractionService = require('./memory-extraction.service');

module.exports = {
  crmAgentInterface,
  crmAgentRepository,
  crmAgentService,
  memoryExtractionService,
};
