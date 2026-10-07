const RESULT_STATUSES = Object.freeze(['success', 'partial', 'failed', 'blocked']);

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function createValidationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function normalizeResultStatus(value) {
  const status = cleanText(value).toLowerCase();
  if (!RESULT_STATUSES.includes(status)) {
    throw createValidationError('Invalid result status.');
  }
  return status;
}

function validateArrayField(result, field) {
  if (result[field] !== undefined && !Array.isArray(result[field])) {
    throw createValidationError(`Result field must be an array: ${field}.`);
  }
}

function validateResultContract(result = {}) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw createValidationError('Result must be an object.');
  }

  if (!cleanText(result.taskId)) {
    throw createValidationError('Result taskId is required.');
  }

  normalizeResultStatus(result.status);

  if (
    result.output !== undefined &&
    result.output !== null &&
    (typeof result.output !== 'object' || Array.isArray(result.output))
  ) {
    throw createValidationError('Result output must be an object.');
  }

  for (const field of ['factsLearned', 'suggestedProfileUpdates', 'followUpQuestions', 'warnings']) {
    validateArrayField(result, field);
  }

  if (!cleanText(result.completedAt)) {
    throw createValidationError('Result completedAt is required.');
  }

  return true;
}

module.exports = {
  RESULT_STATUSES,
  normalizeResultStatus,
  validateResultContract,
};
