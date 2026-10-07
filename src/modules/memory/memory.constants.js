const MEMORY_ROLES = Object.freeze({
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
});

const DEFAULT_CONVERSATION_MEMORY_ENABLED = true;
const DEFAULT_CONVERSATION_MEMORY_MAX_MESSAGES = 20;
const MIN_CONVERSATION_MEMORY_MAX_MESSAGES = 1;
const MAX_CONVERSATION_MEMORY_MAX_MESSAGES = 200;
const DEFAULT_CONVERSATION_SUMMARY_ENABLED = true;
const DEFAULT_SUMMARY_TRIGGER_MESSAGES = 20;
const DEFAULT_SUMMARY_MAX_CHARACTERS = 2500;
const MEMORY_SNAPSHOT_VERSION = 1;
const CONVERSATION_STATES = Object.freeze([
  'idle',
  'active',
  'waiting_for_user',
  'finding_job',
  'housing_search',
  'collecting_documents',
  'money_support',
  'service_support',
  'completed',
]);
const WORKING_MEMORY_TASK_STATUSES = Object.freeze([
  'pending',
  'in_progress',
  'waiting',
  'completed',
  'failed',
  'cancelled',
]);
const MEMORY_LIFECYCLE_STATES = Object.freeze([
  'new',
  'active',
  'waiting',
  'idle',
  'archived',
  'closed',
]);

const SENSITIVE_METADATA_PATTERNS = [
  /api[-_]?key/i,
  /access[-_]?token/i,
  /bot[-_]?token/i,
  /credential/i,
  /password/i,
  /private[-_]?key/i,
  /provider[-_]?error/i,
  /secret/i,
  /token/i,
];

module.exports = {
  DEFAULT_CONVERSATION_MEMORY_ENABLED,
  DEFAULT_CONVERSATION_MEMORY_MAX_MESSAGES,
  DEFAULT_CONVERSATION_SUMMARY_ENABLED,
  DEFAULT_SUMMARY_MAX_CHARACTERS,
  DEFAULT_SUMMARY_TRIGGER_MESSAGES,
  CONVERSATION_STATES,
  MAX_CONVERSATION_MEMORY_MAX_MESSAGES,
  MEMORY_SNAPSHOT_VERSION,
  MEMORY_LIFECYCLE_STATES,
  MEMORY_ROLES,
  MIN_CONVERSATION_MEMORY_MAX_MESSAGES,
  SENSITIVE_METADATA_PATTERNS,
  WORKING_MEMORY_TASK_STATUSES,
};
