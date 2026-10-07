const { env } = require('../../config/env');
const crmAgentRepository = require('../crm-agent/crm-agent.repository');
const { crmAgentService } = require('../crm-agent');
const notificationRepository = require('../notifications/notification.repository');
const lineClient = require('./line-client.service');
const lineDeliveryRepository = require('./line-delivery.repository');
const { LINE_DELIVERY_STATUSES } = require('./line-delivery.model');
const { safeLineWarning } = require('./line-errors');

const memoryDeliveries = [];
const memoryHistory = [];
const SUPPORTED_TYPES = [
  'Job Match',
  'Housing Match',
  'Document Expiry',
  'Missing Document',
  'Task Reminder',
  'Human Response',
  'Community Update',
  'Admin Message',
];
const BLOCKED_STATUSES = ['Dismissed', 'Completed', 'Expired'];
const SENT_STATUSES = ['Sent', 'Delivered', 'Read'];
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

function minutesFromTime(value) {
  const match = cleanText(value).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return Math.min(Number(match[1]), 23) * 60 + Math.min(Number(match[2]), 59);
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
    return Number(parts.find((part) => part.type === 'hour')?.value || 0) * 60 + Number(parts.find((part) => part.type === 'minute')?.value || 0);
  } catch (error) {
    const fallback = new Date();
    return fallback.getHours() * 60 + fallback.getMinutes();
  }
}

function isWithinQuietHours(profile = {}) {
  if (!isYes(profile.lineQuietHoursEnabled)) return false;
  const start = minutesFromTime(profile.lineQuietHoursStart || '22:00');
  const end = minutesFromTime(profile.lineQuietHoursEnd || '07:00');
  if (start === null || end === null || start === end) return false;
  const current = currentMinutesInTimezone(profile.lineTimezone || profile.timezone || DEFAULT_TIMEZONE);
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

function isNotificationDue(notification = {}, now = new Date()) {
  const scheduledAt = cleanText(notification.scheduledAt);
  if (!scheduledAt) return true;
  const scheduled = new Date(scheduledAt);
  return Number.isNaN(scheduled.getTime()) || scheduled <= now;
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

function maskSensitiveText(value = '') {
  return cleanText(value)
    .replace(/\b\d{4,}\b/g, (match) => `***${match.slice(-2)}`)
    .replace(/\b(passport|visa)\s*(number|no\.?)?\s*[:#-]?\s*[A-Z0-9-]{4,}\b/gi, '$1 number ***');
}

function shortMessage(value, maxLength = 420) {
  const text = maskSensitiveText(value).replace(/\s+/g, ' ');
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function formatLineNotification(notification = {}) {
  const lines = [`Gringo: ${shortMessage(notification.title, 120)}`];
  if (notification.priority === 'High' || notification.priority === 'Urgent') {
    lines.push(`Priority: ${notification.priority}`);
  }
  if (notification.message) lines.push(shortMessage(notification.message));
  if (notification.sourceModule) lines.push(`From: ${shortMessage(notification.sourceModule, 60)}`);
  lines.push('This notification was delivered inside Gringo and LINE.');
  return lines.join('\n');
}

function actionData(action, moduleName, recordId) {
  return [action, moduleName, recordId].map(cleanText).join(':').slice(0, 300);
}

function quickReply(label, text, action, moduleName, recordId) {
  return {
    label,
    text,
    data: action ? actionData(action, moduleName, recordId) : '',
  };
}

function notificationQuickReplies(notification = {}) {
  const general = [
    quickReply('Mark as Read', 'Notification read', 'read', 'notifications', notification.notificationId),
    quickReply('Dismiss', 'Notification dismissed', 'dismiss', 'notifications', notification.notificationId),
    quickReply('Tomorrow', 'Remind me tomorrow', 'later1', 'notifications', notification.notificationId),
  ];
  if (notification.type === 'Task Reminder') {
    return [
      quickReply('Complete Task', 'Task completed', 'complete', 'tasks', notification.sourceRecordId),
      quickReply('Reschedule Task', 'Reschedule task', 'later', 'tasks', notification.sourceRecordId),
      ...general,
    ];
  }
  if (notification.type === 'Job Match') {
    return [
      quickReply('View Job', 'View job', 'view', 'jobs', notification.sourceRecordId),
      quickReply('Found Job', 'I found a job', 'found', 'jobs', 'goal'),
      quickReply('Stop Alerts', 'Stop job alerts', 'stop', 'jobs', 'alerts'),
      ...general,
    ];
  }
  if (notification.type === 'Housing Match') {
    return [
      quickReply('View Housing', 'View housing', 'view', 'housing', notification.sourceRecordId),
      quickReply('Found Housing', 'I found housing', 'found', 'housing', 'goal'),
      quickReply('Stop Alerts', 'Stop housing alerts', 'stop', 'housing', 'alerts'),
      ...general,
    ];
  }
  if (notification.type === 'Document Expiry' || notification.type === 'Missing Document') {
    return [
      quickReply('View Document', 'View document', 'view', 'documents', notification.sourceRecordId),
      quickReply('Mark Renewed', 'Mark as renewed', 'renew', 'documents', notification.sourceRecordId),
      quickReply('Remind Later', 'Remind me later', 'later', 'documents', notification.sourceRecordId),
      ...general,
    ];
  }
  if (notification.type === 'Community Update') {
    return [quickReply('Community', 'community'), ...general];
  }
  return general;
}

async function readDeliveriesWithFallback() {
  try {
    const records = await lineDeliveryRepository.findAllDeliveryRecords();
    const byId = new Map(records.map((record) => [record.delivery.deliveryId, record.delivery]));
    memoryDeliveries.forEach((delivery) => byId.set(delivery.deliveryId, delivery));
    return Array.from(byId.values());
  } catch (error) {
    return [...memoryDeliveries];
  }
}

async function readHistoryWithFallback() {
  try {
    const records = await lineDeliveryRepository.findAllDeliveryHistoryRecords();
    const byId = new Map(records.map((record) => [record.history.historyId, record.history]));
    memoryHistory.forEach((history) => byId.set(history.historyId, history));
    return Array.from(byId.values());
  } catch (error) {
    return [...memoryHistory];
  }
}

async function readNotificationsWithFallback() {
  try {
    return await notificationRepository.findAllNotifications();
  } catch (error) {
    return [];
  }
}

async function saveDeliveryHistory(delivery = {}, status = '', eventAt = '', safeFailureCode = '') {
  if (!delivery.deliveryId || !status) return null;
  const existing = await readHistoryWithFallback();
  const cleanEventAt = cleanText(eventAt) || nowIso();
  const duplicate = existing.some(
    (item) => item.deliveryId === delivery.deliveryId && item.status === status && item.eventAt === cleanEventAt
  );
  if (duplicate) return null;

  const history = {
    historyId: generateId('lnhist'),
    deliveryId: delivery.deliveryId,
    userId: delivery.userId,
    status,
    eventAt: cleanEventAt,
    safeFailureCode: cleanText(safeFailureCode),
    createdAt: nowIso(),
  };
  try {
    return await lineDeliveryRepository.createDeliveryHistory(history);
  } catch (error) {
    memoryHistory.push(history);
    return history;
  }
}

async function hasDeliveryHistoryEvent(deliveryId = '', status = '', eventAt = '') {
  if (!deliveryId || !status || !eventAt) return false;
  const existing = await readHistoryWithFallback();
  return existing.some((item) => item.deliveryId === deliveryId && item.status === status && item.eventAt === eventAt);
}

async function saveDelivery(delivery) {
  const cleanStatus = LINE_DELIVERY_STATUSES.includes(delivery.status) ? delivery.status : 'Pending';
  const record = {
    ...delivery,
    channel: 'line',
    status: cleanStatus,
    updatedAt: nowIso(),
  };

  try {
    const updated = await lineDeliveryRepository.updateDelivery(record.deliveryId, record);
    if (updated) return updated;
    return await lineDeliveryRepository.createDelivery(record);
  } catch (error) {
    const index = memoryDeliveries.findIndex((item) => item.deliveryId === record.deliveryId);
    if (index >= 0) memoryDeliveries[index] = record;
    else memoryDeliveries.push(record);
    return record;
  }
}

function existingDeliveryFor(deliveries = [], notification = {}) {
  return deliveries.find(
    (delivery) =>
      delivery.notificationId === notification.notificationId &&
      delivery.userId === notification.userId &&
      delivery.channel === 'line'
  );
}

async function recordCrmHistory(notification = {}, delivery = {}, eventType = '', failureCode = '') {
  if (!notification.userId || !eventType) return null;
  try {
    return await crmAgentService.saveConversation({
      userId: notification.userId,
      channel: 'line',
      question: `Notification ${eventType}: ${notification.type}`,
      answer: failureCode ? `LINE delivery ${eventType}: ${failureCode}` : shortMessage(notification.title, 160),
      category: 'LINE',
      status: `LINE_NOTIFICATION_${eventType.toUpperCase().replace(/\s+/g, '_')}`,
      needsHumanFollowUp: false,
    });
  } catch (error) {
    return null;
  }
}

async function getProfileForNotification(notification = {}) {
  if (!notification.userId) return null;
  const record = await crmAgentRepository.findUserProfileRecordByUserId(notification.userId);
  return record?.profile || null;
}

async function canDeliverNotification(notification = {}) {
  if (env.line?.enabled !== true) return { ok: false, reason: 'line_disabled' };
  if (!SUPPORTED_TYPES.includes(notification.type)) return { ok: false, reason: 'unsupported_type' };
  if (BLOCKED_STATUSES.includes(notification.status)) return { ok: false, reason: 'notification_closed' };
  const profile = await getProfileForNotification(notification);
  if (!profile) return { ok: false, reason: 'profile_missing' };
  if (!cleanText(profile.lineUserId) || profile.lineLinkStatus !== 'Connected') return { ok: false, reason: 'line_not_linked' };
  if (!isYes(profile.lineNotificationsEnabled)) return { ok: false, reason: 'line_notifications_disabled' };
  if (!respectsPreference(profile, notification.type)) return { ok: false, reason: 'preference_disabled' };
  return { ok: true, profile };
}

async function createLineDelivery(notification = {}) {
  const deliveries = await readDeliveriesWithFallback();
  const existing = existingDeliveryFor(deliveries, notification);
  if (existing) return existing;

  const allowed = await canDeliverNotification(notification);
  if (!allowed.ok) return null;

  const now = nowIso();
  const queued = !isNotificationDue(notification) || shouldQueueForQuietHours(notification, allowed.profile);
  const delivery = {
    deliveryId: generateId('lndel'),
    notificationId: notification.notificationId,
    userId: notification.userId,
    channel: 'line',
    lineUserId: allowed.profile.lineUserId,
    lineMessageId: '',
    status: queued ? 'Queued' : 'Pending',
    attemptedAt: '',
    deliveredAt: '',
    failedAt: '',
    failureCode: '',
    retryCount: '0',
    createdAt: now,
    updatedAt: now,
  };
  const saved = await saveDelivery(delivery);
  await saveDeliveryHistory(saved, saved.status, now);
  await recordCrmHistory(notification, saved, queued ? 'Queued' : 'Created');
  return saved;
}

async function queueLineNotification(notification = {}) {
  const delivery = await createLineDelivery(notification);
  if (!delivery || SENT_STATUSES.includes(delivery.status)) return delivery;
  const queued = await saveDelivery({ ...delivery, status: 'Queued', failureCode: '' });
  await saveDeliveryHistory(queued, 'Queued', nowIso());
  await recordCrmHistory(notification, queued, 'Queued');
  return queued;
}

function safeFailureCode(error) {
  if (error?.statusCode === 401 || error?.statusCode === 403) return `line_${error.statusCode}`;
  if (error?.statusCode === 429) return 'line_rate_limited';
  if (error?.retryable) return 'line_temporary_failure';
  return 'line_delivery_failed';
}

function extractLineMessageId(sent = {}) {
  const first = sent?.body?.sentMessages?.[0];
  return cleanText(first?.id || sent.lineRequestId);
}

async function sendLineNotification(notification = {}) {
  const delivery = await createLineDelivery(notification);
  if (!delivery) return null;
  if (SENT_STATUSES.includes(delivery.status)) return delivery;
  if (!['Pending', 'Queued', 'Failed'].includes(delivery.status)) return delivery;

  const latestAllowed = await canDeliverNotification(notification);
  if (!latestAllowed.ok) {
    const cancelled = await saveDelivery({ ...delivery, status: 'Cancelled', failureCode: latestAllowed.reason });
    await saveDeliveryHistory(cancelled, 'Cancelled', nowIso(), latestAllowed.reason);
    await recordCrmHistory(notification, cancelled, 'Cancel', latestAllowed.reason);
    return cancelled;
  }

  if (!isNotificationDue(notification) || shouldQueueForQuietHours(notification, latestAllowed.profile)) {
    if (delivery.status === 'Queued') return delivery;
    const queued = await saveDelivery({ ...delivery, status: 'Queued', failureCode: '' });
    await saveDeliveryHistory(queued, 'Queued', nowIso());
    await recordCrmHistory(notification, queued, 'Queued');
    return queued;
  }

  const attemptedAt = nowIso();
  const retryCount = Number(delivery.retryCount || 0);
  try {
    await recordCrmHistory(notification, delivery, 'Sent');
    const sent = await lineClient.pushTextMessage(delivery.lineUserId, formatLineNotification(notification), {
      quickReplies: notificationQuickReplies(notification),
    });
    const sentRecord = {
      ...delivery,
      status: 'Sent',
      attemptedAt,
      failedAt: '',
      failureCode: '',
      lineMessageId: extractLineMessageId(sent),
      retryCount: String(retryCount),
    };
    await saveDeliveryHistory(sentRecord, 'Sent', attemptedAt);
    const saved = await saveDelivery({
      ...sentRecord,
      status: 'Delivered',
      deliveredAt: nowIso(),
    });
    await saveDeliveryHistory(saved, 'Delivered', saved.deliveredAt);
    await recordCrmHistory(notification, saved, 'Delivered');
    return saved;
  } catch (error) {
    safeLineWarning('LINE notification delivery failed safely.');
    const failed = await saveDelivery({
      ...delivery,
      status: 'Failed',
      attemptedAt,
      failedAt: nowIso(),
      failureCode: safeFailureCode(error),
      retryCount: String(retryCount + 1),
    });
    await saveDeliveryHistory(failed, 'Failed', failed.failedAt, failed.failureCode);
    await recordCrmHistory(notification, failed, 'Failed', failed.failureCode);
    return failed;
  }
}

function retryDue(delivery = {}) {
  if (delivery.status !== 'Failed') return false;
  if (Number(delivery.retryCount || 0) >= MAX_RETRY_COUNT) return false;
  if (!delivery.failedAt) return true;
  return Date.now() - new Date(delivery.failedAt).getTime() >= RETRY_DELAY_MS;
}

async function processPendingLineDeliveries() {
  if (env.line?.enabled !== true) return [];
  const notifications = await readNotificationsWithFallback();
  const deliveries = await readDeliveriesWithFallback();
  const results = [];

  for (const notification of notifications) {
    const existing = existingDeliveryFor(deliveries, notification);
    if (!existing) {
      const delivery = await createLineDelivery(notification);
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
    results.push(await sendLineNotification(notification));
  }

  return results.filter(Boolean);
}

async function findNotification(notificationId) {
  const notifications = await readNotificationsWithFallback();
  return notifications.find((notification) => notification.notificationId === notificationId) || null;
}

async function findDelivery(deliveryId) {
  const deliveries = await readDeliveriesWithFallback();
  return deliveries.find((delivery) => delivery.deliveryId === deliveryId) || null;
}

async function retryLineNotification(deliveryId) {
  const delivery = await findDelivery(deliveryId);
  if (!delivery || delivery.status !== 'Failed') return null;
  if (Number(delivery.retryCount || 0) >= MAX_RETRY_COUNT) return delivery;
  const notification = await findNotification(delivery.notificationId);
  if (!notification) return null;
  await recordCrmHistory(notification, delivery, 'Retry');
  return sendLineNotification(notification);
}

async function cancelLineNotification(deliveryId) {
  const delivery = await findDelivery(deliveryId);
  if (!delivery || SENT_STATUSES.includes(delivery.status)) return delivery;
  const notification = await findNotification(delivery.notificationId);
  const cancelled = await saveDelivery({ ...delivery, status: 'Cancelled' });
  await saveDeliveryHistory(cancelled, 'Cancelled', nowIso(), cancelled.failureCode);
  if (notification) await recordCrmHistory(notification, cancelled, 'Cancel');
  return cancelled;
}

async function getLineDeliveryStatus(notificationId) {
  const deliveries = await readDeliveriesWithFallback();
  return deliveries.find((delivery) => delivery.notificationId === notificationId && delivery.channel === 'line') || null;
}

async function markLineNotificationRead(notificationId, userId = '') {
  const deliveries = await readDeliveriesWithFallback();
  const delivery = deliveries.find(
    (item) => item.notificationId === notificationId && item.channel === 'line' && (!userId || item.userId === userId)
  );
  if (!delivery) return null;
  if (delivery.status === 'Read') return delivery;
  const eventAt = nowIso();
  const read = await saveDelivery({ ...delivery, status: 'Read', deliveredAt: delivery.deliveredAt || eventAt });
  await saveDeliveryHistory(read, 'Read', eventAt);
  const notification = await findNotification(notificationId);
  if (notification) await recordCrmHistory(notification, read, 'Read');
  return read;
}

async function updateLineDeliveryStatusFromEvent(statusEvent = {}) {
  const lineMessageId = cleanText(statusEvent.lineMessageId);
  const status = cleanText(statusEvent.status);
  if (!lineMessageId || !LINE_DELIVERY_STATUSES.includes(status)) return null;
  const deliveries = await readDeliveriesWithFallback();
  const delivery = deliveries.find((item) => item.lineMessageId === lineMessageId);
  if (!delivery) return null;
  const eventAt = cleanText(statusEvent.eventAt) || nowIso();
  const failureCode = status === 'Failed' ? cleanText(statusEvent.safeFailureCode || 'line_delivery_failed') : '';
  if (await hasDeliveryHistoryEvent(delivery.deliveryId, status, eventAt)) return delivery;
  const saved = await saveDelivery({
    ...delivery,
    status,
    deliveredAt: status === 'Delivered' || status === 'Read' ? eventAt : delivery.deliveredAt,
    failedAt: status === 'Failed' ? eventAt : delivery.failedAt,
    failureCode: failureCode || delivery.failureCode,
    retryCount: status === 'Failed' ? String(Number(delivery.retryCount || 0) + 1) : delivery.retryCount,
  });
  await saveDeliveryHistory(saved, status, eventAt, failureCode);
  const notification = await findNotification(saved.notificationId);
  if (notification) await recordCrmHistory(notification, saved, status, failureCode);
  return saved;
}

async function getDeliveryHistory(deliveryId) {
  const history = await readHistoryWithFallback();
  return history.filter((item) => item.deliveryId === deliveryId);
}

async function getAllLineDeliveries() {
  return readDeliveriesWithFallback();
}

async function getAllLineDeliveryHistory() {
  return readHistoryWithFallback();
}

module.exports = {
  canDeliverNotification,
  cancelLineNotification,
  createLineDelivery,
  formatLineNotification,
  getAllLineDeliveries,
  getAllLineDeliveryHistory,
  getDeliveryHistory,
  getLineDeliveryStatus,
  markLineNotificationRead,
  processPendingLineDeliveries,
  queueLineNotification,
  retryLineNotification,
  sendLineNotification,
  updateLineDeliveryStatusFromEvent,
};
