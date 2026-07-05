const { CONTACT_ENUMS } = require('./contact.model');

const TEXT_LIMITS = {
  first_name: 80,
  last_name: 80,
  display_name: 160,
  whatsapp_id: 80,
  telegram_id: 80,
  telegram_username: 80,
  line_id: 120,
  country: 80,
  city: 80,
  source_detail: 250,
  assigned_to: 120,
  ai_summary: 2000,
  ai_next_action: 500,
};

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

function isBoolean(value) {
  return typeof value === 'boolean';
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidIsoDate(value) {
  return !Number.isNaN(Date.parse(value));
}

function validateCreateContact(input = {}) {
  const errors = [];

  if (isBlank(input.first_name)) {
    errors.push('first_name is required.');
  }

  const hasContactMethod = [
    input.email,
    input.phone,
    input.whatsapp_id,
    input.telegram_id,
    input.telegram_username,
    input.line_id,
  ].some((value) => !isBlank(value));

  if (!hasContactMethod) {
    errors.push('At least one contact method is required: email, phone, whatsapp_id, telegram_id, telegram_username, or line_id.');
  }

  Object.entries(TEXT_LIMITS).forEach(([field, limit]) => {
    if (!isBlank(input[field]) && String(input[field]).trim().length > limit) {
      errors.push(`${field} must be ${limit} characters or fewer.`);
    }
  });

  if (!isBlank(input.email) && !isValidEmail(String(input.email).trim())) {
    errors.push('email must be a valid email address.');
  }

  if (!isBlank(input.phone)) {
    const normalizedPhone = String(input.phone).replace(/[^\d+]/g, '');
    const digitCount = normalizedPhone.replace(/[^\d]/g, '').length;

    if (digitCount < 7 || digitCount > 20) {
      errors.push('phone must contain between 7 and 20 digits.');
    }

    if (normalizedPhone.includes('+') && !normalizedPhone.startsWith('+')) {
      errors.push('phone can only include + at the start.');
    }
  }

  if (!isBlank(input.telegram_username) && /\s/.test(String(input.telegram_username).trim())) {
    errors.push('telegram_username cannot contain spaces.');
  }

  Object.entries(CONTACT_ENUMS).forEach(([field, allowedValues]) => {
    if (!isBlank(input[field]) && !allowedValues.includes(String(input[field]).trim())) {
      errors.push(`${field} must be one of: ${allowedValues.join(', ')}.`);
    }
  });

  ['ai_opt_in', 'marketing_opt_in', 'data_consent'].forEach((field) => {
    if (input[field] !== undefined && !isBoolean(input[field])) {
      errors.push(`${field} must be true or false.`);
    }
  });

  ['next_follow_up_at', 'last_contacted_at'].forEach((field) => {
    if (!isBlank(input[field]) && !isValidIsoDate(String(input[field]).trim())) {
      errors.push(`${field} must be a valid date/time.`);
    }
  });

  if (Array.isArray(input.tags)) {
    input.tags.forEach((tag) => {
      const cleanedTag = String(tag).trim();

      if (cleanedTag.length > 40) {
        errors.push('Each tag must be 40 characters or fewer.');
      }
    });
  } else if (!isBlank(input.tags)) {
    String(input.tags)
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
      .forEach((tag) => {
        if (tag.length > 40) {
          errors.push('Each tag must be 40 characters or fewer.');
        }
      });
  }

  return errors;
}

module.exports = {
  validateCreateContact,
};
