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
const { assistantCatalogReply, catalogListReply, catalogMessage, moduleEnabled } = require('../../shared/pilotCatalog');
const { languageFromProfile } = require('../../shared/userFacingCopy');

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function displayName(message = {}) {
  return [message.firstName, message.lastName].map(cleanText).filter(Boolean).join(' ');
}

function languageHint(languageCode = '') {
  const code = cleanText(languageCode).toLowerCase().split('-')[0];
  if (code === 'he' || code === 'iw') return 'Hebrew';
  if (code === 'th') return 'Thai';
  if (code === 'en') return 'English';
  if (code === 'si') return 'Sinhala';
  if (code === 'hi') return 'Hindi';
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

// Thai, Sinhala and Hindi strings are pending native-speaker review.
const START_INTRO = Object.freeze({
  en: (name) => `Hi${name}. I am Gringo. I can help with jobs, housing, money transfer, community, services, documents, notifications and tasks.`,
  he: (name) => `שלום${name}. אני גרינגו. אני יכול לעזור עם עבודה, דיור, העברת כסף, קהילה, שירותים, מסמכים, התראות ומשימות.`,
  th: (name) => `สวัสดี${name} ฉันคือ Gringo ฉันช่วยเรื่องงาน ที่พัก การโอนเงิน ชุมชน บริการ เอกสาร การแจ้งเตือน และงานที่ต้องทำได้`,
  si: (name) => `ආයුබෝවන්${name}. මම Gringo. රැකියා, නිවාස, මුදල් යැවීම, ප්‍රජාව, සේවා, ලේඛන, දැනුම්දීම් සහ කාර්ය ගැන මට උදව් කළ හැක.`,
  hi: (name) => `नमस्ते${name}. मैं Gringo हूँ। मैं नौकरी, आवास, पैसे भेजने, समुदाय, सेवाओं, दस्तावेज़, सूचनाओं और कार्यों में मदद कर सकता हूँ।`,
});

const HELP_REPLY = Object.freeze({
  en: [
    'Gringo can help with:',
    '- jobs',
    '- housing',
    '- money transfer',
    '- community',
    '- services',
    '- documents',
    '- notifications',
    '- tasks',
    'Change language: /language he, /language th, /language en, /language si, /language hi, or send עברית, ไทย, English, සිංහල, or हिंदी.',
  ].join('\n'),
  he: [
    'גרינגו יכול לעזור עם:',
    '- עבודה',
    '- דיור',
    '- העברת כסף',
    '- קהילה',
    '- שירותים',
    '- מסמכים',
    '- התראות',
    '- משימות',
    'החלפת שפה: /language he, /language th, /language en, /language si, /language hi, או שליחה של עברית, ไทย, English, සිංහල, או हिंदी.',
  ].join('\n'),
  th: [
    'Gringo ช่วยได้เรื่อง:',
    '- งาน',
    '- ที่พัก',
    '- การโอนเงิน',
    '- ชุมชน',
    '- บริการ',
    '- เอกสาร',
    '- การแจ้งเตือน',
    '- งานที่ต้องทำ',
    'เปลี่ยนภาษา: /language he, /language th, /language en, /language si, /language hi หรือส่ง עברית, ไทย, English, සිංහල, หรือ हिंदी',
  ].join('\n'),
  si: [
    'Gringo ට උදව් කළ හැක්කේ:',
    '- රැකියා',
    '- නිවාස',
    '- මුදල් යැවීම',
    '- ප්‍රජාව',
    '- සේවා',
    '- ලේඛන',
    '- දැනුම්දීම්',
    '- කාර්ය',
    'භාෂාව වෙනස් කිරීම: /language he, /language th, /language en, /language si, /language hi, හෝ යවන්න עברית, ไทย, English, සිංහල, හෝ हिंदी.',
  ].join('\n'),
  hi: [
    'Gringo इनमें मदद कर सकता है:',
    '- नौकरी',
    '- आवास',
    '- पैसे भेजना',
    '- समुदाय',
    '- सेवाएँ',
    '- दस्तावेज़',
    '- सूचनाएँ',
    '- कार्य',
    'भाषा बदलें: /language he, /language th, /language en, /language si, /language hi, या भेजें עברית, ไทย, English, සිංහල, या हिंदी।',
  ].join('\n'),
});

function copyLanguage(language) {
  const code = cleanText(language).toLowerCase().split('-')[0];
  return HELP_REPLY[code] ? code : 'en';
}

function createStartIntro(firstName = '', language = 'en') {
  const name = firstName ? ` ${firstName}` : '';
  const builder = START_INTRO[copyLanguage(language)] || START_INTRO.en;
  return builder(name);
}

function createHelpReply(language = 'en') {
  return HELP_REPLY[copyLanguage(language)] || HELP_REPLY.en;
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
  const language = languageFromProfile(profile);
  const matched = await jobService.findMatchingJobs(profile);
  const notice = catalogListReply(matched, language);
  if (notice.blocked) return { reply: notice.blocked, status: 'TELEGRAM_JOBS_EMPTY' };
  const matches = matched.slice(0, 3);
  const prefix = notice.prefix ? `${notice.prefix}\n` : '';
  return {
    reply: `${prefix}Relevant jobs:\n${matches
      .map((job, index) => `${index + 1}. ${job.demo ? 'Demo: ' : ''}${job.title} - ${job.city}\n${job.employerName || ''} ${job.salaryText || ''}`.trim())
      .join('\n\n')}`,
    replyMarkup: inlineKeyboard([
      [button('View Job', 'view', 'jobs', matches[0].jobId)],
      [button('I Found a Job', 'found', 'jobs', 'goal'), button('Stop Job Alerts', 'stop', 'jobs', 'alerts')],
    ]),
    status: 'TELEGRAM_JOBS',
  };
}

async function commandHousing(profile = {}) {
  const language = languageFromProfile(profile);
  const matched = await housingService.findMatchingHousing(profile);
  const notice = catalogListReply(matched, language);
  if (notice.blocked) return { reply: notice.blocked, status: 'TELEGRAM_HOUSING_EMPTY' };
  const matches = matched.slice(0, 3);
  const prefix = notice.prefix ? `${notice.prefix}\n` : '';
  return {
    reply: `${prefix}Relevant housing:\n${matches
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
  const language = languageFromProfile(profile);
  const targetCurrency = profile.preferredCurrency || 'THB';
  const amount = profile.lastMoneyTransferAmount || '2000';
  const described = await moneyService.resolveTransferComparison(amount, 'ILS', targetCurrency);
  const notice = catalogListReply(described.results, language);
  if (notice.blocked && !described.results.length) return { reply: notice.blocked, status: 'TELEGRAM_MONEY' };
  const best = described.results[0];
  const lines = [
    notice.prefix || '',
    `Saved currency: ${targetCurrency}`,
    `Saved transfer country: ${profile.lastMoneyTransferCountry || profile.moneyTransferCountry || profile.country || '-'}`,
    best
      ? `${described.demo ? 'Demo: ' : ''}Best ${described.demo ? 'demo ' : ''}option for ${amount} ILS: ${best.providerName}, recipient gets about ${Math.round(best.finalAmountReceived)} ${targetCurrency}.`
      : assistantCatalogReply('empty', language),
    moneyService.SAFETY_NOTICE,
  ].filter(Boolean);
  return {
    reply: lines.join('\n'),
    status: 'TELEGRAM_MONEY',
  };
}

async function commandCommunity(profile = {}) {
  const language = languageFromProfile(profile);
  const matched = await communityService.getRelevantPosts(profile);
  const notice = catalogListReply(matched, language);
  if (notice.blocked) return { reply: notice.blocked, status: 'TELEGRAM_COMMUNITY_EMPTY' };
  const posts = matched.slice(0, 3);
  const prefix = notice.prefix ? `${notice.prefix}\n` : '';
  return {
    reply: `${prefix}Community updates:\n${posts.map((post, index) => `${index + 1}. ${post.demo ? 'Demo: ' : ''}${post.title} (${post.category})`).join('\n')}`,
    replyMarkup: inlineKeyboard([[button('Open Post', 'view', 'community', posts[0].postId), button('Show More', 'more', 'community', 'posts')]]),
    status: 'TELEGRAM_COMMUNITY',
  };
}

async function commandServices(profile = {}) {
  const language = languageFromProfile(profile);
  const matched = await serviceService.findMatchingServices(profile, {});
  const notice = catalogListReply(matched, language);
  if (notice.blocked) return { reply: notice.blocked, status: 'TELEGRAM_SERVICES_EMPTY' };
  const services = matched.slice(0, 3);
  const prefix = notice.prefix ? `${notice.prefix}\n` : '';
  return {
    reply: `${prefix}Recommended services:\n${services
      .map((service, index) => `${index + 1}. ${service.demo ? 'Demo: ' : ''}${service.title} - ${service.category}\n${service.city || '-'} | ${service.languages || '-'}`)
      .join('\n\n')}`,
    replyMarkup: inlineKeyboard([[button('View Service', 'view', 'services', services[0].id), button('Save Service', 'save', 'services', services[0].id)]]),
    status: 'TELEGRAM_SERVICES',
  };
}

async function commandDocuments(profile = {}) {
  const language = languageFromProfile(profile);
  const documents = await documentService.getUserDocuments(profile.userId);
  if (documents.catalogState === 'unavailable' || !documents.length) {
    return {
      reply: documentService.formatDocumentsForChat(documents, {}, { language }),
      status: documents.catalogState === 'unavailable' ? 'TELEGRAM_DOCUMENTS_UNAVAILABLE' : 'TELEGRAM_DOCUMENTS_EMPTY',
    };
  }
  const summary = documentService.summarizeDocuments(profile, documents);
  const valid = documents.filter((document) => documentService.calculateDocumentStatus(document) === 'Valid').length;
  return {
    reply: [
      documents.catalogDemo ? catalogMessage('demo', language) : '',
      'Documents summary:',
      `Valid: ${valid}`,
      `Missing: ${summary.missingDocumentTypes || 'None'}`,
      `Expiring soon: ${summary.expiringDocumentCount || '0'}`,
      `Expired: ${summary.expiredDocumentCount || '0'}`,
      'Document numbers are masked in Gringo.',
    ].filter(Boolean).join('\n'),
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
  const language = languageFromProfile(profile);
  const owned = await taskService.getUserTasks(profile.userId);
  if (owned.catalogState === 'unavailable') {
    return { reply: taskService.formatTasksForChat(owned, { language }), status: 'TELEGRAM_TASKS_UNAVAILABLE' };
  }
  const today = new Date().toISOString().slice(0, 10);
  const tasks = [...(await taskService.getOverdueTasks(profile.userId)), ...(await taskService.getDueTasks(profile.userId, today))].slice(0, 5);
  if (!tasks.length) return { reply: taskService.formatTasksForChat([], { language, state: 'empty' }), status: 'TELEGRAM_TASKS_EMPTY' };
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
  const intro = createStartIntro(message.firstName, languageFromProfile(user, message.languageCode));
  const reply = onboarding.complete || !onboarding.prompt ? intro : `${intro}\n\n${onboarding.prompt}`;
  return { reply, user, status: 'TELEGRAM_START' };
}

async function processHelp(message = {}) {
  const user = await findOrCreateTelegramUser(message);
  const reply = createHelpReply(languageFromProfile(user, message.languageCode));
  return { reply, user, status: 'TELEGRAM_HELP' };
}

async function processTextMessage(message = {}) {
  const user = await findOrCreateTelegramUser(message);
  const profile = await currentProfile(user.userId);
  const commandResult = await runCommand(message.messageText, {
    ...profile,
    userId: user.userId,
    channelLanguage: message.languageCode,
  });
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
  const language = languageFromProfile(profile);
  if (moduleName === 'jobs') {
    if (!moduleEnabled('jobs')) return assistantCatalogReply('disabled', language);
    const jobs = await jobService.getActiveJobs();
    if (jobs.catalogState === 'unavailable') return assistantCatalogReply('unavailable', language);
    const job = jobs.find((item) => item.jobId === recordId) || null;
    if (!job || job.status !== 'Active') return 'This job is no longer available.';
    const prefix = job.demo ? `${catalogMessage('demo', language)}\n` : '';
    return prefix + [`Job: ${job.title}`, `City: ${job.city || '-'}`, `Employer: ${job.employerName || '-'}`, `Salary: ${job.salaryText || '-'}`].join('\n');
  }
  if (moduleName === 'housing') {
    if (!moduleEnabled('housing')) return assistantCatalogReply('disabled', language);
    const listings = await housingService.getActiveHousingListings();
    if (listings.catalogState === 'unavailable') return assistantCatalogReply('unavailable', language);
    const listing = listings.find((item) => item.housingId === recordId) || null;
    if (!listing || listing.status !== 'Active') return 'This housing listing is no longer available.';
    const prefix = listing.demo ? `${catalogMessage('demo', language)}\n` : '';
    return prefix + [`Housing: ${listing.title}`, `City: ${listing.city || '-'}`, `Price: ${listing.monthlyPrice || '-'} NIS`, `Available: ${listing.availableFrom || '-'}`].join('\n');
  }
  if (moduleName === 'documents') {
    const document = await documentService.getDocumentById(recordId);
    if (!document || document.userId !== user.userId) return 'I cannot show that document.';
    const safe = documentService.toSafeDocument(document);
    const prefix = document.demo ? `${catalogMessage('demo', language)}\n` : '';
    return prefix + [`Document: ${safe.documentType}`, `Status: ${safe.status}`, `Expiry: ${safe.expiryDate || '-'}`, `Number: ${safe.documentNumber || 'Not saved'}`].join('\n');
  }
  if (moduleName === 'community') {
    if (!moduleEnabled('community')) return assistantCatalogReply('disabled', language);
    const posts = await communityService.getPublishedPosts();
    if (posts.catalogState === 'unavailable') return assistantCatalogReply('unavailable', language);
    const post = posts.find((item) => item.postId === recordId) || null;
    if (!post || post.status !== 'Published') return 'This post is not available.';
    const prefix = post.demo ? `${catalogMessage('demo', language)}\n` : '';
    return `${prefix}${post.title}\n${post.body || ''}`.slice(0, 1200);
  }
  if (moduleName === 'services') {
    if (!moduleEnabled('services')) return assistantCatalogReply('disabled', language);
    const services = await serviceService.getServices({});
    if (services.catalogState === 'unavailable') return assistantCatalogReply('unavailable', language);
    const service = services.find((item) => item.id === recordId) || null;
    if (!service) return 'This service is not available.';
    const prefix = service.demo ? `${catalogMessage('demo', language)}\n` : '';
    return prefix + [`Service: ${service.title}`, `Category: ${service.category}`, `City: ${service.city || '-'}`, `Phone: ${service.phone || '-'}`, `Languages: ${service.languages || '-'}`].join('\n');
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
      await taskService.completeTask(recordId, { ownerUserId: user.userId });
      return 'Done. I completed the task.';
    }
    if (action === 'later') {
      await taskService.remindTaskLater(recordId, 'tomorrow', '', { ownerUserId: user.userId });
      return 'Done. I will remind you later inside Gringo.';
    }
  }

  if (moduleName === 'notifications') {
    const notifications = await notificationService.getUserNotifications(user.userId);
    const notification = notifications.find((item) => item.notificationId === recordId);
    if (!notification) return 'I cannot update that notification.';
    if (['Read', 'Dismissed', 'Completed'].includes(notification.status)) return 'This notification was already handled.';
    if (action === 'read') {
      await notificationService.markAsRead(recordId, { ownerUserId: user.userId });
      return 'Done. I marked the notification as read.';
    }
    if (action === 'dismiss') {
      await notificationService.dismissNotification(recordId, { ownerUserId: user.userId });
      return 'Done. I dismissed the notification.';
    }
    if (action === 'later') {
      await notificationService.rescheduleNotification(recordId, 1, { ownerUserId: user.userId });
      return 'Done. I will remind you later inside Gringo.';
    }
    if (action === 'later1') {
      await notificationService.rescheduleNotification(recordId, 1, { ownerUserId: user.userId });
      return 'Done. I will remind you tomorrow inside Gringo.';
    }
    if (action === 'later3') {
      await notificationService.rescheduleNotification(recordId, 3, { ownerUserId: user.userId });
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
    const profile = {
      ...(await currentProfile(user.userId)),
      userId: user.userId,
      channelLanguage: callback.languageCode,
    };
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
