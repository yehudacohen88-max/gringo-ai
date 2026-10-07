const TASK_PRIORITIES = Object.freeze(['low', 'normal', 'high', 'urgent']);

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function createValidationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function normalizePriority(value) {
  const priority = cleanText(value || 'normal').toLowerCase();
  if (!TASK_PRIORITIES.includes(priority)) {
    throw createValidationError('Invalid task priority.');
  }
  return priority;
}

function validateTaskContract(task = {}) {
  if (!task || typeof task !== 'object' || Array.isArray(task)) {
    throw createValidationError('Task must be an object.');
  }

  for (const field of ['taskId', 'conversationId', 'requestId', 'domain', 'capability', 'createdAt']) {
    if (!cleanText(task[field])) {
      throw createValidationError(`Task field is required: ${field}.`);
    }
  }

  normalizePriority(task.priority);

  if (task.input !== undefined && (typeof task.input !== 'object' || Array.isArray(task.input))) {
    throw createValidationError('Task input must be an object.');
  }

  if (task.metadata !== undefined && (typeof task.metadata !== 'object' || Array.isArray(task.metadata))) {
    throw createValidationError('Task metadata must be an object.');
  }

  return true;
}

module.exports = {
  TASK_PRIORITIES,
  normalizePriority,
  validateTaskContract,
};
