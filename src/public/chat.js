const chatForm = document.querySelector('#chatForm');
const chatInput = document.querySelector('#chatInput');
const chatSendButton = document.querySelector('#chatSendButton');
const chatHistory = document.querySelector('#chatHistory');
const chatAlert = document.querySelector('#chatAlert');
const chatLoading = document.querySelector('#chatLoading');
const chatView = document.querySelector('#chatView');
const goalActions = document.querySelector('#goalActions');
const documentAlerts = document.querySelector('#documentAlerts');
const communityButton = document.querySelector('#communityButton');
const communityView = document.querySelector('#communityView');
const communityList = document.querySelector('#communityList');
const communityPostView = document.querySelector('#communityPostView');
const communityPostDetail = document.querySelector('#communityPostDetail');
const communityComments = document.querySelector('#communityComments');
const communityCommentForm = document.querySelector('#communityCommentForm');
const moneyButton = document.querySelector('#moneyButton');
const moneyView = document.querySelector('#moneyView');
const moneyForm = document.querySelector('#moneyForm');
const moneyResults = document.querySelector('#moneyResults');
const housingButton = document.querySelector('#housingButton');
const housingView = document.querySelector('#housingView');
const housingFilters = document.querySelector('#housingFilters');
const housingList = document.querySelector('#housingList');
const jobsButton = document.querySelector('#jobsButton');
const jobsView = document.querySelector('#jobsView');
const jobsList = document.querySelector('#jobsList');
const servicesButton = document.querySelector('#servicesButton');
const servicesView = document.querySelector('#servicesView');
const servicesList = document.querySelector('#servicesList');
const documentsButton = document.querySelector('#documentsButton');
const documentsView = document.querySelector('#documentsView');
const documentsFilters = document.querySelector('#documentsFilters');
const documentsChecklist = document.querySelector('#documentsChecklist');
const documentsList = document.querySelector('#documentsList');
const documentForm = document.querySelector('#documentForm');
const clearDocumentFormButton = document.querySelector('#clearDocumentFormButton');
const tasksButton = document.querySelector('#tasksButton');
const tasksView = document.querySelector('#tasksView');
const tasksFilters = document.querySelector('#tasksFilters');
const tasksScheduleFilters = document.querySelector('#tasksScheduleFilters');
const tasksSummary = document.querySelector('#tasksSummary');
const tasksList = document.querySelector('#tasksList');
const taskForm = document.querySelector('#taskForm');
const clearTaskFormButton = document.querySelector('#clearTaskFormButton');
const notificationsButton = document.querySelector('#notificationsButton');
const notificationsBadge = document.querySelector('#notificationsBadge');
const notificationsView = document.querySelector('#notificationsView');
const notificationsFilters = document.querySelector('#notificationsFilters');
const notificationsList = document.querySelector('#notificationsList');
const profileButton = document.querySelector('#profileButton');
const profileView = document.querySelector('#profileView');
const profileForm = document.querySelector('#profileForm');
const connectTelegramButton = document.querySelector('#connectTelegramButton');
const disconnectTelegramButton = document.querySelector('#disconnectTelegramButton');
const telegramLinkStatus = document.querySelector('#telegramLinkStatus');
const connectLineButton = document.querySelector('#connectLineButton');
const disconnectLineButton = document.querySelector('#disconnectLineButton');
const lineLinkStatus = document.querySelector('#lineLinkStatus');
const connectedChannelsSummary = document.querySelector('#connectedChannelsSummary');
const profileLanguageStatus = document.querySelector('#profileLanguageStatus');
const returnToChatButton = document.querySelector('#returnToChatButton');
const returnToChatFromCommunityButton = document.querySelector('#returnToChatFromCommunityButton');
const returnToCommunityButton = document.querySelector('#returnToCommunityButton');
const returnToChatFromJobsButton = document.querySelector('#returnToChatFromJobsButton');
const returnToChatFromServicesButton = document.querySelector('#returnToChatFromServicesButton');
const returnToChatFromDocumentsButton = document.querySelector('#returnToChatFromDocumentsButton');
const returnToChatFromTasksButton = document.querySelector('#returnToChatFromTasksButton');
const returnToChatFromNotificationsButton = document.querySelector('#returnToChatFromNotificationsButton');
const returnToChatFromHousingButton = document.querySelector('#returnToChatFromHousingButton');
const returnToChatFromMoneyButton = document.querySelector('#returnToChatFromMoneyButton');

const channelUserId = localStorage.getItem('gringoWebUserId') || `web_${Date.now()}`;
localStorage.setItem('gringoWebUserId', channelUserId);
let currentCommunityPostId = '';

function showError(message) {
  chatAlert.textContent = message;
  chatAlert.hidden = false;
}

function hideError() {
  chatAlert.hidden = true;
  chatAlert.textContent = '';
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function addMessage(author, text) {
  const item = document.createElement('div');
  item.className = `chat-message chat-message-${author.toLowerCase()}`;
  item.textContent = `${author}: ${text}`;
  chatHistory.appendChild(item);
  chatHistory.scrollTop = chatHistory.scrollHeight;
}

async function readJson(response) {
  const body = await response.json();

  if (!response.ok) {
    throw new Error(body.error?.message || 'Request failed.');
  }

  return body;
}

async function sendMessage(message) {
  const response = await fetch('/api/chat/message', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      message,
      channel: 'web',
      channelUserId,
    }),
  });

  return readJson(response);
}

async function loadOnboardingStatus() {
  const response = await fetch(`/api/chat/onboarding-status?channel=web&channelUserId=${encodeURIComponent(channelUserId)}`);
  return readJson(response);
}

function setProfileField(id, value) {
  document.querySelector(id).value = value || '';
}

function normalizeLanguageValue(value = '') {
  const normalized = String(value || '').trim().toLowerCase().replace(/_/g, '-');
  const primary = normalized.split('-')[0];
  const aliases = {
    english: 'en',
    hebrew: 'he',
    iw: 'he',
    arabic: 'ar',
    thai: 'th',
    sinhala: 'si',
    hindi: 'hi',
    russian: 'ru',
    tagalog: 'tl',
    filipino: 'tl',
  };
  const code = aliases[normalized] || aliases[primary] || primary;
  return ['en', 'he', 'ar', 'th', 'si', 'hi', 'ru', 'tl'].includes(code) ? code : '';
}

function getConnectedChannels(profile = {}) {
  const channels = [
    {
      value: 'Web',
      label: `Web - connected${profile.lastInteractionAt ? `, last activity ${profile.lastInteractionAt}` : ''}`,
      connected: true,
    },
    {
      value: 'Telegram',
      label: `Telegram - ${profile.telegramUserId ? 'connected' : 'not connected'}${
        profile.telegramConnectedAt ? `, connected ${profile.telegramConnectedAt}` : ''
      }`,
      connected: Boolean(profile.telegramUserId && profile.telegramChatId),
    },
    {
      value: 'WhatsApp',
      label: `WhatsApp - ${profile.whatsappConnectedAt ? 'connected' : 'not connected'}${
        profile.whatsappLastInboundAt ? `, last activity ${profile.whatsappLastInboundAt}` : ''
      }`,
      connected: Boolean((profile.whatsappPhone || profile.channel === 'whatsapp') && profile.whatsappConnectedAt),
    },
    {
      value: 'LINE',
      label: `LINE - ${profile.lineLinkStatus || 'Not Connected'}${profile.lineLastActiveAt ? `, last activity ${profile.lineLastActiveAt}` : ''}`,
      connected: Boolean(profile.lineUserId && profile.lineLinkStatus === 'Connected'),
    },
  ];
  return channels;
}

function configureChannelSelects(profile = {}) {
  const channels = getConnectedChannels(profile);
  const connectedValues = channels.filter((channel) => channel.connected).map((channel) => channel.value);
  const preferred = connectedValues.includes(profile.preferredChannel) ? profile.preferredChannel : 'Web';
  const fallback =
    profile.fallbackChannel && profile.fallbackChannel !== preferred && connectedValues.includes(profile.fallbackChannel)
      ? profile.fallbackChannel
      : 'None';
  const preferredSelect = document.querySelector('#profilePreferredChannel');
  const fallbackSelect = document.querySelector('#profileFallbackChannel');

  for (const option of preferredSelect.options) {
    option.dataset.connected = connectedValues.includes(option.value) ? 'true' : 'false';
    option.disabled = !connectedValues.includes(option.value);
  }
  for (const option of fallbackSelect.options) {
    option.dataset.connected = option.value === 'None' || connectedValues.includes(option.value) ? 'true' : 'false';
    option.disabled = option.value !== 'None' && (!connectedValues.includes(option.value) || option.value === preferred);
  }
  preferredSelect.value = preferred;
  fallbackSelect.value = fallback;
  connectedChannelsSummary.textContent = channels.map((channel) => channel.label).join(' | ');
}

function fillProfileForm(profile = {}) {
  setProfileField('#profileFullName', profile.fullName);
  setProfileField('#profileTelegramUserId', profile.telegramUserId);
  setProfileField('#profileTelegramChatId', profile.telegramChatId);
  setProfileField('#profileTelegramUsername', profile.telegramUsername);
  setProfileField('#profileTelegramConnectedAt', profile.telegramConnectedAt);
  setProfileField('#profileCountry', profile.country);
  setProfileField('#profilePreferredLanguage', normalizeLanguageValue(profile.preferredLanguage));
  profileLanguageStatus.textContent = profile.preferredLanguage
    ? `Language preference saved: ${profile.preferredLanguage}`
    : `Language mode: Auto${profile.detectedLanguage ? ` | Detected: ${profile.detectedLanguage}` : ''}${
        profile.languageSource ? ` | Source: ${profile.languageSource}` : ''
      }`;
  configureChannelSelects(profile);
  setProfileField('#profileWorkSector', profile.workSector);
  setProfileField('#profileProfession', profile.profession);
  setProfileField('#profileCity', profile.city);
  setProfileField('#profileLookingForJob', profile.lookingForJob);
  setProfileField('#profilePreferredJobCity', profile.preferredJobCity);
  setProfileField('#profilePreferredJobProfession', profile.preferredJobProfession);
  setProfileField('#profileWantsJobAlerts', profile.wantsJobAlerts);
  setProfileField('#profilePreferredCurrency', profile.preferredCurrency);
  setProfileField('#profileWantsExchangeRateAlerts', profile.wantsExchangeRateAlerts);
  setProfileField('#profileInterestedInMoneyTransfers', profile.interestedInMoneyTransfers);
  setProfileField('#profileLookingForHousing', profile.lookingForHousing);
  setProfileField('#profilePreferredHousingCity', profile.preferredHousingCity);
  setProfileField('#profilePreferredHousingArea', profile.preferredHousingArea);
  setProfileField('#profilePreferredHousingType', profile.preferredHousingType);
  setProfileField('#profileMaximumMonthlyBudget', profile.maximumMonthlyBudget);
  setProfileField('#profileMaximumHousingBudget', profile.maximumHousingBudget);
  setProfileField('#profilePreferredMoveInDate', profile.preferredMoveInDate);
  setProfileField('#profileActiveGoals', profile.activeGoals);
  setProfileField('#profileCompletedGoals', profile.completedGoals);
  setProfileField('#profileDocumentsComplete', profile.documentsComplete);
  setProfileField('#profileExpiringDocumentCount', profile.expiringDocumentCount);
  setProfileField('#profileExpiredDocumentCount', profile.expiredDocumentCount);
  setProfileField('#profileNextDocumentExpiryDate', profile.nextDocumentExpiryDate);
  setProfileField('#profileMissingDocumentTypes', profile.missingDocumentTypes);
  setProfileField('#profileJobNotifications', profile.jobNotifications || 'Yes');
  setProfileField('#profileHousingNotifications', profile.housingNotifications || 'Yes');
  setProfileField('#profileDocumentNotifications', profile.documentNotifications || 'Yes');
  setProfileField('#profileMoneyNotifications', profile.moneyNotifications || 'Yes');
  setProfileField('#profileCommunityNotifications', profile.communityNotifications || 'Yes');
  setProfileField('#profileHumanResponseNotifications', profile.humanResponseNotifications || 'Yes');
  setProfileField('#profileTelegramNotificationsEnabled', profile.telegramNotificationsEnabled || 'No');
  setProfileField('#profileTelegramQuietHoursEnabled', profile.telegramQuietHoursEnabled || 'No');
  setProfileField('#profileTelegramQuietHoursStart', profile.telegramQuietHoursStart || '22:00');
  setProfileField('#profileTelegramQuietHoursEnd', profile.telegramQuietHoursEnd || '07:00');
  setProfileField('#profileTelegramTimezone', profile.telegramTimezone || '');
  setProfileField('#profileWhatsappNotificationsEnabled', profile.whatsappNotificationsEnabled || 'No');
  setProfileField('#profileWhatsappQuietHoursEnabled', profile.whatsappQuietHoursEnabled || 'No');
  setProfileField('#profileWhatsappQuietHoursStart', profile.whatsappQuietHoursStart || '22:00');
  setProfileField('#profileWhatsappQuietHoursEnd', profile.whatsappQuietHoursEnd || '07:00');
  setProfileField('#profileWhatsappTimezone', profile.whatsappTimezone || '');
  setProfileField('#profileLineNotificationsEnabled', profile.lineNotificationsEnabled || 'No');
  setProfileField('#profileLineQuietHoursEnabled', profile.lineQuietHoursEnabled || 'No');
  setProfileField('#profileLineQuietHoursStart', profile.lineQuietHoursStart || '22:00');
  setProfileField('#profileLineQuietHoursEnd', profile.lineQuietHoursEnd || '07:00');
  setProfileField('#profileLineTimezone', profile.lineTimezone || '');
  setProfileField('#profileTaskRemindersEnabled', profile.taskRemindersEnabled || 'Yes');
  setProfileField('#profileDefaultReminderTime', profile.defaultReminderTime || '09:00');
  setProfileField('#profileShowCompletedTasks', profile.showCompletedTasks || 'Yes');
  setProfileField('#profileTasksToday', profile.tasksToday || '0');
  setProfileField('#profileOverdueTasks', profile.overdueTasks || '0');
  setProfileField('#profileUpcomingTasks', profile.upcomingTasks || '0');
  const telegramLinked = Boolean(profile.telegramUserId);
  disconnectTelegramButton.hidden = !telegramLinked;
  connectTelegramButton.hidden = telegramLinked;
  telegramLinkStatus.textContent = telegramLinked
    ? 'Telegram is connected to this Gringo profile.'
    : 'Telegram is not connected yet.';
  const lineLinked = Boolean(profile.lineUserId && profile.lineLinkStatus === 'Connected');
  disconnectLineButton.hidden = !lineLinked;
  connectLineButton.hidden = lineLinked;
  lineLinkStatus.textContent = lineLinked
    ? `LINE is connected${profile.lineDisplayName ? ` as ${profile.lineDisplayName}` : ''}.`
    : `LINE status: ${profile.lineLinkStatus || 'Not Connected'}.`;
}

async function loadProfile() {
  const response = await fetch(`/api/chat/profile?channel=web&channelUserId=${encodeURIComponent(channelUserId)}`);
  return readJson(response);
}

async function loadStartupSummary() {
  const response = await fetch(`/api/chat/startup-summary?channel=web&channelUserId=${encodeURIComponent(channelUserId)}`);
  return readJson(response);
}

async function loadActiveJobs() {
  const response = await fetch('/api/jobs');
  return readJson(response);
}

async function loadMatchingJobs() {
  const response = await fetch(`/api/jobs/matches?channel=web&channelUserId=${encodeURIComponent(channelUserId)}`);
  return readJson(response);
}

async function loadServices() {
  const response = await fetch(`/api/services/matches?channel=web&channelUserId=${encodeURIComponent(channelUserId)}`);
  return readJson(response);
}

async function loadDocuments() {
  const response = await fetch(`/api/documents?channel=web&channelUserId=${encodeURIComponent(channelUserId)}`);
  return readJson(response);
}

async function loadDocumentAlerts() {
  const response = await fetch(`/api/documents/alerts?channel=web&channelUserId=${encodeURIComponent(channelUserId)}`);
  return readJson(response);
}

async function renewDocument(documentId, newExpiryDate) {
  const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/renew`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      channel: 'web',
      channelUserId,
      newExpiryDate,
    }),
  });
  return readJson(response);
}

async function loadNotifications(filter = 'All') {
  const params = new URLSearchParams({ channel: 'web', channelUserId, filter });
  const response = await fetch(`/api/notifications?${params.toString()}`);
  return readJson(response);
}

async function loadNotificationSummary() {
  const response = await fetch(`/api/notifications/summary?channel=web&channelUserId=${encodeURIComponent(channelUserId)}`);
  return readJson(response);
}

async function loadTasks(view = 'Today') {
  const params = new URLSearchParams({ channel: 'web', channelUserId });
  if (view && view !== 'All') params.set('view', view);
  const response = await fetch(`/api/tasks?${params.toString()}`);
  return readJson(response);
}

async function loadTaskSchedule(view = 'Today') {
  const params = new URLSearchParams({ channel: 'web', channelUserId, view });
  const response = await fetch(`/api/tasks/schedule?${params.toString()}`);
  return readJson(response);
}

async function loadTaskAlerts() {
  const response = await fetch(`/api/tasks/alerts?channel=web&channelUserId=${encodeURIComponent(channelUserId)}`);
  return readJson(response);
}

async function saveTask(formData) {
  const taskId = formData.get('taskId');
  const reminderAt = formData.get('reminderAt') ? new Date(formData.get('reminderAt')).toISOString() : '';
  const payload = {
    channel: 'web',
    channelUserId,
    title: formData.get('title'),
    description: formData.get('description'),
    category: formData.get('category'),
    priority: formData.get('priority'),
    dueDate: formData.get('dueDate'),
    dueTime: formData.get('dueTime'),
    reminderAt,
    relatedModule: formData.get('relatedModule'),
    recurrenceType: formData.get('recurrenceType') || 'None',
    recurrenceInterval: formData.get('recurrenceInterval') || '1',
    recurrenceEndDate: formData.get('recurrenceEndDate') || '',
    createdBy: 'User',
  };
  const response = await fetch(taskId ? `/api/tasks/${encodeURIComponent(taskId)}` : '/api/tasks', {
    method: taskId ? 'PUT' : 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return readJson(response);
}

async function updateTaskAction(taskId, action) {
  const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ channel: 'web', channelUserId }),
  });
  return readJson(response);
}

async function remindTask(taskId, option, customDate = '') {
  const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/remind`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ channel: 'web', channelUserId, option, customDate }),
  });
  return readJson(response);
}

async function updateNotification(notificationId, action) {
  const response = await fetch(`/api/notifications/${encodeURIComponent(notificationId)}/${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
  });
  return readJson(response);
}

async function remindNotification(notificationId, days) {
  const response = await fetch(`/api/notifications/${encodeURIComponent(notificationId)}/remind`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ days }),
  });
  return readJson(response);
}

async function saveDocument(formData) {
  const file = formData.get('file');
  const payload = {
    channel: 'web',
    channelUserId,
    documentType: formData.get('documentType'),
    documentNumber: formData.get('documentNumber'),
    issuingCountry: formData.get('issuingCountry'),
    issueDate: formData.get('issueDate'),
    expiryDate: formData.get('expiryDate'),
    status: formData.get('status'),
    notes: formData.get('notes'),
    reminderDaysBefore: formData.get('reminderDaysBefore'),
    verified: formData.get('verified'),
  };

  if (file && file.name) {
    payload.fileName = file.name;
    payload.fileSize = file.size;
  }

  const documentId = formData.get('documentId');
  const response = await fetch(documentId ? `/api/documents/${encodeURIComponent(documentId)}` : '/api/documents', {
    method: documentId ? 'PUT' : 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return readJson(response);
}

async function archiveDocument(documentId) {
  const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/archive`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      channel: 'web',
      channelUserId,
    }),
  });
  return readJson(response);
}

async function loadActiveHousing() {
  const response = await fetch('/api/housing');
  return readJson(response);
}

async function loadMatchingHousing() {
  const response = await fetch(`/api/housing/matches?channel=web&channelUserId=${encodeURIComponent(channelUserId)}`);
  return readJson(response);
}

async function loadCommunityPosts() {
  const response = await fetch('/api/community');
  return readJson(response);
}

async function loadRelevantCommunityPosts() {
  const response = await fetch(`/api/community/relevant?channel=web&channelUserId=${encodeURIComponent(channelUserId)}`);
  return readJson(response);
}

async function loadCommunityPost(postId) {
  const response = await fetch(`/api/community/${encodeURIComponent(postId)}`);
  return readJson(response);
}

async function addCommunityComment(postId, body) {
  const response = await fetch(`/api/community/${encodeURIComponent(postId)}/comments`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      channel: 'web',
      channelUserId,
      body,
    }),
  });
  return readJson(response);
}

async function flagCommunityComment(commentId) {
  const response = await fetch(`/api/community/comments/${encodeURIComponent(commentId)}/flag`, {
    method: 'POST',
  });
  return readJson(response);
}

async function loadMoneyDefaults() {
  const response = await fetch(`/api/money/defaults?channel=web&channelUserId=${encodeURIComponent(channelUserId)}`);
  return readJson(response);
}

async function compareMoney(payload) {
  const params = new URLSearchParams(payload);
  const response = await fetch(`/api/money/compare?${params.toString()}`);
  return readJson(response);
}

async function saveProfile(formData) {
  const preferredLanguage = formData.get('preferredLanguage') || null;
  const response = await fetch('/api/chat/profile', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      channel: 'web',
      channelUserId,
      fullName: formData.get('fullName'),
      country: formData.get('country'),
      preferredLanguage,
      preferredChannel: formData.get('preferredChannel'),
      fallbackChannel: formData.get('fallbackChannel'),
      workSector: formData.get('workSector'),
      profession: formData.get('profession'),
      city: formData.get('city'),
      activeGoals: formData.get('activeGoals'),
      completedGoals: formData.get('completedGoals'),
      lookingForJob: formData.get('lookingForJob'),
      preferredJobCity: formData.get('preferredJobCity'),
      preferredJobProfession: formData.get('preferredJobProfession'),
      wantsJobAlerts: formData.get('wantsJobAlerts'),
      preferredCurrency: formData.get('preferredCurrency'),
      wantsExchangeRateAlerts: formData.get('wantsExchangeRateAlerts'),
      interestedInMoneyTransfers: formData.get('interestedInMoneyTransfers'),
      lookingForHousing: formData.get('lookingForHousing'),
      preferredHousingCity: formData.get('preferredHousingCity'),
      preferredHousingArea: formData.get('preferredHousingArea'),
      preferredHousingType: formData.get('preferredHousingType'),
      maximumHousingBudget: formData.get('maximumHousingBudget'),
      maximumMonthlyBudget: formData.get('maximumMonthlyBudget'),
      preferredMoveInDate: formData.get('preferredMoveInDate'),
      jobNotifications: formData.get('jobNotifications'),
      housingNotifications: formData.get('housingNotifications'),
      documentNotifications: formData.get('documentNotifications'),
      moneyNotifications: formData.get('moneyNotifications'),
      communityNotifications: formData.get('communityNotifications'),
      humanResponseNotifications: formData.get('humanResponseNotifications'),
      telegramNotificationsEnabled: formData.get('telegramNotificationsEnabled'),
      telegramQuietHoursEnabled: formData.get('telegramQuietHoursEnabled'),
      telegramQuietHoursStart: formData.get('telegramQuietHoursStart'),
      telegramQuietHoursEnd: formData.get('telegramQuietHoursEnd'),
      telegramTimezone: formData.get('telegramTimezone'),
      whatsappNotificationsEnabled: formData.get('whatsappNotificationsEnabled'),
      whatsappQuietHoursEnabled: formData.get('whatsappQuietHoursEnabled'),
      whatsappQuietHoursStart: formData.get('whatsappQuietHoursStart'),
      whatsappQuietHoursEnd: formData.get('whatsappQuietHoursEnd'),
      whatsappTimezone: formData.get('whatsappTimezone'),
      lineNotificationsEnabled: formData.get('lineNotificationsEnabled'),
      lineQuietHoursEnabled: formData.get('lineQuietHoursEnabled'),
      lineQuietHoursStart: formData.get('lineQuietHoursStart'),
      lineQuietHoursEnd: formData.get('lineQuietHoursEnd'),
      lineTimezone: formData.get('lineTimezone'),
      taskRemindersEnabled: formData.get('taskRemindersEnabled'),
      defaultReminderTime: formData.get('defaultReminderTime'),
      showCompletedTasks: formData.get('showCompletedTasks'),
    }),
  });

  return readJson(response);
}

async function savePreferredLanguage(value) {
  const response = await fetch('/api/chat/profile', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      channel: 'web',
      channelUserId,
      preferredLanguage: value || null,
    }),
  });

  return readJson(response);
}

async function createTelegramLinkCode() {
  const response = await fetch('/api/telegram/link-code', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      channel: 'web',
      channelUserId,
    }),
  });
  return readJson(response);
}

async function disconnectTelegramProfile() {
  const response = await fetch('/api/telegram/disconnect', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      channel: 'web',
      channelUserId,
    }),
  });
  return readJson(response);
}

async function createLineLinkCode() {
  const response = await fetch('/api/line/link-code', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      channel: 'web',
      channelUserId,
    }),
  });
  return readJson(response);
}

async function disconnectLineProfile() {
  const response = await fetch('/api/line/disconnect', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      channel: 'web',
      channelUserId,
    }),
  });
  return readJson(response);
}

function showChat() {
  profileView.hidden = true;
  communityView.hidden = true;
  communityPostView.hidden = true;
  jobsView.hidden = true;
  servicesView.hidden = true;
  documentsView.hidden = true;
  tasksView.hidden = true;
  notificationsView.hidden = true;
  housingView.hidden = true;
  moneyView.hidden = true;
  chatView.hidden = false;
  chatInput.focus();
}

async function showProfile() {
  hideError();
  const result = await loadProfile();
  fillProfileForm(result.profile);
  chatView.hidden = true;
  communityView.hidden = true;
  communityPostView.hidden = true;
  jobsView.hidden = true;
  servicesView.hidden = true;
  documentsView.hidden = true;
  tasksView.hidden = true;
  notificationsView.hidden = true;
  housingView.hidden = true;
  moneyView.hidden = true;
  profileView.hidden = false;
}

function renderJobs(activeJobs = [], matchingJobs = []) {
  const matchesById = new Map(matchingJobs.map((job) => [job.jobId, job]));

  if (!activeJobs.length) {
    jobsList.innerHTML = '<p class="empty-state">No active jobs yet.</p>';
    return;
  }

  jobsList.innerHTML = activeJobs
    .map((job) => {
      const match = matchesById.get(job.jobId)?.match;
      const reason = match ? `${match.score} - ${match.reason}` : 'No profile match yet';

      return `
        <article class="job-item">
          <h3>${escapeHtml(job.title)}</h3>
          <p>${escapeHtml(job.workSector)} - ${escapeHtml(job.profession)} - ${escapeHtml(job.city)}</p>
          <p>Employer: ${escapeHtml(job.employerName)}</p>
          <p>Salary: ${escapeHtml(job.salaryText)}</p>
          <p>Match: ${escapeHtml(reason)}</p>
        </article>
      `;
    })
    .join('');
}

async function showJobs() {
  hideError();
  const [activeResult, matchingResult] = await Promise.all([loadActiveJobs(), loadMatchingJobs()]);
  renderJobs(activeResult.jobs || [], matchingResult.jobs || []);
  chatView.hidden = true;
  communityView.hidden = true;
  communityPostView.hidden = true;
  profileView.hidden = true;
  moneyView.hidden = true;
  housingView.hidden = true;
  servicesView.hidden = true;
  documentsView.hidden = true;
  tasksView.hidden = true;
  notificationsView.hidden = true;
  jobsView.hidden = false;
}

function renderServices(services = []) {
  if (!services.length) {
    servicesList.innerHTML = '<p class="empty-state">No matching services yet.</p>';
    return;
  }

  servicesList.innerHTML = services
    .map((service) => `
      <article class="job-item">
        <h3>${escapeHtml(service.title)}</h3>
        <p>${escapeHtml(service.category)} | Rating: ${escapeHtml(service.rating || '-')} | Verified: ${escapeHtml(service.verified || 'No')}</p>
        <p>${escapeHtml(service.description)}</p>
        <p>Phone: ${escapeHtml(service.phone || '-')}</p>
        <p>Address: ${escapeHtml(service.address || service.city || '-')}</p>
        <p>Languages: ${escapeHtml(service.languages || '-')}</p>
        <p>Opening hours: ${escapeHtml(service.openingHours || '-')}</p>
        <p>Match: ${escapeHtml(service.match?.reason || 'Relevant service')}</p>
      </article>
    `)
    .join('');
}

async function showServices() {
  hideError();
  const result = await loadServices();
  renderServices(result.services || []);
  chatView.hidden = true;
  communityView.hidden = true;
  communityPostView.hidden = true;
  profileView.hidden = true;
  jobsView.hidden = true;
  housingView.hidden = true;
  moneyView.hidden = true;
  documentsView.hidden = true;
  tasksView.hidden = true;
  notificationsView.hidden = true;
  servicesView.hidden = false;
}

function documentStatusClass(status) {
  if (status === 'Expired') return 'document-status-expired';
  if (status === 'Expiring Soon') return 'document-status-expiring';
  if (status === 'Missing') return 'document-status-missing';
  return '';
}

function renderDocumentsChecklist(checklist = []) {
  if (!checklist.length) {
    documentsChecklist.innerHTML = '<p class="empty-state">No required checklist available yet.</p>';
    return;
  }

  documentsChecklist.innerHTML = `
    <h3>Required documents checklist</h3>
    ${checklist
      .map(
        (item) => `
          <article class="document-item ${documentStatusClass(item.status)}">
            <h3>${escapeHtml(item.documentType)}${item.optional ? ' (optional)' : ''}</h3>
            <p>Status: ${escapeHtml(item.status)}</p>
            ${item.expiryDate ? `<p>Expiry date: ${escapeHtml(item.expiryDate)}</p>` : ''}
          </article>
        `
      )
      .join('')}
  `;
}

function documentPassesFilters(document, filters = {}) {
  if (filters.documentType && document.documentType !== filters.documentType) return false;
  if (filters.status && document.status !== filters.status) return false;
  return true;
}

function renderDocuments(documents = [], filters = {}) {
  const visibleDocuments = documents.filter((document) => documentPassesFilters(document, filters));

  if (!visibleDocuments.length) {
    documentsList.innerHTML = '<p class="empty-state">No saved documents match these filters.</p>';
    return;
  }

  documentsList.innerHTML = `
    <h3>Saved documents</h3>
    ${visibleDocuments
      .map(
        (document) => `
          <article class="document-item ${documentStatusClass(document.status)}" data-document-id="${escapeHtml(document.documentId)}">
            <h3>${escapeHtml(document.documentType)}</h3>
            <p>Status: ${escapeHtml(document.status)}${document.expiryDate ? ` | Expiry: ${escapeHtml(document.expiryDate)}` : ''}</p>
            <p>Number ending: ${escapeHtml(document.documentNumber || '-')} | Verified: ${escapeHtml(document.verified || 'No')}</p>
            <p>File: ${escapeHtml(document.fileName || 'No local file selected')}</p>
            <p>${escapeHtml(document.notes || '')}</p>
            <div class="row-actions">
              <button class="button button-secondary button-small" type="button" data-edit-document="${escapeHtml(document.documentId)}">Edit</button>
              <button class="button button-danger button-small" type="button" data-archive-document="${escapeHtml(document.documentId)}">Archive</button>
            </div>
          </article>
        `
      )
      .join('')}
  `;
}

async function renderDocumentAlerts() {
  const snoozed = JSON.parse(localStorage.getItem('gringoSnoozedDocumentAlerts') || '{}');
  const result = await loadDocumentAlerts();
  const alerts = (result.alerts || []).filter((alert) => snoozed[alert.alertId] !== new Date().toISOString().slice(0, 10));

  if (!alerts.length) {
    documentAlerts.hidden = true;
    documentAlerts.innerHTML = '';
    return;
  }

  documentAlerts.hidden = false;
  documentAlerts.innerHTML = `
    ${alerts
      .slice(0, 3)
      .map(
        (alert) => `
          <article class="document-alert document-item ${documentStatusClass(alert.type)}" data-alert-id="${escapeHtml(alert.alertId)}" data-document-id="${escapeHtml(alert.documentId)}" data-document-type="${escapeHtml(alert.documentType)}">
            <h3>${escapeHtml(alert.documentType)}</h3>
            <p>${escapeHtml(alert.message)}</p>
            <p>${escapeHtml(result.safetyNotice)}</p>
            <div class="renewal-form" hidden>
              <label><span>New expiry date</span><input data-renewal-date type="date"></label>
              <button class="button button-small" data-document-alert-action="save-renewal" type="button">Save renewal</button>
            </div>
            <div class="row-actions">
              <button class="button button-secondary button-small" data-document-alert-action="view" type="button">View Document</button>
              <button class="button button-secondary button-small" data-document-alert-action="update" type="button">Update Document</button>
              ${alert.documentId ? '<button class="button button-small" data-document-alert-action="renew" type="button">Mark as Renewed</button>' : ''}
              <button class="button button-secondary button-small" data-document-alert-action="later" type="button">Remind Me Later</button>
            </div>
          </article>
        `
      )
      .join('')}
  `;
}

async function renderTaskAlerts() {
  const snoozed = JSON.parse(localStorage.getItem('gringoSnoozedTaskAlerts') || '{}');
  const result = await loadTaskAlerts();
  const alerts = (result.alerts || []).filter((alert) => snoozed[alert.taskId] !== new Date().toISOString().slice(0, 10));
  if (!alerts.length) {
    if (!documentAlerts.innerHTML.trim()) documentAlerts.hidden = true;
    return;
  }

  documentAlerts.hidden = false;
  documentAlerts.insertAdjacentHTML(
    'beforeend',
    alerts
      .slice(0, 3)
      .map(
        (alert) => `
          <article class="document-alert document-item" data-task-alert-id="${escapeHtml(alert.taskId)}">
            <h3>${escapeHtml(alert.title)}</h3>
            <p>${escapeHtml(alert.message)}</p>
            <div class="row-actions">
              <button class="button button-secondary button-small" data-task-alert-action="open" type="button">Open Task</button>
              <button class="button button-small" data-task-alert-action="complete" type="button">Complete</button>
              <button class="button button-secondary button-small" data-task-alert-action="later" type="button">Remind Me Later</button>
            </div>
          </article>
        `
      )
      .join('')
  );
}

function clearDocumentForm() {
  documentForm.reset();
  document.querySelector('#documentId').value = '';
  document.querySelector('#documentReminderDaysBefore').value = '30';
  document.querySelector('#documentVerified').value = 'No';
}

function fillDocumentForm(document = {}) {
  document.querySelector('#documentId').value = document.documentId || '';
  document.querySelector('#documentType').value = document.documentType || '';
  document.querySelector('#documentNumber').value = document.documentNumber || '';
  document.querySelector('#documentIssuingCountry').value = document.issuingCountry || '';
  document.querySelector('#documentIssueDate').value = document.issueDate || '';
  document.querySelector('#documentExpiryDate').value = document.expiryDate || '';
  document.querySelector('#documentStatus').value = document.status || '';
  document.querySelector('#documentReminderDaysBefore').value = document.reminderDaysBefore || '30';
  document.querySelector('#documentVerified').value = document.verified || 'No';
  document.querySelector('#documentNotes').value = document.notes || '';
}

async function showDocuments(filters = {}) {
  hideError();
  const result = await loadDocuments();
  renderDocumentsChecklist(result.summary?.checklist || []);
  renderDocuments(result.documents || [], filters);
  chatView.hidden = true;
  communityView.hidden = true;
  communityPostView.hidden = true;
  profileView.hidden = true;
  jobsView.hidden = true;
  servicesView.hidden = true;
  housingView.hidden = true;
  moneyView.hidden = true;
  tasksView.hidden = true;
  notificationsView.hidden = true;
  documentsView.hidden = false;
}

function renderTasks(tasks = [], summary = {}) {
  tasksSummary.innerHTML = `
    <article class="job-item">
      <h3>Task summary</h3>
      <p>Today: ${escapeHtml(summary.tasksToday || 0)} | Overdue: ${escapeHtml(summary.overdueTasks || 0)} | Upcoming: ${escapeHtml(summary.upcomingTasks || 0)}</p>
    </article>
  `;

  if (!tasks.length) {
    tasksList.innerHTML = '<p class="empty-state">No tasks match this view.</p>';
    return;
  }

  tasksList.innerHTML = tasks
    .map((task) => `
      <article class="job-item" data-task-id="${escapeHtml(task.taskId)}">
        <h3>${escapeHtml(task.title)}</h3>
        <p>${escapeHtml(task.category)} | ${escapeHtml(task.priority)} | ${escapeHtml(task.status)}</p>
        <p>Due: ${escapeHtml(task.dueDate || '-')} ${escapeHtml(task.dueTime || '')}</p>
        <p>Related: ${escapeHtml(task.relatedModule || '-')}</p>
        <p>${escapeHtml(task.description || '')}</p>
        <p>Recurrence: ${escapeHtml(task.recurrenceType || 'None')}</p>
        <label class="inline-field">Choose reminder <input type="datetime-local" data-task-custom-reminder></label>
        <div class="row-actions">
          <button class="button button-small" data-task-action="complete" type="button">Complete</button>
          <button class="button button-secondary button-small" data-task-action="edit" type="button">Edit</button>
          <button class="button button-secondary button-small" data-task-action="remind-1h" type="button">Remind Me in 1 Hour</button>
          <button class="button button-secondary button-small" data-task-action="remind-tomorrow" type="button">Remind Me Tomorrow</button>
          <button class="button button-secondary button-small" data-task-action="remind-3d" type="button">Remind Me in 3 Days</button>
          <button class="button button-secondary button-small" data-task-action="remind-date" type="button">Choose Date</button>
          <button class="button button-danger button-small" data-task-action="dismiss" type="button">Dismiss</button>
        </div>
      </article>
    `)
    .join('');
}

function fillTaskForm(task = {}) {
  document.querySelector('#taskId').value = task.taskId || '';
  document.querySelector('#taskTitle').value = task.title || '';
  document.querySelector('#taskDescription').value = task.description || '';
  document.querySelector('#taskCategory').value = task.category || 'Personal';
  document.querySelector('#taskPriority').value = task.priority || 'Normal';
  document.querySelector('#taskDueDate').value = task.dueDate || '';
  document.querySelector('#taskDueTime').value = task.dueTime || '';
  document.querySelector('#taskReminderAt').value = task.reminderAt ? task.reminderAt.slice(0, 16) : '';
  document.querySelector('#taskRelatedModule').value = task.relatedModule || '';
  document.querySelector('#taskRecurrenceType').value = task.recurrenceType || 'None';
  document.querySelector('#taskRecurrenceInterval').value = task.recurrenceInterval || '1';
  document.querySelector('#taskRecurrenceEndDate').value = task.recurrenceEndDate || '';
}

function clearTaskForm() {
  fillTaskForm({ category: 'Personal', priority: 'Normal' });
}

async function showTasks(view = 'Today') {
  hideError();
  const result = await loadTasks(view);
  renderTasks(result.tasks || [], result.summary || {});
  chatView.hidden = true;
  communityView.hidden = true;
  communityPostView.hidden = true;
  profileView.hidden = true;
  jobsView.hidden = true;
  servicesView.hidden = true;
  housingView.hidden = true;
  moneyView.hidden = true;
  documentsView.hidden = true;
  notificationsView.hidden = true;
  tasksView.hidden = false;
}

async function showTaskSchedule(view = 'Today') {
  hideError();
  const result = await loadTaskSchedule(view);
  renderTasks(result.tasks || [], result.summary || {});
  chatView.hidden = true;
  communityView.hidden = true;
  communityPostView.hidden = true;
  profileView.hidden = true;
  jobsView.hidden = true;
  servicesView.hidden = true;
  housingView.hidden = true;
  moneyView.hidden = true;
  documentsView.hidden = true;
  notificationsView.hidden = true;
  tasksView.hidden = false;
}

function typeForFilter(filter) {
  const map = {
    Jobs: 'Job Match',
    Housing: 'Housing Match',
    Documents: 'Document Expiry',
    Money: 'Exchange Rate',
    Community: 'Community Update',
    'Human Responses': 'Human Response',
    Tasks: 'Task Reminder',
  };
  return map[filter] || '';
}

function renderNotifications(notifications = []) {
  if (!notifications.length) {
    notificationsList.innerHTML = '<p class="empty-state">No notifications match this filter.</p>';
    return;
  }

  notificationsList.innerHTML = notifications
    .map(
      (notification) => `
        <article class="notification-item ${notification.status === 'New' ? 'notification-unread' : ''}" data-notification-id="${escapeHtml(notification.notificationId)}">
          <h3>${escapeHtml(notification.title)}</h3>
          <p>${escapeHtml(notification.message)}</p>
          <p>${escapeHtml(notification.type)} | ${escapeHtml(notification.priority)} | ${escapeHtml(notification.status)} | ${escapeHtml(formatDate(notification.createdAt))}</p>
          <div class="row-actions">
            ${notification.actionLabel ? `<button class="button button-secondary button-small" data-notification-action="open" data-action-url="${escapeHtml(notification.actionUrl)}" type="button">${escapeHtml(notification.actionLabel)}</button>` : ''}
            <button class="button button-small" data-notification-action="read" type="button">Mark as Read</button>
            <button class="button button-danger button-small" data-notification-action="dismiss" type="button">Dismiss</button>
            <button class="button button-secondary button-small" data-notification-action="remind" data-days="1" type="button">Remind Me Tomorrow</button>
            <button class="button button-secondary button-small" data-notification-action="remind" data-days="3" type="button">Remind Me in 3 Days</button>
            <button class="button button-secondary button-small" data-notification-action="remind" data-days="7" type="button">Remind Me Next Week</button>
          </div>
        </article>
      `
    )
    .join('');
}

async function refreshNotificationBadge() {
  const summary = await loadNotificationSummary();
  notificationsBadge.textContent = summary.unreadCount;
  notificationsBadge.hidden = !summary.unreadCount;
  return summary;
}

async function showNotificationStartupSummary() {
  const summary = await refreshNotificationBadge();
  if (!summary.unreadCount) return;
  const summaryItems = Array.isArray(summary.summary) ? summary.summary : [];
  const lines = summaryItems.slice(0, 4).map((item) => `- ${item.count} ${String(item.type || '').toLowerCase()}`);
  addMessage('Gringo', `Hello Somchai. You have ${summary.unreadCount} new updates:\n${lines.join('\n')}`);
}

async function showNotifications(filter = 'All') {
  hideError();
  const type = typeForFilter(filter);
  const result = await loadNotifications(filter === 'Unread' ? 'Unread' : 'All');
  const notifications = type ? (result.notifications || []).filter((notification) => notification.type === type || (filter === 'Documents' && notification.type === 'Missing Document')) : result.notifications || [];
  renderNotifications(notifications);
  notificationsBadge.textContent = result.unreadCount;
  notificationsBadge.hidden = !result.unreadCount;
  chatView.hidden = true;
  communityView.hidden = true;
  communityPostView.hidden = true;
  profileView.hidden = true;
  jobsView.hidden = true;
  servicesView.hidden = true;
  housingView.hidden = true;
  moneyView.hidden = true;
  documentsView.hidden = true;
  tasksView.hidden = true;
  notificationsView.hidden = false;
}

function previewText(value) {
  const text = String(value || '').trim();
  return text.length > 140 ? `${text.slice(0, 137)}...` : text;
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-US');
}

function renderCommunityPosts(posts = [], safetyNotice = '') {
  if (!posts.length) {
    communityList.innerHTML = `<p class="empty-state">No published community posts yet.</p><p>${escapeHtml(safetyNotice)}</p>`;
    return;
  }

  communityList.innerHTML = `
    ${posts
      .map((post) => `
        <article class="community-item">
          <p>${escapeHtml(post.category)} - ${escapeHtml(post.language)} - ${escapeHtml(formatDate(post.publishedAt))}</p>
          <h3>${escapeHtml(post.title)}</h3>
          <p>${escapeHtml(previewText(post.body))}</p>
          <p>Relevance: ${escapeHtml(post.relevance?.reason || 'Recent community update')}</p>
          <button class="button button-secondary button-small" type="button" data-open-post="${escapeHtml(post.postId)}">Open</button>
        </article>
      `)
      .join('')}
    <p>${escapeHtml(safetyNotice)}</p>
  `;
}

async function showCommunity() {
  hideError();
  const [publishedResult, relevantResult] = await Promise.all([loadCommunityPosts(), loadRelevantCommunityPosts()]);
  const relevanceByPostId = new Map((relevantResult.posts || []).map((post) => [post.postId, post.relevance]));
  const posts = (publishedResult.posts || []).map((post) => ({
    ...post,
    relevance: relevanceByPostId.get(post.postId),
  }));
  renderCommunityPosts(posts, publishedResult.safetyNotice);
  chatView.hidden = true;
  communityPostView.hidden = true;
  profileView.hidden = true;
  jobsView.hidden = true;
  servicesView.hidden = true;
  housingView.hidden = true;
  moneyView.hidden = true;
  documentsView.hidden = true;
  tasksView.hidden = true;
  notificationsView.hidden = true;
  communityView.hidden = false;
}

function renderComments(comments = []) {
  if (!comments.length) {
    communityComments.innerHTML = '<p class="empty-state">No comments yet.</p>';
    return;
  }

  communityComments.innerHTML = comments
    .map((comment) => `
      <article class="comment-item">
        <p><strong>${escapeHtml(comment.userName)}</strong> - ${escapeHtml(comment.language)} - ${escapeHtml(formatDate(comment.createdAt))}</p>
        <p>${escapeHtml(comment.body)}</p>
        <p>Status: ${escapeHtml(comment.status)}</p>
        <button class="button button-danger button-small" type="button" data-flag-comment="${escapeHtml(comment.commentId)}">Report</button>
      </article>
    `)
    .join('');
}

async function showCommunityPost(postId) {
  hideError();
  const result = await loadCommunityPost(postId);
  const post = result.post;
  currentCommunityPostId = post.postId;
  communityPostDetail.innerHTML = `
    <p>${escapeHtml(post.category)} - ${escapeHtml(post.language)} - ${escapeHtml(formatDate(post.publishedAt))}</p>
    <h2>${escapeHtml(post.title)}</h2>
    <p>${escapeHtml(post.body)}</p>
    ${post.sourceUrl ? `<p>Source: <a href="${escapeHtml(post.sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(post.sourceName || post.sourceUrl)}</a></p>` : ''}
    <p>${escapeHtml(result.safetyNotice)}</p>
  `;
  renderComments(result.comments || []);
  chatView.hidden = true;
  communityView.hidden = true;
  profileView.hidden = true;
  jobsView.hidden = true;
  servicesView.hidden = true;
  housingView.hidden = true;
  moneyView.hidden = true;
  documentsView.hidden = true;
  tasksView.hidden = true;
  notificationsView.hidden = true;
  communityPostView.hidden = false;
}

function listingPassesFilters(listing, filters) {
  const city = String(filters.city || '').trim().toLowerCase();
  const housingType = String(filters.housingType || '').trim();
  const maximumBudget = Number(filters.maximumMonthlyBudget || 0);
  const price = Number(listing.monthlyPrice || 0);

  if (city && String(listing.city || '').toLowerCase() !== city) return false;
  if (housingType && listing.housingType !== housingType) return false;
  if (maximumBudget && price > maximumBudget) return false;

  return true;
}

function renderHousing(activeListings = [], matchingListings = [], filters = {}, safetyNotice = '') {
  const matchesById = new Map(matchingListings.map((listing) => [listing.housingId, listing]));
  const visibleListings = activeListings.filter((listing) => listingPassesFilters(listing, filters));

  if (!visibleListings.length) {
    housingList.innerHTML = `<p class="empty-state">No active housing listings match these filters.</p><p>${escapeHtml(safetyNotice)}</p>`;
    return;
  }

  housingList.innerHTML = `
    ${visibleListings
      .map((listing) => {
        const match = matchesById.get(listing.housingId)?.match;
        const reason = match ? `${match.score} - ${match.reason}` : 'No profile match yet';

        return `
          <article class="housing-item">
            <h3>${escapeHtml(listing.title)}</h3>
            <p>${escapeHtml(listing.housingType)} - ${escapeHtml(listing.city)} - ${escapeHtml(listing.area)}</p>
            <p>Price: ${escapeHtml(listing.monthlyPrice)} NIS monthly. Bills included: ${escapeHtml(listing.billsIncluded)}</p>
            <p>Available: ${escapeHtml(listing.availableFrom)}</p>
            <p>Contact: ${escapeHtml(listing.contactName || listing.contactMethod || 'Ask Gringo for details')}</p>
            <p>Match: ${escapeHtml(reason)}</p>
          </article>
        `;
      })
      .join('')}
    <p>${escapeHtml(safetyNotice)}</p>
  `;
}

async function showHousing(filters = {}) {
  hideError();
  const [activeResult, matchingResult] = await Promise.all([loadActiveHousing(), loadMatchingHousing()]);
  renderHousing(activeResult.listings || [], matchingResult.listings || [], filters, activeResult.safetyNotice);
  chatView.hidden = true;
  communityView.hidden = true;
  communityPostView.hidden = true;
  profileView.hidden = true;
  jobsView.hidden = true;
  servicesView.hidden = true;
  moneyView.hidden = true;
  documentsView.hidden = true;
  tasksView.hidden = true;
  notificationsView.hidden = true;
  housingView.hidden = false;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function renderMoneyResults(result) {
  const rateText = result.rate
    ? `Current demo exchange rate: 1 ${escapeHtml(result.sourceCurrency)} = ${escapeHtml(result.rate.exchangeRate)} ${escapeHtml(result.targetCurrency)}`
    : `No demo exchange rate found for ${escapeHtml(result.sourceCurrency)} to ${escapeHtml(result.targetCurrency)}.`;
  const providers = result.results || [];

  moneyResults.innerHTML = `
    <div class="money-item best-option">
      <h3>${escapeHtml(result.demoNotice)}</h3>
      <p>${rateText}</p>
      <p>${escapeHtml(result.safetyNotice)}</p>
    </div>
    ${providers
      .map((provider, index) => `
        <article class="money-item ${index === 0 ? 'best-option' : ''}">
          <h3>${index === 0 ? 'Best option: ' : ''}${escapeHtml(provider.providerName)}</h3>
          <p>Recipient receives: ${formatNumber(provider.finalAmountReceived)} ${escapeHtml(provider.targetCurrency)}</p>
          <p>Fee: ${formatNumber(provider.transferFee)} ${escapeHtml(provider.sourceCurrency)}</p>
          <p>Provider rate: ${formatNumber(provider.providerExchangeRate)} ${escapeHtml(provider.targetCurrency)}</p>
          <p>Delivery: ${escapeHtml(provider.estimatedDeliveryTime)}</p>
          <p>Payout: ${escapeHtml(provider.payoutMethod)}</p>
        </article>
      `)
      .join('')}
  `;
}

async function showMoney() {
  hideError();
  const defaults = await loadMoneyDefaults();
  document.querySelector('#moneyAmount').value = defaults.amount || '2000';
  document.querySelector('#moneyDestinationCountry').value = defaults.country || 'Thailand';
  document.querySelector('#moneyTargetCurrency').value = defaults.targetCurrency || 'THB';
  document.querySelector('#moneySourceCurrency').value = defaults.sourceCurrency || 'ILS';
  chatView.hidden = true;
  communityView.hidden = true;
  communityPostView.hidden = true;
  profileView.hidden = true;
  jobsView.hidden = true;
  servicesView.hidden = true;
  housingView.hidden = true;
  documentsView.hidden = true;
  tasksView.hidden = true;
  notificationsView.hidden = true;
  moneyView.hidden = false;
}

chatForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideError();

  const message = chatInput.value.trim();
  if (!message) return;

  addMessage('You', message);
  chatInput.value = '';
  chatSendButton.disabled = true;
  chatLoading.hidden = false;

  try {
    const result = await sendMessage(message);
    addMessage('Gringo', result.reply);
  } catch (error) {
    showError(error.message);
  } finally {
    chatSendButton.disabled = false;
    chatLoading.hidden = true;
    chatInput.focus();
  }
});

goalActions.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-goal-message]');
  if (!button) return;
  hideError();

  const message = button.dataset.goalMessage;
  addMessage('You', message);
  chatSendButton.disabled = true;
  chatLoading.hidden = false;

  try {
    const result = await sendMessage(message);
    addMessage('Gringo', result.reply);
  } catch (error) {
    showError(error.message);
  } finally {
    chatSendButton.disabled = false;
    chatLoading.hidden = true;
    chatInput.focus();
  }
});

profileButton.addEventListener('click', async () => {
  try {
    await showProfile();
  } catch (error) {
    showError(error.message);
  }
});

connectTelegramButton.addEventListener('click', async () => {
  hideError();
  connectTelegramButton.disabled = true;

  try {
    const result = await createTelegramLinkCode();
    const expiry = result.linkCode?.expiresAt ? new Date(result.linkCode.expiresAt).toLocaleString() : 'soon';
    telegramLinkStatus.textContent = `${result.instruction} Code expires at ${expiry}.`;
  } catch (error) {
    showError(error.message);
  } finally {
    connectTelegramButton.disabled = false;
  }
});

disconnectTelegramButton.addEventListener('click', async () => {
  hideError();
  if (!window.confirm('Disconnect Telegram from this Gringo profile?')) return;
  disconnectTelegramButton.disabled = true;

  try {
    const result = await disconnectTelegramProfile();
    fillProfileForm(result.profile || {});
    telegramLinkStatus.textContent = 'Telegram was disconnected. You can link again with a new code.';
  } catch (error) {
    showError(error.message);
  } finally {
    disconnectTelegramButton.disabled = false;
  }
});

connectLineButton.addEventListener('click', async () => {
  hideError();
  connectLineButton.disabled = true;

  try {
    const result = await createLineLinkCode();
    const expiry = result.linkCode?.expiresAt ? new Date(result.linkCode.expiresAt).toLocaleString() : 'soon';
    lineLinkStatus.textContent = `${result.instruction}. Code expires at ${expiry}.`;
  } catch (error) {
    showError(error.message);
  } finally {
    connectLineButton.disabled = false;
  }
});

disconnectLineButton.addEventListener('click', async () => {
  hideError();
  if (!window.confirm('Disconnect LINE from this Gringo profile?')) return;
  disconnectLineButton.disabled = true;

  try {
    const result = await disconnectLineProfile();
    fillProfileForm(result.profile || {});
    lineLinkStatus.textContent = 'LINE was disconnected. You can link again with a new code.';
  } catch (error) {
    showError(error.message);
  } finally {
    disconnectLineButton.disabled = false;
  }
});

jobsButton.addEventListener('click', async () => {
  try {
    await showJobs();
  } catch (error) {
    showError(error.message);
  }
});

servicesButton.addEventListener('click', async () => {
  try {
    await showServices();
  } catch (error) {
    showError(error.message);
  }
});

documentsButton.addEventListener('click', async () => {
  try {
    await showDocuments();
  } catch (error) {
    showError(error.message);
  }
});

tasksButton.addEventListener('click', async () => {
  try {
    await showTasks(document.querySelector('#tasksViewFilter')?.value || 'Today');
  } catch (error) {
    showError(error.message);
  }
});

notificationsButton.addEventListener('click', async () => {
  try {
    await showNotifications(document.querySelector('#notificationsFilter')?.value || 'All');
  } catch (error) {
    showError(error.message);
  }
});

communityButton.addEventListener('click', async () => {
  try {
    await showCommunity();
  } catch (error) {
    showError(error.message);
  }
});

housingButton.addEventListener('click', async () => {
  try {
    await showHousing();
  } catch (error) {
    showError(error.message);
  }
});

moneyButton.addEventListener('click', async () => {
  try {
    await showMoney();
  } catch (error) {
    showError(error.message);
  }
});

documentAlerts.addEventListener('click', async (event) => {
  const taskButton = event.target.closest('[data-task-alert-action]');
  const taskItem = event.target.closest('[data-task-alert-id]');
  if (taskButton && taskItem) {
    try {
      if (taskButton.dataset.taskAlertAction === 'open') {
        await showTasks('Today');
        return;
      }
      if (taskButton.dataset.taskAlertAction === 'complete') {
        await updateTaskAction(taskItem.dataset.taskAlertId, 'complete');
        taskItem.remove();
        if (!documentAlerts.querySelector('[data-alert-id], [data-task-alert-id]')) documentAlerts.hidden = true;
        return;
      }
      if (taskButton.dataset.taskAlertAction === 'later') {
        const snoozed = JSON.parse(localStorage.getItem('gringoSnoozedTaskAlerts') || '{}');
        snoozed[taskItem.dataset.taskAlertId] = new Date().toISOString().slice(0, 10);
        localStorage.setItem('gringoSnoozedTaskAlerts', JSON.stringify(snoozed));
        taskItem.remove();
        if (!documentAlerts.querySelector('[data-alert-id], [data-task-alert-id]')) documentAlerts.hidden = true;
      }
    } catch (error) {
      showError(error.message);
    }
    return;
  }

  const button = event.target.closest('[data-document-alert-action]');
  const item = event.target.closest('[data-alert-id]');
  if (!button || !item) return;
  const action = button.dataset.documentAlertAction;

  try {
    if (action === 'view' || action === 'update') {
      await showDocuments({ documentType: item.dataset.documentType });
      if (action === 'update' && item.dataset.documentId) {
        const result = await loadDocuments();
        const document = (result.documents || []).find((entry) => entry.documentId === item.dataset.documentId);
        if (document) fillDocumentForm(document);
      }
      return;
    }

    if (action === 'renew') {
      item.querySelector('.renewal-form').hidden = false;
      return;
    }

    if (action === 'save-renewal') {
      const newExpiryDate = item.querySelector('[data-renewal-date]').value;
      if (!newExpiryDate) {
        showError('Please enter the new expiry date.');
        return;
      }
      const result = await renewDocument(item.dataset.documentId, newExpiryDate);
      addMessage('Gringo', `Saved the renewed ${result.document.documentType}. New expiry date: ${result.document.expiryDate}.`);
      await renderDocumentAlerts();
      return;
    }

    if (action === 'later') {
      const snoozed = JSON.parse(localStorage.getItem('gringoSnoozedDocumentAlerts') || '{}');
      snoozed[item.dataset.alertId] = new Date().toISOString().slice(0, 10);
      localStorage.setItem('gringoSnoozedDocumentAlerts', JSON.stringify(snoozed));
      item.remove();
      if (!documentAlerts.querySelector('[data-alert-id]')) documentAlerts.hidden = true;
    }
  } catch (error) {
    showError(error.message);
  }
});

returnToChatButton.addEventListener('click', showChat);
returnToChatFromCommunityButton.addEventListener('click', showChat);
returnToCommunityButton.addEventListener('click', async () => {
  try {
    await showCommunity();
  } catch (error) {
    showError(error.message);
  }
});
returnToChatFromJobsButton.addEventListener('click', showChat);
returnToChatFromServicesButton.addEventListener('click', showChat);
returnToChatFromDocumentsButton.addEventListener('click', showChat);
returnToChatFromTasksButton.addEventListener('click', showChat);
returnToChatFromNotificationsButton.addEventListener('click', showChat);
returnToChatFromHousingButton.addEventListener('click', showChat);
returnToChatFromMoneyButton.addEventListener('click', showChat);

communityList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-open-post]');
  if (!button) return;

  try {
    await showCommunityPost(button.dataset.openPost);
  } catch (error) {
    showError(error.message);
  }
});

communityComments.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-flag-comment]');
  if (!button) return;

  try {
    await flagCommunityComment(button.dataset.flagComment);
    await showCommunityPost(currentCommunityPostId);
  } catch (error) {
    showError(error.message);
  }
});

communityCommentForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideError();

  try {
    const formData = new FormData(communityCommentForm);
    await addCommunityComment(currentCommunityPostId, formData.get('body'));
    communityCommentForm.reset();
    await showCommunityPost(currentCommunityPostId);
  } catch (error) {
    showError(error.message);
  }
});

housingFilters.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideError();

  try {
    const formData = new FormData(housingFilters);
    await showHousing({
      city: formData.get('city'),
      housingType: formData.get('housingType'),
      maximumMonthlyBudget: formData.get('maximumMonthlyBudget'),
    });
  } catch (error) {
    showError(error.message);
  }
});

documentsFilters.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideError();

  try {
    const formData = new FormData(documentsFilters);
    await showDocuments({
      documentType: formData.get('documentType'),
      status: formData.get('status'),
    });
  } catch (error) {
    showError(error.message);
  }
});

documentsList.addEventListener('click', async (event) => {
  const editButton = event.target.closest('[data-edit-document]');
  const archiveButton = event.target.closest('[data-archive-document]');

  try {
    if (editButton) {
      const result = await loadDocuments();
      const document = (result.documents || []).find((item) => item.documentId === editButton.dataset.editDocument);
      if (document) fillDocumentForm(document);
      return;
    }

    if (archiveButton) {
      await archiveDocument(archiveButton.dataset.archiveDocument);
      clearDocumentForm();
      await showDocuments();
    }
  } catch (error) {
    showError(error.message);
  }
});

tasksFilters.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideError();

  try {
    const formData = new FormData(tasksFilters);
    await showTasks(formData.get('view') || 'Today');
  } catch (error) {
    showError(error.message);
  }
});

tasksScheduleFilters.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideError();

  try {
    const formData = new FormData(tasksScheduleFilters);
    await showTaskSchedule(formData.get('scheduleView') || 'Today');
  } catch (error) {
    showError(error.message);
  }
});

tasksList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-task-action]');
  const item = event.target.closest('[data-task-id]');
  if (!button || !item) return;

  try {
    if (button.dataset.taskAction === 'edit') {
      const result = await loadTasks('All');
      const task = (result.tasks || []).find((entry) => entry.taskId === item.dataset.taskId);
      if (task) fillTaskForm(task);
      return;
    }

    if (button.dataset.taskAction === 'complete') {
      await updateTaskAction(item.dataset.taskId, 'complete');
    } else if (button.dataset.taskAction === 'dismiss') {
      await updateTaskAction(item.dataset.taskId, 'dismiss');
    } else if (button.dataset.taskAction === 'remind-1h') {
      await remindTask(item.dataset.taskId, '1h');
    } else if (button.dataset.taskAction === 'remind-tomorrow') {
      await remindTask(item.dataset.taskId, 'tomorrow');
    } else if (button.dataset.taskAction === 'remind-3d') {
      await remindTask(item.dataset.taskId, '3d');
    } else if (button.dataset.taskAction === 'remind-date') {
      const customDate = item.querySelector('[data-task-custom-reminder]')?.value;
      if (!customDate) throw new Error('Choose a reminder date first.');
      await remindTask(item.dataset.taskId, 'date', customDate);
    }
    await showTasks(document.querySelector('#tasksViewFilter').value || 'Today');
  } catch (error) {
    showError(error.message);
  }
});

notificationsFilters.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideError();

  try {
    const formData = new FormData(notificationsFilters);
    await showNotifications(formData.get('filter') || 'All');
  } catch (error) {
    showError(error.message);
  }
});

notificationsList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-notification-action]');
  const item = event.target.closest('[data-notification-id]');
  if (!button || !item) return;

  try {
    if (button.dataset.notificationAction === 'read') {
      await updateNotification(item.dataset.notificationId, 'read');
    } else if (button.dataset.notificationAction === 'dismiss') {
      await updateNotification(item.dataset.notificationId, 'dismiss');
    } else if (button.dataset.notificationAction === 'remind') {
      await remindNotification(item.dataset.notificationId, button.dataset.days || 1);
    } else if (button.dataset.notificationAction === 'open') {
      await updateNotification(item.dataset.notificationId, 'read');
      const actionUrl = button.dataset.actionUrl;
      if (actionUrl === '#jobs') await showJobs();
      else if (actionUrl === '#housing') await showHousing();
      else if (actionUrl === '#documents') await showDocuments();
      else if (actionUrl === '#money') await showMoney();
      else if (actionUrl === '#community') await showCommunity();
      else if (actionUrl === '#tasks') await showTasks();
      else await showNotifications(document.querySelector('#notificationsFilter').value || 'All');
      return;
    }
    await showNotifications(document.querySelector('#notificationsFilter').value || 'All');
  } catch (error) {
    showError(error.message);
  }
});

clearDocumentFormButton.addEventListener('click', clearDocumentForm);
clearTaskFormButton.addEventListener('click', clearTaskForm);

documentForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideError();

  try {
    await saveDocument(new FormData(documentForm));
    clearDocumentForm();
    await showDocuments();
  } catch (error) {
    showError(error.message);
  }
});

taskForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideError();

  try {
    await saveTask(new FormData(taskForm));
    clearTaskForm();
    await showTasks(document.querySelector('#tasksViewFilter').value || 'Today');
  } catch (error) {
    showError(error.message);
  }
});

moneyForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideError();

  try {
    const formData = new FormData(moneyForm);
    const result = await compareMoney({
      amount: formData.get('amount'),
      sourceCurrency: formData.get('sourceCurrency'),
      targetCurrency: formData.get('targetCurrency'),
    });
    renderMoneyResults(result);
  } catch (error) {
    showError(error.message);
  }
});

document.querySelector('#profilePreferredChannel').addEventListener('change', (event) => {
  const fallbackSelect = document.querySelector('#profileFallbackChannel');
  for (const option of fallbackSelect.options) {
    if (option.value !== 'None') option.disabled = option.dataset.connected !== 'true' || option.value === event.target.value;
  }
  if (fallbackSelect.value === event.target.value) fallbackSelect.value = 'None';
});

document.querySelector('#profilePreferredLanguage').addEventListener('change', async (event) => {
  hideError();
  profileLanguageStatus.textContent = 'Saving language preference...';

  try {
    const result = await savePreferredLanguage(event.target.value);
    fillProfileForm(result.profile);
    profileLanguageStatus.textContent = event.target.value
      ? `Language preference saved: ${result.profile.preferredLanguage}`
      : 'Language mode: Auto';
  } catch (error) {
    showError(error.message);
    const result = await loadProfile();
    fillProfileForm(result.profile);
  }
});

profileForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideError();

  try {
    const result = await saveProfile(new FormData(profileForm));
    fillProfileForm(result.profile);
    addMessage('Gringo', 'Profile saved.');
    showChat();
  } catch (error) {
    showError(error.message);
  }
});

async function startChat() {
  try {
    const status = await loadOnboardingStatus();

    if (!status.complete && status.prompt) {
      addMessage('Gringo', status.prompt);
      return;
    }

    const startup = await loadStartupSummary();
    addMessage('Gringo', startup.message || startup.summary || 'Hello Somchai. Your schedule is ready inside Gringo.');
    await showNotificationStartupSummary();
    await renderDocumentAlerts();
    await renderTaskAlerts();
  } catch (error) {
    showError(error.message);
  }
}

startChat();
