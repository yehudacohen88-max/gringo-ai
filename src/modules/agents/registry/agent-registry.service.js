const { validateAgentInterface } = require('../contracts/agent.interface');

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function createValidationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function cloneAgent(agent = {}) {
  return {
    ...agent,
    capabilities: [...agent.capabilities],
  };
}

class AgentRegistryService {
  constructor() {
    this.agentsById = new Map();
    this.agentIdsByDomain = new Map();
  }

  registerAgent(agent) {
    validateAgentInterface(agent);

    const agentId = cleanText(agent.id);
    const domain = cleanText(agent.domain);

    if (this.agentsById.has(agentId)) {
      throw createValidationError(`Agent already registered: ${agentId}.`);
    }

    if (this.agentIdsByDomain.has(domain)) {
      throw createValidationError(`Agent domain already registered: ${domain}.`);
    }

    this.agentsById.set(agentId, cloneAgent(agent));
    this.agentIdsByDomain.set(domain, agentId);
    return this.getAgent(agentId);
  }

  getAgent(agentId) {
    const agent = this.agentsById.get(cleanText(agentId));
    return agent ? cloneAgent(agent) : null;
  }

  listAgents() {
    return [...this.agentsById.values()].map(cloneAgent);
  }

  hasAgent(agentId) {
    return this.agentsById.has(cleanText(agentId));
  }
}

module.exports = {
  AgentRegistryService,
};
