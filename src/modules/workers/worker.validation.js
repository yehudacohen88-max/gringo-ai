const { WORKER_ENUMS } = require('./worker.model');

const TEXT_LIMITS = {
  first_name: 80,
  last_name: 80,
  nickname: 80,
  nationality: 80,
  native_language: 80,
  phone: 30,
  whatsapp: 80,
  telegram: 80,
  line: 120,
  passport_number: 80,
  profession: 120,
  current_employer: 160,
  current_city: 100,
  notes: 5000,
  documents: 2000,
};

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

function isValidDate(value) {
  return !Number.isNaN(Date.parse(value));
}

function validateWorker(input = {}) {
  const errors = [];

  if (isBlank(input.first_name)) {
    errors.push('first_name is required.');
  }

  if (isBlank(input.nationality)) {
    errors.push('nationality is required.');
  }

  const hasContactMethod = [input.phone, input.whatsapp, input.telegram, input.line].some((value) => !isBlank(value));

  if (!hasContactMethod) {
    errors.push('At least one worker contact method is required: phone, whatsapp, telegram, or line.');
  }

  Object.entries(TEXT_LIMITS).forEach(([field, limit]) => {
    if (!isBlank(input[field]) && String(input[field]).trim().length > limit) {
      errors.push(`${field} must be ${limit} characters or fewer.`);
    }
  });

  Object.entries(WORKER_ENUMS).forEach(([field, allowedValues]) => {
    if (!isBlank(input[field]) && !allowedValues.includes(String(input[field]).trim())) {
      errors.push(`${field} must be one of: ${allowedValues.join(', ')}.`);
    }
  });

  if (!isBlank(input.years_experience)) {
    const years = Number(input.years_experience);

    if (!Number.isFinite(years) || years < 0 || years > 80) {
      errors.push('years_experience must be a number from 0 to 80.');
    }
  }

  if (!isBlank(input.visa_expiration) && !isValidDate(String(input.visa_expiration).trim())) {
    errors.push('visa_expiration must be a valid date.');
  }

  ['skills', 'previous_employers', 'tags'].forEach((field) => {
    if (Array.isArray(input[field])) {
      input[field].forEach((item) => {
        if (String(item).trim().length > 80) {
          errors.push(`${field} items must be 80 characters or fewer.`);
        }
      });
    }
  });

  return errors;
}

module.exports = {
  validateWorker,
};
