const TELEGRAM_LINK_CODE_FIELDS = [
  'linkCodeId',
  'userId',
  'codeHash',
  'status',
  'expiresAt',
  'createdAt',
  'usedAt',
  'cancelledAt',
  'telegramUserId',
];

const TELEGRAM_LINK_HISTORY_FIELDS = [
  'historyId',
  'userId',
  'telegramUserId',
  'eventType',
  'createdAt',
  'safeMetadata',
];

const TELEGRAM_LINK_CODE_STATUSES = ['Active', 'Used', 'Expired', 'Cancelled'];
const TELEGRAM_LINK_HISTORY_EVENT_TYPES = [
  'Code Created',
  'Link Requested',
  'Link Confirmed',
  'Link Completed',
  'Link Failed',
  'Link Cancelled',
  'Disconnected',
];

module.exports = {
  TELEGRAM_LINK_CODE_FIELDS,
  TELEGRAM_LINK_CODE_STATUSES,
  TELEGRAM_LINK_HISTORY_EVENT_TYPES,
  TELEGRAM_LINK_HISTORY_FIELDS,
};
