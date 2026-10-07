const crmAgentRepository = require('../crm-agent/crm-agent.repository');
const { crmAgentService } = require('../crm-agent');
const { coreAgentService } = require('../core-agent');
const { communicationService } = require('../communication');
const documentService = require('../documents/document.service');
const housingService = require('../housing/housing.service');
const jobService = require('../jobs/job.service');
const notificationService = require('../notifications/notification.service');
const taskService = require('../tasks/task.service');
const lineDeliveryService = require('./line-delivery.service');
const lineLinkService = require('./line-link.service');
const { safeLineWarning } = require('./line-errors');

const COMMAND_PROMPTS = {
  help: 'Hi Gringo',
  home: 'Hi Gringo',
  profile: 'Show my profile',
  jobs: 'I am looking for work',
  housing: 'I need housing',
  money: 'What is the best way to send money to Thailand?',
  community: 'What is new in the community today?',
  services: 'I need services',
  documents: 'Show my documents',
  notifications: 'Show my notifications',
  tasks: 'Show my tasks',
};

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function normalizeCommand(text = '') {
  const normalized = cleanText(text)
    .replace(/^[#/]/, '')
    .replace(/^line:/i, '')
    .toLowerCase();
  const aliases = {
    'home': 'home',
    'jobs': 'jobs',
    'view jobs': 'jobs',
    'housing': 'housing',
    'view housing': 'housing',
    'documents': 'documents',
    'view documents': 'documents',
    'tasks': 'tasks',
    'view tasks': 'tasks',
    'notifications': 'notifications',
    'view notifications': 'notifications',
    'services': 'services',
    'view services': 'services',
    'my profile': 'profile',
    'open profile': 'profile',
    'profile': 'profile',
    'money': 'money',
    'community': 'community',
    'help': 'help',
  };
  return aliases[normalized] || '';
}

function quickReply(label, text) {
  return { label, text };
}

function parseActionData(value = '') {
  const [action, moduleName, recordId] = cleanText(value).split(':');
  return { action, moduleName, recordId };
}

function defaultQuickReplies() {
  return [
    quickReply('View Jobs', 'jobs'),
    quickReply('View Housing', 'housing'),
    quickReply('View Documents', 'documents'),
    quickReply('View Tasks', 'tasks'),
    quickReply('Open Profile', 'profile'),
  ];
}

function quickRepliesFor(category = '', status = '') {
  const normalized = cleanText(category).toLowerCase();
  const value = cleanText(status).toLowerCase();
  if (normalized === 'jobs') return [quickReply('View Jobs', 'jobs'), quickReply('View Services', 'services')];
  if (normalized === 'housing') return [quickReply('View Housing', 'housing'), quickReply('View Services', 'services')];
  if (normalized === 'documents') return [quickReply('View Documents', 'documents'), quickReply('Renew Document', 'My document was renewed'), quickReply('Remind Me Later', 'Remind me later')];
  if (normalized === 'tasks' || value.includes('task')) return [quickReply('View Tasks', 'tasks'), quickReply('Complete Task', 'Show my tasks'), quickReply('Remind Me Later', 'Remind me later')];
  if (normalized === 'services') return [quickReply('View Services', 'services'), quickReply('Open Profile', 'profile')];
  if (normalized === 'notifications') return [quickReply('View Notifications', 'notifications'), quickReply('Remind Me Later', 'Remind me later')];
  return defaultQuickReplies();
}

async function findLineUser(message = {}) {
  const lineUserId = cleanText(message.channelUserId);
  if (!lineUserId) return null;

  if (crmAgentRepository.findUserProfileRecordByLineUserId) {
    const linkedRecord = await crmAgentRepository.findUserProfileRecordByLineUserId(lineUserId);
    if (linkedRecord) return linkedRecord;
  }

  return crmAgentRepository.findUserProfileRecordByChannel('line', lineUserId);
}

async function findOrCreateLineUser(message = {}) {
  const lineUserId = cleanText(message.channelUserId);
  const now = new Date().toISOString();
  const record = await findLineUser(message);

  if (record) {
    const updatedProfile = {
      ...record.profile,
      lineUserId: record.profile.lineUserId || lineUserId,
      lineDisplayName: record.profile.lineDisplayName || cleanText(message.displayName),
      lineConnectedAt: record.profile.lineConnectedAt || now,
      lineLastActiveAt: cleanText(message.receivedAt) || now,
      lineLinkStatus: record.profile.lineLinkStatus || (record.profile.lineUserId ? 'Connected' : 'Not Connected'),
      fullName: record.profile.fullName || cleanText(message.displayName),
      language: record.profile.language || cleanText(message.language),
      lastActivityAt: now,
      updatedAt: now,
    };
    return crmAgentRepository.updateUserProfile(record.rowNumber, updatedProfile);
  }

  return crmAgentService.findOrCreateUser({
    channel: 'line',
    channelUserId: lineUserId,
    lineUserId,
    lineDisplayName: cleanText(message.displayName),
    lineConnectedAt: now,
    lineLastActiveAt: cleanText(message.receivedAt) || now,
    lineLinkStatus: 'Not Connected',
    fullName: cleanText(message.displayName),
    language: cleanText(message.language),
    lastActivityAt: now,
  });
}

async function saveLineConversation(message, userId, reply, status, deliveryStatus) {
  try {
    const question = /^link(?:\s|$)/i.test(cleanText(message.messageText)) ? 'link [code]' : message.messageText || '[unsupported]';
    return await crmAgentService.saveConversation({
      userId,
      channel: 'line',
      question: `${question} [lineMessageId:${message.messageId || ''}; receivedAt:${
        message.receivedAt || ''
      }]`,
      answer: `${reply} [delivery:${deliveryStatus || 'unknown'}]`,
      category: 'LINE',
      status,
      needsHumanFollowUp: false,
    });
  } catch (error) {
    safeLineWarning('LINE conversation history could not be saved.');
    return null;
  }
}

async function processLinkCommand(message = {}) {
  const code = cleanText(message.messageText).replace(/^link(?:\s+)?/i, '').trim();
  const user = await findOrCreateLineUser(message);
  if (!code) {
    return {
      reply: 'Please send link followed by the code from My Profile.',
      user,
      status: 'LINE_LINK_MISSING_CODE',
      quickReplies: defaultQuickReplies(),
    };
  }
  const result = await lineLinkService.linkLineToProfile(code, {
    lineUserId: message.channelUserId,
    displayName: message.displayName,
    receivedAt: message.receivedAt,
  });
  return {
    reply: result.error || 'LINE is connected to your Gringo profile.',
    user: result.profile || user,
    status: result.error ? 'LINE_LINK_REJECTED' : 'LINE_LINKED',
    quickReplies: defaultQuickReplies(),
  };
}

async function processUnlinkCommand(message = {}) {
  const text = cleanText(message.messageText).toLowerCase();
  const user = await findOrCreateLineUser(message);
  if (text === 'confirm unlink') {
    const result = await lineLinkService.confirmSelfUnlink(message.channelUserId);
    return {
      reply: result.error || 'LINE was disconnected from your Gringo profile. Conversation history was preserved.',
      user: result.profile || user,
      status: result.error ? 'LINE_UNLINK_REJECTED' : 'LINE_UNLINKED',
      quickReplies: defaultQuickReplies(),
    };
  }
  return {
    reply: await lineLinkService.requestSelfUnlink(message.channelUserId),
    user,
    status: 'LINE_UNLINK_CONFIRMATION_REQUIRED',
    quickReplies: [quickReply('Confirm Unlink', 'confirm unlink'), quickReply('Open Profile', 'profile')],
  };
}

async function processTextMessage(message = {}) {
  const text = cleanText(message.messageText);
  if (/^link(?:\s|$)/i.test(text)) return processLinkCommand(message);
  if (/^(unlink|confirm unlink)$/i.test(text)) return processUnlinkCommand(message);
  const user = await findOrCreateLineUser(message);
  const command = normalizeCommand(message.messageText);
  const coreMessage = command ? COMMAND_PROMPTS[command] : message.messageText;
  const result = await coreAgentService.processWebMessage({
    message: coreMessage,
    channel: 'line',
    channelUserId: message.channelUserId,
    language: message.language,
  });

  return {
    reply: command === 'help' ? createHelpReply(result.reply) : result.reply || 'Gringo received your message.',
    user,
    category: result.category || 'LINE',
    status: result.status || 'LINE_HANDLED',
    quickReplies: quickRepliesFor(result.category, result.status),
    onboarding: result.onboarding,
  };
}

function splitGoals(value) {
  return cleanText(value)
    .split(',')
    .map((goal) => goal.trim())
    .filter(Boolean);
}

function joinGoals(goals = []) {
  return [...new Set(goals.filter(Boolean))].join(', ');
}

async function saveActionHistory(message = {}, userId = '', reply = '', status = 'LINE_ACTION_EXECUTED') {
  try {
    return crmAgentService.saveConversation({
      userId,
      channel: 'line',
      question: `LINE action: ${message.actionId || message.messageText || ''}`,
      answer: reply,
      category: 'LINE',
      status,
      needsHumanFollowUp: false,
    });
  } catch (error) {
    safeLineWarning('LINE action history could not be saved.');
    return null;
  }
}

async function completeJobGoal(user, profile = {}) {
  if (splitGoals(profile.completedGoals).includes('Find Job')) {
    return 'This job goal was already completed.';
  }
  const activeGoals = splitGoals(profile.activeGoals).filter((goal) => goal !== 'Find Job');
  const completedGoals = splitGoals(profile.completedGoals);
  completedGoals.push('Find Job');
  await crmAgentService.updateUserProfile(user.userId, {
    lookingForJob: 'No',
    wantsJobAlerts: 'No',
    activeGoals: joinGoals(activeGoals),
    completedGoals: joinGoals(completedGoals),
  });
  await taskService.completeTasksForGoal(user.userId, 'Find Job');
  return 'Done. I marked your job goal as completed and stopped job alerts.';
}

async function completeHousingGoal(user, profile = {}) {
  if (splitGoals(profile.completedGoals).includes('Find Housing')) {
    return 'This housing goal was already completed.';
  }
  const activeGoals = splitGoals(profile.activeGoals).filter((goal) => goal !== 'Find Housing');
  const completedGoals = splitGoals(profile.completedGoals);
  completedGoals.push('Find Housing');
  await crmAgentService.updateUserProfile(user.userId, {
    lookingForHousing: 'No',
    housingNotifications: 'No',
    activeGoals: joinGoals(activeGoals),
    completedGoals: joinGoals(completedGoals),
  });
  await taskService.completeTasksForGoal(user.userId, 'Find Housing');
  return 'Done. I marked your housing goal as completed and stopped housing alerts.';
}

async function handleViewAction(user, moduleName, recordId) {
  if (moduleName === 'jobs') {
    const job = await jobService.getJobById(recordId);
    if (!job || job.status !== 'Active') return 'This job is not available anymore.';
    return `Job: ${job.title}\nCity: ${job.city}\nEmployer: ${job.employerName || '-'}\nSalary: ${job.salaryText || '-'}`;
  }
  if (moduleName === 'housing') {
    const listing = await housingService.getHousingById(recordId);
    if (!listing || listing.status !== 'Active') return 'This housing listing is not available anymore.';
    return `Housing: ${listing.title}\nCity: ${listing.city}\nPrice: ${listing.monthlyPrice || '-'} NIS\nContact: ${listing.contactName || '-'} ${listing.contactValue || ''}`.trim();
  }
  if (moduleName === 'documents') {
    const document = await documentService.getDocumentById(recordId);
    if (!document || document.userId !== user.userId) return 'I cannot show this document.';
    const safe = documentService.toSafeDocument(document);
    return `Document: ${safe.documentType}\nStatus: ${safe.status}\nExpiry: ${safe.expiryDate || '-'}\nNumber ending: ${safe.documentNumber || 'not saved'}`;
  }
  if (moduleName === 'notifications') {
    const notifications = await notificationService.getUserNotifications(user.userId, { includeScheduled: true });
    const notification = notifications.find((item) => item.notificationId === recordId);
    if (!notification) return 'I cannot show this notification.';
    return `${notification.title}\n${notification.message}`;
  }
  if (moduleName === 'community' || moduleName === 'services') {
    const result = await processTextMessage({ channel: 'line', channelUserId: user.lineUserId || user.channelUserId, messageText: moduleName });
    return result.reply;
  }
  return 'This action is not available.';
}

async function processNotificationAction(user, action, recordId) {
  const notifications = await notificationService.getUserNotifications(user.userId, { includeScheduled: true });
  const notification = notifications.find((item) => item.notificationId === recordId);
  if (!notification) return 'I cannot find this notification.';
  if (['Read', 'Dismissed', 'Completed', 'Expired'].includes(notification.status)) return 'This notification was already handled.';
  if (action === 'read') {
    await notificationService.markAsRead(recordId);
    await lineDeliveryService.markLineNotificationRead(recordId, user.userId);
    return 'Done. I marked the notification as read.';
  }
  if (action === 'dismiss') {
    await notificationService.dismissNotification(recordId);
    return 'Done. I dismissed the notification.';
  }
  if (action === 'later' || action === 'later1') {
    await notificationService.rescheduleNotification(recordId, 1);
    return 'Done. I will remind you tomorrow inside Gringo.';
  }
  if (action === 'later3') {
    await notificationService.rescheduleNotification(recordId, 3);
    return 'Done. I will remind you in 3 days inside Gringo.';
  }
  if (action === 'view') return `${notification.title}\n${notification.message}`;
  return 'This notification action is not available.';
}

async function processModuleAction(user, profile, action, moduleName, recordId) {
  if (action === 'view') return handleViewAction(user, moduleName, recordId);

  if (moduleName === 'jobs') {
    if (action === 'found') return completeJobGoal(user, profile);
    if (action === 'stop') {
      await crmAgentService.updateUserProfile(user.userId, { wantsJobAlerts: 'No', jobNotifications: 'No' });
      return 'Done. Job alerts are stopped.';
    }
  }

  if (moduleName === 'housing') {
    if (action === 'found') return completeHousingGoal(user, profile);
    if (action === 'stop') {
      await crmAgentService.updateUserProfile(user.userId, { housingNotifications: 'No' });
      return 'Done. Housing alerts are stopped.';
    }
  }

  if (moduleName === 'tasks') {
    const task = await taskService.getTaskById(recordId);
    if (!task || task.userId !== user.userId) return 'I cannot update this task.';
    if (task.status === 'Completed' && action === 'complete') return 'This task is already completed.';
    if (action === 'complete') {
      await taskService.completeTask(recordId);
      return 'Task completed.';
    }
    if (action === 'later') {
      await taskService.remindTaskLater(recordId, 'tomorrow');
      return 'Done. I will remind you tomorrow inside Gringo.';
    }
  }

  if (moduleName === 'documents') {
    const document = await documentService.getDocumentById(recordId);
    if (recordId && document && document.userId !== user.userId) return 'I cannot update this document.';
    if (action === 'renew') return 'Please send the new expiry date in YYYY-MM-DD format so Gringo can update it.';
    if (action === 'later') return 'Done. I will keep this document reminder inside Gringo.';
  }

  if (moduleName === 'notifications') {
    return processNotificationAction(user, action, recordId);
  }

  return 'This action is not available.';
}

async function processAction(message = {}) {
  const parsed = parseActionData(message.actionId || message.messageText);
  const allowedModules = ['jobs', 'housing', 'documents', 'notifications', 'tasks', 'community', 'services', 'line'];
  const allowedActions = ['view', 'found', 'stop', 'read', 'dismiss', 'later', 'later1', 'later3', 'complete', 'renew'];

  if (!parsed.action || !allowedModules.includes(parsed.moduleName) || !allowedActions.includes(parsed.action)) {
    const command = normalizeCommand(message.actionId || message.messageText);
    return processTextMessage({
      ...message,
      messageText: command || message.messageText,
    });
  }

  const user = await findOrCreateLineUser(message);
  const profile = user || {};
  let reply = '';
  let status = `LINE_ACTION_${parsed.action.toUpperCase()}`;
  try {
    reply = await processModuleAction(user, profile, parsed.action, parsed.moduleName, parsed.recordId);
    if (/already|not available|cannot/i.test(reply)) status = 'LINE_DUPLICATE_ACTION_PREVENTED';
    else status = 'LINE_ACTION_EXECUTED';
  } catch (error) {
    safeLineWarning('LINE action failed safely.');
    reply = 'This action could not be completed right now.';
    status = 'LINE_ACTION_FAILED';
  }

  await saveActionHistory(message, user.userId, reply, status);
  return {
    reply,
    user,
    status,
    quickReplies: defaultQuickReplies(),
  };
}

async function processUnsupportedMessage(message = {}) {
  const user = await findOrCreateLineUser(message);
  return {
    reply: 'I currently support text messages only.',
    user,
    status: 'LINE_UNSUPPORTED_CONTENT',
    quickReplies: defaultQuickReplies(),
  };
}

async function sendReply(message = {}, reply = '') {
  return communicationService.sendInteractiveMessage({
    channel: 'line',
    to: message.replyToken,
    text: reply,
    options: {
      allowFallback: false,
      quickReplies: message.quickReplies || [],
    },
  });
}

function createHelpReply(coreReply = '') {
  return [
    coreReply || 'Hi. I am Gringo.',
    '',
    'You can type:',
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

async function recordDeliveryStatus(message, userId, reply, status, deliveryStatus) {
  return saveLineConversation(message, userId, reply, status, deliveryStatus);
}

module.exports = {
  findLineUser,
  findOrCreateLineUser,
  processAction,
  processTextMessage,
  processUnsupportedMessage,
  recordDeliveryStatus,
  sendReply,
};
