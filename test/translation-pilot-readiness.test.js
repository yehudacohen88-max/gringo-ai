process.env.MULTI_AGENT_ENABLED = 'true';
process.env.SUPERVISOR_ENABLED = 'true';
process.env.AGENT_EXECUTION_ENABLED = 'true';
process.env.ACTIVE_SUPERVISOR_DELIVERY_ENABLED = 'true';
process.env.SUPERVISOR_MULTI_INTENT_LIVE_ENABLED = 'true';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;
Module._load = function loadStub(request, parent, isMain) {
  if (request === 'dotenv') return { config: () => ({}) };
  if (request === 'googleapis') return { google: { auth: { JWT: function JWT() {} }, sheets: () => ({}) } };
  return originalLoad.call(this, request, parent, isMain);
};

const { crmAgentService } = require('../src/modules/crm-agent');
const { aiProviderService } = require('../src/modules/ai-provider');
const { knowledgeAgentService } = require('../src/modules/knowledge-agent');
const { translationService, TranslationService } = require('../src/modules/translation');
const { coreAgentService } = require('../src/modules/core-agent');
const { SupervisorService } = require('../src/modules/agents');

Module._load = originalLoad;

const HE_SALARY = '\u05dc\u05d0 \u05e7\u05d9\u05d1\u05dc\u05ea\u05d9 \u05d0\u05ea \u05d4\u05de\u05e9\u05db\u05d5\u05e8\u05ea \u05e9\u05dc\u05d9.';
const HE_HOT_WATER = '\u05d0\u05d9\u05df \u05dc\u05d9 \u05de\u05d9\u05dd \u05d7\u05de\u05d9\u05dd \u05d1\u05d3\u05d9\u05e8\u05d4.';
const HE_URGENT = '\u05d0\u05e0\u05d9 \u05e6\u05e8\u05d9\u05da \u05e2\u05d6\u05e8\u05d4 \u05e8\u05e4\u05d5\u05d0\u05d9\u05ea \u05d3\u05d7\u05d5\u05e4\u05d4.';
const HE_SALARY_TRANSFER = '\u05dc\u05d0 \u05e7\u05d9\u05d1\u05dc\u05ea\u05d9 \u05d0\u05ea \u05d4\u05de\u05e9\u05db\u05d5\u05e8\u05ea \u05e9\u05dc\u05d9 \u05d5\u05d0\u05e0\u05d9 \u05e8\u05d5\u05e6\u05d4 \u05dc\u05e9\u05dc\u05d5\u05d7 2,000 ILS \u05dc\u05ea\u05d0\u05d9\u05dc\u05e0\u05d3.';

const originals = {
  findOrCreateUser: crmAgentService.findOrCreateUser,
  getUserMemory: crmAgentService.getUserMemory,
  getUserLanguage: crmAgentService.getUserLanguage,
  updateDetectedLanguage: crmAgentService.updateDetectedLanguage,
  updateUserProfile: crmAgentService.updateUserProfile,
  saveConversation: crmAgentService.saveConversation,
  extractAndUpdateMemory: crmAgentService.extractAndUpdateMemory,
  answerQuestion: knowledgeAgentService.answerQuestion,
  generateReply: aiProviderService.generateReply,
  translateText: translationService.translateText,
  getProviderName: translationService.getProviderName,
  isAvailable: translationService.isAvailable,
};

function restoreOriginals() {
  crmAgentService.findOrCreateUser = originals.findOrCreateUser;
  crmAgentService.getUserMemory = originals.getUserMemory;
  crmAgentService.getUserLanguage = originals.getUserLanguage;
  crmAgentService.updateDetectedLanguage = originals.updateDetectedLanguage;
  crmAgentService.updateUserProfile = originals.updateUserProfile;
  crmAgentService.saveConversation = originals.saveConversation;
  crmAgentService.extractAndUpdateMemory = originals.extractAndUpdateMemory;
  knowledgeAgentService.answerQuestion = originals.answerQuestion;
  aiProviderService.generateReply = originals.generateReply;
  translationService.translateText = originals.translateText;
  translationService.getProviderName = originals.getProviderName;
  translationService.isAvailable = originals.isAvailable;
}

test.afterEach(() => {
  restoreOriginals();
});

function completeProfile(overrides = {}) {
  return {
    userId: 'usr_translation_pilot',
    channel: 'web',
    channelUserId: 'translation-pilot-user',
    fullName: 'David Levi',
    country: 'Thailand',
    preferredLanguage: 'en',
    detectedLanguage: '',
    languageSource: '',
    language: '',
    workSector: 'Construction',
    profession: 'Ironworker',
    city: 'Tel Aviv',
    wantsJobAlerts: 'Yes',
    preferredCurrency: 'THB',
    wantsExchangeRateAlerts: 'Yes',
    ...overrides,
  };
}

function heResponseFor(text = '') {
  if (/emergency services/i.test(text)) {
    return '\u05e2\u05d1\u05e8\u05d9\u05ea: \u05d6\u05d4 \u05e2\u05e9\u05d5\u05d9 \u05dc\u05d4\u05d9\u05d5\u05ea \u05d3\u05d7\u05d5\u05e3. \u05e4\u05e0\u05d4 \u05dc\u05e9\u05d9\u05e8\u05d5\u05ea\u05d9 \u05d7\u05d9\u05e8\u05d5\u05dd \u05d0\u05d5 \u05dc\u05de\u05e8\u05e4\u05d0\u05ea \u05d7\u05d9\u05e8\u05d5\u05dd \u05e7\u05e8\u05d5\u05d1\u05d4 \u05e2\u05db\u05e9\u05d9\u05d5.';
  }
  if (/hot water/i.test(text)) {
    return '\u05e2\u05d1\u05e8\u05d9\u05ea: \u05d4\u05d1\u05e0\u05ea\u05d9. \u05d0\u05d9\u05df \u05de\u05d9\u05dd \u05d7\u05de\u05d9\u05dd \u05db\u05dc\u05dc, \u05d0\u05d5 \u05e9\u05d4\u05dd \u05e0\u05e4\u05e1\u05e7\u05d9\u05dd \u05d0\u05d7\u05e8\u05d9 \u05d6\u05de\u05df \u05e7\u05e6\u05e8?';
  }
  if (/transfer|send money|provider/i.test(text)) {
    return `\u05e2\u05d1\u05e8\u05d9\u05ea: \u05ea\u05e9\u05d5\u05d1\u05ea \u05db\u05e1\u05e3. ${text}`;
  }
  if (/salary|paid|payment|wage/i.test(text)) {
    return `\u05e2\u05d1\u05e8\u05d9\u05ea: \u05ea\u05e9\u05d5\u05d1\u05ea \u05e9\u05db\u05e8. ${text}`;
  }
  return `\u05e2\u05d1\u05e8\u05d9\u05ea: ${text}`;
}

function englishForHebrew(text = '') {
  if (text === HE_SALARY) return 'I did not receive my salary.';
  if (text === HE_HOT_WATER) return 'There is no hot water in my apartment.';
  if (text === HE_URGENT) return 'I need urgent medical help.';
  if (text === HE_SALARY_TRANSFER) return 'I did not receive my salary and I want to send 2,000 ILS to Thailand.';
  return 'I need help.';
}

function mockCore(profile = completeProfile(), options = {}) {
  const state = {
    providerCalls: [],
    savedEvents: [],
    memoryQuestions: [],
    detectedLanguageUpdates: [],
  };
  const user = {
    userId: profile.userId,
    channel: profile.channel || 'web',
    channelUserId: profile.channelUserId || 'translation-pilot-user',
  };

  crmAgentService.findOrCreateUser = async () => user;
  crmAgentService.getUserMemory = async () => profile;
  crmAgentService.getUserLanguage = async (loadedProfile) => ({
    preferredLanguage: loadedProfile.preferredLanguage || '',
    detectedLanguage: loadedProfile.detectedLanguage || '',
    languageSource: loadedProfile.languageSource || '',
    languageUpdatedAt: loadedProfile.languageUpdatedAt || '',
    language: loadedProfile.preferredLanguage || loadedProfile.detectedLanguage || loadedProfile.language || '',
  });
  crmAgentService.updateDetectedLanguage = async (userId, resolution) => {
    state.detectedLanguageUpdates.push({ userId, resolution });
    return { ...profile, detectedLanguage: resolution.language, languageSource: resolution.source };
  };
  crmAgentService.updateUserProfile = async (userId, updates) => ({ ...profile, ...updates, userId });
  crmAgentService.saveConversation = async (event) => {
    state.savedEvents.push(event);
    return event;
  };
  crmAgentService.extractAndUpdateMemory = async (userId, question) => {
    state.memoryQuestions.push(question);
    return { signals: { interests: [] } };
  };

  knowledgeAgentService.answerQuestion = async () => ({
    answer: 'Knowledge answer',
    category: 'Rights',
    status: 'NOT_FOUND',
    relevantKnowledge: [],
  });
  aiProviderService.generateReply = async () => ({
    provider: 'test',
    model: 'test',
    text: 'Safe AI fallback answer.',
  });

  translationService.getProviderName = () => options.providerName || 'pilot-test-provider';
  translationService.isAvailable = () => !options.unavailable;
  translationService.translateText = async (text, sourceLanguage, targetLanguage) => {
    state.providerCalls.push({ text, sourceLanguage, targetLanguage });

    if (options.throwTranslation) throw new Error('translation failed');
    if (options.unavailable || options.emptyTranslation) {
      return {
        translatedText: options.emptyTranslation ? '' : text,
        sourceLanguage,
        targetLanguage,
        provider: 'pilot-test-provider',
        translated: false,
        fallbackUsed: true,
      };
    }

    if (sourceLanguage === 'he' && targetLanguage === 'en') {
      return {
        translatedText: englishForHebrew(text),
        sourceLanguage,
        targetLanguage,
        provider: 'pilot-test-provider',
        translated: true,
        fallbackUsed: false,
      };
    }

    if (sourceLanguage === 'en' && targetLanguage === 'he') {
      return {
        translatedText: heResponseFor(text),
        sourceLanguage,
        targetLanguage,
        provider: 'pilot-test-provider',
        translated: true,
        fallbackUsed: false,
      };
    }

    if (sourceLanguage === 'en' && targetLanguage === 'th') {
      return {
        translatedText: `TH:${text}`,
        sourceLanguage,
        targetLanguage,
        provider: 'pilot-test-provider',
        translated: true,
        fallbackUsed: false,
      };
    }

    return {
      translatedText: text,
      sourceLanguage,
      targetLanguage,
      provider: 'pilot-test-provider',
      translated: false,
      fallbackUsed: sourceLanguage !== targetLanguage,
    };
  };

  return state;
}

function outgoingMetadata(result = {}) {
  const symbol = Object.getOwnPropertySymbols(result).find((item) => String(item).includes('outgoingTranslation'));
  return symbol ? result[symbol] : null;
}

let askCounter = 0;

function callsTo(state, targetLanguage) {
  return state.providerCalls.filter((call) => call.targetLanguage === targetLanguage);
}

async function ask(message, profile = completeProfile(), options = {}) {
  askCounter += 1;
  const isolatedProfile = {
    ...profile,
    channelUserId: options.channelUserId || `translation-pilot-user-${askCounter}`,
    userId: options.userId || `usr_translation_pilot_${askCounter}`,
  };
  const state = mockCore(isolatedProfile, options);
  const result = await coreAgentService.processWebMessage({
    message,
    channel: isolatedProfile.channel || 'web',
    channelUserId: isolatedProfile.channelUserId,
  });
  return { result, state, metadata: outgoingMetadata(result) };
}

test('English input preserves existing English Employment behavior', async () => {
  const { result, state, metadata } = await ask('I did not receive my salary.', completeProfile({ preferredLanguage: 'en' }));

  assert.equal(callsTo(state, 'en').length, 0);
  assert.equal(metadata.translated, false);
  assert.equal(result.category, 'Supervisor');
  assert.match(result.reply, /paid|salary|monthly|hourly|daily/i);
});

test('supported Hebrew missing-salary input uses existing translation path and returns Hebrew delivery', async () => {
  const { result, state, metadata } = await ask(HE_SALARY, completeProfile({ preferredLanguage: 'he' }));

  assert.equal(callsTo(state, 'en').length, 1);
  assert.equal(callsTo(state, 'he').length, 1);
  assert.equal(metadata.translated, true);
  assert.equal(metadata.fallbackUsed, false);
  assert.match(result.reply, /^עברית:/);
  assert.match(metadata.originalResponse, /paid|salary|monthly|hourly|daily/i);
  assert.doesNotMatch(metadata.originalResponse, /until the 9th/i);
});

test('supported Hebrew housing problem reaches current-housing fallback, not housing search', async () => {
  const { result, metadata } = await ask(HE_HOT_WATER, completeProfile({ preferredLanguage: 'he' }));

  assert.equal(metadata.translated, true);
  assert.match(result.reply, /^עברית:/);
  assert.match(metadata.originalResponse, /hot water/i);
  assert.doesNotMatch(metadata.originalResponse, /I found housing options/i);
});

test('supported translated urgent Health input preserves urgent safety guidance and next step', async () => {
  const { result, metadata } = await ask(HE_URGENT, completeProfile({ preferredLanguage: 'he' }));

  assert.equal(metadata.translated, true);
  assert.match(metadata.originalResponse, /does not diagnose/i);
  assert.match(metadata.originalResponse, /emergency services/i);
  assert.match(result.reply, /חירום/);
});

test('translation unavailable fails safely without fake translated delivery', async () => {
  const { result, metadata } = await ask(HE_SALARY, completeProfile({ preferredLanguage: 'he' }), {
    unavailable: true,
  });

  assert.equal(metadata.translated, false);
  assert.equal(metadata.fallbackUsed, true);
  assert.equal(metadata.deliveryResponse, result.reply);
  assert.doesNotMatch(result.reply, /^עברית:/);
});

test('empty translation output fails safely without fake translated delivery', async () => {
  const { result, metadata } = await ask(HE_SALARY, completeProfile({ preferredLanguage: 'he' }), {
    emptyTranslation: true,
  });

  assert.equal(metadata.translated, false);
  assert.equal(metadata.fallbackUsed, true);
  assert.equal(metadata.deliveryResponse, result.reply);
  assert.doesNotMatch(result.reply, /^עברית:/);
});

test('translation exception fails safely without crashing conversation', async () => {
  const { result, metadata } = await ask(HE_SALARY, completeProfile({ preferredLanguage: 'he' }), {
    throwTranslation: true,
  });

  assert.equal(typeof result.reply, 'string');
  assert.notEqual(result.reply.length, 0);
  assert.equal(metadata.translated, false);
  assert.equal(metadata.fallbackUsed, true);
});

test('unsupported language result is safe and does not claim translation succeeded', async () => {
  const service = new TranslationService({
    isAvailable: () => true,
    getProviderName: () => 'pilot-test-provider',
    translateText: async () => ({ translatedText: 'unused' }),
  });

  const result = await service.translateText('Bonjour', 'fr', 'en');

  assert.equal(result.translatedText, 'Bonjour');
  assert.equal(result.translated, false);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.errorCode, 'UNSUPPORTED_SOURCE_LANGUAGE');
});

test('source message and task isolation are preserved after translated multi-intent input', async () => {
  const { result, state, metadata } = await ask(HE_SALARY_TRANSFER, completeProfile({ preferredLanguage: 'he' }));

  assert.equal(callsTo(state, 'en').length, 1);
  assert.equal(state.savedEvents.at(-1).question, HE_SALARY_TRANSFER);
  assert.match(metadata.originalResponse, /salary|paid/i);
  assert.match(metadata.originalResponse, /transfer|send money|provider/i);
  assert.match(result.reply, /^עברית:/);
});

test('Supervisor task creation preserves translated sourceMessage and isolated clauses', () => {
  const service = new SupervisorService();
  const translatedMessage = 'I did not receive my salary and I want to send 2,000 ILS to Thailand.';
  const context = service.createRequestContext({
    requestId: 'req_translation_pilot_tasks',
    conversationId: 'web:translation-pilot',
    userId: 'usr_translation_pilot',
    message: translatedMessage,
    profile: completeProfile(),
  });
  const detected = service.detectIntents(context);
  const tasks = service.createTasksFromIntents(context, detected);

  assert.equal(detected.isMultiIntent, true);
  assert.deepEqual(tasks.map((task) => task.domain), ['employment_salary', 'finance_consumer']);
  assert.equal(tasks.every((task) => task.metadata.sourceMessage === translatedMessage), true);
  assert.match(tasks[0].input.question, /salary/i);
  assert.doesNotMatch(tasks[0].input.question, /transfer|Thailand/i);
  assert.match(tasks[1].input.question, /send 2,000 ils to thailand/i);
});

test('English Finance Housing urgent Health relevance and multi-intent behavior remain available', async () => {
  const service = new SupervisorService();
  const financeContext = service.createRequestContext({
    requestId: 'req_translation_finance_preserved',
    conversationId: 'web:translation-finance-preserved',
    userId: 'usr_translation_finance_preserved',
    message: 'I want to send money to Thailand.',
    profile: completeProfile(),
  });
  const financeDetected = service.detectIntents(financeContext);
  const financeTasks = service.createTasksFromIntents(financeContext, financeDetected);
  const housing = await ask('There is no hot water in my apartment.', completeProfile({ preferredLanguage: 'en' }));
  const urgent = await ask('I need urgent medical help.', completeProfile({ preferredLanguage: 'en' }));
  const multi = await ask('I did not receive my salary and there is no hot water in my apartment.', completeProfile({ preferredLanguage: 'en' }));

  assert.deepEqual(financeDetected.intents, [
    {
      domain: 'finance_consumer',
      intent: 'money_transfer',
    },
  ]);
  assert.equal(financeTasks[0].capability, 'finance.transfer');
  assert.match(housing.result.reply, /hot water/i);
  assert.match(urgent.result.reply, /emergency services/i);
  assert.match(multi.result.reply, /paid|salary/i);
  assert.match(multi.result.reply, /hot water/i);
});

test('Thai currently has deterministic translation-path coverage in existing test architecture', async () => {
  const { result, state, metadata } = await ask('I did not receive my salary.', completeProfile({ preferredLanguage: 'th' }));

  assert.equal(callsTo(state, 'th').length, 1);
  assert.equal(metadata.translated, true);
  assert.match(result.reply, /^TH:/);
});
