const { coreAgentService } = require('../core-agent');
const { crmAgentService } = require('../crm-agent');

function splitGoals(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinGoals(goals = []) {
  return [...new Set(goals.filter(Boolean))].join(', ');
}

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function hasOwn(object = {}, key = '') {
  return Object.prototype.hasOwnProperty.call(object, key);
}

async function withLanguageFields(profile = {}) {
  const language = await crmAgentService.getUserLanguage(profile);
  return {
    ...profile,
    preferredLanguage: language.preferredLanguage || '',
    detectedLanguage: language.detectedLanguage || '',
    languageSource: language.languageSource || '',
  };
}

function normalizeChannel(value = '') {
  const normalized = cleanText(value).toLowerCase();
  if (normalized === 'web') return 'Web';
  if (normalized === 'telegram') return 'Telegram';
  if (normalized === 'whatsapp') return 'WhatsApp';
  if (normalized === 'line') return 'LINE';
  if (normalized === 'none') return 'None';
  return '';
}

function connectedChannels(profile = {}) {
  const channels = ['Web'];
  if (profile.telegramUserId && profile.telegramChatId) channels.push('Telegram');
  if ((profile.whatsappPhone || (profile.channel === 'whatsapp' && profile.channelUserId)) && profile.whatsappConnectedAt) channels.push('WhatsApp');
  if (profile.lineUserId && profile.lineLinkStatus === 'Connected') channels.push('LINE');
  return channels;
}

function sanitizeCommunicationPreferences(profile = {}, updates = {}) {
  const connected = connectedChannels(profile);
  let preferredChannel = normalizeChannel(updates.preferredChannel || profile.preferredChannel || 'Web');
  if (!connected.includes(preferredChannel)) preferredChannel = connected.includes(profile.preferredChannel) ? profile.preferredChannel : 'Web';

  let fallbackChannel = normalizeChannel(updates.fallbackChannel || profile.fallbackChannel || 'None');
  if (fallbackChannel === preferredChannel || (fallbackChannel !== 'None' && !connected.includes(fallbackChannel))) {
    fallbackChannel = 'None';
  }

  return {
    preferredChannel,
    fallbackChannel,
  };
}

function communicationAuditLines(before = {}, after = {}) {
  const fields = [
    ['preferredChannel', 'preferred channel'],
    ['fallbackChannel', 'fallback channel'],
    ['telegramNotificationsEnabled', 'Telegram notifications'],
    ['whatsappNotificationsEnabled', 'WhatsApp notifications'],
    ['lineNotificationsEnabled', 'LINE notifications'],
    ['lineQuietHoursEnabled', 'LINE quiet hours'],
  ];
  return fields
    .filter(([field]) => cleanText(before[field]) !== cleanText(after[field]))
    .map(([field, label]) => `${label}: ${before[field] || '-'} -> ${after[field] || '-'}`);
}

async function saveCommunicationAudit(userId, channel, before, after) {
  const lines = communicationAuditLines(before, after);
  if (!lines.length) return null;
  try {
    return crmAgentService.saveConversation({
      userId,
      channel,
      question: 'Communication preferences updated',
      answer: lines.join('; '),
      category: 'Communication',
      status: 'COMMUNICATION_PREFERENCES_UPDATED',
      needsHumanFollowUp: false,
    });
  } catch (error) {
    return null;
  }
}

function syncGoalToggle(updates, toggleKey, goal) {
  const activeGoals = splitGoals(updates.activeGoals);
  const completedGoals = splitGoals(updates.completedGoals);

  if (updates[toggleKey] === 'Yes' && !activeGoals.includes(goal)) {
    activeGoals.push(goal);
  }

  if (updates[toggleKey] === 'No') {
    const activeIndex = activeGoals.indexOf(goal);
    if (activeIndex >= 0) activeGoals.splice(activeIndex, 1);
    if (!completedGoals.includes(goal)) completedGoals.push(goal);
  }

  updates.activeGoals = joinGoals(activeGoals);
  updates.completedGoals = joinGoals(completedGoals);
}

async function sendMessage(req, res, next) {
  try {
    const message = String(req.body.message || '').trim();

    if (!message) {
      res.status(400).json({
        error: {
          message: 'message is required.',
          details: [],
        },
      });
      return;
    }

    const result = await coreAgentService.processWebMessage({
      message,
      channel: req.body.channel || 'web',
      channelUserId: req.body.channelUserId || 'local-web-user',
    });

    res.status(200).json({
      reply: result.reply,
      category: result.category,
      status: result.status,
      onboarding: result.onboarding,
    });
  } catch (error) {
    next(error);
  }
}

async function getOnboardingStatus(req, res, next) {
  try {
    const result = await coreAgentService.getOnboardingStatus({
      channel: req.query.channel || 'web',
      channelUserId: req.query.channelUserId || 'local-web-user',
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function getProfile(req, res, next) {
  try {
    const result = await coreAgentService.getOnboardingStatus({
      channel: req.query.channel || 'web',
      channelUserId: req.query.channelUserId || 'local-web-user',
    });

    res.status(200).json({
      profile: await withLanguageFields(result.profile),
      complete: result.complete,
      summary: result.summary,
    });
  } catch (error) {
    next(error);
  }
}

async function getStartupSummary(req, res, next) {
  try {
    const result = await coreAgentService.getPersonalizedStartup({
      channel: req.query.channel || 'web',
      channelUserId: req.query.channelUserId || 'local-web-user',
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function updateProfile(req, res, next) {
  try {
    const body = req.body || {};
    const userContext = {
      channel: body.channel || 'web',
      channelUserId: body.channelUserId || 'local-web-user',
    };
    const existingStatus = await coreAgentService.getOnboardingStatus(userContext);
    const existingProfile = existingStatus.profile || {};
    const updateFields = [
      'fullName',
      'country',
      'preferredChannel',
      'fallbackChannel',
      'workSector',
      'profession',
      'city',
      'activeGoals',
      'completedGoals',
      'lookingForJob',
      'preferredJobCity',
      'preferredJobProfession',
      'wantsJobAlerts',
      'preferredCurrency',
      'wantsExchangeRateAlerts',
      'interestedInMoneyTransfers',
      'lookingForHousing',
      'preferredHousingCity',
      'preferredHousingArea',
      'preferredHousingType',
      'maximumHousingBudget',
      'maximumMonthlyBudget',
      'preferredMoveInDate',
      'jobNotifications',
      'housingNotifications',
      'documentNotifications',
      'moneyNotifications',
      'communityNotifications',
      'humanResponseNotifications',
      'telegramNotificationsEnabled',
      'telegramQuietHoursEnabled',
      'telegramQuietHoursStart',
      'telegramQuietHoursEnd',
      'telegramTimezone',
      'whatsappNotificationsEnabled',
      'whatsappQuietHoursEnabled',
      'whatsappQuietHoursStart',
      'whatsappQuietHoursEnd',
      'whatsappTimezone',
      'lineNotificationsEnabled',
      'lineQuietHoursEnabled',
      'lineQuietHoursStart',
      'lineQuietHoursEnd',
      'lineTimezone',
      'taskRemindersEnabled',
      'defaultReminderTime',
      'showCompletedTasks',
    ];
    const updates = {};

    for (const field of updateFields) {
      if (hasOwn(body, field)) updates[field] = body[field];
    }

    if (hasOwn(updates, 'lookingForJob')) syncGoalToggle(updates, 'lookingForJob', 'Find Job');
    if (hasOwn(updates, 'lookingForHousing')) syncGoalToggle(updates, 'lookingForHousing', 'Find Housing');
    if (hasOwn(updates, 'interestedInMoneyTransfers')) syncGoalToggle(updates, 'interestedInMoneyTransfers', 'Send Money');
    if (hasOwn(updates, 'preferredChannel') || hasOwn(updates, 'fallbackChannel')) {
      const communicationPreferences = sanitizeCommunicationPreferences(existingProfile, updates);
      updates.preferredChannel = communicationPreferences.preferredChannel;
      updates.fallbackChannel = communicationPreferences.fallbackChannel;
    }

    let profile = existingProfile;
    if (Object.keys(updates).length) {
      profile = await coreAgentService.updateUserProfile(userContext, updates);
    }

    if (hasOwn(body, 'preferredLanguage')) {
      if (body.preferredLanguage === null || body.preferredLanguage === '') {
        profile = await crmAgentService.clearPreferredLanguage(profile.userId);
      } else {
        profile = await crmAgentService.setPreferredLanguage(profile.userId, body.preferredLanguage);
      }
    }
    await saveCommunicationAudit(profile.userId, userContext.channel, existingProfile, profile);

    res.status(200).json({
      profile: await withLanguageFields(profile),
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getOnboardingStatus,
  getProfile,
  getStartupSummary,
  sendMessage,
  updateProfile,
};
