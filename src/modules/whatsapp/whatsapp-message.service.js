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
const { communicationService } = require('../communication');
const { safeWhatsAppWarning } = require('./whatsapp-errors');
const { assistantCatalogReply, catalogListReply, catalogMessage, moduleEnabled } = require('../../shared/pilotCatalog');
const { languageFromProfile } = require('../../shared/userFacingCopy');

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
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

function isCommand(text = '', command = '') {
  return new RegExp(`^${command}(?:\\s|$)`, 'i').test(cleanText(text).replace(/^\//, ''));
}

function actionId(action, moduleName, recordId) {
  return [action, moduleName, recordId].map(cleanText).join(':');
}

function parseActionId(value = '') {
  const [action, moduleName, recordId] = cleanText(value).split(':');
  return { action, moduleName, recordId };
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

function makeButtons(buttons = []) {
  return buttons.map((button) => ({ title: button.title, id: button.id }));
}

function canUseFreeFormWindow(message = {}) {
  if (!message.receivedAt) return true;
  const receivedAt = new Date(message.receivedAt).getTime();
  if (Number.isNaN(receivedAt)) return true;
  return Date.now() - receivedAt <= 24 * 60 * 60 * 1000;
}

async function findWhatsAppUser(message = {}) {
  const channelUserId = cleanText(message.channelUserId);
  if (!channelUserId) return null;
  return crmAgentRepository.findUserProfileRecordByChannel('whatsapp', channelUserId);
}

async function findOrCreateWhatsAppUser(message = {}) {
  const channelUserId = cleanText(message.channelUserId);
  const now = new Date().toISOString();
  const record = await findWhatsAppUser(message);

  if (record) {
    const updatedProfile = {
      ...record.profile,
      whatsappPhone: cleanText(message.phoneNumber) || record.profile.whatsappPhone,
      whatsappConnectedAt: record.profile.whatsappConnectedAt || now,
      whatsappLastInboundAt: cleanText(message.receivedAt) || now,
      fullName: record.profile.fullName || cleanText(message.profileName),
      lastActivityAt: now,
      updatedAt: now,
    };
    return crmAgentRepository.updateUserProfile(record.rowNumber, updatedProfile);
  }

  return crmAgentService.findOrCreateUser({
    channel: 'whatsapp',
    channelUserId,
    whatsappPhone: cleanText(message.phoneNumber),
    whatsappConnectedAt: now,
    whatsappLastInboundAt: cleanText(message.receivedAt) || now,
    fullName: cleanText(message.profileName),
    lastActivityAt: now,
  });
}

async function saveWhatsAppConversation(message, userId, reply, status, deliveryStatus) {
  try {
    return await crmAgentService.saveConversation({
      userId,
      channel: 'whatsapp',
      question: `${message.messageText || '[unsupported]'} [whatsappMessageId:${message.messageId || ''}; receivedAt:${
        message.receivedAt || ''
      }]`,
      answer: `${reply} [delivery:${deliveryStatus || 'unknown'}]`,
      category: 'WhatsApp',
      status,
      needsHumanFollowUp: false,
    });
  } catch (error) {
    safeWhatsAppWarning('WhatsApp conversation history could not be saved.');
    return null;
  }
}

async function processTextMessage(message = {}) {
  const user = await findOrCreateWhatsAppUser(message);
  const profile = (await crmAgentService.getUserMemory(user.userId)) || user;
  const commandResult = await runCommand(message.messageText, { ...profile, userId: user.userId });
  if (commandResult) {
    return {
      ...commandResult,
      user,
      category: 'WhatsApp',
    };
  }

  const result = await coreAgentService.processWebMessage({
    message: message.messageText,
    channel: 'whatsapp',
    channelUserId: message.channelUserId,
  });
  return {
    reply: result.reply || 'Gringo received your message.',
    user,
    category: result.category,
    status: result.status,
    onboarding: result.onboarding,
  };
}

function createHelpReply() {
  return [
    'Gringo can help with:',
    'help',
    'profile',
    'jobs',
    'housing',
    'money',
    'community',
    'services',
    'documents',
    'notifications',
    'tasks',
  ].join('\n');
}

function commandListRows() {
  return ['profile', 'jobs', 'housing', 'money', 'community', 'services', 'documents', 'notifications', 'tasks'].map((command) => ({
    id: actionId('command', 'menu', command),
    title: command,
    description: `Show ${command}`,
  }));
}

function incompleteProfileFields(profile = {}) {
  return [
    ['fullName', profile.fullName],
    ['country', profile.country],
    ['preferredLanguage', profile.preferredLanguage || profile.language],
    ['workSector', profile.workSector],
    ['profession', profile.profession],
    ['city', profile.city],
  ]
    .filter(([, value]) => !cleanText(value))
    .map(([field]) => field);
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
    status: 'WHATSAPP_PROFILE',
  };
}

async function commandJobs(profile = {}) {
  const language = languageFromProfile(profile);
  const matched = await jobService.findMatchingJobs(profile);
  const notice = catalogListReply(matched, language);
  if (notice.blocked) return { reply: notice.blocked, status: 'WHATSAPP_JOBS_EMPTY' };
  const matches = matched.slice(0, 3);
  const prefix = notice.prefix ? `${notice.prefix}\n` : '';
  return {
    reply: `${prefix}Relevant jobs:\n${matches.map((job, index) => `${index + 1}. ${job.demo ? 'Demo: ' : ''}${job.title} - ${job.city}`).join('\n')}`,
    buttons: makeButtons([
      { title: 'View Jobs', id: actionId('view', 'jobs', matches[0].jobId) },
      { title: 'Apply Later', id: actionId('later', 'jobs', matches[0].jobId) },
      { title: 'I Found a Job', id: actionId('found', 'jobs', 'goal') },
    ]),
    status: 'WHATSAPP_JOBS',
  };
}

async function commandHousing(profile = {}) {
  const language = languageFromProfile(profile);
  const matched = await housingService.findMatchingHousing(profile);
  const notice = catalogListReply(matched, language);
  if (notice.blocked) return { reply: notice.blocked, status: 'WHATSAPP_HOUSING_EMPTY' };
  const matches = matched.slice(0, 3);
  const prefix = notice.prefix ? `${notice.prefix}\n` : '';
  return {
    reply: `${prefix}Relevant housing:\n${matches.map((listing, index) => `${index + 1}. ${listing.demo ? 'Demo: ' : ''}${listing.title} - ${listing.city}`).join('\n')}`,
    buttons: makeButtons([
      { title: 'View Housing', id: actionId('view', 'housing', matches[0].housingId) },
      { title: 'Found Housing', id: actionId('found', 'housing', 'goal') },
      { title: 'Stop Alerts', id: actionId('stop', 'housing', 'alerts') },
    ]),
    status: 'WHATSAPP_HOUSING',
  };
}

async function commandMoney(profile = {}) {
  const language = languageFromProfile(profile);
  const targetCurrency = profile.preferredCurrency || 'THB';
  const amount = profile.lastMoneyTransferAmount || '2000';
  const described = await moneyService.resolveTransferComparison(amount, 'ILS', targetCurrency);
  const notice = catalogListReply(described.results, language);
  if (notice.blocked && !described.results.length) return { reply: notice.blocked, status: 'WHATSAPP_MONEY' };
  const best = described.results[0];
  return {
    reply: [
      notice.prefix || '',
      `Saved currency: ${targetCurrency}`,
      best
        ? `${described.demo ? 'Demo: ' : ''}Best ${described.demo ? 'demo ' : ''}option for ${amount} ILS: ${best.providerName}, recipient gets about ${Math.round(best.finalAmountReceived)} ${targetCurrency}.`
        : assistantCatalogReply('empty', language),
      moneyService.SAFETY_NOTICE,
    ].filter(Boolean).join('\n'),
    status: 'WHATSAPP_MONEY',
  };
}

async function commandCommunity(profile = {}) {
  const language = languageFromProfile(profile);
  const matched = await communityService.getRelevantPosts(profile);
  const notice = catalogListReply(matched, language);
  if (notice.blocked) return { reply: notice.blocked, status: 'WHATSAPP_COMMUNITY_EMPTY' };
  const posts = matched.slice(0, 3);
  const prefix = notice.prefix ? `${notice.prefix}\n` : '';
  return {
    reply: `${prefix}Community updates:\n${posts.map((post, index) => `${index + 1}. ${post.demo ? 'Demo: ' : ''}${post.title} (${post.category})`).join('\n')}`,
    status: 'WHATSAPP_COMMUNITY',
  };
}

async function commandServices(profile = {}) {
  const language = languageFromProfile(profile);
  const matched = await serviceService.findMatchingServices(profile, {});
  const notice = catalogListReply(matched, language);
  if (notice.blocked) return { reply: notice.blocked, status: 'WHATSAPP_SERVICES_EMPTY' };
  const services = matched.slice(0, 3);
  const prefix = notice.prefix ? `${notice.prefix}\n` : '';
  return {
    reply: `${prefix}Recommended services:\n${services.map((service, index) => `${index + 1}. ${service.demo ? 'Demo: ' : ''}${service.title} - ${service.category}`).join('\n')}`,
    buttons: makeButtons([
      { title: 'View Service', id: actionId('view', 'services', services[0].id) },
      { title: 'Save Service', id: actionId('save', 'services', services[0].id) },
    ]),
    status: 'WHATSAPP_SERVICES',
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
    buttons: documents[0]
      ? makeButtons([
          { title: 'View Docs', id: actionId('view', 'documents', documents[0].documentId) },
          { title: 'Renewed', id: actionId('renew', 'documents', documents[0].documentId) },
          { title: 'Remind Later', id: actionId('later', 'documents', documents[0].documentId) },
        ])
      : undefined,
    status: 'WHATSAPP_DOCUMENTS',
  };
}

async function commandNotifications(profile = {}) {
  const notifications = (await notificationService.getUserNotifications(profile.userId, { unread: true })).slice(0, 5);
  if (!notifications.length) return { reply: 'You have no unread notifications.', status: 'WHATSAPP_NOTIFICATIONS_EMPTY' };
  return {
    reply: `Unread notifications:\n${notifications.map((item, index) => `${index + 1}. ${item.title} (${item.type})`).join('\n')}`,
    buttons: makeButtons([
      { title: 'Show Alerts', id: actionId('view', 'notifications', notifications[0].notificationId) },
      { title: 'Mark as Read', id: actionId('read', 'notifications', notifications[0].notificationId) },
      { title: 'Dismiss', id: actionId('dismiss', 'notifications', notifications[0].notificationId) },
    ]),
    status: 'WHATSAPP_NOTIFICATIONS',
  };
}

async function commandTasks(profile = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const tasks = [...(await taskService.getOverdueTasks(profile.userId)), ...(await taskService.getDueTasks(profile.userId, today))].slice(0, 5);
  if (!tasks.length) return { reply: 'You do not have open tasks for today.', status: 'WHATSAPP_TASKS_EMPTY' };
  return {
    reply: `Tasks:\n${tasks.map((task, index) => `${index + 1}. ${task.title} - ${task.status}`).join('\n')}`,
    buttons: makeButtons([
      { title: 'Show Tasks', id: actionId('view', 'tasks', 'list') },
      { title: 'Complete Task', id: actionId('complete', 'tasks', tasks[0].taskId) },
      { title: 'Reschedule', id: actionId('later', 'tasks', tasks[0].taskId) },
    ]),
    status: 'WHATSAPP_TASKS',
  };
}

async function runCommand(text, profile = {}) {
  if (isCommand(text, 'help')) return { reply: createHelpReply(), listRows: commandListRows(), status: 'WHATSAPP_HELP' };
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

async function processAction(message = {}) {
  const user = await findOrCreateWhatsAppUser(message);
  const profile = { ...((await crmAgentService.getUserMemory(user.userId)) || user), userId: user.userId };
  const { action, moduleName, recordId } = parseActionId(message.actionId);
  const allowedModules = ['jobs', 'housing', 'documents', 'notifications', 'tasks', 'services'];
  const allowedActions = ['view', 'found', 'stop', 'later', 'read', 'dismiss', 'complete', 'renew', 'save', 'command'];
  if (action === 'command' && moduleName === 'menu') {
    const commandResult = await runCommand(recordId, profile);
    return { ...(commandResult || { reply: 'This command is not available.', status: 'WHATSAPP_COMMAND_REJECTED' }), user };
  }
  if (!allowedModules.includes(moduleName) || !allowedActions.includes(action)) {
    return { reply: 'This action is not available.', user, status: 'WHATSAPP_ACTION_REJECTED' };
  }

  let reply = 'Done.';
  if (moduleName === 'jobs') {
    if (action === 'found') reply = await completeJobGoal(user, profile);
    else if (action === 'stop') {
      await crmAgentService.updateUserProfile(user.userId, { wantsJobAlerts: 'No', jobNotifications: 'No' });
      reply = 'Done. Job alerts are stopped.';
    } else if (action === 'later') reply = 'Saved. You can apply later from Gringo.';
    else if (action === 'view') {
      const language = languageFromProfile(profile);
      if (!moduleEnabled('jobs')) reply = assistantCatalogReply('disabled', language);
      else {
        const jobs = await jobService.getActiveJobs();
        if (jobs.catalogState === 'unavailable') reply = assistantCatalogReply('unavailable', language);
        else {
          const job = jobs.find((item) => item.jobId === recordId) || null;
          const prefix = job && job.demo ? `${catalogMessage('demo', language)}\n` : '';
          reply = job && job.status === 'Active' ? `${prefix}Job: ${job.title}\nCity: ${job.city || '-'}\nEmployer: ${job.employerName || '-'}` : 'This job is not available.';
        }
      }
    }
  } else if (moduleName === 'housing') {
    if (action === 'found') reply = await completeHousingGoal(user, profile);
    else if (action === 'stop') {
      await crmAgentService.updateUserProfile(user.userId, { housingNotifications: 'No' });
      reply = 'Done. Housing alerts are stopped.';
    }     else if (action === 'view') {
      const language = languageFromProfile(profile);
      if (!moduleEnabled('housing')) reply = assistantCatalogReply('disabled', language);
      else {
        const listings = await housingService.getActiveHousingListings();
        if (listings.catalogState === 'unavailable') reply = assistantCatalogReply('unavailable', language);
        else {
          const listing = listings.find((item) => item.housingId === recordId) || null;
          const prefix = listing && listing.demo ? `${catalogMessage('demo', language)}\n` : '';
          reply = listing && listing.status === 'Active' ? `${prefix}Housing: ${listing.title}\nCity: ${listing.city || '-'}\nPrice: ${listing.monthlyPrice || '-'} NIS` : 'This housing is not available.';
        }
      }
    }
  } else if (moduleName === 'tasks') {
    if (recordId === 'list') return { ...(await commandTasks(profile)), user };
    const task = await taskService.getTaskById(recordId);
    if (!task || task.userId !== user.userId) reply = 'I cannot update that task.';
    else if (task.status === 'Completed' && action === 'complete') reply = 'This task is already completed.';
    else if (action === 'complete') {
      await taskService.completeTask(recordId, { ownerUserId: user.userId });
      reply = 'Task completed.';
    } else if (action === 'later') {
      await taskService.remindTaskLater(recordId, 'tomorrow', '', { ownerUserId: user.userId });
      reply = 'Done. I will remind you later inside Gringo.';
    }
  } else if (moduleName === 'notifications') {
    const notifications = await notificationService.getUserNotifications(user.userId);
    const notification = notifications.find((item) => item.notificationId === recordId);
    if (!notification) reply = 'I cannot update that notification.';
    else if (['Read', 'Dismissed', 'Completed'].includes(notification.status)) reply = 'This notification was already handled.';
    else if (action === 'read') {
      await notificationService.markAsRead(recordId, { ownerUserId: user.userId });
      reply = 'Done. I marked the notification as read.';
    } else if (action === 'dismiss') {
      await notificationService.dismissNotification(recordId, { ownerUserId: user.userId });
      reply = 'Done. I dismissed the notification.';
    } else if (action === 'later') {
      await notificationService.rescheduleNotification(recordId, 1, { ownerUserId: user.userId });
      reply = 'Done. I will remind you tomorrow inside Gringo.';
    } else if (action === 'view') reply = `${notification.title}\n${notification.message}`;
  } else if (moduleName === 'documents') {
    const document = await documentService.getDocumentById(recordId);
    if (!document || document.userId !== user.userId) reply = 'I cannot update that document.';
    else if (action === 'view') {
      const safe = documentService.toSafeDocument(document);
      reply = `Document: ${safe.documentType}\nStatus: ${safe.status}\nExpiry: ${safe.expiryDate || '-'}`;
    } else if (action === 'renew') reply = 'Please send the new expiry date in YYYY-MM-DD format so Gringo can update it.';
    else if (action === 'later') reply = 'Done. I will keep this document reminder inside Gringo.';
  } else if (moduleName === 'services') {
    const language = languageFromProfile(profile);
    if (!moduleEnabled('services')) reply = assistantCatalogReply('disabled', language);
    else {
      const services = await serviceService.getServices({});
      if (services.catalogState === 'unavailable') reply = assistantCatalogReply('unavailable', language);
      else {
        const service = services.find((item) => item.id === recordId) || null;
        if (!service) reply = 'This service is not available.';
        else if (action === 'view') {
          const prefix = service.demo ? `${catalogMessage('demo', language)}\n` : '';
          reply = `${prefix}Service: ${service.title}\nCategory: ${service.category}\nPhone: ${service.phone || '-'}`;
        } else if (action === 'save') {
          const existing = splitList(profile.lastViewedServices);
          await crmAgentService.updateUserProfile(user.userId, {
            lastViewedServices: joinList([...existing, service.id]),
            lastServiceCategory: service.category,
            lastServiceCity: service.city,
          });
          reply = 'Saved. I added this service to your recent services.';
        }
      }
    }
  }

  return { reply, user, status: `WHATSAPP_ACTION_${action.toUpperCase()}` };
}

async function processUnsupportedMessage(message = {}) {
  const user = await findOrCreateWhatsAppUser(message);
  return {
    reply: 'I currently support text messages only.',
    user,
    status: 'WHATSAPP_UNSUPPORTED_CONTENT',
  };
}

async function sendReply(message = {}, reply = '', options = {}) {
  if (!canUseFreeFormWindow(message)) {
    return {
      skipped: true,
      status: 'WHATSAPP_TEMPLATE_REQUIRED',
      reason: 'conversation_window_closed',
    };
  }
  if (options.listRows?.length) {
    return communicationService.sendInteractiveMessage({
      channel: 'whatsapp',
      to: message.phoneNumber || message.channelUserId,
      text: reply,
      options: { listRows: options.listRows },
    });
  }
  if (options.buttons?.length) {
    return communicationService.sendInteractiveMessage({
      channel: 'whatsapp',
      to: message.phoneNumber || message.channelUserId,
      text: reply,
      options: { buttons: options.buttons },
    });
  }
  return communicationService.sendMessage({
    channel: 'whatsapp',
    to: message.phoneNumber || message.channelUserId,
    text: reply,
  });
}

async function recordDeliveryStatus(message, userId, reply, status, deliveryStatus) {
  return saveWhatsAppConversation(message, userId, reply, status, deliveryStatus);
}

module.exports = {
  canUseFreeFormWindow,
  findOrCreateWhatsAppUser,
  processAction,
  processTextMessage,
  processUnsupportedMessage,
  recordDeliveryStatus,
  sendReply,
};
