const communityService = require('../community/community.service');
const documentService = require('../documents/document.service');
const housingService = require('../housing/housing.service');
const jobService = require('../jobs/job.service');
const moneyService = require('../money/money.service');
const { crmAgentService } = require('../crm-agent');
const telegramDeliveryService = require('../telegram/telegram-delivery.service');
const whatsappDeliveryService = require('../whatsapp/whatsapp-delivery.service');
const lineDeliveryService = require('../line/line-delivery.service');
const notificationRepository = require('./notification.repository');
const {
  NOTIFICATION_PRIORITIES,
  NOTIFICATION_STATUSES,
  NOTIFICATION_TYPES,
} = require('./notification.model');

const memoryNotifications = [];

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function normalize(value) {
  return cleanText(value).toLowerCase();
}

function generateId(prefix) {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${timestamp}_${random}`;
}

function isEnabled(value) {
  return cleanText(value) !== 'No';
}

function isYes(value) {
  return cleanText(value) === 'Yes' || value === true;
}

function isDue(notification = {}, now = new Date()) {
  if (!notification.scheduledAt) return true;
  const scheduled = new Date(notification.scheduledAt);
  return Number.isNaN(scheduled.getTime()) || scheduled <= now;
}

function preferenceForType(type) {
  const byType = {
    'Job Match': 'jobNotifications',
    'Housing Match': 'housingNotifications',
    'Document Expiry': 'documentNotifications',
    'Missing Document': 'documentNotifications',
    'Exchange Rate': 'moneyNotifications',
    'Money Transfer': 'moneyNotifications',
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

async function recordNotificationEvent(notification = {}, eventType = '') {
  if (!notification.userId || !eventType) return null;
  try {
    return await crmAgentService.saveConversation({
      userId: notification.userId,
      channel: 'internal',
      question: `Notification ${eventType}: ${notification.type}`,
      answer: cleanText(notification.title),
      category: 'Notifications',
      status: eventType.toUpperCase(),
      needsHumanFollowUp: false,
    });
  } catch (error) {
    return null;
  }
}

function buildNotification(input = {}) {
  const now = new Date().toISOString();
  const notification = {
    notificationId: cleanText(input.notificationId) || generateId('notif'),
    userId: cleanText(input.userId),
    type: cleanText(input.type),
    title: cleanText(input.title),
    message: cleanText(input.message),
    sourceModule: cleanText(input.sourceModule),
    sourceRecordId: cleanText(input.sourceRecordId),
    priority: cleanText(input.priority) || 'Normal',
    status: cleanText(input.status) || 'New',
    actionLabel: cleanText(input.actionLabel),
    actionUrl: cleanText(input.actionUrl),
    scheduledAt: cleanText(input.scheduledAt),
    createdAt: cleanText(input.createdAt) || now,
    readAt: cleanText(input.readAt),
    dismissedAt: cleanText(input.dismissedAt),
    expiresAt: cleanText(input.expiresAt),
  };

  if (!NOTIFICATION_TYPES.includes(notification.type)) notification.type = 'System';
  if (!NOTIFICATION_PRIORITIES.includes(notification.priority)) notification.priority = 'Normal';
  if (!NOTIFICATION_STATUSES.includes(notification.status)) notification.status = 'New';
  return notification;
}

function validateNotification(notification) {
  const errors = [];
  if (!notification.userId) errors.push('userId is required.');
  if (!notification.title) errors.push('title is required.');
  if (!notification.message) errors.push('message is required.');
  return errors;
}

function validationError(details) {
  const error = new Error('Notification validation failed.');
  error.statusCode = 400;
  error.details = details;
  return error;
}

async function readNotificationsWithFallback() {
  try {
    const notifications = await notificationRepository.findAllNotifications();
    const byId = new Map(notifications.map((notification) => [notification.notificationId, notification]));
    memoryNotifications.forEach((notification) => byId.set(notification.notificationId, notification));
    return Array.from(byId.values());
  } catch (error) {
    return [...memoryNotifications];
  }
}

function isDuplicate(existing = [], notification = {}) {
  return existing.some(
    (item) =>
      item.userId === notification.userId &&
      item.type === notification.type &&
      cleanText(item.sourceRecordId) &&
      item.sourceRecordId === notification.sourceRecordId
  );
}

async function createNotification(input = {}) {
  const notification = buildNotification(input);
  const errors = validateNotification(notification);
  if (errors.length) throw validationError(errors);
  const existing = await readNotificationsWithFallback();
  const duplicate = isDuplicate(existing, notification);
  if (duplicate) {
    return existing.find(
      (item) => item.userId === notification.userId && item.type === notification.type && item.sourceRecordId === notification.sourceRecordId
    );
  }

  try {
    const saved = await notificationRepository.createNotification(notification);
    await recordNotificationEvent(saved, 'created');
    await telegramDeliveryService.createTelegramDelivery(saved).catch(() => null);
    await whatsappDeliveryService.createWhatsAppDelivery(saved).catch(() => null);
    await lineDeliveryService.createLineDelivery(saved).catch(() => null);
    return saved;
  } catch (error) {
    memoryNotifications.push(notification);
    await recordNotificationEvent(notification, 'created');
    await telegramDeliveryService.createTelegramDelivery(notification).catch(() => null);
    await whatsappDeliveryService.createWhatsAppDelivery(notification).catch(() => null);
    await lineDeliveryService.createLineDelivery(notification).catch(() => null);
    return notification;
  }
}

function notificationPassesFilters(notification, filters = {}) {
  if (filters.status && notification.status !== filters.status) return false;
  if (filters.unread && notification.status !== 'New') return false;
  if (filters.type && notification.type !== filters.type) return false;
  if (filters.sourceModule && normalize(notification.sourceModule) !== normalize(filters.sourceModule)) return false;
  return true;
}

async function getUserNotifications(userId, filters = {}) {
  await expireOldNotifications();
  const notifications = await readNotificationsWithFallback();
  const now = new Date();
  return notifications
    .filter((notification) => notification.userId === userId)
    .filter((notification) => filters.includeScheduled || isDue(notification, now))
    .filter((notification) => notificationPassesFilters(notification, filters))
    .sort((a, b) => {
      if (a.status === 'New' && b.status !== 'New') return -1;
      if (a.status !== 'New' && b.status === 'New') return 1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
}

async function getUnreadCount(userId) {
  const notifications = await getUserNotifications(userId, { unread: true });
  return notifications.length;
}

async function updateNotificationStatus(notificationId, status, extra = {}) {
  const notifications = await readNotificationsWithFallback();
  const existing = notifications.find((notification) => notification.notificationId === notificationId);
  if (!existing) return null;
  const now = new Date().toISOString();
  const updated = {
    ...existing,
    ...extra,
    status,
    readAt: status === 'Read' ? now : existing.readAt,
    dismissedAt: status === 'Dismissed' ? now : existing.dismissedAt,
  };

  try {
    const saved = (await notificationRepository.updateNotification(notificationId, updated)) || updated;
    await recordNotificationEvent(saved, status.toLowerCase());
    return saved;
  } catch (error) {
    const index = memoryNotifications.findIndex((notification) => notification.notificationId === notificationId);
    if (index >= 0) memoryNotifications[index] = updated;
    else memoryNotifications.push(updated);
    await recordNotificationEvent(updated, status.toLowerCase());
    return updated;
  }
}

async function markAsRead(notificationId) {
  return updateNotificationStatus(notificationId, 'Read');
}

async function dismissNotification(notificationId) {
  return updateNotificationStatus(notificationId, 'Dismissed');
}

async function completeNotification(notificationId) {
  return updateNotificationStatus(notificationId, 'Completed');
}

async function expireOldNotifications() {
  const notifications = await readNotificationsWithFallback();
  const now = new Date();
  const expired = [];
  for (const notification of notifications) {
    if (
      notification.expiresAt &&
      notification.status !== 'Expired' &&
      notification.status !== 'Dismissed' &&
      new Date(notification.expiresAt) < now
    ) {
      expired.push(await updateNotificationStatus(notification.notificationId, 'Expired'));
    }
  }
  return expired.filter(Boolean);
}

async function processScheduledNotifications() {
  await expireOldNotifications();
  const notifications = await readNotificationsWithFallback();
  const now = new Date();
  const due = notifications.filter(
    (notification) => notification.scheduledAt && notification.status === 'New' && isDue(notification, now)
  );
  for (const notification of due) {
    await recordNotificationEvent(notification, 'displayed');
  }
  return due;
}

async function rescheduleNotification(notificationId, days = 1) {
  const notifications = await readNotificationsWithFallback();
  const existing = notifications.find((notification) => notification.notificationId === notificationId);
  if (!existing) return null;
  const scheduledDate = new Date();
  scheduledDate.setUTCDate(scheduledDate.getUTCDate() + Number(days || 1));
  const scheduledAt = scheduledDate.toISOString();
  const reminder = await createNotification({
    ...existing,
    notificationId: generateId('notif_reminder'),
    title: `Reminder: ${existing.title}`,
    scheduledAt,
    createdAt: new Date().toISOString(),
    readAt: '',
    dismissedAt: '',
    status: 'New',
    sourceRecordId: `${existing.sourceRecordId || existing.notificationId}_reminder_${scheduledAt.slice(0, 10)}`,
  });
  const current = await updateNotificationStatus(notificationId, 'Completed');
  await recordNotificationEvent(reminder, 'rescheduled');
  return { current, reminder };
}

async function cancelScheduledNotification(notificationId) {
  return updateNotificationStatus(notificationId, 'Dismissed');
}

async function createNotificationsFromExistingModules(userId, userProfile = {}) {
  const created = [];

  if (isYes(userProfile.lookingForJob) && isYes(userProfile.wantsJobAlerts) && isEnabled(userProfile.jobNotifications)) {
    const jobs = await jobService.findMatchingJobs(userProfile);
    for (const job of jobs.slice(0, 3)) {
      created.push(
        await createNotification({
          userId,
          type: 'Job Match',
          title: 'New job match',
          message: `${job.title} in ${job.city}. ${job.salaryText || ''}`.trim(),
          sourceModule: 'Jobs',
          sourceRecordId: job.jobId,
          priority: 'High',
          actionLabel: 'View Jobs',
          actionUrl: '#jobs',
        })
      );
    }
  }

  if (isYes(userProfile.lookingForHousing) && isEnabled(userProfile.housingNotifications)) {
    const listings = await housingService.findMatchingHousing(userProfile);
    for (const listing of listings.slice(0, 3)) {
      created.push(
        await createNotification({
          userId,
          type: 'Housing Match',
          title: 'New housing match',
          message: `${listing.title} in ${listing.city}. ${listing.monthlyPrice} NIS monthly.`,
          sourceModule: 'Housing',
          sourceRecordId: listing.housingId,
          priority: 'High',
          actionLabel: 'View Housing',
          actionUrl: '#housing',
        })
      );
    }
  }

  if (isEnabled(userProfile.documentNotifications)) {
    const documents = await documentService.getUserDocuments(userId);
    const alerts = documentService.createDocumentAlerts(userProfile, documents, 10);
    for (const alert of alerts) {
      created.push(
        await createNotification({
          userId,
          type: alert.type === 'Missing' ? 'Missing Document' : 'Document Expiry',
          title: alert.documentType,
          message: alert.message,
          sourceModule: 'Documents',
          sourceRecordId: alert.documentId || alert.documentType,
          priority: alert.type === 'Expired' ? 'Urgent' : 'High',
          actionLabel: alert.documentId ? 'View Document' : 'Add Document',
          actionUrl: '#documents',
        })
      );
    }
  }

  if (isYes(userProfile.wantsExchangeRateAlerts) && userProfile.preferredCurrency && isEnabled(userProfile.moneyNotifications)) {
    const rate = await moneyService.getExchangeRate('ILS', userProfile.preferredCurrency);
    if (rate) {
      created.push(
        await createNotification({
          userId,
          type: 'Exchange Rate',
          title: 'Exchange rate update',
          message: `Demo rate: 1 ILS = ${rate.exchangeRate} ${rate.targetCurrency}. Demo data - not a live rate.`,
          sourceModule: 'Money',
          sourceRecordId: `${rate.sourceCurrency}_${rate.targetCurrency}`,
          priority: 'Normal',
          actionLabel: 'View Money',
          actionUrl: '#money',
        })
      );
    }
  }

  if (isEnabled(userProfile.communityNotifications)) {
    const posts = await communityService.getRelevantPosts(userProfile);
    for (const post of posts.slice(0, 3)) {
      created.push(
        await createNotification({
          userId,
          type: 'Community Update',
          title: post.title,
          message: `${post.category}. ${post.relevance?.reason || 'Relevant community update'}.`,
          sourceModule: 'Community',
          sourceRecordId: post.postId,
          priority: 'Normal',
          actionLabel: 'Open Community',
          actionUrl: '#community',
        })
      );
    }
  }

  return created.filter(Boolean);
}

function summarizeUnread(notifications = []) {
  const unread = notifications.filter((notification) => notification.status === 'New');
  const counts = unread.reduce((acc, notification) => {
    const key = notification.type;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts)
    .slice(0, 4)
    .map(([type, count]) => ({ type, count }));
}

async function getAllNotifications(filters = {}) {
  await expireOldNotifications();
  const notifications = await readNotificationsWithFallback();
  return notifications
    .filter((notification) => notificationPassesFilters(notification, filters))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function buildAdminSummary(notifications = []) {
  const unread = notifications.filter((notification) => notification.status === 'New' && isDue(notification));
  const scheduledDueToday = notifications.filter(
    (notification) =>
      notification.scheduledAt &&
      notification.status === 'New' &&
      new Date(notification.scheduledAt).toISOString().slice(0, 10) === todayKey()
  );
  const unreadByType = unread.reduce((acc, notification) => {
    acc[notification.type] = (acc[notification.type] || 0) + 1;
    return acc;
  }, {});
  const dismissedByType = notifications
    .filter((notification) => notification.status === 'Dismissed')
    .reduce((acc, notification) => {
      acc[notification.type] = (acc[notification.type] || 0) + 1;
      return acc;
    }, {});
  const openedByType = notifications
    .filter((notification) => notification.status === 'Read' || notification.status === 'Completed')
    .reduce((acc, notification) => {
      acc[notification.type] = (acc[notification.type] || 0) + 1;
      return acc;
    }, {});
  const unreadByUser = unread.reduce((acc, notification) => {
    acc[notification.userId] = (acc[notification.userId] || 0) + 1;
    return acc;
  }, {});
  const opened = notifications.filter((notification) => notification.status === 'Read' || notification.status === 'Completed').length;
  const created = notifications.length;

  return {
    notificationsCreated: created,
    unreadNotifications: unread.length,
    notificationOpenRate: created ? `${Math.round((opened / created) * 100)}%` : '0%',
    dismissedNotifications: notifications.filter((notification) => notification.status === 'Dismissed').length,
    urgentNotifications: notifications.filter((notification) => notification.priority === 'Urgent' && notification.status === 'New'),
    unreadByType,
    expiredScheduledNotifications: notifications.filter((notification) => notification.status === 'Expired' && notification.scheduledAt),
    usersWithManyUnread: Object.entries(unreadByUser)
      .filter(([, count]) => count >= 3)
      .map(([userId, count]) => ({ userId, count })),
    mostIgnoredNotificationTypes: dismissedByType,
    mostOpenedNotificationTypes: openedByType,
    topNotificationCategories: unreadByType,
    usersWithNoEngagement: Object.entries(unreadByUser)
      .filter(([, count]) => count >= 3)
      .map(([userId]) => userId),
    scheduledNotificationsDueToday: scheduledDueToday,
  };
}

async function createManualNotifications(profiles = [], input = {}) {
  const type = cleanText(input.type) || 'System';
  const target = input.target || {};
  const activeGoal = normalize(target.activeGoal);
  const matches = profiles.filter((profile) => {
    if (target.userId && profile.userId !== target.userId) return false;
    if (target.country && normalize(profile.country) !== normalize(target.country)) return false;
    if (target.language && normalize(profile.preferredLanguage || profile.language) !== normalize(target.language)) return false;
    if (target.sector && normalize(profile.workSector) !== normalize(target.sector)) return false;
    if (target.city && normalize(profile.city) !== normalize(target.city)) return false;
    if (activeGoal && !normalize(profile.activeGoals).includes(activeGoal)) return false;
    return respectsPreference(profile, type);
  });

  const created = [];
  for (const profile of matches) {
    created.push(
      await createNotification({
        userId: profile.userId,
        type,
        title: input.title,
        message: `${cleanText(input.message)} Delivery is inside Gringo only.`.trim(),
        sourceModule: 'Admin',
        sourceRecordId: cleanText(input.sourceRecordId) || generateId('admin_notice'),
        priority: input.priority || 'Normal',
        actionLabel: input.actionLabel,
        actionUrl: input.actionUrl,
        scheduledAt: input.scheduledAt,
        expiresAt: input.expiresAt,
      })
    );
  }
  return created.filter(Boolean);
}

module.exports = {
  completeNotification,
  cancelScheduledNotification,
  createNotification,
  createManualNotifications,
  createNotificationsFromExistingModules,
  dismissNotification,
  expireOldNotifications,
  getAllNotifications,
  getUnreadCount,
  getUserNotifications,
  markAsRead,
  processScheduledNotifications,
  rescheduleNotification,
  respectsPreference,
  buildAdminSummary,
  summarizeUnread,
};
