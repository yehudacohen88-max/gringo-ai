const test = require('node:test');
const assert = require('node:assert/strict');

const { aiProviderService } = require('../src/modules/ai-provider');
const { crmAgentService } = require('../src/modules/crm-agent');
const { coreAgentService } = require('../src/modules/core-agent');

function completeProfile(overrides = {}) {
  return {
    userId: 'usr_test_001',
    channel: 'web',
    fullName: 'Somchai',
    country: 'Thailand',
    preferredLanguage: 'en',
    workSector: 'Construction',
    profession: 'Construction worker',
    city: 'Tel Aviv',
    wantsJobAlerts: 'Yes',
    preferredCurrency: 'THB',
    wantsExchangeRateAlerts: 'Yes',
    interests: 'Jobs',
    lastQuestion: 'I need work',
    ...overrides,
  };
}

function mockCrm(overrides = {}) {
  const profile = completeProfile();
  crmAgentService.findOrCreateUser = async () => profile;
  crmAgentService.getUserMemory = async () => profile;
  crmAgentService.saveConversation = async (event) => event;
  crmAgentService.getUserLanguage = async (profile) => ({
    preferredLanguage: profile.preferredLanguage || '',
    detectedLanguage: profile.detectedLanguage || '',
    languageSource: profile.languageSource || '',
    languageUpdatedAt: profile.languageUpdatedAt || '',
    language: profile.preferredLanguage || profile.detectedLanguage || profile.language || '',
  });
  crmAgentService.updateDetectedLanguage = async () => ({});
  crmAgentService.extractAndUpdateMemory = async () => ({
    signals: {
      interests: [],
    },
  });
  crmAgentService.updateUserProfile = async (userId, updates) => ({
    userId,
    ...updates,
  });

  Object.assign(crmAgentService, overrides);
}

test('Core Agent calls AI provider with user, memory, knowledge, and conversation context when knowledge is missing', async () => {
  mockCrm();

  const providerContexts = [];
  const savedEvents = [];

  aiProviderService.generateReply = async (context) => {
    providerContexts.push(context);
    return {
      provider: 'openai',
      model: 'test-model',
      text: 'Hi, I am here. What do you need help with?',
    };
  };
  crmAgentService.saveConversation = async (event) => {
    savedEvents.push(event);
    return event;
  };

  await coreAgentService.processWebMessage({
    message: 'Earlier context',
    channel: 'web',
    channelUserId: 'test-user',
  });
  const result = await coreAgentService.processWebMessage({
    message: 'Hi Gringo',
    channel: 'web',
    channelUserId: 'test-user',
  });

  assert.equal(result.status, 'AI_PROVIDER');
  assert.equal(result.ai.used, true);
  assert.equal(providerContexts.length, 2);
  assert.equal(providerContexts[1].message, 'Hi Gringo');
  assert.equal(providerContexts[1].userLanguage, 'en');
  assert.equal(providerContexts[1].userProfile.userId, 'usr_test_001');
  assert.equal(Array.isArray(providerContexts[1].relevantKnowledge), true);
  assert.equal(providerContexts[1].recentConversation.length, 2);
  assert.equal(savedEvents.at(-1).answer, 'Hi, I am here. What do you need help with?');
  assert.equal(savedEvents.at(-1).status, 'AI_PROVIDER');
});

test('Core Agent returns friendly fallback and still saves conversation when AI provider fails', async () => {
  const savedEvents = [];

  mockCrm({
    saveConversation: async (event) => {
      savedEvents.push(event);
      return event;
    },
  });

  aiProviderService.generateReply = async () => {
    throw new Error('Provider unavailable');
  };

  const result = await coreAgentService.processWebMessage({
    message: 'Hi Gringo',
    channel: 'web',
    channelUserId: 'fallback-user',
  });

  assert.equal(result.ai.attempted, true);
  assert.equal(result.ai.used, false);
  assert.match(result.reply, /Gringo will check/);
  assert.equal(savedEvents.length, 1);
  assert.equal(savedEvents[0].answer, result.reply);
});
