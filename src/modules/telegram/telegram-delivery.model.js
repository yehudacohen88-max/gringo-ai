const TELEGRAM_DELIVERY_FIELDS = [
  'deliveryId',
  'notificationId',
  'userId',
  'telegramChatId',
  'status',
  'telegramMessageId',
  'attemptedAt',
  'deliveredAt',
  'failedAt',
  'failureCode',
  'retryCount',
  'createdAt',
  'updatedAt',
];

const TELEGRAM_DELIVERY_STATUSES = ['Pending', 'Delivered', 'Failed', 'Cancelled', 'Queued'];

module.exports = {
  TELEGRAM_DELIVERY_FIELDS,
  TELEGRAM_DELIVERY_STATUSES,
};
