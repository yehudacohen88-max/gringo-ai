const { env } = require('../../config/env');
const crmAgentRepository = require('../crm-agent/crm-agent.repository');
const { crmAgentService } = require('../crm-agent');
const notificationRepository = require('../notifications/notification.repository');
const { communicationService } = require('../communication');
const whatsappDeliveryRepository = require('./whatsapp-delivery.repository');
const { WHATSAPP_DELIVERY_MODES, WHATSAPP_DELIVERY_STATUSES } = require('./whatsapp-delivery.model');
const { safeWhatsAppWarning } = require('./whatsapp-errors');

const memoryDeliveries = [];
const memoryHistory = [];
const memoryTemplates = [
  ['job_match', 'gringo_job_match', 'Job Match'],
  ['housing_match', 'gringo_housing_match', 'Housing Match'],
  ['document_expiry', 'gringo_document_expiry', 'Document Expiry'],
  ['missing_document', 'gringo_missing_document', 'Missing Document'],
  ['community_update', 'gringo_community_update', 'Community Update'],
  ['task_reminder', 'gringo_task_reminder', 'Task Reminder'],
  ['human_response', 'gringo_human_response', 'Human Response'],
  ['admin_message', 'gringo_admin_message', 'Admin Message'],
].map(([internalName, metaTemplateName, notificationType]) => ({
  templateId: `watpl_${internalName}`,
  internalName,
  metaTemplateName,
  languageCode: 'en',
  notificationType,
  status: 'Approved',
  parameterMapping: 'title,message,priority',
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt: '2026-07-18T00:00:00.000Z',
}));

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
  if (!isYes(profile.whatsappQuietHoursEnabled)) return false;
  const start = minutesFromTime(profile.whatsappQuietHoursStart || '22:00');
  const end = minutesFromTime(profile.whatsappQuietHoursEnd || '07:00');
  if (start === null || end === null || start === end) return false;
  const current = currentMinutesInTimezone(profile.whatsappTimezone || profile.timezone || DEFAULT_TIMEZONE);
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

async function readDeliveriesWithFallback() {
  try {
    const records = await whatsappDeliveryRepository.findAllDeliveryRecords();
    const byId = new Map(records.map((record) => [record.delivery.deliveryId, record.delivery]));
    memoryDeliveries.forEach((delivery) => byId.set(delivery.deliveryId, delivery));
    return Array.from(byId.values());
  } catch (error) {
    return [...memoryDeliveries];
  }
}

async function readTemplatesWithFallback() {
  try {
    const records = await whatsappDeliveryRepository.findAllTemplateRecords();
    const templates = records.map((record) => record.template);
    return templates.length ? templates : [...memoryTemplates];
  } catch (error) {
    return [...memoryTemplates];
  }
}

async function readHistoryWithFallback() {
  try {
    const records = await whatsappDeliveryRepository.findAllDeliveryHistoryRecords();
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

async function saveDelivery(delivery) {
  const status = WHATSAPP_DELIVERY_STATUSES.includes(delivery.status) ? delivery.status : 'Pending';
  const mode = WHATSAPP_DELIVERY_MODES.includes(delivery.deliveryMode) ? delivery.deliveryMode : delivery.deliveryMode || '';
  const record = {
    ...delivery,
    deliveryMode: mode,
    status,
    updatedAt: nowIso(),
  };

  try {
    const updated = await whatsappDeliveryRepository.updateDelivery(record.deliveryId, record);
    if (updated) return updated;
    return await whatsappDeliveryRepository.createDelivery(record);
  } catch (error) {
    const index = memoryDeliveries.findIndex((item) => item.deliveryId === record.deliveryId);
    if (index >= 0) memoryDeliveries[index] = record;
    else memoryDeliveries.push(record);
    return record;
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
    historyId: generateId('wahist'),
    deliveryId: delivery.deliveryId,
    userId: delivery.userId,
    status,
    eventAt: cleanEventAt,
    safeFailureCode: cleanText(safeFailureCode),
    createdAt: nowIso(),
  };
  try {
    return await whatsappDeliveryRepository.createDeliveryHistory(history);
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
  if (env.whatsapp?.enabled !== true) return { ok: false, reason: 'whatsapp_disabled' };
  if (!SUPPORTED_TYPES.includes(notification.type)) return { ok: false, reason: 'unsupported_type' };
  if (BLOCKED_STATUSES.includes(notification.status)) return { ok: false, reason: 'notification_closed' };
  const profile = await getProfileForNotification(notification);
  if (!profile) return { ok: false, reason: 'profile_missing' };
  if (!cleanText(profile.whatsappPhone)) return { ok: false, reason: 'whatsapp_not_connected' };
  if (!isYes(profile.whatsappNotificationsEnabled)) return { ok: false, reason: 'whatsapp_notifications_disabled' };
  if (!respectsPreference(profile, notification.type)) return { ok: false, reason: 'preference_disabled' };
  return { ok: true, profile };
}

function isConversationWindowOpen(profile = {}) {
  const lastInbound = new Date(profile.whatsappLastInboundAt || profile.lastInteractionAt || 0).getTime();
  return !Number.isNaN(lastInbound) && Date.now() - lastInbound <= 24 * 60 * 60 * 1000;
}

async function findApprovedTemplate(notificationType = '') {
  const templates = await readTemplatesWithFallback();
  return (
    templates.find((template) => template.notificationType === notificationType && template.status === 'Approved') ||
    null
  );
}

async function createWhatsAppDelivery(notification = {}) {
  const deliveries = await readDeliveriesWithFallback();
  const existing = existingDeliveryFor(deliveries, notification);
  if (existing) return existing;
  const allowed = await canDeliverNotification(notification);
  if (!allowed.ok) return null;

  const now = nowIso();
  const queued = !isNotificationDue(notification) || shouldQueueForQuietHours(notification, allowed.profile);
  const delivery = {
    deliveryId: generateId('wadel'),
    notificationId: notification.notificationId,
    userId: notification.userId,
    whatsappPhone: allowed.profile.whatsappPhone,
    templateId: '',
    deliveryMode: '',
    status: queued ? 'Queued' : 'Pending',
    whatsappMessageId: '',
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
  if (error?.statusCode === 401 || error?.statusCode === 403) return `whatsapp_${error.statusCode}`;
  if (error?.statusCode === 429) return 'whatsapp_rate_limited';
  if (error?.retryable) return 'whatsapp_temporary_failure';
  return 'whatsapp_delivery_failed';
}

function shortText(value, maxLength = 360) {
  const text = cleanText(value).replace(/\s+/g, ' ');
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function formatSessionMessage(notification = {}) {
  const lines = [`Gringo: ${shortText(notification.title, 120)}`];
  if (notification.priority === 'High' || notification.priority === 'Urgent') lines.push(`Priority: ${notification.priority}`);
  if (notification.message) lines.push(shortText(notification.message));
  if (notification.actionLabel) lines.push(`Action: ${shortText(notification.actionLabel, 60)}`);
  return lines.join('\n');
}

async function recordWhatsAppCrmHistory(delivery = {}, eventType = '', details = {}) {
  if (!delivery?.userId || !eventType) return null;
  const safeStatus = cleanText(details.status || delivery.status);
  const safeMode = cleanText(details.deliveryMode || delivery.deliveryMode);
  const safeReason = cleanText(details.failureCode || delivery.failureCode);
  const notificationId = cleanText(delivery.notificationId);
  try {
    return await crmAgentService.saveConversation({
      userId: delivery.userId,
      channel: 'whatsapp',
      question: `WhatsApp admin event: ${eventType}`,
      answer: [
        safeMode ? `Mode: ${safeMode}` : '',
        safeStatus ? `Status: ${safeStatus}` : '',
        safeReason ? `Reason: ${safeReason}` : '',
        notificationId ? `Notification: ${notificationId}` : '',
      ]
        .filter(Boolean)
        .join(' | '),
      category: 'WhatsApp',
      status: `WHATSAPP_${eventType.toUpperCase().replace(/\s+/g, '_')}`,
      needsHumanFollowUp: false,
    });
  } catch (error) {
    safeWhatsAppWarning('WhatsApp CRM history could not be saved.');
    return null;
  }
}

function actionId(action, moduleName, recordId) {
  return [action, moduleName, recordId].map(cleanText).join(':').slice(0, 256);
}

function notificationButtons(notification = {}) {
  if (notification.type === 'Task Reminder') {
    return [
      { title: 'Complete Task', id: actionId('complete', 'tasks', notification.sourceRecordId) },
      { title: 'Reschedule', id: actionId('later', 'tasks', notification.sourceRecordId) },
      { title: 'Mark Read', id: actionId('read', 'notifications', notification.notificationId) },
    ];
  }
  if (notification.type === 'Job Match') {
    return [
      { title: 'View Job', id: actionId('view', 'jobs', notification.sourceRecordId) },
      { title: 'Found Job', id: actionId('found', 'jobs', 'goal') },
      { title: 'Stop Alerts', id: actionId('stop', 'jobs', 'alerts') },
    ];
  }
  if (notification.type === 'Housing Match') {
    return [
      { title: 'View Home', id: actionId('view', 'housing', notification.sourceRecordId) },
      { title: 'Found Home', id: actionId('found', 'housing', 'goal') },
      { title: 'Stop Alerts', id: actionId('stop', 'housing', 'alerts') },
    ];
  }
  if (notification.type === 'Document Expiry' || notification.type === 'Missing Document') {
    return [
      { title: 'View Doc', id: actionId('view', 'documents', notification.sourceRecordId) },
      { title: 'Renewed', id: actionId('renew', 'documents', notification.sourceRecordId) },
      { title: 'Remind Later', id: actionId('later', 'notifications', notification.notificationId) },
    ];
  }
  return [
    { title: 'Mark Read', id: actionId('read', 'notifications', notification.notificationId) },
    { title: 'Dismiss', id: actionId('dismiss', 'notifications', notification.notificationId) },
    { title: 'Tomorrow', id: actionId('later', 'notifications', notification.notificationId) },
  ];
}

function templateParameters(notification = {}) {
  return [
    shortText(notification.title, 120),
    shortText(notification.message || 'Open Gringo for details.', 300),
    ['High', 'Urgent'].includes(notification.priority) ? notification.priority : 'Normal',
  ];
}

function extractWhatsAppMessageId(sentMessages = []) {
  const first = Array.isArray(sentMessages) ? sentMessages[0] : sentMessages;
  return cleanText(first?.messages?.[0]?.id || first?.message_id);
}

async function findNotification(notificationId) {
  const notifications = await readNotificationsWithFallback();
  return notifications.find((notification) => notification.notificationId === notificationId) || null;
}

async function findDelivery(deliveryId) {
  const deliveries = await readDeliveriesWithFallback();
  return deliveries.find((delivery) => delivery.deliveryId === deliveryId) || null;
}

async function markFailure(delivery, failureCode, retryIncrement = 0) {
  const saved = await saveDelivery({
    ...delivery,
    status: failureCode === 'no_approved_template' ? 'Pending' : 'Failed',
    failedAt: nowIso(),
    failureCode,
    retryCount: String(Number(delivery.retryCount || 0) + retryIncrement),
  });
  await saveDeliveryHistory(saved, saved.status, saved.failedAt, failureCode);
  await recordWhatsAppCrmHistory(saved, 'delivery failure', { failureCode });
  return saved;
}

async function sendWhatsAppSessionMessage(notification = {}) {
  const delivery = await createWhatsAppDelivery(notification);
  if (!delivery || SENT_STATUSES.includes(delivery.status)) return delivery;
  const allowed = await canDeliverNotification(notification);
  if (!allowed.ok) return saveDelivery({ ...delivery, status: 'Cancelled', failureCode: allowed.reason });
  if (shouldQueueForQuietHours(notification, allowed.profile)) {
    return saveDelivery({ ...delivery, status: 'Queued', failureCode: '' });
  }
  if (!isConversationWindowOpen(allowed.profile)) return sendWhatsAppTemplateMessage(notification);

  const attemptedAt = nowIso();
  try {
    const buttons = notificationButtons(notification);
    const sent = await communicationService.sendNotification({
      channel: 'whatsapp',
      to: delivery.whatsappPhone,
      text: formatSessionMessage(notification),
      notification,
      profile: allowed.profile,
      options: {
        buttons,
        allowFallback: false,
      },
    });
    const saved = await saveDelivery({
      ...delivery,
      deliveryMode: 'Session Message',
      status: 'Sent',
      whatsappMessageId: extractWhatsAppMessageId(sent),
      attemptedAt,
      deliveredAt: '',
      failedAt: '',
      failureCode: '',
    });
    await saveDeliveryHistory(saved, 'Sent', attemptedAt);
    await recordWhatsAppCrmHistory(saved, notification.type === 'Human Response' ? 'Human Response' : 'session message', {
      status: 'Sent',
      deliveryMode: 'Session Message',
    });
    return saved;
  } catch (error) {
    safeWhatsAppWarning('WhatsApp session delivery failed safely.');
    return markFailure({ ...delivery, deliveryMode: 'Session Message', attemptedAt }, safeFailureCode(error), 1);
  }
}

async function sendWhatsAppTemplateMessage(notification = {}) {
  const delivery = await createWhatsAppDelivery(notification);
  if (!delivery || SENT_STATUSES.includes(delivery.status)) return delivery;
  const allowed = await canDeliverNotification(notification);
  if (!allowed.ok) return saveDelivery({ ...delivery, status: 'Cancelled', failureCode: allowed.reason });
  if (shouldQueueForQuietHours(notification, allowed.profile)) {
    return saveDelivery({ ...delivery, status: 'Queued', failureCode: '' });
  }
  const template = await findApprovedTemplate(notification.type);
  if (!template) return markFailure({ ...delivery, deliveryMode: 'Template Message' }, 'no_approved_template', 0);

  const attemptedAt = nowIso();
  try {
    const sent = await communicationService.sendNotification({
      channel: 'whatsapp',
      to: delivery.whatsappPhone,
      text: formatSessionMessage(notification),
      notification,
      profile: allowed.profile,
      options: {
        templateName: template.metaTemplateName,
        languageCode: template.languageCode || 'en',
        parameters: templateParameters(notification),
        allowFallback: false,
      },
    });
    const saved = await saveDelivery({
      ...delivery,
      templateId: template.templateId,
      deliveryMode: 'Template Message',
      status: 'Sent',
      whatsappMessageId: extractWhatsAppMessageId(sent),
      attemptedAt,
      deliveredAt: '',
      failedAt: '',
      failureCode: '',
    });
    await saveDeliveryHistory(saved, 'Sent', attemptedAt);
    await recordWhatsAppCrmHistory(saved, notification.type === 'Human Response' ? 'Human Response' : 'template message', {
      status: 'Sent',
      deliveryMode: 'Template Message',
    });
    return saved;
  } catch (error) {
    safeWhatsAppWarning('WhatsApp template delivery failed safely.');
    return markFailure({ ...delivery, templateId: template.templateId, deliveryMode: 'Template Message', attemptedAt }, safeFailureCode(error), 1);
  }
}

function normalizeStatus(status = '') {
  const value = cleanText(status).toLowerCase();
  if (value === 'sent') return 'Sent';
  if (value === 'delivered') return 'Delivered';
  if (value === 'read') return 'Read';
  if (value === 'failed') return 'Failed';
  return '';
}

async function updateDeliveryStatusFromWebhook(statusEvent = {}) {
  const whatsappMessageId = cleanText(statusEvent.whatsappMessageId);
  const status = normalizeStatus(statusEvent.status);
  if (!whatsappMessageId || !status) return null;
  const deliveries = await readDeliveriesWithFallback();
  const delivery = deliveries.find((item) => item.whatsappMessageId === whatsappMessageId);
  if (!delivery) return null;

  const eventAt = cleanText(statusEvent.eventAt) || nowIso();
  const safeFailureCode = status === 'Failed' ? cleanText(statusEvent.safeFailureCode || 'whatsapp_delivery_failed') : '';
  if (await hasDeliveryHistoryEvent(delivery.deliveryId, status, eventAt)) return delivery;
  const updated = {
    ...delivery,
    status,
    deliveredAt: status === 'Delivered' ? eventAt : delivery.deliveredAt,
    failedAt: status === 'Failed' ? eventAt : delivery.failedAt,
    failureCode: safeFailureCode || delivery.failureCode,
    retryCount: status === 'Failed' ? String(Number(delivery.retryCount || 0) + 1) : delivery.retryCount,
  };
  const saved = await saveDelivery(updated);
  await saveDeliveryHistory(saved, status, eventAt, safeFailureCode);
  await recordWhatsAppCrmHistory(saved, status === 'Failed' ? 'delivery failure' : 'delivery success', {
    status,
    failureCode: safeFailureCode,
  });
  return saved;
}

function retryDue(delivery = {}) {
  if (delivery.status !== 'Failed') return false;
  if (['whatsapp_401', 'whatsapp_403'].includes(delivery.failureCode)) return false;
  if (Number(delivery.retryCount || 0) >= MAX_RETRY_COUNT) return false;
  if (!delivery.failedAt) return true;
  return Date.now() - new Date(delivery.failedAt).getTime() >= RETRY_DELAY_MS;
}

async function sendNotificationByWindow(notification = {}) {
  const allowed = await canDeliverNotification(notification);
  if (!allowed.ok) return null;
  if (!isNotificationDue(notification)) {
    const delivery = await createWhatsAppDelivery(notification);
    return delivery ? saveDelivery({ ...delivery, status: 'Queued', failureCode: '' }) : null;
  }
  return isConversationWindowOpen(allowed.profile)
    ? sendWhatsAppSessionMessage(notification)
    : sendWhatsAppTemplateMessage(notification);
}

async function processPendingWhatsAppDeliveries() {
  if (env.whatsapp?.enabled !== true) return [];
  const notifications = await readNotificationsWithFallback();
  const deliveries = await readDeliveriesWithFallback();
  const results = [];

  for (const notification of notifications) {
    const existing = existingDeliveryFor(deliveries, notification);
    if (!existing) {
      const delivery = await createWhatsAppDelivery(notification);
      if (delivery) deliveries.push(delivery);
    }
  }

  for (const delivery of deliveries) {
    if (!['Pending', 'Queued'].includes(delivery.status) && !retryDue(delivery)) continue;
    if (delivery.failureCode === 'no_approved_template') continue;
    const notification = notifications.find((item) => item.notificationId === delivery.notificationId);
    if (!notification) {
      results.push(await saveDelivery({ ...delivery, status: 'Cancelled', failureCode: 'notification_missing' }));
      continue;
    }
    results.push(await sendNotificationByWindow(notification));
  }

  return results.filter(Boolean);
}

async function retryFailedWhatsAppDelivery(deliveryId) {
  const delivery = await findDelivery(deliveryId);
  if (!delivery || delivery.status !== 'Failed') return null;
  const notification = await findNotification(delivery.notificationId);
  if (!notification) return null;
  await recordWhatsAppCrmHistory(delivery, 'retry', { failureCode: delivery.failureCode });
  return sendNotificationByWindow(notification);
}

async function cancelWhatsAppDelivery(deliveryId) {
  const delivery = await findDelivery(deliveryId);
  if (!delivery || SENT_STATUSES.includes(delivery.status)) return delivery;
  const saved = await saveDelivery({ ...delivery, status: 'Cancelled' });
  await saveDeliveryHistory(saved, 'Cancelled', nowIso(), saved.failureCode);
  await recordWhatsAppCrmHistory(saved, 'cancel', { status: 'Cancelled' });
  return saved;
}

async function getWhatsAppDeliveryStatus(notificationId) {
  const deliveries = await readDeliveriesWithFallback();
  return deliveries.find((delivery) => delivery.notificationId === notificationId) || null;
}

async function getTemplateConfiguration() {
  return readTemplatesWithFallback();
}

async function getDeliveryHistory(deliveryId) {
  const history = await readHistoryWithFallback();
  return history.filter((item) => item.deliveryId === deliveryId);
}

async function getAllWhatsAppDeliveries() {
  return readDeliveriesWithFallback();
}

async function getAllWhatsAppDeliveryHistory() {
  return readHistoryWithFallback();
}

module.exports = {
  cancelWhatsAppDelivery,
  createWhatsAppDelivery,
  getAllWhatsAppDeliveries,
  getAllWhatsAppDeliveryHistory,
  getTemplateConfiguration,
  getDeliveryHistory,
  getWhatsAppDeliveryStatus,
  processPendingWhatsAppDeliveries,
  retryFailedWhatsAppDelivery,
  sendWhatsAppSessionMessage,
  sendWhatsAppTemplateMessage,
  updateDeliveryStatusFromWebhook,
};
