const NOTIFICATION_FIELDS = [
  'notificationId',
  'userId',
  'type',
  'title',
  'message',
  'sourceModule',
  'sourceRecordId',
  'priority',
  'status',
  'actionLabel',
  'actionUrl',
  'scheduledAt',
  'createdAt',
  'readAt',
  'dismissedAt',
  'expiresAt',
];

const NOTIFICATION_TYPES = [
  'Job Match',
  'Housing Match',
  'Document Expiry',
  'Missing Document',
  'Exchange Rate',
  'Money Transfer',
  'Community Update',
  'Human Response',
  'Task Reminder',
  'Admin Message',
  'System',
  'Reminder',
];

const NOTIFICATION_PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'];
const NOTIFICATION_STATUSES = ['New', 'Read', 'Dismissed', 'Completed', 'Expired'];

module.exports = {
  NOTIFICATION_FIELDS,
  NOTIFICATION_PRIORITIES,
  NOTIFICATION_STATUSES,
  NOTIFICATION_TYPES,
};
