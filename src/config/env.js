try {
  require('dotenv').config();
} catch (error) {
  // dotenv is optional for local fallback/test runs where environment variables are already provided.
}

function normalizePrivateKey(value) {
  return value ? value.replace(/\\n/g, '\n') : '';
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  adminApiKey: process.env.ADMIN_API_KEY || 'dev-admin-key',
  telegram: {
    enabled: String(process.env.TELEGRAM_BOT_ENABLED || 'false').toLowerCase() === 'true',
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    mode: process.env.TELEGRAM_BOT_MODE || 'polling',
    pollingTimeoutSeconds: Number(process.env.TELEGRAM_POLLING_TIMEOUT_SECONDS || 30),
    linkCodeTtlMinutes: Number(process.env.TELEGRAM_LINK_CODE_TTL_MINUTES || 10),
  },
  whatsapp: {
    enabled: String(process.env.WHATSAPP_ENABLED || 'false').toLowerCase() === 'true',
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
  },
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

module.exports = { env };
