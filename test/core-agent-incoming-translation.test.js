const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;
Module._load = function loadStub(request, parent, isMain) {
  if (request === 'dotenv') return { config: () => ({}) };
  if (request === 'googleapis') return { google: { auth: { JWT: function JWT() {} }, sheets: () => ({}) } };
  return originalLoad.call(this, request, parent, isMain);
};

const { aiProviderService } = require('../src/modules/ai-provider');
const { crmAgentService } = require('../src/modules/crm-agent');
const { knowledgeAgentService } = require('../src/modules/knowledge-agent');
const { translationService } = require('../src/modules/translation');
const { coreAgentService } = require('../src/modules/core-agent');

Module._load = originalLoad;

function completeProfile(overrides = {}) {
  return {
    userId: 'usr_translation_core',
    fullName: 'Somchai',
    country: 'Thailand',
    preferredLanguage: 'en',
    detectedLanguage: '',
    languageSource: '',
    language: '',
    workSector: 'Construction',
    profession: 'Construction worker',
    city: 'Tel Aviv',
    wantsJobAlerts: 'Yes',
    preferredCurrency: 'THB',
    wantsExchangeRateAlerts: 'Yes',
    ...overrides,
  };
}

function mockCore(profile, options = {}) {
  const state = {
    providerCalls: [],
    knowledgeQuestions: [],
    savedEvents: [],
    memoryQuestions: [],
    aiContexts: [],
  };
  const user = {
    userId: profile.userId,
    channel: options.channel || 'web',
    channelUserId: options.channelUserId || 'incoming-translation-user',
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
  crmAgentService.updateDetectedLanguage = async () => ({});
  crmAgentService.updateUserProfile = async (userId, updates) => ({ ...profile, ...updates, userId });
  crmAgentService.saveConversation = async (event) => {
    state.savedEvents.push(event);
    return event;
  };
  crmAgentService.extractAndUpdateMemory = async (userId, question) => {
    state.memoryQuestions.push(question);
    return { signals: { interests: [] } };
  };

  knowledgeAgentService.answerQuestion = async ({ question }) => {
    state.knowledgeQuestions.push(question);
    return {
      answer: 'Knowledge answer',
      category: 'Rights',
      status: 'FOUND',
      relevantKnowledge: [],
    };
  };

  aiProviderService.generateReply = async (context) => {
    state.aiContexts.push(context);
    return {
      provider: 'openai',
      model: 'test-model',
      text: 'AI answer',
    };
  };

  translationService.getProviderName = () => 'mock-provider';
  translationService.translateText = async (text, sourceLanguage, targetLanguage) => {
    state.providerCalls.push({ text, sourceLanguage, targetLanguage });
    if (options.failTranslation) {
      return {
        translatedText: text,
        sourceLanguage,
        targetLanguage,
        provider: 'mock-provider',
        translated: false,
        fallbackUsed: true,
      };
    }
    return {
      translatedText: options.translatedText || 'What are my rights if my employer did not pay me?',
      sourceLanguage,
      targetLanguage,
      provider: 'mock-provider',
      translated: true,
      fallbackUsed: false,
    };
  };

  return state;
}

function incomingCalls(state) {
  return state.providerCalls.filter((call) => call.targetLanguage === 'en');
}

test('Hebrew message is translated to English before intent routing', async () => {
  const state = mockCore(completeProfile({ preferredLanguage: 'he' }));

  await coreAgentService.processWebMessage({
    message: 'מה הזכויות שלי אם המעסיק לא שילם לי?',
    channel: 'web',
    channelUserId: 'he-translation',
  });

  assert.equal(incomingCalls(state).length, 1);
  assert.equal(incomingCalls(state)[0].sourceLanguage, 'he');
  assert.equal(state.knowledgeQuestions.at(-1), 'What are my rights if my employer did not pay me?');
});

test('Arabic message is translated to English before intent routing', async () => {
  const state = mockCore(completeProfile({ preferredLanguage: 'ar' }), {
    translatedText: 'What are my rights if my employer did not pay me?',
  });

  await coreAgentService.processWebMessage({
    message: 'ما هي حقوقي إذا لم يدفع لي صاحب العمل؟',
    channel: 'web',
    channelUserId: 'ar-translation',
  });

  assert.equal(incomingCalls(state).length, 1);
  assert.equal(incomingCalls(state)[0].sourceLanguage, 'ar');
  assert.equal(state.knowledgeQuestions.at(-1), 'What are my rights if my employer did not pay me?');
});

test('Thai message is translated to English before intent routing', async () => {
  const state = mockCore(completeProfile({ preferredLanguage: 'th' }), {
    translatedText: 'What are my rights if my employer did not pay me?',
  });

  await coreAgentService.processWebMessage({
    message: 'นายจ้างไม่จ่ายเงิน ฉันมีสิทธิอะไรบ้าง',
    channel: 'web',
    channelUserId: 'th-translation',
  });

  assert.equal(incomingCalls(state).length, 1);
  assert.equal(incomingCalls(state)[0].sourceLanguage, 'th');
  assert.equal(state.knowledgeQuestions.at(-1), 'What are my rights if my employer did not pay me?');
});

test('English message skips translation provider', async () => {
  const state = mockCore(completeProfile({ preferredLanguage: 'en' }));

  await coreAgentService.processWebMessage({
    message: 'What are my rights if my employer did not pay me?',
    channel: 'web',
    channelUserId: 'en-skip',
  });

  assert.equal(incomingCalls(state).length, 0);
  assert.equal(state.knowledgeQuestions.at(-1), 'What are my rights if my employer did not pay me?');
});

test('Empty message skips translation provider', async () => {
  const state = mockCore(completeProfile({ preferredLanguage: 'en' }));

  await coreAgentService.processWebMessage({
    message: '',
    channel: 'web',
    channelUserId: 'empty-skip',
  });

  assert.equal(incomingCalls(state).length, 0);
});

test('Translation failure safely uses original text and preserves it', async () => {
  const original = 'מה הזכויות שלי אם המעסיק לא שילם לי?';
  const state = mockCore(completeProfile({ preferredLanguage: 'he' }), {
    failTranslation: true,
  });

  await coreAgentService.processWebMessage({
    message: original,
    channel: 'web',
    channelUserId: 'translation-failure',
  });

  assert.equal(incomingCalls(state).length, 1);
  assert.equal(state.knowledgeQuestions.at(-1), original);
  assert.equal(state.savedEvents.at(-1).question, original);
  assert.equal(state.memoryQuestions.at(-1), original);
});

test('Intent routing receives processingText while CRM keeps original text', async () => {
  const original = 'מה הזכויות שלי אם המעסיק לא שילם לי?';
  const translated = 'What are my rights if my employer did not pay me?';
  const state = mockCore(completeProfile({ preferredLanguage: 'he' }), {
    translatedText: translated,
  });

  await coreAgentService.processWebMessage({
    message: original,
    channel: 'web',
    channelUserId: 'processing-text',
  });

  assert.equal(state.knowledgeQuestions.at(-1), translated);
  assert.equal(state.savedEvents.at(-1).question, original);
});

test('Commands are not translated', async () => {
  const state = mockCore(completeProfile({ preferredLanguage: 'he' }));

  await coreAgentService.processWebMessage({
    message: '/profile',
    channel: 'telegram',
    channelUserId: 'command-skip',
  });

  assert.equal(incomingCalls(state).length, 0);
  assert.equal(state.knowledgeQuestions.at(-1), '/profile');
});

test('Provider is called only once for incoming translation per message', async () => {
  const state = mockCore(completeProfile({ preferredLanguage: 'he' }));

  await coreAgentService.processWebMessage({
    message: 'מה הזכויות שלי אם המעסיק לא שילם לי?',
    channel: 'whatsapp',
    channelUserId: 'single-call',
  });

  assert.equal(incomingCalls(state).length, 1);
});

test('Existing channel flows still use the shared Core Agent path', async () => {
  const state = mockCore(completeProfile({ preferredLanguage: 'th' }), {
    translatedText: 'What are my rights if my employer did not pay me?',
    channel: 'line',
  });

  await coreAgentService.processWebMessage({
    message: 'นายจ้างไม่จ่ายเงิน ฉันมีสิทธิอะไรบ้าง',
    channel: 'line',
    channelUserId: 'line-shared-flow',
  });

  assert.equal(incomingCalls(state).length, 1);
  assert.equal(state.knowledgeQuestions.at(-1), 'What are my rights if my employer did not pay me?');
});
