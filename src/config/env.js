try {
  require('dotenv').config();
} catch (error) {
  // dotenv is optional for local fallback/test runs where environment variables are already provided.
}

function normalizePrivateKey(value) {
  return value ? value.replace(/\\n/g, '\n') : '';
}

const DEV_ADMIN_API_KEY = 'dev-admin-key';
const MIN_PRODUCTION_ADMIN_API_KEY_LENGTH = 32;
const MIN_UNIQUE_PRODUCTION_ADMIN_KEY_CHARACTERS = 4;
const HOSTING_ENV_MARKERS = [
  'VERCEL',
  'RENDER',
  'RAILWAY_ENVIRONMENT',
  'FLY_APP_NAME',
  'K_SERVICE',
  'DYNO',
  'HEROKU_APP_NAME',
  'AWS_EXECUTION_ENV',
];
const WEAK_ADMIN_KEY_PLACEHOLDERS = [
  'change-me',
  'changeme',
  'password',
  'secret',
  'placeholder',
  'replace-me',
  'your-secret-here',
];

function envValuePresent(sourceEnv, name) {
  const value = sourceEnv ? sourceEnv[name] : '';
  return typeof value === 'string' && value.trim() !== '';
}

function isHostedDeployment(sourceEnv) {
  return HOSTING_ENV_MARKERS.some((name) => envValuePresent(sourceEnv, name));
}

function isDevAdminOptIn(sourceEnv) {
  const value = sourceEnv && typeof sourceEnv.ALLOW_DEV_ADMIN_KEY === 'string'
    ? sourceEnv.ALLOW_DEV_ADMIN_KEY.trim().toLowerCase()
    : '';
  return value === 'true' || value === '1' || value === 'yes';
}

function devDefaultPermitted(nodeEnv, sourceEnv) {
  if (nodeEnv !== 'development' && nodeEnv !== 'test') return false;
  if (isHostedDeployment(sourceEnv)) return false;
  return isDevAdminOptIn(sourceEnv);
}

function isOnlyRepeatedToken(value, token) {
  if (!token || value.length < token.length) return false;
  return value === token.repeat(Math.ceil(value.length / token.length)).slice(0, value.length);
}

// Rejects obvious placeholders and low-diversity values only. A passing key is not proof of randomness.
function isObviouslyWeakProductionKey(key) {
  const normalized = key.toLowerCase();
  if (new Set(normalized).size < MIN_UNIQUE_PRODUCTION_ADMIN_KEY_CHARACTERS) return true;
  return WEAK_ADMIN_KEY_PLACEHOLDERS.some(
    (placeholder) => normalized === placeholder || isOnlyRepeatedToken(normalized, placeholder)
  );
}

function readTrimmed(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// WhatsApp is optional. A missing app secret or verify token must not stop the
// process: web chat, Telegram, and LINE keep running. Startup only warns when
// the connector is explicitly enabled in development or production. Requests
// still fail closed in every environment. There is no unsigned opt-in.
function warnIfEnabledWhatsAppCannotVerify(nodeEnv, config) {
  if (nodeEnv !== 'production' && nodeEnv !== 'development') return;
  if (!config.enabled || (config.appSecret && config.verifyToken)) return;
  console.warn(
    '[startup] WHATSAPP_ENABLED is true but WHATSAPP_APP_SECRET or WHATSAPP_VERIFY_TOKEN is missing. WhatsApp stays optional, so startup continues. POST /api/whatsapp/webhook fails closed until WHATSAPP_APP_SECRET is set, and GET verification returns 403 until WHATSAPP_VERIFY_TOKEN is set. This warning does not include secret values.'
  );
}

function buildWhatsAppConfig(rawNodeEnv, sourceEnv) {
  const nodeEnv = typeof rawNodeEnv === 'string' ? rawNodeEnv.trim() : '';
  const config = {
    enabled: String(sourceEnv.WHATSAPP_ENABLED || 'false').toLowerCase() === 'true',
    verifyToken: readTrimmed(sourceEnv.WHATSAPP_VERIFY_TOKEN),
    appSecret: readTrimmed(sourceEnv.WHATSAPP_APP_SECRET),
    accessToken: sourceEnv.WHATSAPP_ACCESS_TOKEN || '',
    phoneNumberId: sourceEnv.WHATSAPP_PHONE_NUMBER_ID || '',
    businessAccountId: sourceEnv.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
  };
  warnIfEnabledWhatsAppCannotVerify(nodeEnv, config);
  return config;
}

function devDefaultRefusalMessage(nodeEnv, sourceEnv) {
  if (isHostedDeployment(sourceEnv)) {
    return 'Refusing to start: ADMIN_API_KEY must be a unique secret. The development default is disabled because this process looks like a hosted deployment. Store the key only in the hosting provider secret store.';
  }
  if (nodeEnv !== 'development' && nodeEnv !== 'test') {
    return 'Refusing to start: ADMIN_API_KEY must be a unique secret. The development default is available only when NODE_ENV is development or test, ALLOW_DEV_ADMIN_KEY=true, and the process is not hosted.';
  }
  return 'Refusing to start: ADMIN_API_KEY must be a unique secret, or set ALLOW_DEV_ADMIN_KEY=true for local development or tests. The development default is disabled without that opt-in.';
}

function resolveAdminApiKey(nodeEnv, rawValue, sourceEnv = {}) {
  const normalizedEnv = typeof nodeEnv === 'string' ? nodeEnv.trim() : '';
  const configured = typeof rawValue === 'string' ? rawValue.trim() : '';

  if (normalizedEnv === 'production') {
    if (!configured) {
      throw new Error(
        'Refusing to start: ADMIN_API_KEY is missing. Set ADMIN_API_KEY to a unique secret of at least 32 characters from a cryptographically secure source. The development default is not allowed in production.'
      );
    }
    if (configured === DEV_ADMIN_API_KEY) {
      throw new Error(
        'Refusing to start: ADMIN_API_KEY is set to the development default. Set ADMIN_API_KEY to a unique secret of at least 32 characters from a cryptographically secure source.'
      );
    }
    if (configured.length < MIN_PRODUCTION_ADMIN_API_KEY_LENGTH) {
      throw new Error(
        'Refusing to start: ADMIN_API_KEY is too short. Set ADMIN_API_KEY to a unique secret of at least 32 characters from a cryptographically secure source.'
      );
    }
    if (isObviouslyWeakProductionKey(configured)) {
      throw new Error(
        'Refusing to start: ADMIN_API_KEY is an obvious placeholder or has too little character variety. Generate a new value from a cryptographically secure source. This check cannot prove that the key is truly random.'
      );
    }
    return configured;
  }

  const usingDevDefault = !configured || configured === DEV_ADMIN_API_KEY;
  if (usingDevDefault) {
    if (!devDefaultPermitted(normalizedEnv, sourceEnv)) {
      throw new Error(devDefaultRefusalMessage(normalizedEnv, sourceEnv));
    }
    if (normalizedEnv === 'development') {
      console.warn(
        '[startup] ADMIN_API_KEY is unset or still the development default. Local loopback admin requests can continue because ALLOW_DEV_ADMIN_KEY is set. Production and hosted deployments refuse to start unless ADMIN_API_KEY is a unique secret of at least 32 characters. This process cannot prove that a key is truly random.'
      );
    }
    return DEV_ADMIN_API_KEY;
  }

  return configured;
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  adminApiKey: resolveAdminApiKey(process.env.NODE_ENV, process.env.ADMIN_API_KEY, process.env),
  telegram: {
    enabled: String(process.env.TELEGRAM_BOT_ENABLED || 'false').toLowerCase() === 'true',
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    mode: process.env.TELEGRAM_BOT_MODE || 'polling',
    pollingTimeoutSeconds: Number(process.env.TELEGRAM_POLLING_TIMEOUT_SECONDS || 30),
    linkCodeTtlMinutes: Number(process.env.TELEGRAM_LINK_CODE_TTL_MINUTES || 10),
  },
  whatsapp: buildWhatsAppConfig(process.env.NODE_ENV, process.env),
  line: {
    enabled: String(process.env.LINE_ENABLED || 'false').toLowerCase() === 'true',
    channelId: process.env.LINE_CHANNEL_ID || '',
    channelSecret: process.env.LINE_CHANNEL_SECRET || '',
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  },
  ai: {
    provider: process.env.AI_PROVIDER || 'openai',
    apiKey: process.env.AI_API_KEY || '',
    model: process.env.AI_MODEL || 'gpt-4.1-mini',
  },
  translation: {
    provider: process.env.TRANSLATION_PROVIDER || '',
    apiKey: process.env.TRANSLATION_API_KEY || '',
    model: process.env.TRANSLATION_MODEL || '',
    timeoutMs: Number(process.env.TRANSLATION_TIMEOUT_MS || 30000),
    cacheEnabled: String(process.env.TRANSLATION_CACHE_ENABLED || 'true').toLowerCase() !== 'false',
    cacheTtlMinutes: Number(process.env.TRANSLATION_CACHE_TTL_MINUTES || 60),
  },
  money: {
    referenceRateEndpoint: process.env.REFERENCE_EXCHANGE_RATE_API_ENDPOINT || '',
    referenceRateTimeoutMs: Number(process.env.REFERENCE_EXCHANGE_RATE_TIMEOUT_MS || 5000),
  },
  conversationMemory: {
    enabled: String(process.env.CONVERSATION_MEMORY_ENABLED || 'true').toLowerCase() !== 'false',
    maxMessages: Number(process.env.CONVERSATION_MEMORY_MAX_MESSAGES || 20),
  },
  contextManager: {
    enabled: String(process.env.CONTEXT_MANAGER_ENABLED || 'true').toLowerCase() !== 'false',
    maxMessages: Number(process.env.CONTEXT_MAX_MESSAGES || 12),
    maxCharacters: Number(process.env.CONTEXT_MAX_CHARACTERS || 12000),
  },
  conversationSummary: {
    enabled: String(process.env.CONVERSATION_SUMMARY_ENABLED || 'true').toLowerCase() !== 'false',
    triggerMessages: Number(process.env.SUMMARY_TRIGGER_MESSAGES || 20),
    maxCharacters: Number(process.env.SUMMARY_MAX_CHARACTERS || 2500),
  },
  memoryLifecycle: {
    idleMinutes: Number(process.env.MEMORY_IDLE_MINUTES || 30),
    archiveHours: Number(process.env.MEMORY_ARCHIVE_HOURS || 24),
    cleanupEnabled: String(process.env.MEMORY_CLEANUP_ENABLED || 'true').toLowerCase() !== 'false',
  },
  googleSheets: {
    spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID || '',
    clientEmail: process.env.GOOGLE_SHEETS_CLIENT_EMAIL || '',
    privateKey: normalizePrivateKey(process.env.GOOGLE_SHEETS_PRIVATE_KEY),
    sheets: {
      contacts: process.env.GOOGLE_SHEETS_CONTACTS_SHEET_NAME || 'Contacts',
      contactNotes: process.env.GOOGLE_SHEETS_CONTACT_NOTES_SHEET_NAME || 'ContactNotes',
      contactHistory: process.env.GOOGLE_SHEETS_CONTACT_HISTORY_SHEET_NAME || 'ContactHistory',
      workers: process.env.GOOGLE_SHEETS_WORKERS_SHEET_NAME || 'Workers',
      workerHistory: process.env.GOOGLE_SHEETS_WORKER_HISTORY_SHEET_NAME || 'WorkerHistory',
      jobs: process.env.GOOGLE_SHEETS_JOBS_SHEET_NAME || 'Jobs',
      exchangeRates: process.env.GOOGLE_SHEETS_EXCHANGE_RATES_SHEET_NAME || 'ExchangeRates',
      moneyTransferProviders:
        process.env.GOOGLE_SHEETS_MONEY_TRANSFER_PROVIDERS_SHEET_NAME || 'MoneyTransferProviders',
      userSubmittedTransferQuotes:
        process.env.GOOGLE_SHEETS_USER_SUBMITTED_TRANSFER_QUOTES_SHEET_NAME || 'UserSubmittedTransferQuotes',
      housingListings: process.env.GOOGLE_SHEETS_HOUSING_LISTINGS_SHEET_NAME || 'HousingListings',
      communityPosts: process.env.GOOGLE_SHEETS_COMMUNITY_POSTS_SHEET_NAME || 'CommunityPosts',
      communityComments: process.env.GOOGLE_SHEETS_COMMUNITY_COMMENTS_SHEET_NAME || 'CommunityComments',
      humanFollowUps: process.env.GOOGLE_SHEETS_HUMAN_FOLLOW_UPS_SHEET_NAME || 'HumanFollowUps',
      adminNotes: process.env.GOOGLE_SHEETS_ADMIN_NOTES_SHEET_NAME || 'AdminNotes',
      knowledgeDrafts: process.env.GOOGLE_SHEETS_KNOWLEDGE_DRAFTS_SHEET_NAME || 'KnowledgeDrafts',
      userProfiles: process.env.GOOGLE_SHEETS_USER_PROFILES_SHEET_NAME || 'UserProfiles',
      conversationHistory: process.env.GOOGLE_SHEETS_CONVERSATION_HISTORY_SHEET_NAME || 'ConversationHistory',
      dailyReports: process.env.GOOGLE_SHEETS_DAILY_REPORTS_SHEET_NAME || 'DailyReports',
      weeklyReports: process.env.GOOGLE_SHEETS_WEEKLY_REPORTS_SHEET_NAME || 'WeeklyReports',
      recommendations: process.env.GOOGLE_SHEETS_RECOMMENDATIONS_SHEET_NAME || 'Recommendations',
      contentDrafts: process.env.GOOGLE_SHEETS_CONTENT_DRAFTS_SHEET_NAME || 'ContentDrafts',
      services: process.env.GOOGLE_SHEETS_SERVICES_SHEET_NAME || 'Services',
      userDocuments: process.env.GOOGLE_SHEETS_USER_DOCUMENTS_SHEET_NAME || 'UserDocuments',
      userDocumentHistory: process.env.GOOGLE_SHEETS_USER_DOCUMENT_HISTORY_SHEET_NAME || 'UserDocumentHistory',
      userNotifications: process.env.GOOGLE_SHEETS_USER_NOTIFICATIONS_SHEET_NAME || 'UserNotifications',
      userTasks: process.env.GOOGLE_SHEETS_USER_TASKS_SHEET_NAME || 'UserTasks',
      userTaskHistory: process.env.GOOGLE_SHEETS_USER_TASK_HISTORY_SHEET_NAME || 'UserTaskHistory',
      telegramLinkCodes: process.env.GOOGLE_SHEETS_TELEGRAM_LINK_CODES_SHEET_NAME || 'TelegramLinkCodes',
      telegramLinkHistory: process.env.GOOGLE_SHEETS_TELEGRAM_LINK_HISTORY_SHEET_NAME || 'TelegramLinkHistory',
      telegramDeliveries: process.env.GOOGLE_SHEETS_TELEGRAM_DELIVERIES_SHEET_NAME || 'TelegramDeliveries',
      channelLinkCodes: process.env.GOOGLE_SHEETS_CHANNEL_LINK_CODES_SHEET_NAME || 'ChannelLinkCodes',
      channelLinkHistory: process.env.GOOGLE_SHEETS_CHANNEL_LINK_HISTORY_SHEET_NAME || 'ChannelLinkHistory',
      lineDeliveries: process.env.GOOGLE_SHEETS_LINE_DELIVERIES_SHEET_NAME || 'LineDeliveries',
      lineDeliveryHistory: process.env.GOOGLE_SHEETS_LINE_DELIVERY_HISTORY_SHEET_NAME || 'LineDeliveryHistory',
      whatsappTemplates: process.env.GOOGLE_SHEETS_WHATSAPP_TEMPLATES_SHEET_NAME || 'WhatsAppTemplates',
      whatsappDeliveries: process.env.GOOGLE_SHEETS_WHATSAPP_DELIVERIES_SHEET_NAME || 'WhatsAppDeliveries',
      whatsappDeliveryHistory: process.env.GOOGLE_SHEETS_WHATSAPP_DELIVERY_HISTORY_SHEET_NAME || 'WhatsAppDeliveryHistory',
    },
  },
};

module.exports = { env, DEV_ADMIN_API_KEY };
