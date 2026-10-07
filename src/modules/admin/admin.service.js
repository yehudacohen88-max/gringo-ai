const adminRepository = require('./admin.repository');
const { HUMAN_FOLLOW_UP_STATUSES, KNOWLEDGE_DRAFT_STATUSES } = require('./admin.model');
const contentRepository = require('../content-agent/content-agent.repository');
const { CONTENT_DRAFT_FIELDS } = require('../content-agent/content-draft.model');
const communityService = require('../community/community.service');
const documentService = require('../documents/document.service');
const managerRepository = require('../manager-agent/manager-agent.repository');
const managerService = require('../manager-agent/manager-agent.service');
const notificationService = require('../notifications/notification.service');
const taskService = require('../tasks/task.service');
const {
  translationConstants,
  translationMetricsService,
  translationSettingsService,
  translationService,
} = require('../translation');
const { lineClientService, lineDeliveryService, lineWebhookService } = require('../line');
const { whatsappClientService, whatsappDeliveryService, whatsappWebhookService } = require('../whatsapp');

const memory = {
  followUps: [],
  notes: [],
  knowledgeDrafts: [],
  contentDrafts: [],
  recommendations: [],
};

function nowIso() {
  return new Date().toISOString();
}

function generateId(prefix) {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${timestamp}_${random}`;
}

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function dateKey(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function isToday(value) {
  return dateKey(value) === new Date().toISOString().slice(0, 10);
}

function isYesterday(value) {
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return dateKey(value) === yesterday.toISOString().slice(0, 10);
}

function countBy(items, getKey) {
  return items.reduce((counts, item) => {
    const key = getKey(item);
    if (!key) return counts;
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function topCounts(items, getKey, limit = 5) {
  return Object.entries(countBy(items, getKey))
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

function splitList(value) {
  return cleanText(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

async function safeRead(readFn, fallback = []) {
  try {
    const result = await readFn();
    return result.length ? result : fallback;
  } catch (error) {
    return fallback;
  }
}

function sampleConversations() {
  const createdAt = nowIso();
  return [
    {
      conversationId: 'conv_admin_sample_unanswered',
      userId: 'usr_somchai',
      channel: 'web',
      question: 'What can I do if my employer did not pay overtime?',
      answer: '',
      category: 'Rights',
      status: 'NOT_FOUND',
      needsHumanFollowUp: true,
      createdAt,
    },
    {
      conversationId: 'conv_admin_sample_housing',
      userId: 'usr_somchai',
      channel: 'web',
      question: 'I need a shared room in Tel Aviv under 2,000 shekels',
      answer: 'I found housing options that may fit you.',
      category: 'Housing',
      status: 'HOUSING_FOUND',
      needsHumanFollowUp: false,
      createdAt,
    },
    {
      conversationId: 'conv_admin_sample_money',
      userId: 'usr_somchai',
      channel: 'web',
      question: 'What is the best way to send 2,000 shekels to Thailand?',
      answer: 'Demo data - not a live rate.',
      category: 'Money',
      status: 'MONEY_COMPARISON_FOUND',
      needsHumanFollowUp: false,
      createdAt,
    },
  ];
}

function sampleProfiles() {
  return [
    {
      userId: 'usr_somchai',
      fullName: 'Somchai',
      language: 'Thai',
      preferredLanguage: 'Thai',
      country: 'Thailand',
      city: 'Tel Aviv',
      workSector: 'Construction',
      profession: 'Construction worker',
      lookingForJob: 'Yes',
      preferredJobCity: 'Tel Aviv',
      preferredJobProfession: 'Construction worker',
      wantsJobAlerts: 'Yes',
      lookingForHousing: 'Yes',
      preferredHousingCity: 'Tel Aviv',
      preferredHousingType: 'Shared Room',
      maximumHousingBudget: '2000',
      interestedInMoneyTransfers: 'Yes',
      lastMoneyTransferAmount: '2000',
      lastMoneyTransferCountry: 'Thailand',
      activeGoals: 'Find Job, Find Housing, Send Money, Follow Community Updates',
      completedGoals: '',
      lastViewedServices: 'svc_thai_clinic_tel_aviv',
      lastServiceCategory: 'Medical',
      lastServiceCity: 'Tel Aviv',
      documentsComplete: 'No',
      missingDocumentTypes: 'Health Insurance',
      expiringDocumentCount: '1',
      expiredDocumentCount: '0',
      nextDocumentExpiryDate: '2026-08-05',
      jobNotifications: 'Yes',
      housingNotifications: 'Yes',
      documentNotifications: 'Yes',
      moneyNotifications: 'Yes',
      communityNotifications: 'Yes',
      humanResponseNotifications: 'Yes',
      whatsappPhone: '972500000000',
      whatsappConnectedAt: nowIso(),
      whatsappLastInboundAt: nowIso(),
      whatsappNotificationsEnabled: 'Yes',
      whatsappQuietHoursEnabled: 'No',
      whatsappQuietHoursStart: '22:00',
      whatsappQuietHoursEnd: '07:00',
      whatsappTimezone: 'Asia/Jerusalem',
      lineUserId: 'UlineSomchai',
      lineConnectedAt: nowIso(),
      lineDisplayName: 'Somchai',
      lineLastActiveAt: nowIso(),
      lineLinkStatus: 'Connected',
      lineNotificationsEnabled: 'Yes',
      lineQuietHoursEnabled: 'No',
      lineQuietHoursStart: '22:00',
      lineQuietHoursEnd: '07:00',
      lineTimezone: 'Asia/Jerusalem',
      lastActivityAt: nowIso(),
      createdAt: nowIso(),
      lastInteractionAt: nowIso(),
    },
  ];
}

function sampleContentDrafts() {
  if (!memory.contentDrafts.length) {
    memory.contentDrafts.push({
      draftId: 'draft_admin_sample_money_tip',
      contentType: 'Tips',
      title: 'How to compare transfer fees',
      category: 'Money',
      language: 'English',
      audience: 'Gringo Community',
      summary: 'A simple post about checking fee, rate, delivery time, and final received amount.',
      body: 'Compare the fee, exchange rate, delivery time, and final amount before sending money. Verify the final amount with the provider.',
      sourceTopics: 'money transfer',
      createdAt: nowIso(),
      status: 'Draft',
    });
  }
  return memory.contentDrafts;
}

function sampleRecommendations() {
  if (!memory.recommendations.length) {
    memory.recommendations.push({
      recommendationId: 'rec_admin_sample_rights',
      type: 'knowledge',
      title: 'Prepare clearer rights answers for unpaid overtime',
      reason: 'A user asked a rights question that needs a human answer.',
      priority: 'high',
      sourceReportId: 'daily_admin_sample',
      status: 'New',
      createdAt: nowIso(),
    });
  }
  return memory.recommendations;
}

async function readBaseData() {
  const [
    conversations,
    profiles,
    comments,
    contentDrafts,
    recommendations,
    reports,
    notes,
    followUps,
    knowledgeDrafts,
    documents,
    notifications,
    tasks,
      whatsappDeliveries,
      whatsappDeliveryHistory,
      lineDeliveries,
      lineDeliveryHistory,
  ] =
    await Promise.all([
      safeRead(() => managerRepository.readConversationHistory(), sampleConversations()),
      safeRead(() => managerRepository.readUserProfiles(), sampleProfiles()),
      communityService.getAllComments().catch(() => []),
      safeRead(() => contentRepository.readContentDrafts(), sampleContentDrafts()),
      safeRead(() => managerRepository.readRecommendations(), sampleRecommendations()),
      safeRead(() => managerRepository.readDailyReports(), []),
      safeRead(() => adminRepository.readAdminNotes(), memory.notes),
      safeRead(() => adminRepository.readHumanFollowUps(), memory.followUps),
      safeRead(() => adminRepository.readKnowledgeDrafts(), memory.knowledgeDrafts),
      documentService.getAllDocuments().catch(() => []),
      notificationService.getAllNotifications().catch(() => []),
      taskService.getUserTasks('usr_somchai').catch(() => []),
      whatsappDeliveryService.getAllWhatsAppDeliveries().catch(() => []),
      whatsappDeliveryService.getAllWhatsAppDeliveryHistory().catch(() => []),
      lineDeliveryService.getAllLineDeliveries().catch(() => []),
      lineDeliveryService.getAllLineDeliveryHistory().catch(() => []),
    ]);

  return {
    conversations,
    profiles,
    comments,
    contentDrafts,
    recommendations,
    reports,
    notes,
    followUps,
    knowledgeDrafts,
    documents,
    notifications,
    tasks,
    whatsappDeliveries,
    whatsappDeliveryHistory,
    lineDeliveries,
    lineDeliveryHistory,
  };
}

function getProfileById(profiles) {
  return new Map(profiles.map((profile) => [profile.userId, profile]));
}

function buildHumanQueue(conversations, profiles, storedFollowUps) {
  const profilesById = getProfileById(profiles);
  const storedByConversation = new Map(storedFollowUps.map((item) => [item.conversationId, item]));

  return conversations
    .filter(
      (event) =>
        String(event.status).toUpperCase() === 'NEEDS_HUMAN' ||
        String(event.status).toUpperCase() === 'NOT_FOUND' ||
        String(event.needsHumanFollowUp).toLowerCase() === 'true'
    )
    .map((event) => {
      const stored = storedByConversation.get(event.conversationId) || {};
      const profile = profilesById.get(event.userId) || {};
      return {
        followUpId: stored.followUpId || `followup_${event.conversationId}`,
        conversationId: event.conversationId,
        userId: event.userId,
        userName: stored.userName || profile.fullName || 'Unknown user',
        question: event.question,
        language: stored.language || profile.preferredLanguage || profile.language || '',
        category: event.category,
        context: stored.context || event.answer || 'No previous context saved.',
        humanAnswer: stored.humanAnswer || '',
        status: stored.status || 'New',
        createdAt: event.createdAt,
        updatedAt: stored.updatedAt || event.createdAt,
      };
    });
}

function buildMissingKnowledgeQueue(conversations, knowledgeDrafts) {
  const draftsBySource = new Map(knowledgeDrafts.map((draft) => [draft.sourceId, draft]));
  return conversations
    .filter((event) => String(event.status).toUpperCase() === 'NOT_FOUND')
    .map((event) => ({
      eventId: event.conversationId,
      question: event.question,
      category: event.category || 'Other',
      language: '',
      status: draftsBySource.get(event.conversationId)?.status || 'New',
      answer: draftsBySource.get(event.conversationId)?.answer || '',
      createdAt: event.createdAt,
    }));
}

function buildActiveNeeds(profiles = []) {
  return profiles
    .filter(
      (profile) =>
        splitList(profile.activeGoals).length ||
        cleanText(profile.lookingForJob) === 'Yes' ||
        cleanText(profile.lookingForHousing) === 'Yes' ||
        cleanText(profile.interestedInMoneyTransfers) === 'Yes'
    )
    .map((profile) => ({
      userId: profile.userId,
      userName: profile.fullName || profile.userId || 'Unknown user',
      activeGoals: profile.activeGoals || 'None',
      currentJobNeed:
        profile.lookingForJob === 'Yes'
          ? `${profile.preferredJobProfession || profile.profession || profile.workSector || 'Work'} in ${
              profile.preferredJobCity || profile.city || 'any city'
            }`
          : 'No active job need',
      currentHousingNeed:
        profile.lookingForHousing === 'Yes'
          ? `${profile.preferredHousingType || 'Housing'} in ${profile.preferredHousingCity || profile.city || 'any city'}${
              profile.maximumHousingBudget || profile.maximumMonthlyBudget
                ? ` up to ${profile.maximumHousingBudget || profile.maximumMonthlyBudget}`
                : ''
            }`
          : 'No active housing need',
      moneyTransferInterest:
        profile.interestedInMoneyTransfers === 'Yes'
          ? `${profile.lastMoneyTransferAmount || 'Amount not set'} ILS to ${
              profile.lastMoneyTransferCountry || profile.moneyTransferCountry || profile.country || 'destination not set'
            }`
          : 'No active money interest',
      lastActivityAt: profile.lastActivityAt || profile.lastInteractionAt || profile.createdAt || '',
    }));
}

function buildOverview(data) {
  const todayConversations = data.conversations.filter((event) => isToday(event.createdAt));
  const todayUsers = data.profiles.filter((profile) => isToday(profile.createdAt));
  const activeUserIds = new Set(todayConversations.map((event) => event.userId).filter(Boolean));
  const flaggedComments = data.comments.filter((comment) => comment.status === 'Flagged');
  const activeGoals = data.profiles.flatMap((profile) => splitList(profile.activeGoals));
  const completedGoals = data.profiles.flatMap((profile) => splitList(profile.completedGoals));
  const serviceConversations = todayConversations.filter((event) =>
    /services|doctor|clinic|lawyer|sim|transport|insurance|embassy|government/i.test(`${event.question} ${event.category}`)
  );
  const viewedServices = data.profiles.flatMap((profile) => splitList(profile.lastViewedServices));
  const notificationSummary = notificationService.buildAdminSummary(data.notifications || []);
  const taskSummary = taskService.summarizeTasks(data.tasks || []);
  const taskStats = taskService.getTaskStatistics(data.tasks || []);
  const translationMetrics = translationMetricsService.getMetrics();

  return {
    conversationsToday: todayConversations.length,
    newUsersToday: todayUsers.length,
    activeUsersToday: activeUserIds.size,
    topQuestionCategories: topCounts(todayConversations, (event) => event.category || 'Other'),
    unansweredQuestions: todayConversations.filter((event) => String(event.status).toUpperCase() === 'NOT_FOUND').length,
    needsHumanQuestions: todayConversations.filter(
      (event) => String(event.status).toUpperCase() === 'NEEDS_HUMAN' || String(event.needsHumanFollowUp).toLowerCase() === 'true'
    ).length,
    missingKnowledgeTopics: topCounts(
      todayConversations.filter((event) => String(event.status).toUpperCase() === 'NOT_FOUND'),
      (event) => event.category || event.question
    ),
    popularJobSearches: topCounts(
      todayConversations.filter((event) => /job|work|construction/i.test(`${event.question} ${event.category}`)),
      (event) => event.question
    ),
    popularHousingSearches: topCounts(
      todayConversations.filter((event) => /housing|room|apartment/i.test(`${event.question} ${event.category}`)),
      (event) => event.question
    ),
    moneyTransferRequests: todayConversations.filter((event) => /money|transfer|shekel|baht/i.test(`${event.question} ${event.category}`)).length,
    newCommunityComments: data.comments.filter((comment) => isToday(comment.createdAt)).length,
    flaggedComments: flaggedComments.length,
    usersLookingForWork: data.profiles.filter((profile) => profile.lookingForJob === 'Yes').length,
    usersLookingForHousing: data.profiles.filter((profile) => profile.lookingForHousing === 'Yes').length,
    completedGoals: topCounts(completedGoals, (goal) => goal),
    repeatedIgnoredRecommendations: data.conversations.filter((event) =>
      /no longer need|stop alert|ignored recommendation/i.test(`${event.question} ${event.answer} ${event.status}`)
    ).length,
    mostCommonActiveGoals: topCounts(activeGoals, (goal) => goal),
    mostSearchedServices: topCounts(serviceConversations, (event) => event.question),
    mostViewedServices: topCounts(viewedServices, (serviceId) => serviceId),
    topServiceCategories: topCounts(serviceConversations, (event) => {
      const text = `${event.question} ${event.answer}`.toLowerCase();
      if (text.includes('doctor') || text.includes('clinic') || text.includes('medical')) return 'Medical';
      if (text.includes('lawyer') || text.includes('legal')) return 'Lawyer';
      if (text.includes('sim')) return 'SIM Card';
      if (text.includes('transport')) return 'Transportation';
      return 'Services';
    }),
    mostActiveServiceCities: topCounts(data.profiles.filter((profile) => profile.lastServiceCity), (profile) => profile.lastServiceCity),
    expiringDocuments: data.profiles.reduce((sum, profile) => sum + Number(profile.expiringDocumentCount || 0), 0),
    expiredDocuments: data.profiles.reduce((sum, profile) => sum + Number(profile.expiredDocumentCount || 0), 0),
    usersMissingDocuments: data.profiles.filter((profile) => cleanText(profile.missingDocumentTypes)).length,
    missingRequiredDocuments: topCounts(
      data.profiles.flatMap((profile) => splitList(profile.missingDocumentTypes)),
      (documentType) => documentType
    ),
    notificationsCreated: notificationSummary.notificationsCreated,
    unreadNotifications: notificationSummary.unreadNotifications,
    notificationOpenRate: notificationSummary.notificationOpenRate,
    dismissedNotifications: notificationSummary.dismissedNotifications,
    urgentNotifications: notificationSummary.urgentNotifications.length,
    topNotificationCategories: Object.entries(notificationSummary.topNotificationCategories).map(([label, count]) => ({ label, count })),
    usersWithNoNotificationEngagement: notificationSummary.usersWithNoEngagement.length,
    scheduledNotificationsDueToday: notificationSummary.scheduledNotificationsDueToday.length,
    tasksToday: taskSummary.tasksToday,
    overdueTasks: taskSummary.overdueTasks,
    upcomingTasks: taskSummary.upcomingTasks,
    tasksCreated: taskStats.tasksCreated,
    tasksCompleted: taskStats.tasksCompleted,
    taskCompletionRate: taskStats.taskCompletionRate,
    mostCommonTaskCategories: taskStats.mostCommonTaskCategories,
    tasksGeneratedFromDocuments: taskStats.tasksGeneratedFromDocuments,
    tasksGeneratedFromAdmin: taskStats.tasksGeneratedFromAdmin,
    translationRequests: translationMetrics.translationRequests,
    translationSuccesses: translationMetrics.successfulTranslations,
    translationFailures: translationMetrics.failedTranslations,
    translationCacheHits: translationMetrics.cacheHits,
    translationCacheMisses: translationMetrics.cacheMisses,
    translationAverageLatencyMs: translationMetrics.averageLatencyMs,
    translationProviderLatencyMs: translationMetrics.providerLatencyMs,
  };
}

function calculatePercentage(part, total) {
  const numerator = Number(part) || 0;
  const denominator = Number(total) || 0;
  if (!denominator) return '0%';
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function buildTranslationOverview() {
  const metrics = translationMetricsService.getMetrics();
  const cacheHits = Number(metrics.cacheHits) || 0;
  const cacheMisses = Number(metrics.cacheMisses) || 0;
  const cacheTotal = cacheHits + cacheMisses;
  const providerName = translationService.getProviderName();
  const providerAvailable = translationService.isAvailable();
  const settings = translationSettingsService.getSettings();

  return {
    status: {
      providerName,
      providerAvailability: providerAvailable ? 'Available' : 'Unavailable',
      translationEnabled: settings.translationEnabled ? 'Enabled' : 'Disabled',
      cacheEnabled: settings.cacheEnabled ? 'Enabled' : 'Disabled',
      cacheTtlMinutes: settings.cacheTtlMinutes,
      supportedLanguages: Object.fromEntries(
        settings.enabledLanguages.map((language) => [language, translationConstants.SUPPORTED_LANGUAGES[language]])
      ),
      coreAgentWorkingLanguage: 'en',
    },
    settings: {
      translationEnabled: settings.translationEnabled,
      provider: settings.provider,
      allowedProviders: translationConstants.TRANSLATION_PROVIDERS,
      cacheEnabled: settings.cacheEnabled,
      cacheTtlMinutes: settings.cacheTtlMinutes,
      supportedLanguages: translationConstants.SUPPORTED_LANGUAGES,
      enabledLanguages: settings.enabledLanguages,
      coreAgentWorkingLanguage: 'en',
      updatedAt: settings.updatedAt,
    },
    metrics: {
      totalTranslationRequests: metrics.translationRequests || 0,
      successfulTranslations: metrics.successfulTranslations || 0,
      failedTranslations: metrics.failedTranslations || 0,
      cacheHits,
      cacheMisses,
      cacheHitRate: calculatePercentage(cacheHits, cacheTotal),
      averageTranslationLatencyMs: metrics.averageLatencyMs || 0,
      providerLatencyMs: metrics.providerLatencyMs || 0,
      lastRecordedFailureTime: metrics.lastFailureAt || '',
    },
  };
}

function buildReportSections(report, data) {
  const yesterdayConversations = data.conversations.filter((event) => isYesterday(event.createdAt));
  const humanQueue = buildHumanQueue(data.conversations, data.profiles, data.followUps);
  return {
    report,
    sections: {
      whatHappenedYesterday: yesterdayConversations.length
        ? `${yesterdayConversations.length} conversations happened yesterday.`
        : 'No conversation data from yesterday yet.',
      importantProblems: report?.missingKnowledgeTopics || 'No major problem trend yet.',
      questionsRequiringHumanAttention: humanQueue.slice(0, 5).map((item) => item.question),
      popularTopics: report?.topCategories || 'No popular topics yet.',
      recommendedActions: data.recommendations.slice(0, 5).map((item) => item.title),
      contentOpportunities: data.contentDrafts.slice(0, 5).map((item) => item.title),
    },
    notes: data.notes.filter((note) => note.reportId === report?.reportId),
  };
}

function buildAdminNotificationCenter(data) {
  const notifications = data.notifications || [];
  const profilesById = getProfileById(data.profiles);
  const summary = notificationService.buildAdminSummary(notifications);
  const withUserName = (items = []) =>
    items.map((notification) => ({
      ...notification,
      userName: profilesById.get(notification.userId)?.fullName || notification.userId || 'Unknown user',
    }));
  return {
    ...summary,
    urgentNotifications: withUserName(summary.urgentNotifications),
    expiredScheduledNotifications: withUserName(summary.expiredScheduledNotifications),
    scheduledNotificationsDueToday: withUserName(summary.scheduledNotificationsDueToday),
    usersWithManyUnread: summary.usersWithManyUnread.map((item) => ({
      ...item,
      userName: profilesById.get(item.userId)?.fullName || item.userId,
    })),
    recentNotifications: withUserName(notifications.slice(0, 20)),
  };
}

function isOpenWhatsAppWindow(profile = {}) {
  const lastInbound = new Date(profile.whatsappLastInboundAt || profile.lastInteractionAt || 0).getTime();
  return !Number.isNaN(lastInbound) && Date.now() - lastInbound <= 24 * 60 * 60 * 1000;
}

function percent(part, total) {
  if (!total) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}

function buildWhatsAppDashboard(data) {
  const profiles = data.profiles || [];
  const conversations = data.conversations || [];
  const deliveries = data.whatsappDeliveries || [];
  const connectedUsers = profiles.filter((profile) => cleanText(profile.whatsappPhone));
  const whatsappConversations = conversations.filter((event) => event.channel === 'whatsapp');
  const activeConversationUserIds = new Set(
    whatsappConversations.filter((event) => isToday(event.createdAt)).map((event) => event.userId).filter(Boolean)
  );
  const openUsers = connectedUsers.filter(isOpenWhatsAppWindow);
  const closedUsers = connectedUsers.filter((profile) => !isOpenWhatsAppWindow(profile));
  const pendingDeliveries = deliveries.filter((delivery) => delivery.status === 'Pending');
  const queuedDeliveries = deliveries.filter((delivery) => delivery.status === 'Queued');
  const failedDeliveries = deliveries.filter((delivery) => delivery.status === 'Failed');
  const successfulDeliveries = deliveries.filter((delivery) => ['Sent', 'Delivered', 'Read'].includes(delivery.status));
  const clientHealth = whatsappClientService.getHealth();
  const webhookHealth = whatsappWebhookService.getWebhookHealth();
  const profilesById = getProfileById(profiles);
  const notificationsById = new Map((data.notifications || []).map((notification) => [notification.notificationId, notification]));

  return {
    health: {
      enabled: clientHealth.enabled ? 'Enabled' : 'Disabled',
      apiReachable: clientHealth.apiReachable ? 'Reachable' : clientHealth.configured ? 'No successful request yet' : 'Not configured',
      webhookStatus: webhookHealth.status,
      lastWebhookReceivedAt: webhookHealth.lastWebhookReceivedAt,
      lastSuccessfulRequestAt: clientHealth.lastSuccessfulRequestAt,
      lastFailedRequestAt: clientHealth.lastFailedRequestAt,
      lastFailureCode: clientHealth.lastFailureCode,
    },
    cards: {
      connectedUsers: connectedUsers.length,
      todaysMessages: whatsappConversations.filter((event) => isToday(event.createdAt)).length,
      pendingQueue: pendingDeliveries.length + queuedDeliveries.length,
      failedDeliveries: failedDeliveries.length,
      successRate: percent(successfulDeliveries.length, deliveries.length),
      openConversations: openUsers.length,
    },
    connectorStatus: clientHealth.enabled ? 'Enabled' : 'Disabled',
    connectedUsers: connectedUsers.map((profile) => ({
      userId: profile.userId,
      userName: profile.fullName || profile.userId || 'Unknown user',
      country: profile.country || '',
      language: profile.preferredLanguage || profile.language || '',
      sector: profile.workSector || '',
      city: profile.city || '',
      status: isOpenWhatsAppWindow(profile) ? 'Open' : 'Closed',
      whatsappConnectedAt: profile.whatsappConnectedAt || '',
      whatsappLastInboundAt: profile.whatsappLastInboundAt || profile.lastInteractionAt || '',
      whatsappNotificationsEnabled: profile.whatsappNotificationsEnabled || '',
    })),
    activeConversations: activeConversationUserIds.size,
    openConversationWindows: openUsers.length,
    closedConversationWindows: closedUsers.length,
    pendingDeliveries: pendingDeliveries.length,
    failedDeliveries: failedDeliveries.length,
    queueSize: pendingDeliveries.length + queuedDeliveries.length,
    deliveries: deliveries.slice(0, 30).map((delivery) => {
      const profile = profilesById.get(delivery.userId) || {};
      const notification = notificationsById.get(delivery.notificationId) || {};
      return {
        ...delivery,
        userName: profile.fullName || delivery.userId || 'Unknown user',
        country: profile.country || '',
        language: profile.preferredLanguage || profile.language || '',
        sector: profile.workSector || '',
        city: profile.city || '',
        notificationType: notification.type || '',
        notificationTitle: notification.title || '',
        failureReason: delivery.failureCode || 'None',
      };
    }),
  };
}

function buildLineDashboard(data) {
  const profiles = data.profiles || [];
  const conversations = data.conversations || [];
  const deliveries = data.lineDeliveries || [];
  const connectedUsers = profiles.filter((profile) => cleanText(profile.lineUserId) && cleanText(profile.lineLinkStatus) === 'Connected');
  const lineConversations = conversations.filter((event) => event.channel === 'line');
  const activeConversationUserIds = new Set(
    lineConversations.filter((event) => isToday(event.createdAt)).map((event) => event.userId).filter(Boolean)
  );
  const pendingDeliveries = deliveries.filter((delivery) => delivery.status === 'Pending');
  const queuedDeliveries = deliveries.filter((delivery) => delivery.status === 'Queued');
  const failedDeliveries = deliveries.filter((delivery) => delivery.status === 'Failed');
  const successfulDeliveries = deliveries.filter((delivery) => ['Sent', 'Delivered', 'Read'].includes(delivery.status));
  const clientHealth = lineClientService.getHealth();
  const webhookHealth = lineWebhookService.getWebhookHealth();
  const profilesById = getProfileById(profiles);
  const notificationsById = new Map((data.notifications || []).map((notification) => [notification.notificationId, notification]));

  return {
    health: {
      enabled: clientHealth.enabled ? 'Enabled' : 'Disabled',
      apiReachable: clientHealth.apiReachable ? 'Reachable' : clientHealth.configured ? 'No successful request yet' : 'Not configured',
      webhookStatus: webhookHealth.status,
      lastIncomingEvent: webhookHealth.lastWebhookReceivedAt || 'Never',
      lastSuccessfulRequestAt: clientHealth.lastSuccessfulRequestAt || '',
      lastFailedRequestAt: clientHealth.lastFailedRequestAt || '',
      lastFailureCode: clientHealth.lastFailureCode || '',
    },
    cards: {
      connectedUsers: connectedUsers.length,
      messagesToday: lineConversations.filter((event) => isToday(event.createdAt)).length,
      pendingQueue: pendingDeliveries.length + queuedDeliveries.length,
      failedDeliveries: failedDeliveries.length,
      successRate: percent(successfulDeliveries.length, deliveries.length),
    },
    connectorStatus: clientHealth.enabled ? 'Enabled' : 'Disabled',
    connectedUsers: connectedUsers.map((profile) => ({
      userId: profile.userId,
      userName: profile.fullName || profile.lineDisplayName || profile.userId || 'Unknown user',
      country: profile.country || '',
      language: profile.preferredLanguage || profile.language || '',
      sector: profile.workSector || '',
      city: profile.city || '',
      status: profile.lineNotificationsEnabled === 'Yes' ? 'Notifications enabled' : 'Notifications disabled',
      lineConnectedAt: profile.lineConnectedAt || '',
      lineLastActiveAt: profile.lineLastActiveAt || profile.lastInteractionAt || '',
      lineNotificationsEnabled: profile.lineNotificationsEnabled || '',
    })),
    activeConversations: activeConversationUserIds.size,
    pendingDeliveries: pendingDeliveries.length,
    failedDeliveries: failedDeliveries.length,
    queueSize: pendingDeliveries.length + queuedDeliveries.length,
    deliveries: deliveries.slice(0, 30).map((delivery) => {
      const profile = profilesById.get(delivery.userId) || {};
      const notification = notificationsById.get(delivery.notificationId) || {};
      return {
        ...delivery,
        userName: profile.fullName || profile.lineDisplayName || delivery.userId || 'Unknown user',
        country: profile.country || '',
        language: profile.preferredLanguage || profile.language || '',
        sector: profile.workSector || '',
        city: profile.city || '',
        notificationType: notification.type || '',
        notificationTitle: notification.title || '',
        failureReason: delivery.failureCode || 'None',
      };
    }),
  };
}

async function getDashboard() {
  const data = await readBaseData();
  const latestReport = [...data.reports].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
  return {
    overview: buildOverview(data),
    activeNeeds: buildActiveNeeds(data.profiles),
    documents: documentService.buildAdminDocumentWarnings(data.profiles, data.documents),
    notifications: buildAdminNotificationCenter(data),
    translation: buildTranslationOverview(),
    whatsapp: buildWhatsAppDashboard(data),
    line: buildLineDashboard(data),
    tasks: data.tasks || [],
    taskAdminSummary: taskService.buildAdminTaskSummary(data.tasks || [], data.profiles || []),
    latestDailyReport: buildReportSections(latestReport, data),
    humanFollowUps: buildHumanQueue(data.conversations, data.profiles, data.followUps),
    missingKnowledge: buildMissingKnowledgeQueue(data.conversations, data.knowledgeDrafts),
    contentDrafts: data.contentDrafts,
    communityModeration: {
      recentComments: data.comments.slice(-20).reverse(),
      flaggedComments: data.comments.filter((comment) => comment.status === 'Flagged'),
    },
    recommendations: data.recommendations,
  };
}

async function getTranslationOverview() {
  return buildTranslationOverview();
}

async function updateTranslationSettings(updates = {}) {
  const saved = translationSettingsService.updateSettings(updates);
  translationService.reloadProvider();
  return buildTranslationOverview().settings;
}

async function updateDocumentFromAdmin(documentId, updates = {}) {
  const allowedUpdates = {};
  if (cleanText(updates.expiryDate)) allowedUpdates.expiryDate = cleanText(updates.expiryDate);
  if (cleanText(updates.status)) allowedUpdates.status = cleanText(updates.status);
  if (cleanText(updates.verified)) allowedUpdates.verified = cleanText(updates.verified);
  if (cleanText(updates.adminNote)) allowedUpdates.notes = cleanText(updates.adminNote);
  if (cleanText(updates.changeType)) allowedUpdates.changeType = cleanText(updates.changeType);

  if (updates.action === 'verify') {
    allowedUpdates.verified = 'Yes';
    allowedUpdates.changeType = 'Verified';
  } else if (updates.action === 'under-review') {
    allowedUpdates.status = 'Under Review';
    allowedUpdates.changeType = 'Status Changed';
  } else if (updates.action === 'archive') {
    return documentService.archiveDocument(documentId);
  }

  return documentService.updateDocument(documentId, allowedUpdates);
}

async function generateDailyReport() {
  try {
    const report = await managerService.generateDailySummary();
    await managerService.generateRecommendations({ dailyReport: report });
    return report;
  } catch (error) {
    const data = await readBaseData();
    const notificationSummary = notificationService.buildAdminSummary(data.notifications || []);
    const whatsappDashboard = buildWhatsAppDashboard(data);
    const lineDashboard = buildLineDashboard(data);
    const lineConversations = (data.conversations || []).filter((event) => event.channel === 'line');
    const lineSuccessfulDeliveries = (data.lineDeliveries || []).filter((delivery) =>
      ['Sent', 'Delivered', 'Read'].includes(delivery.status)
    );
    const translationMetrics = translationMetricsService.getMetrics();
    return {
      reportId: generateId('daily_local'),
      reportDate: new Date().toISOString().slice(0, 10),
      totalConversations: data.conversations.length,
      newUsers: data.profiles.filter((profile) => isToday(profile.createdAt)).length,
      activeUsers: new Set(data.conversations.map((event) => event.userId)).size,
      mostCommonQuestions: topCounts(data.conversations, (event) => event.question)
        .map((item) => `${item.label} (${item.count})`)
        .join(', '),
      topCategories: topCounts(data.conversations, (event) => event.category).map((item) => `${item.label} (${item.count})`).join(', '),
      unansweredQuestions: data.conversations.filter((event) => String(event.status).toUpperCase() === 'NOT_FOUND').length,
      needsHumanQuestions: data.conversations.filter((event) => String(event.needsHumanFollowUp).toLowerCase() === 'true').length,
      missingKnowledgeTopics: topCounts(data.conversations, (event) => event.category).map((item) => `${item.label} (${item.count})`).join(', '),
      mostRequestedJobs: 'Construction worker in Tel Aviv (1)',
      mostRequestedLocations: 'Tel Aviv (1)',
      moneyTransferRequests: data.conversations.filter((event) => /money|transfer/i.test(`${event.question} ${event.category}`)).length,
      exchangeRateRequests: 0,
      usersLookingForWork: data.profiles.filter((profile) => profile.lookingForJob === 'Yes').length,
      usersLookingForHousing: data.profiles.filter((profile) => profile.lookingForHousing === 'Yes').length,
      completedGoals: topCounts(data.profiles.flatMap((profile) => splitList(profile.completedGoals)), (goal) => goal)
        .map((item) => `${item.label} (${item.count})`)
        .join(', '),
      repeatedIgnoredRecommendations: data.conversations.filter((event) =>
        /no longer need|stop alert|ignored recommendation/i.test(`${event.question} ${event.answer} ${event.status}`)
      ).length,
      mostCommonActiveGoals: topCounts(data.profiles.flatMap((profile) => splitList(profile.activeGoals)), (goal) => goal)
        .map((item) => `${item.label} (${item.count})`)
        .join(', '),
      expiringDocuments: data.profiles.reduce((sum, profile) => sum + Number(profile.expiringDocumentCount || 0), 0),
      expiredDocuments: data.profiles.reduce((sum, profile) => sum + Number(profile.expiredDocumentCount || 0), 0),
      missingRequiredDocuments: topCounts(
        data.profiles.flatMap((profile) => splitList(profile.missingDocumentTypes)),
        (documentType) => documentType
      )
        .map((item) => `${item.label} (${item.count})`)
        .join(', '),
      completedRenewals: 'Calculated from UserDocumentHistory when available.',
      notificationsCreated: notificationSummary.notificationsCreated,
      unreadNotifications: notificationSummary.unreadNotifications,
      notificationOpenRate: notificationSummary.notificationOpenRate,
      dismissedNotifications: notificationSummary.dismissedNotifications,
      urgentNotifications: notificationSummary.urgentNotifications.length,
      topNotificationCategories: Object.entries(notificationSummary.topNotificationCategories)
        .map(([label, count]) => `${label} (${count})`)
        .join(', '),
      usersWithNoEngagement: notificationSummary.usersWithNoEngagement.length,
      scheduledNotificationsDueToday: notificationSummary.scheduledNotificationsDueToday.length,
      whatsappConnectedUsers: whatsappDashboard.cards.connectedUsers,
      whatsappActiveUsers: whatsappDashboard.activeConversations,
      whatsappMessagesReceived: whatsappDashboard.cards.todaysMessages,
      whatsappMessagesSent: (data.whatsappDeliveries || []).filter((delivery) => ['Sent', 'Delivered', 'Read'].includes(delivery.status)).length,
      whatsappSessionMessages: (data.whatsappDeliveries || []).filter((delivery) => delivery.deliveryMode === 'Session Message').length,
      whatsappTemplateMessages: (data.whatsappDeliveries || []).filter((delivery) => delivery.deliveryMode === 'Template Message').length,
      whatsappSuccessRate: whatsappDashboard.cards.successRate,
      whatsappFailedDeliveries: whatsappDashboard.cards.failedDeliveries,
      whatsappRetryStatistics: `${(data.whatsappDeliveries || []).reduce((sum, delivery) => sum + Number(delivery.retryCount || 0), 0)} retries`,
      whatsappAverageResponseTime: 'Not available',
      whatsappMostCommonCommands: 'Calculated by Manager Agent when conversation history is available.',
      whatsappMostCommonActions: 'Calculated by Manager Agent when conversation history is available.',
      lineConnectedUsers: lineDashboard.cards.connectedUsers,
      lineDailyActiveUsers: lineDashboard.activeConversations,
      lineMessagesReceived: lineConversations.length,
      lineMessagesSent: lineSuccessfulDeliveries.length,
      lineNotificationSuccessRate: lineDashboard.cards.successRate,
      lineFailedDeliveries: lineDashboard.cards.failedDeliveries,
      lineAverageResponseTime: 'Not available',
      lineMostUsedCommands: 'Calculated by Manager Agent when conversation history is available.',
      lineMostUsedActions: 'Calculated by Manager Agent when conversation history is available.',
      translationRequests: translationMetrics.translationRequests,
      translationSuccesses: translationMetrics.successfulTranslations,
      translationFailures: translationMetrics.failedTranslations,
      translationCacheHits: translationMetrics.cacheHits,
      translationCacheMisses: translationMetrics.cacheMisses,
      translationAverageLatencyMs: translationMetrics.averageLatencyMs,
      translationProviderLatencyMs: translationMetrics.providerLatencyMs,
      createdAt: nowIso(),
    };
  }
}

async function generateWeeklyReport() {
  try {
    return managerService.generateWeeklySummary();
  } catch (error) {
    return {
      reportId: generateId('weekly_local'),
      growth: 'Local fallback weekly report created.',
      trends: 'Rights, Housing, Money',
      recurringProblems: 'Missing rights answer',
      communityOpportunities: 'Create community post from approved draft',
      createdAt: nowIso(),
    };
  }
}

async function saveAdminNote(reportId, body) {
  const note = {
    noteId: generateId('note'),
    reportId: cleanText(reportId),
    body: cleanText(body),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  try {
    return await adminRepository.saveAdminNote(note);
  } catch (error) {
    memory.notes.push(note);
    return note;
  }
}

async function saveHumanAnswer(followUpId, answer, status = 'Answered') {
  if (!HUMAN_FOLLOW_UP_STATUSES.includes(status)) status = 'Answered';
  const dashboard = await getDashboard();
  const existing = dashboard.humanFollowUps.find((item) => item.followUpId === followUpId);
  if (!existing) return null;
  const profile = dashboard.activeNeeds.find((item) => item.userId === existing.userId) || {};
  const userProfile = (await readBaseData()).profiles.find((item) => item.userId === existing.userId) || profile;
  const updated = {
    ...existing,
    humanAnswer: cleanText(answer),
    status,
    updatedAt: nowIso(),
  };
  try {
    const saved = await adminRepository.updateHumanFollowUp(followUpId, updated);
    const finalSaved = saved || (await adminRepository.saveHumanFollowUp(updated));
    if (status === 'Answered' && notificationService.respectsPreference(userProfile, 'Human Response')) {
      await notificationService.createNotification({
        userId: finalSaved.userId,
        type: 'Human Response',
        title: 'Gringo has an answer for you',
        message: 'A human answer is ready in Gringo. Delivery is inside Gringo only.',
        sourceModule: 'Admin',
        sourceRecordId: finalSaved.followUpId,
        priority: 'High',
        actionLabel: 'Open response',
        actionUrl: '#notifications',
      });
    }
    return finalSaved;
  } catch (error) {
    const index = memory.followUps.findIndex((item) => item.followUpId === followUpId);
    if (index >= 0) memory.followUps[index] = updated;
    else memory.followUps.push(updated);
    if (status === 'Answered' && notificationService.respectsPreference(userProfile, 'Human Response')) {
      await notificationService.createNotification({
        userId: updated.userId,
        type: 'Human Response',
        title: 'Gringo has an answer for you',
        message: 'A human answer is ready in Gringo. Delivery is inside Gringo only.',
        sourceModule: 'Admin',
        sourceRecordId: updated.followUpId,
        priority: 'High',
        actionLabel: 'Open response',
        actionUrl: '#notifications',
      });
    }
    return updated;
  }
}

async function createManualNotification(input = {}) {
  const data = await readBaseData();
  return notificationService.createManualNotifications(data.profiles, {
    type: cleanText(input.type) || 'Admin Message',
    title: cleanText(input.title),
    message: cleanText(input.message),
    priority: cleanText(input.priority) || 'Normal',
    actionLabel: cleanText(input.actionLabel),
    actionUrl: cleanText(input.actionUrl),
    scheduledAt: cleanText(input.scheduledAt),
    expiresAt: cleanText(input.expiresAt),
    sourceRecordId: cleanText(input.sourceRecordId) || generateId('admin_notice'),
    target: {
      userId: cleanText(input.targetUserId),
      country: cleanText(input.country),
      language: cleanText(input.language),
      sector: cleanText(input.sector),
      city: cleanText(input.city),
      activeGoal: cleanText(input.activeGoal),
    },
  });
}

async function createWhatsAppManualNotification(input = {}) {
  const notifications = await createManualNotification({
    ...input,
    type: cleanText(input.type) || 'Admin Message',
  });
  await whatsappDeliveryService.processPendingWhatsAppDeliveries().catch(() => []);
  return notifications;
}

async function cancelScheduledNotification(notificationId) {
  return notificationService.cancelScheduledNotification(notificationId);
}

async function retryWhatsAppDelivery(deliveryId) {
  return whatsappDeliveryService.retryFailedWhatsAppDelivery(deliveryId);
}

async function cancelWhatsAppDelivery(deliveryId) {
  return whatsappDeliveryService.cancelWhatsAppDelivery(deliveryId);
}

async function getWhatsAppFailureReason(deliveryId) {
  const deliveries = await whatsappDeliveryService.getAllWhatsAppDeliveries().catch(() => []);
  const delivery = deliveries.find((item) => item.deliveryId === deliveryId);
  if (!delivery) return null;
  const history = await whatsappDeliveryService.getDeliveryHistory(deliveryId).catch(() => []);
  return {
    deliveryId,
    status: delivery.status,
    failureCode: delivery.failureCode || 'None',
    retryCount: delivery.retryCount || '0',
    failedAt: delivery.failedAt || '',
    history,
  };
}

async function assignTask(input = {}) {
  const data = await readBaseData();
  return taskService.createTasksForAudience(data.profiles, {
    userId: cleanText(input.userId) || cleanText(input.targetUserId),
    country: cleanText(input.country),
    language: cleanText(input.language),
    sector: cleanText(input.sector),
    city: cleanText(input.city),
    activeGoal: cleanText(input.activeGoal),
    title: cleanText(input.title),
    description: cleanText(input.description),
    internalNote: cleanText(input.internalNote),
    category: cleanText(input.category) || 'Other',
    priority: cleanText(input.priority) || 'Normal',
    dueDate: cleanText(input.dueDate),
    dueTime: cleanText(input.dueTime),
    reminderAt: cleanText(input.reminderAt),
    relatedModule: cleanText(input.relatedModule),
    relatedRecordId: cleanText(input.relatedRecordId),
    recurrenceType: cleanText(input.recurrenceType) || 'None',
    recurrenceInterval: cleanText(input.recurrenceInterval) || '1',
    recurrenceEndDate: cleanText(input.recurrenceEndDate),
    createdBy: 'Admin',
  });
}

async function updateTaskFromAdmin(taskId, updates = {}) {
  if (updates.action === 'complete') return taskService.completeTask(taskId);
  if (updates.action === 'archive') return taskService.archiveTask(taskId);
  if (updates.action === 'dismiss') return taskService.dismissTask(taskId);
  if (updates.action === 'reschedule') {
    return taskService.rescheduleTask(taskId, {
      dueDate: updates.dueDate,
      dueTime: updates.dueTime,
      reminderAt: updates.reminderAt,
    });
  }
  return taskService.updateTask(taskId, {
    title: cleanText(updates.title),
    description: cleanText(updates.description),
    category: cleanText(updates.category),
    priority: cleanText(updates.priority),
    dueDate: cleanText(updates.dueDate),
    dueTime: cleanText(updates.dueTime),
    reminderAt: cleanText(updates.reminderAt),
    relatedModule: cleanText(updates.relatedModule),
    relatedRecordId: cleanText(updates.relatedRecordId),
  });
}

async function createKnowledgeDraftFromFollowUp(followUpId) {
  const dashboard = await getDashboard();
  const followUp = dashboard.humanFollowUps.find((item) => item.followUpId === followUpId);
  if (!followUp) return null;
  return saveKnowledgeDraft({
    sourceType: 'HumanFollowUp',
    sourceId: followUp.conversationId,
    question: followUp.question,
    answer: followUp.humanAnswer,
    category: followUp.category,
    language: followUp.language,
  });
}

async function saveKnowledgeDraft(input = {}) {
  const draft = {
    knowledgeDraftId: cleanText(input.knowledgeDraftId) || generateId('kdraft'),
    sourceType: cleanText(input.sourceType) || 'Manual',
    sourceId: cleanText(input.sourceId),
    question: cleanText(input.question),
    answer: cleanText(input.answer),
    category: cleanText(input.category) || 'Other',
    language: cleanText(input.language) || 'English',
    status: cleanText(input.status) || 'Draft',
    createdAt: cleanText(input.createdAt) || nowIso(),
    updatedAt: nowIso(),
  };
  if (!KNOWLEDGE_DRAFT_STATUSES.includes(draft.status)) draft.status = 'Draft';
  try {
    return await adminRepository.saveKnowledgeDraft(draft);
  } catch (error) {
    memory.knowledgeDrafts.push(draft);
    return draft;
  }
}

async function updateMissingKnowledge(eventId, action, answer = '') {
  if (action === 'Ignore') {
    return saveKnowledgeDraft({ sourceType: 'MissingKnowledge', sourceId: eventId, question: '', answer: '', status: 'Ignored' });
  }
  const dashboard = await getDashboard();
  const item = dashboard.missingKnowledge.find((event) => event.eventId === eventId);
  if (!item) return null;
  return saveKnowledgeDraft({
    sourceType: 'MissingKnowledge',
    sourceId: eventId,
    question: item.question,
    answer,
    category: item.category,
    language: item.language || 'English',
    status: action === 'Mark as Resolved' ? 'Approved' : 'Draft',
  });
}

function normalizeDraftStatus(status) {
  return ['Draft', 'In Review', 'Approved', 'Rejected', 'Published'].includes(status) ? status : 'Draft';
}

async function updateContentDraft(draftId, updates = {}) {
  const data = await readBaseData();
  const existing = data.contentDrafts.find((draft) => draft.draftId === draftId);
  if (!existing) return null;
  const updated = {
    ...existing,
    title: cleanText(updates.title) || existing.title,
    body: cleanText(updates.body) || existing.body,
    status: normalizeDraftStatus(updates.status || existing.status),
  };
  try {
    const saved = await contentRepository.updateContentDraft(draftId, updated);
    if (saved) return saved;
  } catch (error) {
    // Use memory fallback below.
  }
  const index = memory.contentDrafts.findIndex((draft) => draft.draftId === draftId);
  if (index >= 0) memory.contentDrafts[index] = updated;
  else memory.contentDrafts.push(updated);
  return updated;
}

async function publishContentDraft(draftId) {
  const draft = await updateContentDraft(draftId, { status: 'Approved' });
  if (!draft) return null;
  const post = await communityService.publishApprovedDraft(draft);
  await updateContentDraft(draftId, { status: 'Published' });
  return post;
}

async function moderateComment(commentId, action) {
  const statusByAction = {
    Publish: 'Published',
    Hide: 'Hidden',
    'Keep Flagged': 'Flagged',
    'Delete from visible feed': 'Hidden',
  };
  return communityService.updateCommentStatus(commentId, statusByAction[action] || 'Flagged');
}

async function updateRecommendation(recommendationId, status) {
  const data = await readBaseData();
  const existing = data.recommendations.find((item) => item.recommendationId === recommendationId);
  if (!existing) return null;
  const updated = { ...existing, status };
  try {
    const saved = await managerRepository.updateRecommendation(recommendationId, updated);
    if (saved) return saved;
  } catch (error) {
    // Use memory fallback below.
  }
  const index = memory.recommendations.findIndex((item) => item.recommendationId === recommendationId);
  if (index >= 0) memory.recommendations[index] = updated;
  else memory.recommendations.push(updated);
  return updated;
}

async function createContentDraftFromQuestion(followUpId) {
  const dashboard = await getDashboard();
  const followUp = dashboard.humanFollowUps.find((item) => item.followUpId === followUpId);
  if (!followUp) return null;
  const draft = {
    draftId: generateId('draft'),
    contentType: 'Community Post',
    title: `Community answer: ${followUp.category}`,
    category: followUp.category,
    language: followUp.language || 'English',
    audience: 'Gringo Community',
    summary: followUp.question,
    body: followUp.humanAnswer || 'Owner should add a clear answer before publishing.',
    sourceTopics: followUp.question,
    createdAt: nowIso(),
    status: 'Draft',
  };
  try {
    return await contentRepository.saveContentDraft(draft);
  } catch (error) {
    memory.contentDrafts.push(draft);
    return draft;
  }
}

module.exports = {
  createContentDraftFromQuestion,
  cancelWhatsAppDelivery,
  cancelScheduledNotification,
  assignTask,
  createManualNotification,
  createWhatsAppManualNotification,
  createKnowledgeDraftFromFollowUp,
  generateDailyReport,
  generateWeeklyReport,
  getDashboard,
  getTranslationOverview,
  updateTranslationSettings,
  getWhatsAppFailureReason,
  moderateComment,
  publishContentDraft,
  retryWhatsAppDelivery,
  saveAdminNote,
  saveHumanAnswer,
  updateContentDraft,
  updateDocumentFromAdmin,
  updateMissingKnowledge,
  updateRecommendation,
  updateTaskFromAdmin,
};
