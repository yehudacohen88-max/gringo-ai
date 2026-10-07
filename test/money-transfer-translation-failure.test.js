const test = require('node:test');
const assert = require('node:assert/strict');

const { aiProviderService } = require('../src/modules/ai-provider');
const { coreAgentService } = require('../src/modules/core-agent');
const { crmAgentService } = require('../src/modules/crm-agent');
const { knowledgeAgentService } = require('../src/modules/knowledge-agent');
const {
  setUserSubmittedTransferQuoteRepositoryForTest,
  supervisorService,
} = require('../src/modules/agents');
const { translationService } = require('../src/modules/translation');

const ORIGINAL_ENV = {
  MULTI_AGENT_ENABLED: process.env.MULTI_AGENT_ENABLED,
  SUPERVISOR_ENABLED: process.env.SUPERVISOR_ENABLED,
  AGENT_EXECUTION_ENABLED: process.env.AGENT_EXECUTION_ENABLED,
  ACTIVE_SUPERVISOR_DELIVERY_ENABLED: process.env.ACTIVE_SUPERVISOR_DELIVERY_ENABLED,
  SUPERVISOR_MULTI_INTENT_LIVE_ENABLED: process.env.SUPERVISOR_MULTI_INTENT_LIVE_ENABLED,
};

const HE_SALARY_TRANSFER = 'לא קיבלתי את המשכורת שלי ואני רוצה לשלוח 2,000 ILS לתאילנד.';
const HE_SALARY_ONLY = 'לא קיבלתי את המשכורת שלי.';
const HEBREW_TRANSFER = 'אני רוצה לשלוח 2000 שקל לתאילנד, איפה הכי משתלם?';
const ENGLISH_TRANSFER = 'I want to send 2000 ILS to Thailand';
const TRANSLATED_SALARY_TRANSFER = 'I did not receive my salary and I want to send 2,000 ILS to Thailand.';
const HEBREW_NOTICE = 'ייתכן שחלק מההודעה לא הובן בגלל בעיה זמנית בעיבוד השפה. אפשר לשלוח שוב או לנסח את החלק הזה מחדש.';
const HEBREW_TRANSFER_REPLY = [
  'לפי דיווחים שנשמרו ב-Gringo עבור העברות של 2,000 ILS לתאילנד:',
  'Neema\nשליחה: 2,000 ILS\nקבלה: 21,800 THB\nעמלה שדווחה: 20 ILS',
  'Monox / Monox Money\nשליחה: 2,000 ILS\nקבלה: 21,500 THB',
  'לפי סכום הקבלה בלבד, בדיווח של Neema המקבל קיבל 300 THB יותר.',
  'חשוב: אלה דיווחים שנמסרו ואינם הצעות חיות או מידע רשמי מהחברות. נתונים חסרים לא חושבו.',
].join('\n\n');
const ENGLISH_TRANSFER_REPLY = [
  'Based on reports saved in Gringo for transfers of 2,000 ILS to Thailand:',
  'Neema\nSend: 2,000 ILS\nRecipient: 21,800 THB\nReported fee: 20 ILS',
  'Monox / Monox Money\nSend: 2,000 ILS\nRecipient: 21,500 THB',
  'By recipient amount only, in the Neema report the recipient received 300 THB more.',
  'Important: these are submitted reports, not live quotes or official company information. Missing values were not calculated.',
].join('\n\n');

function completeProfile(overrides = {}) {
  return {
    userId: 'usr_transfer_chat',
    fullName: 'Somchai',
    country: 'Thailand',
    preferredLanguage: 'he',
    detectedLanguage: '',
    languageSource: '',
    language: 'he',
    workSector: 'Construction',
    profession: 'Construction worker',
    city: 'Tel Aviv',
    wantsJobAlerts: 'Yes',
    preferredCurrency: 'THB',
    wantsExchangeRateAlerts: 'Yes',
    ...overrides,
  };
}

function enableActiveSupervisor() {
  process.env.MULTI_AGENT_ENABLED = 'true';
  process.env.SUPERVISOR_ENABLED = 'true';
  process.env.AGENT_EXECUTION_ENABLED = 'true';
  process.env.ACTIVE_SUPERVISOR_DELIVERY_ENABLED = 'true';
  process.env.SUPERVISOR_MULTI_INTENT_LIVE_ENABLED = 'true';
}

function restoreEnv() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function mockCore(profile) {
  crmAgentService.findOrCreateUser = async (context = {}) => ({
    userId: profile.userId,
    channel: context.channel || 'web',
    channelUserId: context.channelUserId || 'transfer-chat-user',
  });
  crmAgentService.getUserMemory = async () => profile;
  crmAgentService.getUserLanguage = async () => ({
    preferredLanguage: profile.preferredLanguage || '',
    detectedLanguage: profile.detectedLanguage || '',
    languageSource: profile.languageSource || '',
    languageUpdatedAt: '',
    language: profile.language || profile.preferredLanguage || '',
  });
  crmAgentService.updateDetectedLanguage = async () => profile;
  crmAgentService.updateUserProfile = async (userId, updates) => ({ ...profile, ...updates, userId });
  crmAgentService.saveConversation = async (event) => event;
  crmAgentService.extractAndUpdateMemory = async () => ({ signals: { interests: [] } });
  knowledgeAgentService.answerQuestion = async () => ({
    status: 'FOUND',
    category: 'Rights',
    answer: 'Workers should keep written records and ask for help if wages are unpaid.',
    relevantKnowledge: [],
  });
  aiProviderService.generateReply = async () => ({
    provider: 'test',
    model: 'test',
    text: 'AI reply should not be used',
  });
}

function seedTransferQuotes() {
  setUserSubmittedTransferQuoteRepositoryForTest({
    findRecentUserSubmittedTransferQuotes: async () => ({
      ok: true,
      quotes: [
        {
          providerId: 'neema',
          providerName: 'Neema',
          quote: {
            providerId: 'neema',
            providerName: 'Neema',
            sourceCurrency: 'ILS',
            targetCurrency: 'THB',
            sendAmount: 2000,
            recipientAmount: 21800,
            transferFee: 20,
            totalCustomerCost: null,
            customerExchangeRate: null,
            observedAt: null,
            reporterType: 'user',
            evidenceStatus: 'none',
          },
        },
        {
          providerId: 'monox_money',
          providerName: 'Monox / Monox Money',
          quote: {
            providerId: 'monox_money',
            providerName: 'Monox / Monox Money',
            sourceCurrency: 'ILS',
            targetCurrency: 'THB',
            sendAmount: 2000,
            recipientAmount: 21500,
            transferFee: null,
            totalCustomerCost: null,
            customerExchangeRate: null,
            observedAt: null,
            reporterType: 'user',
            evidenceStatus: 'none',
          },
        },
      ],
    }),
  });
}

async function withTranslation(handler, callback) {
  const original = translationService.translateText;
  const calls = [];
  translationService.translateText = async (text, sourceLanguage, targetLanguage) => {
    calls.push({ text, sourceLanguage, targetLanguage });
    return handler(text, sourceLanguage, targetLanguage);
  };

  try {
    return await callback(calls);
  } finally {
    translationService.translateText = original;
    setUserSubmittedTransferQuoteRepositoryForTest(null);
  }
}

function failedIncomingTranslation(text, sourceLanguage, targetLanguage) {
  return {
    translatedText: text,
    sourceLanguage,
    targetLanguage,
    translated: false,
    fallbackUsed: true,
    errorCode: 'PROVIDER_RATE_LIMIT',
    failureType: 'rate_limit',
  };
}

test.afterEach(() => {
  restoreEnv();
  setUserSubmittedTransferQuoteRepositoryForTest(null);
});

test('Hebrew salary plus transfer with successful translation still handles both intents', async () => {
  enableActiveSupervisor();
  mockCore(completeProfile());
  seedTransferQuotes();

  await withTranslation(async (text, sourceLanguage, targetLanguage) => {
    if (text === HE_SALARY_TRANSFER && targetLanguage === 'en') {
      return {
        translatedText: TRANSLATED_SALARY_TRANSFER,
        sourceLanguage,
        targetLanguage,
        translated: true,
        fallbackUsed: false,
      };
    }
    return {
      translatedText: `he:${text}`,
      sourceLanguage,
      targetLanguage,
      translated: true,
      fallbackUsed: false,
    };
  }, async (calls) => {
    const response = await coreAgentService.processWebMessage({
      requestId: 'req_salary_transfer_translated',
      message: HE_SALARY_TRANSFER,
      channel: 'web',
      channelUserId: 'salary-transfer-translated',
    });
    const outgoing = calls.find((call) => call.targetLanguage === 'he');

    assert.equal(calls.some((call) => call.sourceLanguage === 'he' && call.targetLanguage === 'en'), true);
    assert.equal(response.status.startsWith('SUPERVISOR_MULTI_INTENT_'), true);
    assert.notEqual(response.status, 'SUPERVISOR_COMPLETED');
    assert.match(outgoing.text, /salary|paid|monthly/i);
    assert.match(outgoing.text, /Thailand|ILS|transfer|reports/i);
    assert.equal(outgoing.text.includes(HEBREW_NOTICE), false);
    assert.equal(response.reply.includes(HEBREW_NOTICE), false);
    assert.equal(response.reply.includes('PROVIDER_RATE_LIMIT'), false);
  });
});

test('Hebrew salary plus transfer stays partial when incoming translation fails', async () => {
  enableActiveSupervisor();
  mockCore(completeProfile());
  seedTransferQuotes();

  await withTranslation(async (text, sourceLanguage, targetLanguage) => (
    failedIncomingTranslation(text, sourceLanguage, targetLanguage)
  ), async (calls) => {
    const response = await coreAgentService.processWebMessage({
      requestId: 'req_salary_transfer_fallback',
      message: HE_SALARY_TRANSFER,
      channel: 'web',
      channelUserId: 'salary-transfer-fallback',
    });
    const plan = supervisorService.getPlan('req_salary_transfer_fallback');
    const transferResult = plan.tasks[0].result;

    assert.equal(calls.length, 1);
    assert.equal(calls[0].sourceLanguage, 'he');
    assert.equal(calls[0].targetLanguage, 'en');
    assert.equal(response.status, 'SUPERVISOR_PARTIAL');
    assert.equal(plan.status, 'partial');
    assert.equal(plan.tasks.length, 1);
    assert.equal(plan.tasks[0].domain, 'finance_consumer');
    assert.equal(transferResult.status, 'success');
    assert.equal(transferResult.warnings.includes('reported_quote_unverified'), true);
    assert.equal(plan.warnings.includes('incoming_translation_incomplete'), true);
    assert.equal(plan.incomingTranslation.fallbackUsed, true);
    assert.equal(plan.incomingTranslation.errorCode, 'PROVIDER_RATE_LIMIT');
    assert.equal(plan.incomingTranslation.failureType, 'rate_limit');
    assert.equal(response.reply, `${HEBREW_TRANSFER_REPLY}\n\n${HEBREW_NOTICE}`);
    assert.equal(response.reply.includes('PROVIDER_RATE_LIMIT'), false);
    assert.equal(response.reply.includes('insufficient_quota'), false);
    assert.equal(response.reply.includes('429'), false);
    assert.equal(response.reply.includes('incoming_translation_incomplete'), false);
    assert.equal(response.reply.includes('Some parts could not be completed yet.'), false);
  });
});

test('native Hebrew finance.transfer is unchanged when translation is unavailable', async () => {
  enableActiveSupervisor();
  mockCore(completeProfile());
  seedTransferQuotes();

  await withTranslation(async () => {
    throw new Error('insufficient_quota');
  }, async (calls) => {
    const response = await coreAgentService.processWebMessage({
      requestId: 'req_native_transfer_translation_down',
      message: HEBREW_TRANSFER,
      channel: 'web',
      channelUserId: 'native-transfer-translation-down',
    });
    const plan = supervisorService.getPlan('req_native_transfer_translation_down');

    assert.equal(calls.length, 0);
    assert.equal(response.status, 'SUPERVISOR_COMPLETED');
    assert.equal(plan.status, 'completed');
    assert.equal(response.reply, HEBREW_TRANSFER_REPLY);
    assert.equal(response.reply.includes(HEBREW_NOTICE), false);
  });
});

test('English finance.transfer is unchanged when translation is unavailable', async () => {
  enableActiveSupervisor();
  mockCore(completeProfile({ preferredLanguage: 'en', language: 'en' }));
  seedTransferQuotes();

  await withTranslation(async () => {
    throw new Error('insufficient_quota');
  }, async (calls) => {
    const response = await coreAgentService.processWebMessage({
      requestId: 'req_english_transfer_translation_down',
      message: ENGLISH_TRANSFER,
      channel: 'web',
      channelUserId: 'english-transfer-translation-down',
    });

    assert.equal(calls.length, 0);
    assert.equal(response.status, 'SUPERVISOR_COMPLETED');
    assert.equal(response.reply, ENGLISH_TRANSFER_REPLY);
    assert.equal(response.reply.includes('temporary language-processing problem'), false);
  });
});

test('Hebrew salary-only translation failure does not report completed', async () => {
  enableActiveSupervisor();
  mockCore(completeProfile());

  await withTranslation(async (text, sourceLanguage, targetLanguage) => (
    failedIncomingTranslation(text, sourceLanguage, targetLanguage)
  ), async () => {
    const response = await coreAgentService.processWebMessage({
      requestId: 'req_salary_only_fallback',
      message: HE_SALARY_ONLY,
      channel: 'web',
      channelUserId: 'salary-only-fallback',
    });

    assert.notEqual(response.status, 'SUPERVISOR_COMPLETED');
    assert.equal(response.status, 'SUPERVISOR_NEEDS_CLARIFICATION');
    assert.equal(response.reply.includes('insufficient_quota'), false);
    assert.equal(response.reply.includes('PROVIDER_RATE_LIMIT'), false);
  });
});
