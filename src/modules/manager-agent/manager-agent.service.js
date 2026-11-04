const managerRepository = require('./manager-agent.repository');
const { redactContactDetails } = require('../ai-provider/gringo-prompt.service');
// Lazy: privacy.service loads CRM modules that load this one.
const privacyService = { allowsProcessingForUser: (userId) => require('../privacy/privacy.service').allowsProcessingForUser(userId) };
const notificationService = require('../notifications/notification.service');
const taskService = require('../tasks/task.service');
const { translationMetricsService } = require('../translation');
const lineDeliveryService = require('../line/line-delivery.service');
const { whatsappDeliveryService } = require('../whatsapp');

function generateId(prefix) {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${timestamp}_${random}`;
}

function toDateKey(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function isWithinDateRange(value, startDate, endDate) {
  const dateKey = toDateKey(value);
  if (!dateKey) return false;
  if (startDate && dateKey < startDate) return false;
  if (endDate && dateKey > endDate) return false;
  return true;
}

function countBy(items, getKey) {
  return items.reduce((counts, item) => {
    const key = getKey(item);
    if (!key) return counts;
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function topCounts(counts, limit = 5) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => `${label} (${count})`)
    .join(', ');
}

function splitList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function includesAny(value, terms) {
  const normalized = String(value || '').toLowerCase();
  return terms.some((term) => normalized.includes(term));
}

function percent(part, total) {
  if (!total) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}

function getDailyRange(options = {}) {
  const reportDate = options.reportDate || new Date().toISOString().slice(0, 10);
  return {
    reportDate,
    startDate: reportDate,
    endDate: reportDate,
  };
}

function getWeeklyRange(options = {}) {
  if (options.weekStart && options.weekEnd) {
    return {
      weekStart: options.weekStart,
      weekEnd: options.weekEnd,
    };
  }

  const today = new Date();
  const day = today.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  return {
    weekStart: monday.toISOString().slice(0, 10),
    weekEnd: sunday.toISOString().slice(0, 10),
  };
}

// Reports have no owner column, so deletion cannot reach them. To keep a
// single worker's words out of them, question text is redacted and a
// question is listed only when at least REPORT_MIN_QUESTION_COUNT
// conversations asked it (default 2).
const REPORT_MIN_QUESTION_COUNT = Math.max(1, Number(process.env.REPORT_MIN_QUESTION_COUNT || 2));

function summarizeQuestions(conversations) {
  const counts = countBy(conversations, (event) => redactContactDetails(String(event.question || '').trim().slice(0, 120)));
  const shared = Object.fromEntries(Object.entries(counts).filter(([label, count]) => label && count >= REPORT_MIN_QUESTION_COUNT));
  return topCounts(shared, 5);
}

// Only conversations and profiles of users who allow processing (consent,
// not deletion_pending) are counted. Fails closed per user.
async function filterByConsent(records) {
  const decisions = new Map();
  const kept = [];
  for (const record of records) {
    const userId = String(record.userId || '');
    if (!userId) continue;
    if (!decisions.has(userId)) {
      let allowed = false;
      try {
        allowed = await privacyService.allowsProcessingForUser(userId);
      } catch (error) {
        allowed = false;
      }
      decisions.set(userId, allowed);
    }
    if (decisions.get(userId)) kept.push(record);
  }
  return kept;
}

function summarizeCategories(conversations) {
  return topCounts(countBy(conversations, (event) => event.category || 'Other'), 5);
}

function summarizeJobs(conversations) {
  const jobQuestions = conversations.filter((event) =>
    includesAny(`${event.question} ${event.category}`, ['job', 'work', 'worker', 'profession'])
  );
  return summarizeQuestions(jobQuestions);
}

function summarizeServices(conversations) {
  const serviceQuestions = conversations.filter((event) =>
    includesAny(`${event.question} ${event.category}`, [
      'service',
      'doctor',
      'clinic',
      'lawyer',
      'sim',
      'transport',
      'insurance',
      'embassy',
      'government',
    ])
  );
  return summarizeQuestions(serviceQuestions);
}

function summarizeLocations(userProfiles, conversations) {
  const profileLocations = countBy(userProfiles, (profile) => profile.city);
  const locationMentions = countBy(conversations, (event) => {
    const question = String(event.question || '').toLowerCase();
    if (question.includes('tel aviv')) return 'Tel Aviv';
    if (question.includes('jerusalem')) return 'Jerusalem';
    if (question.includes('haifa')) return 'Haifa';
    if (question.includes('eilat')) return 'Eilat';
    return '';
  });

  return topCounts({ ...profileLocations, ...locationMentions }, 5);
}

function getMissingKnowledgeTopics(conversations) {
  const missing = conversations.filter((event) => String(event.status).toUpperCase() === 'NOT_FOUND');
  return topCounts(countBy(missing, (event) => event.category || event.question), 5);
}

function getNeedsHumanCount(conversations) {
  return conversations.filter(
    (event) =>
      String(event.status).toUpperCase() === 'NEEDS_HUMAN' ||
      String(event.needsHumanFollowUp).toLowerCase() === 'true'
  ).length;
}

function extractReceivedAt(event = {}) {
  const match = String(event.question || '').match(/receivedAt:([^;\]]+)/i);
  if (!match) return null;
  const receivedAt = new Date(match[1]).getTime();
  return Number.isNaN(receivedAt) ? null : receivedAt;
}

function averageWhatsAppResponseTime(conversations = []) {
  const durations = conversations
    .map((event) => {
      const receivedAt = extractReceivedAt(event);
      const repliedAt = new Date(event.createdAt).getTime();
      if (!receivedAt || Number.isNaN(repliedAt) || repliedAt < receivedAt) return null;
      return repliedAt - receivedAt;
    })
    .filter((duration) => duration !== null);
  if (!durations.length) return 'Not available';
  const averageMs = durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
  const seconds = Math.round(averageMs / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.round(seconds / 60)}m`;
}

function averageLineResponseTime(conversations = []) {
  const durations = conversations
    .map((event) => {
      const receivedAt = extractReceivedAt(event);
      const repliedAt = new Date(event.createdAt).getTime();
      if (!receivedAt || Number.isNaN(repliedAt) || repliedAt < receivedAt) return null;
      return repliedAt - receivedAt;
    })
    .filter((duration) => duration !== null);
  if (!durations.length) return 'Not available';
  const averageMs = durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
  const seconds = Math.round(averageMs / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.round(seconds / 60)}m`;
}

function summarizeWhatsAppCommands(conversations = []) {
  const commandCounts = countBy(conversations, (event) => {
    const text = String(event.question || '').trim().replace(/^\//, '').split(/\s+/)[0].toLowerCase();
    return ['start', 'help', 'link', 'profile', 'jobs', 'housing', 'money', 'community', 'services', 'documents', 'notifications', 'tasks'].includes(text)
      ? text
      : '';
  });
  return topCounts(commandCounts, 5) || 'None';
}

function summarizeWhatsAppActions(conversations = []) {
  const actionCounts = countBy(conversations, (event) => {
    const status = String(event.status || '');
    if (status.startsWith('WHATSAPP_ACTION_')) return status.replace('WHATSAPP_ACTION_', '').toLowerCase();
    const adminEvent = String(event.question || '').match(/WhatsApp admin event:\s*(.+)$/i);
    return adminEvent ? adminEvent[1].toLowerCase() : '';
  });
  return topCounts(actionCounts, 5) || 'None';
}

function summarizeLineCommands(conversations = []) {
  const commandCounts = countBy(conversations, (event) => {
    const text = String(event.question || '').trim().replace(/^\//, '').split(/\s+/)[0].toLowerCase();
    return ['help', 'link', 'unlink', 'profile', 'jobs', 'housing', 'money', 'community', 'services', 'documents', 'notifications', 'tasks'].includes(text)
      ? text
      : '';
  });
  return topCounts(commandCounts, 5) || 'None';
}

function summarizeLineActions(conversations = []) {
  const actionCounts = countBy(conversations, (event) => {
    const status = String(event.status || '');
    const text = String(event.question || '');
    if (text.startsWith('LINE action:')) return text.replace(/^LINE action:\s*/i, '').split(':')[0].toLowerCase();
    if (status.startsWith('LINE_DUPLICATE_ACTION_')) return 'duplicate action prevented';
    if (status.startsWith('LINE_ACTION_')) return status.replace('LINE_ACTION_', '').toLowerCase();
    return '';
  });
  return topCounts(actionCounts, 5) || 'None';
}

function buildWhatsAppReportStats(userProfiles = [], conversations = [], deliveries = []) {
  const whatsappConversations = conversations.filter((event) => event.channel === 'whatsapp');
  const connectedUsers = userProfiles.filter((profile) => profile.whatsappPhone);
  const activeUsers = new Set(whatsappConversations.map((event) => event.userId).filter(Boolean));
  const successfulDeliveries = deliveries.filter((delivery) => ['Sent', 'Delivered', 'Read'].includes(delivery.status));
  const failedDeliveries = deliveries.filter((delivery) => delivery.status === 'Failed');
  const retryCount = deliveries.reduce((sum, delivery) => sum + Number(delivery.retryCount || 0), 0);

  return {
    whatsappConnectedUsers: connectedUsers.length,
    whatsappActiveUsers: activeUsers.size,
    whatsappMessagesReceived: whatsappConversations.filter((event) => !String(event.question).startsWith('WhatsApp admin event:')).length,
    whatsappMessagesSent: successfulDeliveries.length,
    whatsappSessionMessages: deliveries.filter((delivery) => delivery.deliveryMode === 'Session Message').length,
    whatsappTemplateMessages: deliveries.filter((delivery) => delivery.deliveryMode === 'Template Message').length,
    whatsappSuccessRate: percent(successfulDeliveries.length, deliveries.length),
    whatsappFailedDeliveries: failedDeliveries.length,
    whatsappRetryStatistics: `${retryCount} retries across ${deliveries.length} deliveries`,
    whatsappAverageResponseTime: averageWhatsAppResponseTime(whatsappConversations),
    whatsappMostCommonCommands: summarizeWhatsAppCommands(whatsappConversations),
    whatsappMostCommonActions: summarizeWhatsAppActions(whatsappConversations),
  };
}

function buildLineReportStats(userProfiles = [], conversations = [], deliveries = []) {
  const lineConversations = conversations.filter((event) => event.channel === 'line');
  const connectedUsers = userProfiles.filter(
    (profile) => profile.lineUserId && String(profile.lineLinkStatus || 'Connected') === 'Connected'
  );
  const activeUsers = new Set(lineConversations.map((event) => event.userId).filter(Boolean));
  const successfulDeliveries = deliveries.filter((delivery) => ['Sent', 'Delivered', 'Read'].includes(delivery.status));
  const failedDeliveries = deliveries.filter((delivery) => delivery.status === 'Failed');

  return {
    lineConnectedUsers: connectedUsers.length,
    lineDailyActiveUsers: activeUsers.size,
    lineMessagesReceived: lineConversations.length,
    lineMessagesSent: successfulDeliveries.length,
    lineNotificationSuccessRate: percent(successfulDeliveries.length, deliveries.length),
    lineFailedDeliveries: failedDeliveries.length,
    lineAverageResponseTime: averageLineResponseTime(lineConversations),
    lineMostUsedCommands: summarizeLineCommands(lineConversations),
    lineMostUsedActions: summarizeLineActions(lineConversations),
  };
}

function createDailyReport({
  reportDate,
  conversations,
  userProfiles,
  notifications = [],
  tasks = [],
  taskHistory = [],
  whatsappDeliveries = [],
  lineDeliveries = [],
}) {
  const unansweredQuestions = conversations.filter((event) => String(event.status).toUpperCase() === 'NOT_FOUND');
  const newUsers = userProfiles.filter((profile) => toDateKey(profile.createdAt) === reportDate);
  const activeUserIds = new Set(conversations.map((event) => event.userId).filter(Boolean));
  const activeGoals = userProfiles.flatMap((profile) => splitList(profile.activeGoals));
  const completedGoals = userProfiles.flatMap((profile) => splitList(profile.completedGoals));
  const missingRequiredDocuments = userProfiles.flatMap((profile) => splitList(profile.missingDocumentTypes));
  const notificationSummary = notificationService.buildAdminSummary(notifications);
  const taskStats = taskService.getTaskStatistics(tasks, taskHistory);
  const whatsappStats = buildWhatsAppReportStats(userProfiles, conversations, whatsappDeliveries);
  const lineStats = buildLineReportStats(userProfiles, conversations, lineDeliveries);
  const translationMetrics = translationMetricsService.getMetrics();

  return {
    reportId: generateId('daily'),
    reportDate,
    totalConversations: conversations.length,
    newUsers: newUsers.length,
    activeUsers: activeUserIds.size,
    mostCommonQuestions: summarizeQuestions(conversations),
    topCategories: summarizeCategories(conversations),
    unansweredQuestions: unansweredQuestions.length,
    needsHumanQuestions: getNeedsHumanCount(conversations),
    missingKnowledgeTopics: getMissingKnowledgeTopics(conversations),
    mostRequestedJobs: summarizeJobs(conversations),
    mostRequestedServices: summarizeServices(conversations),
    mostRequestedLocations: summarizeLocations(userProfiles, conversations),
    moneyTransferRequests: conversations.filter((event) =>
      includesAny(`${event.question} ${event.category}`, ['money', 'transfer'])
    ).length,
    exchangeRateRequests: conversations.filter((event) =>
      includesAny(`${event.question} ${event.category}`, ['exchange', 'rate'])
    ).length,
    usersLookingForWork: userProfiles.filter((profile) => String(profile.lookingForJob).toLowerCase() === 'yes').length,
    usersLookingForHousing: userProfiles.filter((profile) => String(profile.lookingForHousing).toLowerCase() === 'yes').length,
    completedGoals: topCounts(countBy(completedGoals, (goal) => goal), 5),
    repeatedIgnoredRecommendations: conversations.filter((event) =>
      includesAny(`${event.question} ${event.answer} ${event.status}`, ['no longer need', 'stop alert', 'ignored recommendation'])
    ).length,
    mostCommonActiveGoals: topCounts(countBy(activeGoals, (goal) => goal), 5),
    expiringDocuments: userProfiles.reduce((sum, profile) => sum + Number(profile.expiringDocumentCount || 0), 0),
    expiredDocuments: userProfiles.reduce((sum, profile) => sum + Number(profile.expiredDocumentCount || 0), 0),
    missingRequiredDocuments: topCounts(countBy(missingRequiredDocuments, (documentType) => documentType), 5),
    completedRenewals: conversations.filter((event) =>
      includesAny(`${event.question} ${event.answer} ${event.status}`, ['renewed', 'document renewal', 'mark as renewed'])
    ).length,
    notificationsCreated: notificationSummary.notificationsCreated,
    unreadNotifications: notificationSummary.unreadNotifications,
    notificationOpenRate: notificationSummary.notificationOpenRate,
    dismissedNotifications: notificationSummary.dismissedNotifications,
    urgentNotifications: notificationSummary.urgentNotifications.length,
    topNotificationCategories: topCounts(notificationSummary.topNotificationCategories, 5),
    usersWithNoEngagement: notificationSummary.usersWithNoEngagement.length,
    scheduledNotificationsDueToday: notificationSummary.scheduledNotificationsDueToday.length,
    tasksCreated: taskStats.tasksCreated,
    tasksCompleted: taskStats.tasksCompleted,
    overdueTasks: taskStats.overdueTasks,
    taskCompletionRate: taskStats.taskCompletionRate,
    mostCommonTaskCategories: taskStats.mostCommonTaskCategories,
    usersWithRepeatedOverdueTasks: taskStats.usersWithRepeatedOverdueTasks,
    tasksGeneratedFromDocuments: taskStats.tasksGeneratedFromDocuments,
    tasksGeneratedFromAdmin: taskStats.tasksGeneratedFromAdmin,
    ...whatsappStats,
    ...lineStats,
    translationRequests: translationMetrics.translationRequests,
    translationSuccesses: translationMetrics.successfulTranslations,
    translationFailures: translationMetrics.failedTranslations,
    translationCacheHits: translationMetrics.cacheHits,
    translationCacheMisses: translationMetrics.cacheMisses,
    translationAverageLatencyMs: translationMetrics.averageLatencyMs,
    translationProviderLatencyMs: translationMetrics.providerLatencyMs,
    createdAt: new Date().toISOString(),
  };
}

async function readRows(read) {
  try {
    const rows = await read();
    const records = Array.isArray(rows) ? rows : [];
    return { records, state: records.length ? 'ok' : 'empty' };
  } catch (error) {
    return { records: [], state: 'unavailable' };
  }
}

function unavailableReportError() {
  const error = new Error('This service is unavailable right now.');
  error.statusCode = 503;
  error.code = 'UNAVAILABLE';
  error.details = [];
  return error;
}

async function generateDailySummary(options = {}) {
  const { reportDate, startDate, endDate } = getDailyRange(options);
  const [
    conversationResult,
    profileResult,
    allNotifications,
    taskResult,
    historyResult,
    allWhatsAppDeliveries,
    allLineDeliveries,
  ] = await Promise.all([
    readRows(() => managerRepository.readConversationHistory()),
    readRows(() => managerRepository.readUserProfiles()),
    notificationService.getAllNotifications().catch(() => []),
    taskService.getReportTasks().catch(() => null),
    taskService.getReportTaskHistory().catch(() => null),
    whatsappDeliveryService.getAllWhatsAppDeliveries().catch(() => []),
    lineDeliveryService.getAllLineDeliveries().catch(() => []),
  ]);
  if (
    conversationResult.state === 'unavailable' ||
    profileResult.state === 'unavailable' ||
    !Array.isArray(taskResult) ||
    taskResult.catalogState === 'unavailable' ||
    !Array.isArray(historyResult) ||
    historyResult.catalogState === 'unavailable'
  ) {
    throw unavailableReportError();
  }
  const allConversations = await filterByConsent(conversationResult.records.filter((event) => event.userId !== 'usr_somchai'));
  const allUserProfiles = await filterByConsent(profileResult.records.filter((profile) => profile.userId !== 'usr_somchai' && profile.demo !== true));
  const conversations = allConversations.filter((event) => isWithinDateRange(event.createdAt, startDate, endDate));
  const userProfiles = allUserProfiles.filter((profile) =>
    isWithinDateRange(profile.lastInteractionAt || profile.createdAt, startDate, endDate)
  );
  const notifications = allNotifications.filter((notification) => isWithinDateRange(notification.createdAt, startDate, endDate));
  const allTasks = taskResult;
  const allTaskHistory = historyResult;
  const tasks = allTasks.filter((task) => isWithinDateRange(task.createdAt || task.updatedAt || task.dueDate, startDate, endDate));
  const taskHistory = allTaskHistory.filter((event) => isWithinDateRange(event.createdAt, startDate, endDate));
  const whatsappDeliveries = allWhatsAppDeliveries.filter((delivery) =>
    isWithinDateRange(delivery.createdAt || delivery.attemptedAt || delivery.updatedAt, startDate, endDate)
  );
  const lineDeliveries = allLineDeliveries.filter((delivery) =>
    isWithinDateRange(delivery.createdAt || delivery.attemptedAt || delivery.updatedAt, startDate, endDate)
  );
  const report = createDailyReport({
    reportDate,
    conversations,
    userProfiles,
    notifications,
    tasks,
    taskHistory,
    whatsappDeliveries,
    lineDeliveries,
  });

  return managerRepository.saveDailyReport(report);
}

async function generateWeeklySummary(options = {}) {
  const { weekStart, weekEnd } = getWeeklyRange(options);
  const [conversationResult, profileResult] = await Promise.all([
    readRows(() => managerRepository.readConversationHistory()),
    readRows(() => managerRepository.readUserProfiles()),
  ]);
  if (conversationResult.state === 'unavailable' || profileResult.state === 'unavailable') {
    throw unavailableReportError();
  }
  const allConversations = await filterByConsent(conversationResult.records.filter((event) => event.userId !== 'usr_somchai'));
  const allUserProfiles = profileResult.records.filter((profile) => profile.userId !== 'usr_somchai' && profile.demo !== true);
  const conversations = allConversations.filter((event) => isWithinDateRange(event.createdAt, weekStart, weekEnd));
  const users = allUserProfiles.filter((profile) => isWithinDateRange(profile.createdAt, weekStart, weekEnd));
  const report = {
    reportId: generateId('weekly'),
    weekStart,
    weekEnd,
    growth: `${users.length} new users, ${conversations.length} conversations`,
    trends: summarizeCategories(conversations) || 'No trends yet',
    recurringProblems: getMissingKnowledgeTopics(conversations) || 'No recurring problems yet',
    communityOpportunities: [
      summarizeJobs(conversations) || 'No clear job opportunities yet',
      `Users looking for work: ${users.filter((profile) => String(profile.lookingForJob).toLowerCase() === 'yes').length}`,
      `Users looking for housing: ${users.filter((profile) => String(profile.lookingForHousing).toLowerCase() === 'yes').length}`,
      `Most common active goals: ${topCounts(countBy(users.flatMap((profile) => splitList(profile.activeGoals)), (goal) => goal), 5) || 'None yet'}`,
    ].join('; '),
    createdAt: new Date().toISOString(),
  };

  return managerRepository.saveWeeklyReport(report);
}

async function generateRecommendations(options = {}) {
  const dailyReport = options.dailyReport || (await generateDailySummary(options));
  const recommendations = [];

  if (dailyReport.missingKnowledgeTopics) {
    recommendations.push({
      recommendationId: generateId('rec'),
      type: 'knowledge',
      title: `Need new knowledge for ${dailyReport.missingKnowledgeTopics}`,
      reason: 'Users asked questions that were not answered.',
      priority: 'high',
      sourceReportId: dailyReport.reportId,
      status: 'New',
      createdAt: new Date().toISOString(),
    });
  }

  if (Number(dailyReport.moneyTransferRequests) > 0) {
    recommendations.push({
      recommendationId: generateId('rec'),
      type: 'content',
      title: 'Create article about money transfer options',
      reason: 'Users asked about money transfer.',
      priority: 'normal',
      sourceReportId: dailyReport.reportId,
      status: 'New',
      createdAt: new Date().toISOString(),
    });
  }

  if (dailyReport.mostRequestedJobs) {
    recommendations.push({
      recommendationId: generateId('rec'),
      type: 'community',
      title: `High demand for ${dailyReport.mostRequestedJobs}`,
      reason: 'Job-related questions appeared in conversations.',
      priority: 'normal',
      sourceReportId: dailyReport.reportId,
      status: 'New',
      createdAt: new Date().toISOString(),
    });
  }

  const saved = [];
  for (const recommendation of recommendations) {
    saved.push(await managerRepository.saveRecommendation(recommendation));
  }

  return saved;
}

module.exports = {
  REPORT_MIN_QUESTION_COUNT,
  filterByConsent,
  summarizeQuestions,
  generateDailySummary,
  generateRecommendations,
  generateWeeklySummary,
};
