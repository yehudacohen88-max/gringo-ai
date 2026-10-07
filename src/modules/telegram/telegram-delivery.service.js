const { env } = require('../../config/env');
const crmAgentRepository = require('../crm-agent/crm-agent.repository');
const notificationRepository = require('../notifications/notification.repository');
const { communicationService } = require('../communication');
const telegramDeliveryRepository = require('./telegram-delivery.repository');
const { TELEGRAM_DELIVERY_STATUSES } = require('./telegram-delivery.model');
const { safeTelegramWarning } = require('./telegram-errors');

const memoryDeliveries = [];
const SUPPORTED_TYPES = [
  'Job Match',
  'Housing Match',
  'Document Expiry',
  'Missing Document',
  'Community Update',
  'Human Response',
  'Task Reminder',
  'Admin Message',
];
const BLOCKED_STATUSES = ['Dismissed', 'Completed', 'Expired'];
const MAX_RETRY_COUNT = 3;
const RETRY_DELAY_MS = 60 * 1000;
const DEFAULT_TIMEZONE = 'Asia/Jerusalem';

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function nowIso() {
  return new Date().toISOString();
}

function generateId(prefix) {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${timestamp}_${random}`;
}

function isYes(value) {
  return cleanText(value) === 'Yes' || value === true;
}

function isEnabled(value) {
  return cleanText(value) !== 'No';
}

function inlineKeyboard(rows = []) {
  const inline_keyboard = rows
    .map((row) => row.filter(Boolean))
    .filter((row) => row.length)
    .map((row) =>
      row.map((button) => ({
        text: button.text,
        callback_data: button.data.slice(0, 64),
      }))
    );
  return inline_keyboard.length ? { inline_keyboard } : undefined;
}

function button(text, action, moduleName, recordId) {
  return { text, data: [action, moduleName, recordId].map(cleanText).join(':') };
}

function minutesFromTime(value) {
  const match = cleanText(value).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Math.min(Number(match[1]), 23);
  const minutes = Math.min(Number(match[2]), 59);
  return hours * 60 + minutes;
}

function currentMinutesInTimezone(timezone = '') {
  const safeTimezone = cleanText(timezone) || DEFAULT_TIMEZONE;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: safeTimezone,
    }).formatToParts(new Date());
    const hours = Number(parts.find((part) => part.type === 'hour')?.value || 0);
    const minutes = Number(parts.find((part) => part.type === 'minute')?.value || 0);
    return hours * 60 + minutes;
  } catch (error) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: DEFAULT_TIMEZONE,
    }).formatToParts(new Date());
    const hours = Number(parts.find((part) => part.type === 'hour')?.value || 0);
    const minutes = Number(parts.find((part) => part.type === 'minute')?.value || 0);
    return hours * 60 + minutes;
  }
}

function isWithinQuietHours(profile = {}) {
  if (!isYes(profile.telegramQuietHoursEnabled)) return false;
  const start = minutesFromTime(profile.telegramQuietHoursStart || '22:00');
  const end = minutesFromTime(profile.telegramQuietHoursEnd || '07:00');
  if (start === null || end === null || start === end) return false;
  const current = currentMinutesInTimezone(profile.telegramTimezone || profile.timezone || DEFAULT_TIMEZONE);
  if (start < end) return current >= start && current < end;
  return current >= start || current < end;
}

function isTimeSensitive(notification = {}) {
  if (notification.priority === 'Urgent') return true;
  if (notification.type === 'Task Reminder' && notification.priority === 'High') return true;
  if (notification.type === 'Document Expiry' && notification.priority === 'High') return true;
  if (notification.type === 'Human Response' && notification.priority === 'High') return true;
  return false;
}

function shouldQueueForQuietHours(notification = {}, profile = {}) {
  if (!isWithinQuietHours(profile)) return false;
  if (notification.priority === 'Urgent') return false;
  if (notification.priority === 'High') return !isTimeSensitive(notification);
  return true;
}

function preferenceForType(type) {
  const byType = {
    'Job Match': 'jobNotifications',
    'Housing Match': 'housingNotifications',
    'Document Expiry': 'documentNotifications',
    'Missing Document': 'documentNotifications',
    'Community Update': 'communityNotifications',
    'Human Response': 'humanResponseNotifications',
    'Task Reminder': 'taskRemindersEnabled',
    'Admin Message': 'humanResponseNotifications',
  };
  return byType[type] || '';
}

function respectsPreference(profile = {}, type = '') {
  const key = preferenceForType(type);
  return !key || isEnabled(profile[key]);
}

async function readDeliveriesWithFallback() {
  try {
    const records = await telegramDeliveryRepository.findAllDeliveryRecords();
    const byId = new Map(records.map((record) => [record.delivery.deliveryId, record.delivery]));
    memoryDeliveries.forEach((delivery) => byId.set(delivery.deliveryId, delivery));
    return Array.from(byId.values());
  } catch (error) {
    return [...memoryDeliveries];
  }
}

async function readNotificationsWithFallback() {
  try {
    return await notificationRepository.findAllNotifications();
  } catch (error) {
    return [];
  }
}

async function saveDelivery(delivery) {
  const cleanStatus = TELEGRAM_DELIVERY_STATUSES.includes(delivery.status) ? delivery.status : 'Pending';
  const record = {
    ...delivery,
    status: cleanStatus,
    updatedAt: nowIso(),
  };

  try {
    const updated = await telegramDeliveryRepository.updateDelivery(record.deliveryId, record);
    if (updated) return updated;
    return await telegramDeliveryRepository.createDelivery(record);
  } catch (error) {
    const index = memoryDeliveries.findIndex((item) => item.deliveryId === record.deliveryId);
    if (index >= 0) memoryDeliveries[index] = record;
    else memoryDeliveries.push(record);
    return record;
  }
}

function existingDeliveryFor(deliveries = [], notification = {}) {
  return deliveries.find(
    (delivery) => delivery.notificationId === notification.notificationId && delivery.userId === notification.userId
  );
}

async function getProfileForNotification(notification = {}) {
  if (!notification.userId) return null;
  const record = await crmAgentRepository.findUserProfileRecordByUserId(notification.userId);
  return record?.profile || null;
}

async function canDeliverNotification(notification = {}) {
  if (env.telegram?.enabled !== true) return { ok: false, reason: 'telegram_disabled' };
  if (!SUPPORTED_TYPES.includes(notification.type)) return { ok: false, reason: 'unsupported_type' };
  if (BLOCKED_STATUSES.includes(notification.status)) return { ok: false, reason: 'notification_closed' };
  const profile = await getProfileForNotification(notification);
  if (!profile) return { ok: false, reason: 'profile_missing' };
  if (!cleanText(profile.telegramUserId) || !cleanText(profile.telegramChatId)) return { ok: false, reason: 'telegram_not_linked' };
  if (!isYes(profile.telegramNotificationsEnabled)) return { ok: false, reason: 'telegram_notifications_disabled' };
  if (!respectsPreference(profile, notification.type)) return { ok: false, reason: 'preference_disabled' };
  return { ok: true, profile };
}

async function createTelegramDelivery(notification = {}) {
  const deliveries = await readDeliveriesWithFallback();
  const existing = existingDeliveryFor(deliveries, notification);
  if (existing) return existing;

  const allowed = await canDeliverNotification(notification);
  if (!allowed.ok) return null;

  const now = nowIso();
  const queued = shouldQueueForQuietHours(notification, allowed.profile);
  const delivery = {
    deliveryId: generateId('tgdel'),
    notificationId: notification.notificationId,
    userId: notification.userId,
    telegramChatId: allowed.profile.telegramChatId,
    status: queued ? 'Queued' : 'Pending',
    telegramMessageId: '',
    attemptedAt: '',
    deliveredAt: '',
    failedAt: '',
    failureCode: '',
    retryCount: '0',
    createdAt: now,
    updatedAt: now,
  };
  return saveDelivery(delivery);
}

function safeFailureCode(error) {
  if (error?.statusCode === 401 || error?.statusCode === 403) return `telegram_${error.statusCode}`;
  if (error?.statusCode === 429) return 'telegram_rate_limited';
  if (error?.retryable) return 'telegram_temporary_failure';
  return 'telegram_delivery_failed';
}

function shortMessage(value, maxLength = 420) {
  const text = cleanText(value).replace(/\s+/g, ' ');
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function formatTelegramNotification(notification = {}) {
  const lines = [`Gringo: ${shortMessage(notification.title, 120)}`];
  if (notification.priority === 'High' || notification.priority === 'Urgent') {
    lines.push(`Priority: ${notification.priority}`);
  }
  if (notification.message) lines.push(shortMessage(notification.message));
  if (notification.sourceModule) lines.push(`From: ${shortMessage(notification.sourceModule, 60)}`);
  if (notification.createdAt) lines.push(`Created: ${String(notification.createdAt).slice(0, 10)}`);
  lines.push('This notification was delivered inside Gringo and Telegram.');
  return lines.join('\n');
}

function notificationReplyMarkup(notification = {}) {
  const generalRows = [
    [
      button('Mark as Read', 'read', 'notifications', notification.notificationId),
      button('Dismiss', 'dismiss', 'notifications', notification.notificationId),
    ],
    [
      button('Remind Me Tomorrow', 'later1', 'notifications', notification.notificationId),
      button('Remind Me in 3 Days', 'later3', 'notifications', notification.notificationId),
    ],
  ];

  if (notification.type === 'Task Reminder') {
    return inlineKeyboard([
      [button('Complete Task', 'complete', 'tasks', notification.sourceRecordId), button('Reschedule', 'later', 'tasks', notification.sourceRecordId)],
      ...generalRows,
    ]);
  }

  if (notification.type === 'Job Match') {
    return inlineKeyboard([
      [button('View Job', 'view', 'jobs', notification.sourceRecordId)],
      [button('I Found a Job', 'found', 'jobs', 'goal'), button('Stop Job Alerts', 'stop', 'jobs', 'alerts')],
      ...generalRows,
    ]);
  }

  if (notification.type === 'Housing Match') {
    return inlineKeyboard([
      [button('View Housing', 'view', 'housing', notification.sourceRecordId)],
      [button('I Found Housing', 'found', 'housing', 'goal'), button('Stop Housing Alerts', 'stop', 'housing', 'alerts')],
      ...generalRows,
    ]);
  }

  if (notification.type === 'Document Expiry' || notification.type === 'Missing Document') {
    return inlineKeyboard([
      [button('View Document', 'view', 'documents', notification.sourceRecordId)],
      [button('Mark as Renewed', 'renew', 'documents', notification.sourceRecordId), button('Remind Me Later', 'later', 'documents', notification.sourceRecordId)],
      ...generalRows,
    ]);
  }

  return inlineKeyboard(generalRows);
}

function extractTelegramMessageId(sentMessages = []) {
  const first = Array.isArray(sentMessages) ? sentMessages[0] : sentMessages;
  return cleanText(first?.message_id);
}

async function findNotification(notificationId) {
  const notifications = await readNotificationsWithFallback();
  return notifications.find((notification) => notification.notificationId === notificationId) || null;
}

async function findDelivery(deliveryId) {
  const deliveries = await readDeliveriesWithFallback();
  return deliveries.find((delivery) => delivery.deliveryId === deliveryId) || null;
}

async function sendTelegramNotification(notification = {}) {
  const delivery = await createTelegramDelivery(notification);
  if (!delivery) return null;
  if (delivery.status === 'Delivered') return delivery;
  if (!['Pending', 'Queued', 'Failed'].includes(delivery.status)) return delivery;

  const latestAllowed = await canDeliverNotification(notification);
  if (!latestAllowed.ok) {
    return saveDelivery({
      ...delivery,
      status: 'Cancelled',
      failureCode: latestAllowed.reason,
    });
  }

  if (shouldQueueForQuietHours(notification, latestAllowed.profile)) {
    return saveDelivery({
      ...delivery,
      status: 'Queued',
      failureCode: '',
    });
  }

  const attemptedAt = nowIso();
  const retryCount = Number(delivery.retryCount || 0);
  try {
    const sent = await communicationService.sendNotification({
      channel: 'telegram',
      to: delivery.telegramChatId,
      text: formatTelegramNotification(notification),
      notification,
      profile: latestAllowed.profile,
      options: {
        replyMarkup: notificationReplyMarkup(notification),
        allowFallback: false,
      },
    });
    return saveDelivery({
      ...delivery,
      status: 'Delivered',
      attemptedAt,
      deliveredAt: nowIso(),
      failedAt: '',
      failureCode: '',
      telegramMessageId: extractTelegramMessageId(sent),
      retryCount: String(retryCount),
    });
  } catch (error) {
    safeTelegramWarning('Telegram notification delivery failed safely.');
    return saveDelivery({
      ...delivery,
      status: 'Failed',
      attemptedAt,
      failedAt: nowIso(),
      failureCode: safeFailureCode(error),
      retryCount: String(retryCount + 1),
    });
  }
}

function retryDue(delivery = {}) {
  if (delivery.status !== 'Failed') return false;
  if (Number(delivery.retryCount || 0) >= MAX_RETRY_COUNT) return false;
  if (!delivery.failedAt) return true;
  return Date.now() - new Date(delivery.failedAt).getTime() >= RETRY_DELAY_MS;
}

async function processPendingTelegramDeliveries() {
  const notifications = await readNotificationsWithFallback();
  const deliveries = await readDeliveriesWithFallback();
  const results = [];

  for (const notification of notifications) {
    const existing = existingDeliveryFor(deliveries, notification);
    if (!existing) {
      const delivery = await createTelegramDelivery(notification);
      if (delivery) deliveries.push(delivery);
    }
  }

  for (const delivery of deliveries) {
    if (!['Pending', 'Queued'].includes(delivery.status) && !retryDue(delivery)) continue;
    const notification = notifications.find((item) => item.notificationId === delivery.notificationId);
    if (!notification) {
      results.push(await saveDelivery({ ...delivery, status: 'Cancelled', failureCode: 'notification_missing' }));
      continue;
    }
    results.push(await sendTelegramNotification(notification));
  }

  return results.filter(Boolean);
}

async function retryFailedTelegramDelivery(deliveryId) {
  const delivery = await findDelivery(deliveryId);
  if (!delivery || delivery.status !== 'Failed') return null;
  const notification = await findNotification(delivery.notificationId);
  if (!notification) return null;
  return sendTelegramNotification(notification);
}

async function cancelTelegramDelivery(deliveryId) {
  const delivery = await findDelivery(deliveryId);
  if (!delivery || delivery.status === 'Delivered') return delivery;
  return saveDelivery({ ...delivery, status: 'Cancelled' });
}

async function getTelegramDeliveryStatus(notificationId) {
  const deliveries = await readDeliveriesWithFallback();
  return deliveries.find((delivery) => delivery.notificationId === notificationId) || null;
}

module.exports = {
  canDeliverNotification,
  cancelTelegramDelivery,
  createTelegramDelivery,
  formatTelegramNotification,
  getTelegramDeliveryStatus,
  processPendingTelegramDeliveries,
  retryFailedTelegramDelivery,
  sendTelegramNotification,
};
