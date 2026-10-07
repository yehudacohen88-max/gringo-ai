const crmAgentRepository = require('../crm-agent/crm-agent.repository');
const { crmAgentService } = require('../crm-agent');
const { coreAgentService } = require('../core-agent');
const jobService = require('../jobs/job.service');
const housingService = require('../housing/housing.service');
const moneyService = require('../money/money.service');
const communityService = require('../community/community.service');
const serviceService = require('../services/service.service');
const documentService = require('../documents/document.service');
const notificationService = require('../notifications/notification.service');
const taskService = require('../tasks/task.service');
const telegramClient = require('./telegram-client.service');
const telegramLinkService = require('./telegram-link.service');
const { safeTelegramWarning } = require('./telegram-errors');

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function displayName(message = {}) {
  return [message.firstName, message.lastName].map(cleanText).filter(Boolean).join(' ');
}

function languageHint(languageCode = '') {
  const code = cleanText(languageCode).toLowerCase();
  if (code === 'he') return 'Hebrew';
  if (code === 'th') return 'Thai';
  if (code === 'en') return 'English';
  return '';
}

function splitList(value) {
  return cleanText(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinList(values = []) {
  return [...new Set(values.filter(Boolean))].join(', ');
}

function profileWithGoalCompleted(profile = {}, goal = '') {
  const activeGoals = splitList(profile.activeGoals).filter((item) => item !== goal);
  const completedGoals = splitList(profile.completedGoals);
  if (!completedGoals.includes(goal)) completedGoals.push(goal);
  return {
    activeGoals: joinList(activeGoals),
    completedGoals: joinList(completedGoals),
  };
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

function button(text, action, module, recordId) {
  return { text, data: [action, module, recordId].map(cleanText).join(':') };
}

function parseCallbackData(data = '') {
  const [action, moduleName, recordId] = cleanText(data).split(':');
  return { action, moduleName, recordId };
}

function isCommand(text = '', command = '') {
  return new RegExp(`^/${command}(?:\\s|$)`, 'i').test(cleanText(text));
}

async function findTelegramUser(message = {}) {
  const telegramUserId = cleanText(message.channelUserId);
  if (!telegramUserId) return null;

  if (crmAgentRepository.findUserProfileRecordByTelegramUserId) {
    const byTelegramId = await crmAgentRepository.findUserProfileRecordByTelegramUserId(telegramUserId);
    if (byTelegramId) return byTelegramId;
  }

  return crmAgentRepository.findUserProfileRecordByChannel('telegram', telegramUserId);
}

async function findOrCreateTelegramUser(message = {}) {
  const telegramUserId = cleanText(message.channelUserId);
  const now = new Date().toISOString();
  let record = await findTelegramUser(message);

  if (record) {
    const updates = {
      telegramUserId,
      telegramChatId: cleanText(message.channelChatId) || record.profile.telegramChatId,
      telegramUsername: cleanText(message.username) || record.profile.telegramUsername,
      telegramConnectedAt: record.profile.telegramConnectedAt || now,
      lastActivityAt: now,
    };

    if (record.profile.channel === 'telegram' && !record.profile.channelUserId) {
      updates.channelUserId = telegramUserId;
    }

    const updatedProfile = {
      ...record.profile,
      ...updates,
      userId: record.profile.userId,
      createdAt: record.profile.createdAt,
      updatedAt: now,
    };
    const saved = await crmAgentRepository.updateUserProfile(record.rowNumber, updatedProfile);
    return saved;
  }

  return crmAgentService.findOrCreateUser({
    channel: 'telegram',
    channelUserId: telegramUserId,
    telegramUserId,
    telegramChatId: cleanText(message.channelChatId),
    telegramUsername: cleanText(message.username),
    telegramConnectedAt: now,
    fullName: displayName(message),
    language: languageHint(message.languageCode),
    lastActivityAt: now,
  });
}

function createStartIntro(firstName = '') {
  const name = firstName ? ` ${firstName}` : '';
  return `Hi${name}. I am Gringo. I can help with jobs, housing, money transfer, community, services, documents, notifications and tasks.`;
}

function createHelpReply() {
  return [
    'Gringo can help with:',
    '- jobs',
    '- housing',
    '- money transfer',
    '- community',
    '- services',
    '- documents',
    '- notifications',
    '- tasks',
  ].join('\n');
}

function incompleteProfileFields(profile = {}) {
  return [
    ['fullName', profile.fullName],
    ['country', profile.country],
    ['preferredLanguage', profile.preferredLanguage || profile.language],
    ['workSector', profile.workSector],
    ['profession', profile.profession],
    ['city', profile.city],
    ['wantsJobAlerts', profile.wantsJobAlerts],
    ['preferredCurrency', profile.preferredCurrency],
    ['wantsExchangeRateAlerts', profile.wantsExchangeRateAlerts],
  ]
    .filter(([, value]) => !cleanText(value))
    .map(([field]) => field);
}

async function currentProfile(userId) {
  return (await crmAgentService.getUserMemory(userId)) || {};
}

async function commandProfile(profile = {}) {
  const missing = incompleteProfileFields(profile);
  return {
    reply: [
      `Profile: ${profile.fullName || 'Name not saved yet'}`,
      `Country: ${profile.country || '-'}`,
      `Language: ${profile.preferredLanguage || profile.language || '-'}`,
      `Work: ${profile.profession || '-'}${profile.city ? ` in ${profile.city}` : ''}`,
      `Active goals: ${profile.activeGoals || 'None'}`,
      `Incomplete fields: ${missing.length ? missing.join(', ') : 'None'}`,
    ].join('\n'),
    status: 'TELEGRAM_PROFILE',
  };
}

async function commandJobs(profile = {}) {
  const matches = (await jobService.findMatchingJobs(profile)).slice(0, 3);
  if (!matches.length) return { reply: 'I did not find matching active jobs yet.', status: 'TELEGRAM_JOBS_EMPTY' };
  return {
    reply: `Relevant jobs:\n${matches
      .map((job, index) => `${index + 1}. ${job.title} - ${job.city}\n${job.employerName || ''} ${job.salaryText || ''}`.trim())
      .join('\n\n')}`,
    replyMarkup: inlineKeyboard([
      [button('View Job', 'view', 'jobs', matches[0].jobId)],
      [button('I Found a Job', 'found', 'jobs', 'goal'), button('Stop Job Alerts', 'stop', 'jobs', 'alerts')],
    ]),
    status: 'TELEGRAM_JOBS',
  };
}

async function commandHousing(profile = {}) {
  const matches = (await housingService.findMatchingHousing(profile)).slice(0, 3);
  if (!matches.length) return { reply: 'I did not find matching housing yet.', status: 'TELEGRAM_HOUSING_EMPTY' };
  return {
    reply: `Relevant housing:\n${matches
      .map(
        (listing, index) =>
          `${index + 1}. ${listing.title} - ${listing.city}\n${listing.monthlyPrice || '-'} NIS | ${
            listing.matchReason || listing.reason || 'Relevant'
          }`
      )
      .join('\n\n')}`,
    replyMarkup: inlineKeyboard([
      [button('View Housing', 'view', 'housing', matches[0].housingId)],
      [button('I Found Housing', 'found', 'housing', 'goal'), button('Stop Housing Alerts', 'stop', 'housing', 'alerts')],
    ]),
    status: 'TELEGRAM_HOUSING',
  };
}

async function commandMoney(profile = {}) {
  const targetCurrency = profile.preferredCurrency || 'THB';
  const amount = profile.lastMoneyTransferAmount || '2000';
  const comparison = await moneyService.compareTransfers(amount, 'ILS', targetCurrency);
  const best = comparison[0];
  return {
    reply: [
      moneyService.DEMO_NOTICE,
      `Saved currency: ${targetCurrency}`,
      `Saved transfer country: ${profile.lastMoneyTransferCountry || profile.moneyTransferCountry || profile.country || '-'}`,
      best
        ? `Best demo option for ${amount} ILS: ${best.providerName}, recipient gets about ${Math.round(best.finalAmountReceived)} ${targetCurrency}.`
        : 'No demo transfer provider found.',
      moneyService.SAFETY_NOTICE,
    ].join('\n'),
    status: 'TELEGRAM_MONEY',
  };
}

async function commandCommunity(profile = {}) {
  const posts = (await communityService.getRelevantPosts(profile)).slice(0, 3);
  if (!posts.length) return { reply: 'No recent community posts matched yet.', status: 'TELEGRAM_COMMUNITY_EMPTY' };
  return {
    reply: `Community updates:\n${posts.map((post, index) => `${index + 1}. ${post.title} (${post.category})`).join('\n')}`,
    replyMarkup: inlineKeyboard([[button('Open Post', 'view', 'community', posts[0].postId), button('Show More', 'more', 'community', 'posts')]]),
    status: 'TELEGRAM_COMMUNITY',
  };
}

async function commandServices(profile = {}) {
  const services = (await serviceService.findMatchingServices(profile)).slice(0, 3);
  if (!services.length) return { reply: 'I did not find recommended services yet.', status: 'TELEGRAM_SERVICES_EMPTY' };
  return {
    reply: `Recommended services:\n${services
      .map((service, index) => `${index + 1}. ${service.title} - ${service.category}\n${service.city || '-'} | ${service.languages || '-'}`)
      .join('\n\n')}`,
    replyMarkup: inlineKeyboard([[button('View Service', 'view', 'services', services[0].id), button('Save Service', 'save', 'services', services[0].id)]]),
    status: 'TELEGRAM_SERVICES',
  };
}

async function commandDocuments(profile = {}) {
  const documents = await documentService.getUserDocuments(profile.userId);
  const summary = documentService.summarizeDocuments(profile, documents);
  const valid = documents.filter((document) => documentService.calculateDocumentStatus(document) === 'Valid').length;
  return {
    reply: [
      'Documents summary:',
      `Valid: ${valid}`,
      `Missing: ${summary.missingDocumentTypes || 'None'}`,
      `Expiring soon: ${summary.expiringDocumentCount || '0'}`,
      `Expired: ${summary.expiredDocumentCount || '0'}`,
      'Document numbers are masked in Gringo.',
    ].join('\n'),
    replyMarkup: inlineKeyboard(
      documents[0]
        ? [
            [button('View Document', 'view', 'documents', documents[0].documentId), button('Remind Me Later', 'later', 'documents', documents[0].documentId)],
            [button('Mark as Renewed', 'renew', 'documents', documents[0].documentId)],
          ]
        : []
    ),
    status: 'TELEGRAM_DOCUMENTS',
  };
}

async function commandNotifications(profile = {}) {
  const notifications = (await notificationService.getUserNotifications(profile.userId, { unread: true })).slice(0, 5);
  if (!notifications.length) return { reply: 'You have no unread notifications.', status: 'TELEGRAM_NOTIFICATIONS_EMPTY' };
  return {
    reply: `Unread notifications:\n${notifications.map((item, index) => `${index + 1}. ${item.title} (${item.type})`).join('\n')}`,
    replyMarkup: inlineKeyboard([
      [button('Mark as Read', 'read', 'notifications', notifications[0].notificationId), button('Dismiss', 'dismiss', 'notifications', notifications[0].notificationId)],
      [button('Remind Me Later', 'later', 'notifications', notifications[0].notificationId)],
    ]),
    status: 'TELEGRAM_NOTIFICATIONS',
  };
}

async function commandTasks(profile = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const tasks = [...(await taskService.getOverdueTasks(profile.userId)), ...(await taskService.getDueTasks(profile.userId, today))].slice(0, 5);
  if (!tasks.length) return { reply: 'You do not have open tasks for today.', status: 'TELEGRAM_TASKS_EMPTY' };
  return {
    reply: `Tasks:\n${tasks.map((task, index) => `${index + 1}. ${task.title} - ${task.status}${task.dueTime ? ` at ${task.dueTime}` : ''}`).join('\n')}`,
    replyMarkup: inlineKeyboard([[button('Complete', 'complete', 'tasks', tasks[0].taskId), button('Reschedule', 'later', 'tasks', tasks[0].taskId)], [button('Open Tasks', 'open', 'tasks', 'list')]]),
    status: 'TELEGRAM_TASKS',
  };
}

async function runCommand(text, profile = {}) {
  if (isCommand(text, 'profile')) return commandProfile(profile);
  if (isCommand(text, 'jobs')) return commandJobs(profile);
  if (isCommand(text, 'housing')) return commandHousing(profile);
  if (isCommand(text, 'money')) return commandMoney(profile);
  if (isCommand(text, 'community')) return commandCommunity(profile);
  if (isCommand(text, 'services')) return commandServices(profile);
  if (isCommand(text, 'documents')) return commandDocuments(profile);
  if (isCommand(text, 'notifications')) return commandNotifications(profile);
  if (isCommand(text, 'tasks')) return commandTasks(profile);
  return null;
}

async function processLinkCommand(message = {}) {
  const text = cleanText(message.messageText);
  const code = text.replace(/^\/link(?:\s+)?/i, '').trim();
  const user = await findOrCreateTelegramUser(message);

  if (!code) {
    return {
      reply: 'Please send /link followed by the code from My Profile.',
      user,
      status: 'TELEGRAM_LINK_MISSING_CODE',
    };
  }

  const result = await telegramLinkService.findValidCode(code, message.channelUserId);
  if (result.error) {
    return {
      reply: result.error,
      user,
      status: 'TELEGRAM_LINK_REJECTED',
    };
  }

  return {
    reply: 'Connect this Telegram account to your Gringo profile?',
    replyMarkup: inlineKeyboard([
      [button('Confirm Link', 'confirm', 'link', result.code.linkCodeId), button('Cancel', 'cancel', 'link', result.code.linkCodeId)],
    ]),
    user,
    status: 'TELEGRAM_LINK_CONFIRMATION',
  };
}

async function saveTelegramConversation(message, userId, reply, status, deliveryStatus) {
  try {
    return await crmAgentService.saveConversation({
      userId,
      channel: 'telegram',
      question: `${message.messageText} [telegramMessageId:${message.telegramMessageId || ''}; receivedAt:${message.receivedAt || ''}]`,
      answer: `${reply} [delivery:${deliveryStatus || 'unknown'}]`,
      category: 'Telegram',
      status,
      needsHumanFollowUp: false,
    });
  } catch (error) {
    safeTelegramWarning('Telegram conversation history could not be saved.');
    return null;
  }
}

async function processStart(message = {}) {
  const user = await findOrCreateTelegramUser(message);
  const onboarding = await coreAgentService.getOnboardingStatus({
    channel: 'telegram',
    channelUserId: message.channelUserId,
  });
  const intro = createStartIntro(message.firstName);
  const reply = onboarding.complete || !onboarding.prompt ? intro : `${intro}\n\n${onboarding.prompt}`;
  return { reply, user, status: 'TELEGRAM_START' };
}

async function processHelp(message = {}) {
  const user = await findOrCreateTelegramUser(message);
  const reply = createHelpReply();
  return { reply, user, status: 'TELEGRAM_HELP' };
}

async function processTextMessage(message = {}) {
  const user = await findOrCreateTelegramUser(message);
  const profile = await currentProfile(user.userId);
  const commandResult = await runCommand(message.messageText, { ...profile, userId: user.userId });
  if (commandResult) {
    return {
      ...commandResult,
      user,
      category: 'Telegram',
    };
  }

  const result = await coreAgentService.processWebMessage({
    message: message.messageText,
    channel: 'telegram',
    channelUserId: message.channelUserId,
    languageCode: message.languageCode,
  });
  const reply = result.reply || 'Gringo received your message.';
  return {
    reply,
    user,
    category: result.category,
    status: result.status,
    onboarding: result.onboarding,
  };
}

async function processTelegramMessage(message = {}) {
  const text = cleanText(message.messageText);
  if (/^\/start(?:\s|$)/i.test(text)) return processStart(message);
  if (/^\/help(?:\s|$)/i.test(text)) return processHelp(message);
  if (/^\/link(?:\s|$)/i.test(text)) return processLinkCommand(message);
  return processTextMessage(message);
}

async function answerCallback(callback, text) {
  try {
    await telegramClient.answerCallbackQuery(callback.callbackQueryId, text);
  } catch (error) {
    safeTelegramWarning('Could not answer one Telegram callback query.');
  }
}

async function editCallbackMessage(callback, text, replyMarkup) {
  if (!callback.channelChatId || !callback.telegramMessageId) return null;
  try {
    return telegramClient.editMessageText(callback.channelChatId, callback.telegramMessageId, text, { replyMarkup });
  } catch (error) {
    safeTelegramWarning('Could not edit one Telegram callback message.');
    return null;
  }
}

function callbackMessage(callback = {}, text = '') {
  return {
    messageText: `[callback:${callback.callbackData}]`,
    telegramMessageId: callback.telegramMessageId,
    receivedAt: callback.receivedAt,
  };
}

async function saveCallbackHistory(callback, userId, reply, status) {
  return saveTelegramConversation(callbackMessage(callback), userId, reply, status, 'callback');
}

async function completeJobGoal(user, profile) {
  if (profile.lookingForJob === 'No' && splitList(profile.completedGoals).includes('Find Job')) {
    return 'This job goal was already completed.';
  }
  await crmAgentService.updateUserProfile(user.userId, {
    ...profileWithGoalCompleted(profile, 'Find Job'),
    lookingForJob: 'No',
    wantsJobAlerts: 'No',
    jobNotifications: 'No',
  });
  await taskService.completeTasksForGoal(user.userId, 'Find Job');
  return 'Done. I marked your job search as completed and stopped job alerts.';
}

async function completeHousingGoal(user, profile) {
  if (profile.lookingForHousing === 'No' && splitList(profile.completedGoals).includes('Find Housing')) {
    return 'This housing goal was already completed.';
  }
  await crmAgentService.updateUserProfile(user.userId, {
    ...profileWithGoalCompleted(profile, 'Find Housing'),
    lookingForHousing: 'No',
    housingNotifications: 'No',
  });
  await taskService.completeTasksForGoal(user.userId, 'Find Housing');
  return 'Done. I marked your housing search as completed and stopped housing reminders.';
}

async function handleViewCallback(callback, user, profile, moduleName, recordId) {
  if (moduleName === 'jobs') {
    const job = await jobService.getJobById(recordId);
    if (!job || job.status !== 'Active') return 'This job is no longer available.';
    return [`Job: ${job.title}`, `City: ${job.city || '-'}`, `Employer: ${job.employerName || '-'}`, `Salary: ${job.salaryText || '-'}`].join('\n');
  }
  if (moduleName === 'housing') {
    const listing = await housingService.getHousingById(recordId);
    if (!listing || listing.status !== 'Active') return 'This housing listing is no longer available.';
    return [`Housing: ${listing.title}`, `City: ${listing.city || '-'}`, `Price: ${listing.monthlyPrice || '-'} NIS`, `Available: ${listing.availableFrom || '-'}`].join('\n');
  }
  if (moduleName === 'documents') {
    const document = await documentService.getDocumentById(recordId);
    if (!document || document.userId !== user.userId) return 'I cannot show that document.';
    const safe = documentService.toSafeDocument(document);
    return [`Document: ${safe.documentType}`, `Status: ${safe.status}`, `Expiry: ${safe.expiryDate || '-'}`, `Number: ${safe.documentNumber || 'Not saved'}`].join('\n');
  }
  if (moduleName === 'community') {
    const post = await communityService.getPostById(recordId);
    if (!post || post.status !== 'Published') return 'This post is not available.';
    return `${post.title}\n${post.body || ''}`.slice(0, 1200);
  }
  if (moduleName === 'services') {
    const service = await serviceService.getServiceById(recordId);
    if (!service) return 'This service is not available.';
    return [`Service: ${service.title}`, `Category: ${service.category}`, `City: ${service.city || '-'}`, `Phone: ${service.phone || '-'}`, `Languages: ${service.languages || '-'}`].join('\n');
  }
  return 'This item is not available.';
}

async function processCallbackAction(callback, user, profile, parsed) {
  const { action, moduleName, recordId } = parsed;

  if (moduleName === 'link') {
    if (action === 'confirm') {
      const result = await telegramLinkService.linkTelegramToProfile(recordId, {
        telegramUserId: callback.channelUserId,
        telegramChatId: callback.channelChatId,
        telegramUsername: callback.username,
      });
      if (result.error) return result.error;
      return 'Telegram is connected to your Gringo profile.';
    }
    if (action === 'cancel') {
      await telegramLinkService.cancelLinkRequest(recordId, callback.channelUserId);
      return 'Telegram linking was cancelled.';
    }
  }

  if (action === 'view') return handleViewCallback(callback, user, profile, moduleName, recordId);
  if (action === 'more' && moduleName === 'community') return (await commandCommunity(profile)).reply;

  if (action === 'found' && moduleName === 'jobs') return completeJobGoal(user, profile);
  if (action === 'found' && moduleName === 'housing') return completeHousingGoal(user, profile);
  if (action === 'stop' && moduleName === 'jobs') {
    await crmAgentService.updateUserProfile(user.userId, { wantsJobAlerts: 'No', jobNotifications: 'No' });
    return 'Done. Job alerts are stopped.';
  }
  if (action === 'stop' && moduleName === 'housing') {
    await crmAgentService.updateUserProfile(user.userId, { housingNotifications: 'No' });
    return 'Done. Housing alerts are stopped.';
  }

  if (moduleName === 'tasks') {
    if (recordId === 'list') return (await commandTasks(profile)).reply;
    const task = await taskService.getTaskById(recordId);
    if (!task || task.userId !== user.userId) return 'I cannot update that task.';
    if (task.status === 'Completed' && action === 'complete') return 'This task is already completed.';
    if (action === 'complete') {
      await taskService.completeTask(recordId);
      return 'Done. I completed the task.';
    }
    if (action === 'later') {
      await taskService.remindTaskLater(recordId, 'tomorrow');
      return 'Done. I will remind you later inside Gringo.';
    }
  }

  if (moduleName === 'notifications') {
    const notifications = await notificationService.getUserNotifications(user.userId);
    const notification = notifications.find((item) => item.notificationId === recordId);
    if (!notification) return 'I cannot update that notification.';
    if (['Read', 'Dismissed', 'Completed'].includes(notification.status)) return 'This notification was already handled.';
    if (action === 'read') {
      await notificationService.markAsRead(recordId);
      return 'Done. I marked the notification as read.';
    }
    if (action === 'dismiss') {
      await notificationService.dismissNotification(recordId);
      return 'Done. I dismissed the notification.';
    }
    if (action === 'later') {
      await notificationService.rescheduleNotification(recordId, 1);
      return 'Done. I will remind you later inside Gringo.';
    }
    if (action === 'later1') {
      await notificationService.rescheduleNotification(recordId, 1);
      return 'Done. I will remind you tomorrow inside Gringo.';
    }
    if (action === 'later3') {
      await notificationService.rescheduleNotification(recordId, 3);
      return 'Done. I will remind you in 3 days inside Gringo.';
    }
  }

  if (moduleName === 'documents') {
    const document = await documentService.getDocumentById(recordId);
    if (!document || document.userId !== user.userId) return 'I cannot update that document.';
    if (action === 'later') return 'Done. I will keep this document reminder inside Gringo.';
    if (action === 'renew') return 'Please send the new expiry date in YYYY-MM-DD format so Gringo can update it.';
  }

  if (moduleName === 'services' && action === 'save') {
    const service = await serviceService.getServiceById(recordId);
    if (!service) return 'This service is not available.';
    const existing = splitList(profile.lastViewedServices);
    await crmAgentService.updateUserProfile(user.userId, {
      lastViewedServices: joinList([...existing, service.id]),
      lastServiceCategory: service.category,
      lastServiceCity: service.city,
    });
    return 'Saved. I added this service to your recent services.';
  }

  return 'This action is not available.';
}

async function processCallback(callback = {}, options = {}) {
  if (options.duplicate) {
    await answerCallback(callback, 'Already handled.');
    return { duplicate: true };
  }

  if (callback.chatType !== 'private') {
    await answerCallback(callback, 'Please use Gringo in a private chat.');
    return { rejected: true };
  }

  const parsed = parseCallbackData(callback.callbackData);
  const allowedModules = ['jobs', 'housing', 'documents', 'notifications', 'tasks', 'community', 'services', 'link'];
  const allowedActions = ['view', 'found', 'stop', 'read', 'dismiss', 'later', 'later1', 'later3', 'complete', 'open', 'more', 'save', 'renew', 'confirm', 'cancel'];
  if (!allowedModules.includes(parsed.moduleName) || !allowedActions.includes(parsed.action)) {
    await answerCallback(callback, 'Action not available.');
    return { rejected: true };
  }

  try {
    const user = await findOrCreateTelegramUser(callback);
    const profile = { ...(await currentProfile(user.userId)), userId: user.userId };
    const reply = await processCallbackAction(callback, user, profile, parsed);
    await answerCallback(callback, 'Done.');
    await editCallbackMessage(callback, reply, undefined);
    await saveCallbackHistory(callback, user.userId, reply, `TELEGRAM_CALLBACK_${parsed.action.toUpperCase()}`);
    return { reply, user, status: 'TELEGRAM_CALLBACK_DONE' };
  } catch (error) {
    safeTelegramWarning('Telegram callback failed safely.');
    await answerCallback(callback, 'Sorry, this action could not be completed.');
    return { error: true };
  }
}

async function recordDeliveryStatus(message, userId, reply, status, deliveryStatus) {
  return saveTelegramConversation(message, userId, reply, status, deliveryStatus);
}

module.exports = {
  createHelpReply,
  createStartIntro,
  findOrCreateTelegramUser,
  processCallback,
  processTelegramMessage,
  recordDeliveryStatus,
};
