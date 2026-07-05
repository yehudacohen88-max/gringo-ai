const test = require('node:test');
const assert = require('node:assert/strict');

const { validateCreateContact } = require('../src/modules/contacts/contact.validation');

test('accepts a minimum valid contact', () => {
  const errors = validateCreateContact({
    first_name: 'Daniel',
    email: 'daniel@example.com',
  });

  assert.deepEqual(errors, []);
});

test('requires first_name', () => {
  const errors = validateCreateContact({
    email: 'daniel@example.com',
  });

  assert.ok(errors.includes('first_name is required.'));
});

test('requires at least one contact method', () => {
  const errors = validateCreateContact({
    first_name: 'Daniel',
  });

  assert.ok(
    errors.includes(
      'At least one contact method is required: email, phone, whatsapp_id, telegram_id, telegram_username, or line_id.'
    )
  );
});

test('rejects invalid enum values', () => {
  const errors = validateCreateContact({
    first_name: 'Daniel',
    email: 'daniel@example.com',
    status: 'maybe',
  });

  assert.ok(errors.some((error) => error.startsWith('status must be one of:')));
});

test('rejects invalid boolean fields', () => {
  const errors = validateCreateContact({
    first_name: 'Daniel',
    email: 'daniel@example.com',
    ai_opt_in: 'yes',
  });

  assert.ok(errors.includes('ai_opt_in must be true or false.'));
});

test('rejects oversized tags', () => {
  const errors = validateCreateContact({
    first_name: 'Daniel',
    email: 'daniel@example.com',
    tags: ['this-tag-is-intentionally-way-too-long-for-the-approved-spec'],
  });

  assert.ok(errors.includes('Each tag must be 40 characters or fewer.'));
});
