const CHANNEL_LINK_CODE_FIELDS = [
  'linkCodeId',
  'userId',
  'channel',
  'codeHash',
  'status',
  'expiresAt',
  'createdAt',
  'usedAt',
  'cancelledAt',
  'channelUserId',
];

const CHANNEL_LINK_HISTORY_FIELDS = [
  'historyId',
  'userId',
  'channel',
  'channelUserId',
  'eventType',
  'createdAt',
  'safeMetadata',
];

const CHANNEL_LINK_CODE_STATUSES = ['Active', 'Used', 'Expired', 'Cancelled'];
const LINE_LINK_STATUSES = ['Not Connected', 'Pending', 'Connected', 'Disconnected'];
const CHANNEL_LINK_HISTORY_EVENT_TYPES = [
  'Code Created',
  'Link Requested',
  'Link Completed',
  'Link Failed',
  'Link Cancelled',
  'Disconnected',
];

module.exports = {
  CHANNEL_LINK_CODE_FIELDS,
  CHANNEL_LINK_CODE_STATUSES,
  CHANNEL_LINK_HISTORY_EVENT_TYPES,
  CHANNEL_LINK_HISTORY_FIELDS,
  LINE_LINK_STATUSES,
};
