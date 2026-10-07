const crmAgentRepository = require('./crm-agent.repository');
const { languageDetectionService } = require('../language');
const {
  USER_PROFILE_DEFAULTS,
  normalizeLanguageSource,
  normalizeProfileLanguageFields,
} = require('./user-profile.model');
const { extractMemorySignals, mergeInterests } = require('./memory-extraction.service');

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function cleanBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.trim().toLowerCase() === 'true';
  return false;
}

function generateId(prefix) {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${timestamp}_${random}`;
}

function unsupportedLanguageError(language) {
  const error = new Error(`Unsupported language: ${cleanText(language) || 'empty'}`);
  error.statusCode = 400;
  return error;
}

async function requireUserProfileRecord(userId) {
  const record = await crmAgentRepository.findUserProfileRecordByUserId(userId);

  if (!record) {
    const error = new Error('User profile not found.');
    error.statusCode = 404;
    throw error;
  }

  return record;
}

function nowIso() {
  return new Date().toISOString();
}

function hasChanged(profile = {}, updates = {}) {
  return Object.entries(updates).some(([key, value]) => cleanText(profile[key]) !== cleanText(value));
}

function buildUserProfile(context = {}) {
  const now = new Date().toISOString();

  return normalizeProfileLanguageFields({
    ...USER_PROFILE_DEFAULTS,
    userId: context.userId || generateId('usr'),
    channel: cleanText(context.channel) || USER_PROFILE_DEFAULTS.channel,
    channelUserId: cleanText(context.channelUserId),
    telegramUserId: cleanText(context.telegramUserId),
    telegramChatId: cleanText(context.telegramChatId),
    telegramUsername: cleanText(context.telegramUsername),
    telegramConnectedAt: cleanText(context.telegramConnectedAt),
    fullName: cleanText(context.fullName),
    language: cleanText(context.language),
    preferredLanguage: cleanText(context.preferredLanguage),
    detectedLanguage: cleanText(context.detectedLanguage),
    languageSource: cleanText(context.languageSource),
    languageUpdatedAt: cleanText(context.languageUpdatedAt),
    preferredChannel: cleanText(context.preferredChannel),
    fallbackChannel: cleanText(context.fallbackChannel),
    country: cleanText(context.country),
    city: cleanText(context.city),
    profession: cleanText(context.profession),
    workSector: cleanText(context.workSector),
    wantsJobAlerts: cleanText(context.wantsJobAlerts),
    currentEmployer: cleanText(context.currentEmployer),
    interests: cleanText(context.interests),
    activeGoals: cleanText(context.activeGoals),
    completedGoals: cleanText(context.completedGoals),
    lookingForJob: cleanText(context.lookingForJob),
    preferredJobCity: cleanText(context.preferredJobCity),
    preferredJobProfession: cleanText(context.preferredJobProfession),
    preferredCurrency: cleanText(context.preferredCurrency),
    wantsExchangeRateAlerts: cleanText(context.wantsExchangeRateAlerts),
    moneyTransferCountry: cleanText(context.moneyTransferCountry),
    interestedInMoneyTransfers: cleanText(context.interestedInMoneyTransfers),
    lastMoneyTransferAmount: cleanText(context.lastMoneyTransferAmount),
    lastMoneyTransferCountry: cleanText(context.lastMoneyTransferCountry),
    lookingForHousing: cleanText(context.lookingForHousing),
    preferredHousingCity: cleanText(context.preferredHousingCity),
    preferredHousingArea: cleanText(context.preferredHousingArea),
    preferredHousingType: cleanText(context.preferredHousingType),
    maximumHousingBudget: cleanText(context.maximumHousingBudget),
    maximumMonthlyBudget: cleanText(context.maximumMonthlyBudget),
    preferredMoveInDate: cleanText(context.preferredMoveInDate),
    lastRelevantPostIds: cleanText(context.lastRelevantPostIds),
    lastRecommendedJobIds: cleanText(context.lastRecommendedJobIds),
    lastRecommendedHousingIds: cleanText(context.lastRecommendedHousingIds),
    lastViewedServices: cleanText(context.lastViewedServices),
    lastServiceCategory: cleanText(context.lastServiceCategory),
    lastServiceCity: cleanText(context.lastServiceCity),
    documentsComplete: cleanText(context.documentsComplete),
    missingDocumentTypes: cleanText(context.missingDocumentTypes),
    expiringDocumentCount: cleanText(context.expiringDocumentCount),
    expiredDocumentCount: cleanText(context.expiredDocumentCount),
    nextDocumentExpiryDate: cleanText(context.nextDocumentExpiryDate),
    jobNotifications: cleanText(context.jobNotifications) || USER_PROFILE_DEFAULTS.jobNotifications,
    housingNotifications: cleanText(context.housingNotifications) || USER_PROFILE_DEFAULTS.housingNotifications,
    documentNotifications: cleanText(context.documentNotifications) || USER_PROFILE_DEFAULTS.documentNotifications,
    moneyNotifications: cleanText(context.moneyNotifications) || USER_PROFILE_DEFAULTS.moneyNotifications,
    communityNotifications: cleanText(context.communityNotifications) || USER_PROFILE_DEFAULTS.communityNotifications,
    humanResponseNotifications: cleanText(context.humanResponseNotifications) || USER_PROFILE_DEFAULTS.humanResponseNotifications,
    taskRemindersEnabled: cleanText(context.taskRemindersEnabled) || USER_PROFILE_DEFAULTS.taskRemindersEnabled,
    defaultReminderTime: cleanText(context.defaultReminderTime) || USER_PROFILE_DEFAULTS.defaultReminderTime,
    showCompletedTasks: cleanText(context.showCompletedTasks) || USER_PROFILE_DEFAULTS.showCompletedTasks,
    tasksToday: cleanText(context.tasksToday) || USER_PROFILE_DEFAULTS.tasksToday,
    overdueTasks: cleanText(context.overdueTasks) || USER_PROFILE_DEFAULTS.overdueTasks,
    upcomingTasks: cleanText(context.upcomingTasks) || USER_PROFILE_DEFAULTS.upcomingTasks,
    telegramNotificationsEnabled: cleanText(context.telegramNotificationsEnabled) || USER_PROFILE_DEFAULTS.telegramNotificationsEnabled,
    telegramQuietHoursEnabled: cleanText(context.telegramQuietHoursEnabled) || USER_PROFILE_DEFAULTS.telegramQuietHoursEnabled,
    telegramQuietHoursStart: cleanText(context.telegramQuietHoursStart) || USER_PROFILE_DEFAULTS.telegramQuietHoursStart,
    telegramQuietHoursEnd: cleanText(context.telegramQuietHoursEnd) || USER_PROFILE_DEFAULTS.telegramQuietHoursEnd,
    telegramTimezone: cleanText(context.telegramTimezone) || USER_PROFILE_DEFAULTS.telegramTimezone,
    whatsappPhone: cleanText(context.whatsappPhone) || USER_PROFILE_DEFAULTS.whatsappPhone,
    whatsappConnectedAt: cleanText(context.whatsappConnectedAt) || USER_PROFILE_DEFAULTS.whatsappConnectedAt,
    whatsappNotificationsEnabled: cleanText(context.whatsappNotificationsEnabled) || USER_PROFILE_DEFAULTS.whatsappNotificationsEnabled,
    whatsappLastInboundAt: cleanText(context.whatsappLastInboundAt) || USER_PROFILE_DEFAULTS.whatsappLastInboundAt,
    whatsappQuietHoursEnabled: cleanText(context.whatsappQuietHoursEnabled) || USER_PROFILE_DEFAULTS.whatsappQuietHoursEnabled,
    whatsappQuietHoursStart: cleanText(context.whatsappQuietHoursStart) || USER_PROFILE_DEFAULTS.whatsappQuietHoursStart,
    whatsappQuietHoursEnd: cleanText(context.whatsappQuietHoursEnd) || USER_PROFILE_DEFAULTS.whatsappQuietHoursEnd,
    whatsappTimezone: cleanText(context.whatsappTimezone) || USER_PROFILE_DEFAULTS.whatsappTimezone,
    lineUserId: cleanText(context.lineUserId) || USER_PROFILE_DEFAULTS.lineUserId,
    lineConnectedAt: cleanText(context.lineConnectedAt) || USER_PROFILE_DEFAULTS.lineConnectedAt,
    lineDisplayName: cleanText(context.lineDisplayName) || USER_PROFILE_DEFAULTS.lineDisplayName,
    lineLastActiveAt: cleanText(context.lineLastActiveAt) || USER_PROFILE_DEFAULTS.lineLastActiveAt,
    lineLinkStatus: cleanText(context.lineLinkStatus) || USER_PROFILE_DEFAULTS.lineLinkStatus,
    lineNotificationsEnabled: cleanText(context.lineNotificationsEnabled) || USER_PROFILE_DEFAULTS.lineNotificationsEnabled,
    lineQuietHoursEnabled: cleanText(context.lineQuietHoursEnabled) || USER_PROFILE_DEFAULTS.lineQuietHoursEnabled,
    lineQuietHoursStart: cleanText(context.lineQuietHoursStart) || USER_PROFILE_DEFAULTS.lineQuietHoursStart,
    lineQuietHoursEnd: cleanText(context.lineQuietHoursEnd) || USER_PROFILE_DEFAULTS.lineQuietHoursEnd,
    lineTimezone: cleanText(context.lineTimezone) || USER_PROFILE_DEFAULTS.lineTimezone,
    lastActivityAt: cleanText(context.lastActivityAt) || now,
    lastQuestion: cleanText(context.lastQuestion),
    lastCategory: cleanText(context.lastCategory),
    lastInteractionAt: now,
    createdAt: now,
    updatedAt: now,
  });
}

function buildConversationEvent(event = {}) {
  return {
    conversationId: event.conversationId || generateId('conv'),
    userId: cleanText(event.userId),
    channel: cleanText(event.channel) || 'internal',
    question: cleanText(event.question),
    answer: cleanText(event.answer),
    category: cleanText(event.category),
    status: cleanText(event.status) || 'UNKNOWN',
    needsHumanFollowUp: cleanBoolean(event.needsHumanFollowUp),
    createdAt: event.createdAt || new Date().toISOString(),
  };
}

async function findOrCreateUser(context = {}) {
  const channel = cleanText(context.channel) || USER_PROFILE_DEFAULTS.channel;
  const channelUserId = cleanText(context.channelUserId);
  let record = null;

  if (context.userId) {
    record = await crmAgentRepository.findUserProfileRecordByUserId(context.userId);
  }

  if (!record && channelUserId) {
    record = await crmAgentRepository.findUserProfileRecordByChannel(channel, channelUserId);
  }

  if (record) {
    return record.profile;
  }

  const profile = buildUserProfile({
    ...context,
    channel,
    channelUserId,
  });

  return crmAgentRepository.createUserProfile(profile);
}

async function updateUserProfile(userId, updates = {}) {
  const record = await requireUserProfileRecord(userId);

  const updatedProfile = {
    ...record.profile,
    ...updates,
    userId: record.profile.userId,
    createdAt: record.profile.createdAt,
    updatedAt: new Date().toISOString(),
  };
  const languageUpdates = {};

  for (const field of ['preferredLanguage', 'detectedLanguage', 'languageSource']) {
    if (Object.prototype.hasOwnProperty.call(updates, field)) {
      languageUpdates[field] = updates[field];
    }
  }

  Object.assign(updatedProfile, normalizeProfileLanguageFields(languageUpdates));

  return crmAgentRepository.updateUserProfile(record.rowNumber, updatedProfile);
}

async function getUserLanguage(user = {}) {
  const profile = user.userId && !Object.prototype.hasOwnProperty.call(user, 'preferredLanguage')
    ? (await requireUserProfileRecord(user.userId)).profile
    : user;
  const preferredLanguage = languageDetectionService.normalizeLanguageCode(profile.preferredLanguage);
  const detectedLanguage = languageDetectionService.normalizeLanguageCode(profile.detectedLanguage);
  const legacyLanguage = languageDetectionService.normalizeLanguageCode(profile.language);
  const languageSource = normalizeLanguageSource(profile.languageSource);

  return {
    preferredLanguage,
    detectedLanguage,
    languageSource,
    languageUpdatedAt: cleanText(profile.languageUpdatedAt),
    language: preferredLanguage || detectedLanguage || legacyLanguage || '',
  };
}

async function setPreferredLanguage(userId, language) {
  const preferredLanguage = languageDetectionService.normalizeLanguageCode(language);
  if (!preferredLanguage) throw unsupportedLanguageError(language);

  const record = await requireUserProfileRecord(userId);
  const updates = {
    preferredLanguage,
    languageSource: 'explicit',
  };

  if (!hasChanged(record.profile, updates)) {
    return record.profile;
  }

  return updateUserProfile(userId, {
    ...updates,
    languageUpdatedAt: nowIso(),
  });
}

async function clearPreferredLanguage(userId) {
  const record = await requireUserProfileRecord(userId);

  if (!cleanText(record.profile.preferredLanguage)) {
    return record.profile;
  }

  return updateUserProfile(userId, {
    preferredLanguage: '',
    languageUpdatedAt: nowIso(),
  });
}

async function updateDetectedLanguage(userId, resolution = {}) {
  const detectedLanguage = languageDetectionService.normalizeLanguageCode(resolution.language);
  if (!detectedLanguage) throw unsupportedLanguageError(resolution.language);

  const languageSource = normalizeLanguageSource(resolution.source);
  const updates = {
    detectedLanguage,
    languageSource: languageSource || 'default',
  };
  const record = await requireUserProfileRecord(userId);

  if (!hasChanged(record.profile, updates)) {
    return record.profile;
  }

  return updateUserProfile(userId, {
    ...updates,
    languageUpdatedAt: nowIso(),
  });
}

async function saveConversation(event = {}) {
  const conversationEvent = buildConversationEvent(event);
  return crmAgentRepository.createConversationHistory(conversationEvent);
}

async function extractAndUpdateMemory(userId, message = '') {
  const record = await crmAgentRepository.findUserProfileRecordByUserId(userId);

  if (!record) {
    const error = new Error('User profile not found.');
    error.statusCode = 404;
    throw error;
  }

  const signals = extractMemorySignals(message);
  const updatedProfile = {
    ...record.profile,
    interests: mergeInterests(record.profile.interests, signals.interests),
    lastQuestion: cleanText(message),
    lastInteractionAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await crmAgentRepository.updateUserProfile(record.rowNumber, updatedProfile);

  return {
    profile: updatedProfile,
    signals,
  };
}

async function getUserMemory(userId) {
  const record = await crmAgentRepository.findUserProfileRecordByUserId(userId);

  if (!record) {
    return null;
  }

  return {
    userId: record.profile.userId,
    fullName: record.profile.fullName,
    telegramUserId: record.profile.telegramUserId,
    telegramChatId: record.profile.telegramChatId,
    telegramUsername: record.profile.telegramUsername,
    telegramConnectedAt: record.profile.telegramConnectedAt,
    telegramNotificationsEnabled: record.profile.telegramNotificationsEnabled,
    telegramQuietHoursEnabled: record.profile.telegramQuietHoursEnabled,
    telegramQuietHoursStart: record.profile.telegramQuietHoursStart,
    telegramQuietHoursEnd: record.profile.telegramQuietHoursEnd,
    telegramTimezone: record.profile.telegramTimezone,
    whatsappPhone: record.profile.whatsappPhone,
    whatsappConnectedAt: record.profile.whatsappConnectedAt,
    whatsappNotificationsEnabled: record.profile.whatsappNotificationsEnabled,
    whatsappLastInboundAt: record.profile.whatsappLastInboundAt,
    whatsappQuietHoursEnabled: record.profile.whatsappQuietHoursEnabled,
    whatsappQuietHoursStart: record.profile.whatsappQuietHoursStart,
    whatsappQuietHoursEnd: record.profile.whatsappQuietHoursEnd,
    whatsappTimezone: record.profile.whatsappTimezone,
    lineUserId: record.profile.lineUserId,
    lineConnectedAt: record.profile.lineConnectedAt,
    lineDisplayName: record.profile.lineDisplayName,
    lineLastActiveAt: record.profile.lineLastActiveAt,
    lineLinkStatus: record.profile.lineLinkStatus,
    lineNotificationsEnabled: record.profile.lineNotificationsEnabled,
    lineQuietHoursEnabled: record.profile.lineQuietHoursEnabled,
    lineQuietHoursStart: record.profile.lineQuietHoursStart,
    lineQuietHoursEnd: record.profile.lineQuietHoursEnd,
    lineTimezone: record.profile.lineTimezone,
    language: record.profile.language,
    preferredLanguage: record.profile.preferredLanguage,
    detectedLanguage: record.profile.detectedLanguage || '',
    languageSource: record.profile.languageSource || '',
    languageUpdatedAt: record.profile.languageUpdatedAt || '',
    preferredChannel: record.profile.preferredChannel,
    fallbackChannel: record.profile.fallbackChannel,
    country: record.profile.country,
    city: record.profile.city,
    profession: record.profile.profession,
    workSector: record.profile.workSector,
    wantsJobAlerts: record.profile.wantsJobAlerts,
    currentEmployer: record.profile.currentEmployer,
    interests: record.profile.interests,
    activeGoals: record.profile.activeGoals,
    completedGoals: record.profile.completedGoals,
    lookingForJob: record.profile.lookingForJob,
    preferredJobCity: record.profile.preferredJobCity,
    preferredJobProfession: record.profile.preferredJobProfession,
    preferredCurrency: record.profile.preferredCurrency,
    wantsExchangeRateAlerts: record.profile.wantsExchangeRateAlerts,
    moneyTransferCountry: record.profile.moneyTransferCountry,
    interestedInMoneyTransfers: record.profile.interestedInMoneyTransfers,
    lastMoneyTransferAmount: record.profile.lastMoneyTransferAmount,
    lastMoneyTransferCountry: record.profile.lastMoneyTransferCountry,
    lookingForHousing: record.profile.lookingForHousing,
    preferredHousingCity: record.profile.preferredHousingCity,
    preferredHousingArea: record.profile.preferredHousingArea,
    preferredHousingType: record.profile.preferredHousingType,
    maximumHousingBudget: record.profile.maximumHousingBudget,
    maximumMonthlyBudget: record.profile.maximumMonthlyBudget,
    preferredMoveInDate: record.profile.preferredMoveInDate,
    lastRelevantPostIds: record.profile.lastRelevantPostIds,
    lastRecommendedJobIds: record.profile.lastRecommendedJobIds,
    lastRecommendedHousingIds: record.profile.lastRecommendedHousingIds,
    lastViewedServices: record.profile.lastViewedServices,
    lastServiceCategory: record.profile.lastServiceCategory,
    lastServiceCity: record.profile.lastServiceCity,
    documentsComplete: record.profile.documentsComplete,
    missingDocumentTypes: record.profile.missingDocumentTypes,
    expiringDocumentCount: record.profile.expiringDocumentCount,
    expiredDocumentCount: record.profile.expiredDocumentCount,
    nextDocumentExpiryDate: record.profile.nextDocumentExpiryDate,
    jobNotifications: record.profile.jobNotifications,
    housingNotifications: record.profile.housingNotifications,
    documentNotifications: record.profile.documentNotifications,
    moneyNotifications: record.profile.moneyNotifications,
    communityNotifications: record.profile.communityNotifications,
    humanResponseNotifications: record.profile.humanResponseNotifications,
    taskRemindersEnabled: record.profile.taskRemindersEnabled,
    defaultReminderTime: record.profile.defaultReminderTime,
    showCompletedTasks: record.profile.showCompletedTasks,
    tasksToday: record.profile.tasksToday,
    overdueTasks: record.profile.overdueTasks,
    upcomingTasks: record.profile.upcomingTasks,
    lastActivityAt: record.profile.lastActivityAt,
    lastQuestion: record.profile.lastQuestion,
    lastCategory: record.profile.lastCategory,
    lastInteractionAt: record.profile.lastInteractionAt,
  };
}

module.exports = {
  clearPreferredLanguage,
  extractAndUpdateMemory,
  findOrCreateUser,
  getUserLanguage,
  getUserMemory,
  saveConversation,
  setPreferredLanguage,
  updateDetectedLanguage,
  updateUserProfile,
};
