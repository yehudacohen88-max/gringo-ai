const { LANGUAGE_ALIASES, SUPPORTED_LANGUAGES } = require('../language/language.constants');

const USER_PROFILE_FIELDS = [
  'userId',
  'channel',
  'channelUserId',
  'fullName',
  'language',
  'preferredLanguage',
  'country',
  'city',
  'profession',
  'workSector',
  'wantsJobAlerts',
  'currentEmployer',
  'interests',
  'activeGoals',
  'completedGoals',
  'lookingForJob',
  'preferredJobCity',
  'preferredJobProfession',
  'preferredCurrency',
  'wantsExchangeRateAlerts',
  'moneyTransferCountry',
  'interestedInMoneyTransfers',
  'lastMoneyTransferAmount',
  'lastMoneyTransferCountry',
  'lookingForHousing',
  'preferredHousingCity',
  'preferredHousingArea',
  'preferredHousingType',
  'maximumHousingBudget',
  'maximumMonthlyBudget',
  'preferredMoveInDate',
  'lastRelevantPostIds',
  'lastRecommendedJobIds',
  'lastRecommendedHousingIds',
  'lastViewedServices',
  'lastServiceCategory',
  'lastServiceCity',
  'documentsComplete',
  'missingDocumentTypes',
  'expiringDocumentCount',
  'expiredDocumentCount',
  'nextDocumentExpiryDate',
  'jobNotifications',
  'housingNotifications',
  'documentNotifications',
  'moneyNotifications',
  'communityNotifications',
  'humanResponseNotifications',
  'taskRemindersEnabled',
  'defaultReminderTime',
  'showCompletedTasks',
  'tasksToday',
  'overdueTasks',
  'upcomingTasks',
  'telegramUserId',
  'telegramChatId',
  'telegramUsername',
  'telegramConnectedAt',
  'lastActivityAt',
  'lastQuestion',
  'lastCategory',
  'lastInteractionAt',
  'createdAt',
  'updatedAt',
  'telegramNotificationsEnabled',
  'telegramQuietHoursEnabled',
  'telegramQuietHoursStart',
  'telegramQuietHoursEnd',
  'telegramTimezone',
  'whatsappPhone',
  'whatsappConnectedAt',
  'whatsappNotificationsEnabled',
  'whatsappLastInboundAt',
  'whatsappQuietHoursEnabled',
  'whatsappQuietHoursStart',
  'whatsappQuietHoursEnd',
  'whatsappTimezone',
  'lineUserId',
  'lineConnectedAt',
  'preferredChannel',
  'fallbackChannel',
  'lineDisplayName',
  'lineLastActiveAt',
  'lineLinkStatus',
  'lineNotificationsEnabled',
  'lineQuietHoursEnabled',
  'lineQuietHoursStart',
  'lineQuietHoursEnd',
  'lineTimezone',
  'detectedLanguage',
  'languageSource',
  'languageUpdatedAt',
];

const LANGUAGE_SOURCES = ['explicit', 'profile', 'channel', 'text', 'default'];

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function normalizeProfileLanguageCode(value) {
  const raw = cleanText(value);
  if (!raw) return '';

  const normalized = raw.toLowerCase().replace(/_/g, '-');
  const primary = normalized.split('-')[0];
  const aliased = LANGUAGE_ALIASES[normalized] || LANGUAGE_ALIASES[primary] || primary;

  return SUPPORTED_LANGUAGES[aliased] ? aliased : '';
}

function normalizeLanguageSource(value) {
  const source = cleanText(value).toLowerCase();
  return LANGUAGE_SOURCES.includes(source) ? source : '';
}

function normalizeProfileLanguageFields(profile = {}) {
  const normalized = { ...profile };

  if (Object.prototype.hasOwnProperty.call(normalized, 'preferredLanguage')) {
    normalized.preferredLanguage = normalizeProfileLanguageCode(normalized.preferredLanguage);
  }

  if (Object.prototype.hasOwnProperty.call(normalized, 'detectedLanguage')) {
    normalized.detectedLanguage = normalizeProfileLanguageCode(normalized.detectedLanguage);
  }

  if (Object.prototype.hasOwnProperty.call(normalized, 'languageSource')) {
    normalized.languageSource = normalizeLanguageSource(normalized.languageSource);
  }

  return normalized;
}

const USER_PROFILE_DEFAULTS = {
  channel: 'internal',
  channelUserId: '',
  telegramUserId: '',
  telegramChatId: '',
  telegramUsername: '',
  telegramConnectedAt: '',
  fullName: '',
  language: '',
  preferredLanguage: '',
  preferredChannel: '',
  fallbackChannel: '',
  country: '',
  city: '',
  profession: '',
  workSector: '',
  wantsJobAlerts: '',
  currentEmployer: '',
  interests: '',
  activeGoals: '',
  completedGoals: '',
  lookingForJob: '',
  preferredJobCity: '',
  preferredJobProfession: '',
  preferredCurrency: '',
  wantsExchangeRateAlerts: '',
  moneyTransferCountry: '',
  interestedInMoneyTransfers: '',
  lastMoneyTransferAmount: '',
  lastMoneyTransferCountry: '',
  lookingForHousing: '',
  preferredHousingCity: '',
  preferredHousingArea: '',
  preferredHousingType: '',
  maximumHousingBudget: '',
  maximumMonthlyBudget: '',
  preferredMoveInDate: '',
  lastRelevantPostIds: '',
  lastRecommendedJobIds: '',
  lastRecommendedHousingIds: '',
  lastViewedServices: '',
  lastServiceCategory: '',
  lastServiceCity: '',
  documentsComplete: '',
  missingDocumentTypes: '',
  expiringDocumentCount: '',
  expiredDocumentCount: '',
  nextDocumentExpiryDate: '',
  jobNotifications: 'Yes',
  housingNotifications: 'Yes',
  documentNotifications: 'Yes',
  moneyNotifications: 'Yes',
  communityNotifications: 'Yes',
  humanResponseNotifications: 'Yes',
  taskRemindersEnabled: 'Yes',
  defaultReminderTime: '09:00',
  showCompletedTasks: 'Yes',
  tasksToday: '0',
  overdueTasks: '0',
  upcomingTasks: '0',
  telegramNotificationsEnabled: 'No',
  telegramQuietHoursEnabled: 'No',
  telegramQuietHoursStart: '22:00',
  telegramQuietHoursEnd: '07:00',
  telegramTimezone: '',
  whatsappPhone: '',
  whatsappConnectedAt: '',
  whatsappNotificationsEnabled: 'No',
  whatsappLastInboundAt: '',
  whatsappQuietHoursEnabled: 'No',
  whatsappQuietHoursStart: '22:00',
  whatsappQuietHoursEnd: '07:00',
  whatsappTimezone: '',
  lineUserId: '',
  lineConnectedAt: '',
  lineDisplayName: '',
  lineLastActiveAt: '',
  lineLinkStatus: 'Not Connected',
  lineNotificationsEnabled: 'No',
  lineQuietHoursEnabled: 'No',
  lineQuietHoursStart: '22:00',
  lineQuietHoursEnd: '07:00',
  lineTimezone: '',
  detectedLanguage: '',
  languageSource: '',
  languageUpdatedAt: '',
  lastActivityAt: '',
  lastQuestion: '',
  lastCategory: '',
  lastInteractionAt: '',
};

module.exports = {
  LANGUAGE_SOURCES,
  USER_PROFILE_DEFAULTS,
  USER_PROFILE_FIELDS,
  normalizeLanguageSource,
  normalizeProfileLanguageCode,
  normalizeProfileLanguageFields,
};
