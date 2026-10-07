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
};

const HEBREW_REQUEST = 'אני רוצה לשלוח 2000 שקל לתאילנד, איפה הכי משתלם?';
const HEBREW_FINAL_REPLY = [
  'לפי דיווחים שנשמרו ב-Gringo עבור העברות של 2,000 ILS לתאילנד:',
  'Neema\nשליחה: 2,000 ILS\nקבלה: 21,800 THB\nעמלה שדווחה: 20 ILS',
  'Monox / Monox Money\nשליחה: 2,000 ILS\nקבלה: 21,500 THB',
  'לפי סכום הקבלה בלבד, בדיווח של Neema המקבל קיבל 300 THB יותר.',
  'חשוב: אלה דיווחים שנמסרו ואינם הצעות חיות או מידע רשמי מהחברות. נתונים חסרים לא חושבו.',
].join('\n\n');
const ENGLISH_FINAL_REPLY = [
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

function seedTransferQuotes({ sendAmount = 2000, quotes = null } = {}) {
  const storedQuotes = Array.isArray(quotes) ? quotes : [
    {
      providerId: 'neema',
      providerName: 'Neema',
      sendAmount,
      recipientAmount: 21800,
      transferFee: 20,
    },
    {
      providerId: 'monox_money',
      providerName: 'Monox / Monox Money',
      sendAmount,
      recipientAmount: 21500,
      transferFee: null,
    },
  ];

  setUserSubmittedTransferQuoteRepositoryForTest({
    findRecentUserSubmittedTransferQuotes: async (payload) => {
      assert.equal(payload.userId, 'usr_transfer_chat');
      assert.equal(payload.requesterUserId, 'usr_transfer_chat');
      assert.equal(payload.sourceCurrency, 'ILS');
      assert.equal(payload.targetCurrency, 'THB');
      return {
        ok: true,
        quotes: storedQuotes.map((item) => ({
          providerId: item.providerId,
          providerName: item.providerName,
          quote: {
            providerId: item.providerId,
            providerName: item.providerName,
            sourceCurrency: 'ILS',
            targetCurrency: 'THB',
            sendAmount: item.sendAmount,
            recipientAmount: item.recipientAmount,
            transferFee: item.transferFee,
            totalCustomerCost: null,
            customerExchangeRate: null,
            observedAt: null,
            reporterType: 'user',
            evidenceStatus: 'none',
          },
        })),
      };
    },
  });
}

async function withTranslationSpy(callback) {
  const original = translationService.translateText;
  const calls = [];
  translationService.translateText = async (text, sourceLanguage, targetLanguage) => {
    calls.push({ text, sourceLanguage, targetLanguage });
    return {
      translatedText: `translated:${text}`,
      sourceLanguage,
      targetLanguage,
      translated: true,
      fallbackUsed: false,
    };
  };

  try {
    return await callback(calls);
  } finally {
    translationService.translateText = original;
    setUserSubmittedTransferQuoteRepositoryForTest(null);
  }
}

test.afterEach(() => {
  restoreEnv();
  setUserSubmittedTransferQuoteRepositoryForTest(null);
});

test('active Supervisor Hebrew money-transfer reply is the formatter text with no raw warning or second translation', async () => {
  enableActiveSupervisor();
  mockCore(completeProfile({ preferredLanguage: 'he', language: 'he' }));
  seedTransferQuotes();

  await withTranslationSpy(async (calls) => {
    const response = await coreAgentService.processWebMessage({
      requestId: 'req_he_transfer_final',
      message: HEBREW_REQUEST,
      channel: 'web',
      channelUserId: 'he-transfer-final',
    });
    const plan = supervisorService.getPlan('req_he_transfer_final');

    assert.equal(response.reply, HEBREW_FINAL_REPLY);
    assert.equal(response.replyLanguage, undefined);
    assert.equal(calls.length, 0);
    assert.equal(response.reply.includes('reported_quote_unverified'), false);
    assert.equal(plan.tasks[0].result.warnings.includes('reported_quote_unverified'), true);
    assert.equal(plan.tasks[0].result.output.responseLanguage, 'he');
  });
});

test('English money-transfer reply for a Hebrew user is translated once and omits the raw warning', async () => {
  enableActiveSupervisor();
  mockCore(completeProfile({ preferredLanguage: 'he', language: 'he' }));
  seedTransferQuotes();

  await withTranslationSpy(async (calls) => {
    const response = await coreAgentService.processWebMessage({
      requestId: 'req_en_transfer_for_he_user',
      message: 'I want to send 2000 ILS to Thailand',
      channel: 'web',
      channelUserId: 'en-transfer-he-user',
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].sourceLanguage, 'en');
    assert.equal(calls[0].targetLanguage, 'he');
    assert.equal(calls[0].text.includes('reported_quote_unverified'), false);
    assert.equal(response.reply, `translated:${ENGLISH_FINAL_REPLY}`);
    assert.equal(response.replyLanguage, undefined);
  });
});

test('English money-transfer reply for an English user is unchanged and not translated', async () => {
  enableActiveSupervisor();
  mockCore(completeProfile({ preferredLanguage: 'en', language: 'en' }));
  seedTransferQuotes();

  await withTranslationSpy(async (calls) => {
    const response = await coreAgentService.processWebMessage({
      requestId: 'req_en_transfer_final',
      message: 'I want to send 2000 ILS to Thailand',
      channel: 'web',
      channelUserId: 'en-transfer-final',
    });

    assert.equal(calls.length, 0);
    assert.equal(response.reply, ENGLISH_FINAL_REPLY);
    assert.equal(response.reply.includes('reported_quote_unverified'), false);
  });
});

test('unrelated English Supervisor answers are still translated for a Hebrew user', async () => {
  enableActiveSupervisor();
  mockCore(completeProfile({ preferredLanguage: 'he', language: 'he' }));
  const originalExecuteAgent = supervisorService.executeAgent;
  supervisorService.executeAgent = async (task) => ({
    taskId: task.taskId,
    status: 'success',
    output: { message: 'One supervisor answer.' },
    factsLearned: [],
    suggestedProfileUpdates: [],
    followUpQuestions: [],
    warnings: ['reported_quote_unverified'],
    completedAt: '2026-08-02T08:01:00.000Z',
  });

  try {
    await withTranslationSpy(async (calls) => {
      const response = await coreAgentService.processWebMessage({
        requestId: 'req_unrelated_translate',
        message: 'salary employer rights',
        channel: 'web',
        channelUserId: 'unrelated-translate',
      });

      assert.equal(calls.length, 1);
      assert.equal(calls[0].targetLanguage, 'he');
      assert.equal(calls[0].text.includes('reported_quote_unverified'), false);
      assert.equal(response.reply.startsWith('translated:'), true);
      assert.equal(response.reply.includes('One supervisor answer.'), true);
    });
  } finally {
    supervisorService.executeAgent = originalExecuteAgent;
  }
});

const HEBREW_ALT_REQUEST = 'תעזור לי להעביר 1500 שקלים לתאילנד';
const GENERIC_PARTIAL = 'Some parts could not be completed yet.';
const GENERIC_PARTIAL_FOLLOW_UP = 'Tell me the missing detail and I can continue.';

test('another Hebrew finance.transfer phrasing skips the translation round trip', async () => {
  enableActiveSupervisor();
  mockCore(completeProfile({ preferredLanguage: 'he', language: 'he' }));
  seedTransferQuotes({ sendAmount: 1500 });

  await withTranslationSpy(async (calls) => {
    const response = await coreAgentService.processWebMessage({
      requestId: 'req_he_transfer_alt_phrase',
      message: HEBREW_ALT_REQUEST,
      channel: 'web',
      channelUserId: 'he-transfer-alt-phrase',
    });
    const plan = supervisorService.getPlan('req_he_transfer_alt_phrase');

    assert.equal(calls.length, 0);
    assert.equal(plan.tasks[0].input.question, HEBREW_ALT_REQUEST);
    assert.equal(plan.tasks[0].result.output.responseLanguage, 'he');
    assert.equal(response.reply, HEBREW_FINAL_REPLY.replaceAll('2,000', '1,500'));
    assert.equal(response.reply.includes(GENERIC_PARTIAL), false);
  });
});

test('money-transfer no-data partial stays partial and omits the generic English limitation', async () => {
  enableActiveSupervisor();
  mockCore(completeProfile({ preferredLanguage: 'he', language: 'he' }));
  seedTransferQuotes({ quotes: [] });

  await withTranslationSpy(async (calls) => {
    const response = await coreAgentService.processWebMessage({
      requestId: 'req_he_transfer_no_data',
      message: HEBREW_REQUEST,
      channel: 'web',
      channelUserId: 'he-transfer-no-data',
    });
    const result = supervisorService.getPlan('req_he_transfer_no_data').tasks[0].result;

    assert.equal(calls.length, 0);
    assert.equal(result.status, 'partial');
    assert.equal(result.warnings.includes('insufficient_reported_quote_data'), true);
    assert.equal(result.warnings.includes('reported_quote_unverified'), true);
    assert.equal(response.reply, 'אין לי כרגע מספיק דיווחים אמיתיים עבור ILS → THB כדי לבצע השוואה. לא אציג דירוג הדגמה כספק מומלץ.');
    assert.equal(response.reply.includes(GENERIC_PARTIAL), false);
    assert.equal(response.reply.includes(GENERIC_PARTIAL_FOLLOW_UP), false);
    assert.equal(response.reply.includes('insufficient_reported_quote_data'), false);
  });
});

test('money-transfer different-amount partial stays partial and omits the generic English limitation', async () => {
  enableActiveSupervisor();
  mockCore(completeProfile({ preferredLanguage: 'he', language: 'he' }));
  seedTransferQuotes({ sendAmount: 2000 });

  await withTranslationSpy(async (calls) => {
    const response = await coreAgentService.processWebMessage({
      requestId: 'req_he_transfer_different_amount',
      message: 'אני רוצה לשלוח 1500 שקל לתאילנד',
      channel: 'web',
      channelUserId: 'he-transfer-different-amount',
    });
    const result = supervisorService.getPlan('req_he_transfer_different_amount').tasks[0].result;

    assert.equal(calls.length, 0);
    assert.equal(result.status, 'partial');
    assert.equal(result.warnings.includes('no_same_amount_reported_quote'), true);
    assert.equal(response.reply.includes('אין לי כרגע מספיק דיווחים'), false);
    assert.equal(response.reply.includes('יש לי דיווחים שמורים עבור ILS → THB, אבל לא דיווח ישיר עבור 1500 ILS:'), true);
    assert.equal(response.reply.includes('לא חישבתי סכומי קבלה'), true);
    assert.equal(response.reply.includes(GENERIC_PARTIAL), false);
    assert.equal(response.reply.includes(GENERIC_PARTIAL_FOLLOW_UP), false);
  });
});

test('an unrecognized Hebrew destination still uses incoming translation', async () => {
  enableActiveSupervisor();
  mockCore(completeProfile({ preferredLanguage: 'he', language: 'he' }));

  await withTranslationSpy(async (calls) => {
    await coreAgentService.processWebMessage({
      requestId: 'req_he_transfer_india',
      message: 'אני רוצה לשלוח 2000 שקל להודו',
      channel: 'web',
      channelUserId: 'he-transfer-india',
    });

    assert.equal(calls.some((call) => call.sourceLanguage === 'he' && call.targetLanguage === 'en'), true);
  });
});
