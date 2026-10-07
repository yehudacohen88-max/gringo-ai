const LINE_DELIVERY_FIELDS = [
  'deliveryId',
  'notificationId',
  'userId',
  'channel',
  'lineUserId',
  'lineMessageId',
  'status',
  'attemptedAt',
  'deliveredAt',
  'failedAt',
  'failureCode',
  'retryCount',
  'createdAt',
  'updatedAt',
];

const LINE_DELIVERY_STATUSES = ['Pending', 'Sent', 'Delivered', 'Read', 'Failed', 'Cancelled', 'Queued'];
const LINE_DELIVERY_HISTORY_FIELDS = [
  'historyId',
  'deliveryId',
  'userId',
  'status',
  'eventAt',
  'safeFailureCode',
  'createdAt',
];

module.exports = {
  LINE_DELIVERY_FIELDS,
  LINE_DELIVERY_HISTORY_FIELDS,
  LINE_DELIVERY_STATUSES,
};
