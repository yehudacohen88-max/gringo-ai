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
const taskService = require('../src/modules/tasks/task.service');
const { translationService } = require('../src/modules/translation');
const { coreAgentService } = require('../src/modules/core-agent');

Module._load = originalLoad;

function completeProfile(overrides = {}) {
  return {
    userId: 'usr_outgoing_translation',
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
    savedEvents: [],
    memoryQuestions: [],
  };
  const user = {
    userId: profile.userId,
    channel: options.channel || 'web',
    channelUserId: options.channelUserId || 'outgoing-translation-user',
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

  knowledgeAgentService.answerQuestion = async () => ({
    answer: options.knowledgeAnswer || 'You can ask your employer for payment and keep records.',
    category: 'Rights',
    status: 'FOUND',
    relevantKnowledge: [],
  });

  aiProviderService.generateReply = async () => ({
    provider: 'openai',
    model: 'test-model',
    text: options.aiAnswer || 'AI answer',
  });
  taskService.isTaskMessage = () => Boolean(options.taskIntent);
  taskService.handleTaskChat = async () => ({
    reply: options.taskReply || '',
    category: 'Tasks',
    status: 'TASKS_FOUND',
  });

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
      translatedText: options.translatedText || `[${targetLanguage}] ${text}`,
      sourceLanguage,
      targetLanguage,
      provider: 'mock-provider',
      translated: true,
      fallbackUsed: false,
    };
  };

  return state;
}

function outgoingCalls(state) {
  return state.providerCalls.filter((call) => call.sourceLanguage === 'en' && call.targetLanguage !== 'en');
}

async function ask(profile, options = {}, message = '/profile', channel = 'web') {
  const state = mockCore(profile, { ...options, channel });
  const result = await coreAgentService.processWebMessage({
    message,
    channel,
    channelUserId: `${channel}-outgoing-user`,
  });
  return { result, state };
}

test('English response is translated to Hebrew before delivery', async () => {
  const { result, state } = await ask(completeProfile({ preferredLanguage: 'he' }), {
    translatedText: 'אפשר לבקש מהמעסיק תשלום ולשמור מסמכים.',
  });

  assert.equal(result.reply, 'אפשר לבקש מהמעסיק תשלום ולשמור מסמכים.');
  assert.equal(outgoingCalls(state).length, 1);
  assert.equal(outgoingCalls(state)[0].targetLanguage, 'he');
});

test('English response is translated to Arabic before delivery', async () => {
  const { result, state } = await ask(completeProfile({ preferredLanguage: 'ar' }), {
    translatedText: 'يمكنك طلب الدفع من صاحب العمل والاحتفاظ بالسجلات.',
  });

  assert.equal(result.reply, 'يمكنك طلب الدفع من صاحب العمل والاحتفاظ بالسجلات.');
  assert.equal(outgoingCalls(state).length, 1);
  assert.equal(outgoingCalls(state)[0].targetLanguage, 'ar');
});

test('English response is translated to Thai before delivery', async () => {
  const { result, state } = await ask(completeProfile({ preferredLanguage: 'th' }), {
    translatedText: 'คุณสามารถขอให้นายจ้างจ่ายเงินและเก็บหลักฐานไว้ได้',
  });

  assert.equal(result.reply, 'คุณสามารถขอให้นายจ้างจ่ายเงินและเก็บหลักฐานไว้ได้');
  assert.equal(outgoingCalls(state).length, 1);
  assert.equal(outgoingCalls(state)[0].targetLanguage, 'th');
});

test('English target skips outgoing translation', async () => {
  const { result, state } = await ask(completeProfile({ preferredLanguage: 'en' }));

  assert.equal(result.reply, 'You can ask your employer for payment and keep records.');
  assert.equal(outgoingCalls(state).length, 0);
});

test('Empty response skips outgoing translation', async () => {
  const { result, state } = await ask(completeProfile({ preferredLanguage: 'he' }), {
    taskIntent: true,
    taskReply: '',
  }, 'show my tasks');

  assert.equal(result.reply, '');
  assert.equal(outgoingCalls(state).length, 0);
});

test('Translation failure sends original English response', async () => {
  const { result, state } = await ask(completeProfile({ preferredLanguage: 'he' }), {
    failTranslation: true,
  });

  assert.equal(result.reply, 'You can ask your employer for payment and keep records.');
  assert.equal(outgoingCalls(state).length, 1);
});

test('originalResponse remains unchanged internally and CRM saves English answer', async () => {
  const english = 'You can ask your employer for payment and keep records.';
  const { result, state } = await ask(completeProfile({ preferredLanguage: 'he' }), {
    translatedText: 'אפשר לבקש מהמעסיק תשלום ולשמור מסמכים.',
  });
  const symbol = Object.getOwnPropertySymbols(result).find((item) => String(item).includes('outgoingTranslation'));
  const metadata = result[symbol];

  assert.equal(state.savedEvents.at(-1).answer, english);
  assert.equal(metadata.originalResponse, english);
  assert.equal(metadata.deliveryResponse, 'אפשר לבקש מהמעסיק תשלום ולשמור מסמכים.');
  assert.equal(Object.keys(result).includes('translation'), false);
});

test('URLs, codes, money amounts, and dates remain intact', async () => {
  const english = 'Visit https://example.com, use code ABC12345, pay 700 NIS, and check 2027-05-20.';
  const { result, state } = await ask(completeProfile({ preferredLanguage: 'he' }), {
    knowledgeAnswer: english,
    translatedText:
      'בדוק __GRINGO_KEEP_0__, השתמש בקוד __GRINGO_KEEP_1__, שלם __GRINGO_KEEP_2__, ובדוק __GRINGO_KEEP_3__.',
  });

  assert.equal(outgoingCalls(state).length, 1);
  assert.match(result.reply, /https:\/\/example\.com/);
  assert.match(result.reply, /ABC12345/);
  assert.match(result.reply, /700 NIS/);
  assert.match(result.reply, /2027-05-20/);
});

test('Provider is called only once for outgoing translation', async () => {
  const { state } = await ask(completeProfile({ preferredLanguage: 'he' }), {
    translatedText: 'אפשר לבקש מהמעסיק תשלום ולשמור מסמכים.',
  });

  assert.equal(outgoingCalls(state).length, 1);
});

test('Each channel receives deliveryResponse through shared Core Agent flow', async () => {
  for (const channel of ['web', 'telegram', 'whatsapp', 'line']) {
    const { result, state } = await ask(
      completeProfile({ preferredLanguage: 'he' }),
      {
        translatedText: `delivery-${channel}`,
      },
      '/profile',
      channel
    );

    assert.equal(result.reply, `delivery-${channel}`);
    assert.equal(outgoingCalls(state).length, 1);
  }
});
