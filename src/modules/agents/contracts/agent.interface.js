const REQUIRED_AGENT_FIELDS = Object.freeze([
  'id',
  'name',
  'version',
  'domain',
  'capabilities',
  'initialize',
  'health',
  'execute',
  'validate',
]);

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function createValidationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function validateAgentInterface(agent = {}) {
  if (!agent || typeof agent !== 'object') {
    throw createValidationError('Agent must be an object.');
  }

  for (const field of REQUIRED_AGENT_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(agent, field)) {
      throw createValidationError(`Agent is missing required field: ${field}.`);
    }
  }

  for (const field of ['id', 'name', 'version', 'domain']) {
    if (!cleanText(agent[field])) {
      throw createValidationError(`Agent field must not be empty: ${field}.`);
    }
  }

  if (!Array.isArray(agent.capabilities) || agent.capabilities.length === 0) {
    throw createValidationError('Agent capabilities must be a non-empty array.');
  }

  for (const capability of agent.capabilities) {
    if (!cleanText(capability)) {
      throw createValidationError('Agent capabilities must not include empty values.');
    }
  }

  for (const method of ['initialize', 'health', 'execute', 'validate']) {
    if (typeof agent[method] !== 'function') {
      throw createValidationError(`Agent method must be a function: ${method}.`);
    }
  }

  return true;
}

module.exports = {
  REQUIRED_AGENT_FIELDS,
  validateAgentInterface,
};
