const { CONTACT_DEFAULTS } = require('./contact.model');
const contactRepository = require('./contact.repository');
const { validateCreateContact } = require('./contact.validation');

const EDITABLE_CONTACT_FIELDS = [
  'first_name',
  'last_name',
  'display_name',
  'email',
  'phone',
  'whatsapp_id',
  'telegram_id',
  'telegram_username',
  'line_id',
  'preferred_channel',
  'country',
  'city',
  'language',
  'status',
  'source',
  'source_detail',
  'interest',
  'priority',
  'assigned_to',
  'next_follow_up_at',
  'last_contacted_at',
  'tags',
  'ai_summary',
  'ai_next_action',
  'ai_opt_in',
  'marketing_opt_in',
  'data_consent',
];

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function cleanEmail(value) {
  return cleanText(value).toLowerCase();
}

function cleanBoolean(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }

  return fallback;
}

function generateContactId() {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  const random = Math.random().toString(36).slice(2, 8);

  return `con_${timestamp}_${random}`;
}

function generateHistoryId() {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  const random = Math.random().toString(36).slice(2, 8);

  return `his_${timestamp}_${random}`;
}

function buildDisplayName(input) {
  const displayName = cleanText(input.display_name);

  if (displayName) return displayName;

  return [cleanText(input.first_name), cleanText(input.last_name)].filter(Boolean).join(' ');
}

function normalizeContactInput(input = {}) {
  return {
    first_name: cleanText(input.first_name),
    last_name: cleanText(input.last_name),
    display_name: buildDisplayName(input),
    email: cleanEmail(input.email),
    phone: cleanText(input.phone),
    whatsapp_id: cleanText(input.whatsapp_id),
    telegram_id: cleanText(input.telegram_id),
    telegram_username: cleanText(input.telegram_username).replace(/^@/, ''),
    line_id: cleanText(input.line_id),
    preferred_channel: cleanText(input.preferred_channel) || CONTACT_DEFAULTS.preferred_channel,
    country: cleanText(input.country),
    city: cleanText(input.city),
    language: cleanText(input.language) || CONTACT_DEFAULTS.language,
    status: cleanText(input.status) || CONTACT_DEFAULTS.status,
    source: cleanText(input.source) || CONTACT_DEFAULTS.source,
    source_detail: cleanText(input.source_detail),
    interest: cleanText(input.interest) || CONTACT_DEFAULTS.interest,
    priority: cleanText(input.priority) || CONTACT_DEFAULTS.priority,
    assigned_to: cleanText(input.assigned_to),
    next_follow_up_at: cleanText(input.next_follow_up_at),
    last_contacted_at: cleanText(input.last_contacted_at),
    tags: Array.isArray(input.tags) ? input.tags.map(cleanText).filter(Boolean).join(',') : cleanText(input.tags),
    ai_summary: cleanText(input.ai_summary),
    ai_next_action: cleanText(input.ai_next_action),
    ai_opt_in: cleanBoolean(input.ai_opt_in, CONTACT_DEFAULTS.ai_opt_in),
    marketing_opt_in: cleanBoolean(input.marketing_opt_in, CONTACT_DEFAULTS.marketing_opt_in),
    data_consent: cleanBoolean(input.data_consent, CONTACT_DEFAULTS.data_consent),
  };
}

function buildContact(input = {}) {
  const now = new Date().toISOString();

  return {
    ...CONTACT_DEFAULTS,
    ...normalizeContactInput(input),
    notes_count: CONTACT_DEFAULTS.notes_count,
    history_count: 1,
    contact_id: generateContactId(),
    created_at: now,
    updated_at: now,
    archived_at: CONTACT_DEFAULTS.archived_at,
  };
}

function buildHistory({ contactId, eventType, title, description, oldValue = '', newValue = '' }) {
  return {
    history_id: generateHistoryId(),
    contact_id: contactId,
    event_type: eventType,
    channel: 'system',
    direction: 'none',
    title,
    description,
    old_value: oldValue,
    new_value: newValue,
    actor_type: 'system',
    actor_id: '',
    external_message_id: '',
    created_at: new Date().toISOString(),
  };
}

function notFoundError() {
  const error = new Error('Contact not found.');
  error.statusCode = 404;
  return error;
}

function filterContacts(contacts, filters = {}) {
  const search = cleanText(filters.search).toLowerCase();
  const status = cleanText(filters.status);
  const source = cleanText(filters.source);
  const country = cleanText(filters.country).toLowerCase();

  return contacts.filter((contact) => {
    if (!status && contact.archived_at) return false;
    if (status && contact.status !== status) return false;
    if (source && contact.source !== source) return false;
    if (country && cleanText(contact.country).toLowerCase() !== country) return false;

    if (search) {
      const searchable = [
        contact.first_name,
        contact.last_name,
        contact.display_name,
        contact.email,
        contact.phone,
      ]
        .map((value) => cleanText(value).toLowerCase())
        .join(' ');

      if (!searchable.includes(search)) return false;
    }

    return true;
  });
}

async function createContact(input = {}) {
  const errors = validateCreateContact(input);

  if (errors.length > 0) {
    const error = new Error('Contact validation failed.');
    error.statusCode = 400;
    error.details = errors;
    throw error;
  }

  const contact = buildContact(input);
  const history = buildHistory({
    contactId: contact.contact_id,
    eventType: 'contact_created',
    title: 'Contact created',
    description: 'Contact was created.',
  });

  await contactRepository.createContact(contact);
  await contactRepository.createContactHistory(history);

  return contact;
}

async function getContacts(filters = {}) {
  const contacts = await contactRepository.findAllContacts();

  return filterContacts(contacts, filters);
}

async function updateContact(contactId, input = {}) {
  const record = await contactRepository.findContactRecordById(contactId);

  if (!record) {
    throw notFoundError();
  }

  const existingContact = record.contact;
  const updateInput = EDITABLE_CONTACT_FIELDS.reduce((payload, field) => {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      payload[field] = input[field];
    }

    return payload;
  }, {});
  const normalizedInput = normalizeContactInput({
    ...existingContact,
    ...updateInput,
  });
  const nextContact = {
    ...existingContact,
    ...normalizedInput,
    contact_id: existingContact.contact_id,
    created_at: existingContact.created_at,
    updated_at: new Date().toISOString(),
    archived_at: existingContact.archived_at,
    history_count: Number(existingContact.history_count || 0) + 1,
    notes_count: Number(existingContact.notes_count || 0),
  };

  if (existingContact.archived_at) {
    nextContact.status = 'archived';
  }

  const errors = validateCreateContact(nextContact);

  if (errors.length > 0) {
    const error = new Error('Contact validation failed.');
    error.statusCode = 400;
    error.details = errors;
    throw error;
  }

  const history = buildHistory({
    contactId,
    eventType: 'contact_updated',
    title: 'Contact updated',
    description: 'Contact details were updated.',
  });

  await contactRepository.updateContact(record.rowNumber, nextContact);
  await contactRepository.createContactHistory(history);

  return nextContact;
}

async function archiveContact(contactId) {
  const record = await contactRepository.findContactRecordById(contactId);

  if (!record) {
    throw notFoundError();
  }

  const now = new Date().toISOString();
  const archivedContact = {
    ...record.contact,
    status: 'archived',
    updated_at: now,
    archived_at: now,
    history_count: Number(record.contact.history_count || 0) + 1,
  };
  const history = buildHistory({
    contactId,
    eventType: 'contact_archived',
    title: 'Contact archived',
    description: 'Contact was archived.',
    oldValue: record.contact.status || '',
    newValue: 'archived',
  });

  await contactRepository.updateContact(record.rowNumber, archivedContact);
  await contactRepository.createContactHistory(history);

  return archivedContact;
}

module.exports = {
  archiveContact,
  createContact,
  getContacts,
  updateContact,
};
