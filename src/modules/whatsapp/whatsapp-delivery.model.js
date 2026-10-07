const WHATSAPP_DELIVERY_FIELDS = [
  'deliveryId',
  'notificationId',
  'userId',
  'whatsappPhone',
  'templateId',
  'deliveryMode',
  'status',
  'whatsappMessageId',
  'attemptedAt',
  'deliveredAt',
  'failedAt',
  'failureCode',
  'retryCount',
  'createdAt',
  'updatedAt',
];

const WHATSAPP_DELIVERY_MODES = ['Session Message', 'Template Message'];
const WHATSAPP_DELIVERY_STATUSES = ['Pending', 'Sent', 'Delivered', 'Read', 'Failed', 'Cancelled', 'Queued'];
const WHATSAPP_DELIVERY_HISTORY_FIELDS = [
  'historyId',
  'deliveryId',
  'userId',
  'status',
  'eventAt',
  'safeFailureCode',
  'createdAt',
];

module.exports = {
  WHATSAPP_DELIVERY_FIELDS,
  WHATSAPP_DELIVERY_HISTORY_FIELDS,
  WHATSAPP_DELIVERY_MODES,
  WHATSAPP_DELIVERY_STATUSES,
};
