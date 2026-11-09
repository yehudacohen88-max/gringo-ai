const test = require('node:test');
const assert = require('node:assert/strict');

const { aiProviderService } = require('../src/modules/ai-provider');
const { crmAgentService } = require('../src/modules/crm-agent');
const { coreAgentService } = require('../src/modules/core-agent');

function completeProfile(overrides = {}) {
  return {
    userId: 'usr_core_language',
    fullName: 'Somchai',
    country: 'Thailand',
    preferredLanguage: '',
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

function mockCoreLanguage(profile, options = {}) {
  const detectedUpdates = [];
  const savedEvents = [];
  const providerContexts = [];
  const user = { userId: profile.userId, channel: 'web', channelUserId: 'core-language-user' };

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
    detectedUpdates.push({ userId, resolution });
    return { ...profile, detectedLanguage: resolution.language, languageSource: resolution.source };
  };
  crmAgentService.saveConversation = async (event) => {
    savedEvents.push(event);
    return event;
  };
  crmAgentService.extractAndUpdateMemory = async () => ({
    signals: {
      interests: [],
    },
  });
  crmAgentService.updateUserProfile = async (userId, updates) => ({ ...profile, ...updates, userId });

  aiProviderService.generateReply = async (context) => {
    providerContexts.push(context);
    return {
      provider: 'openai',
      model: 'test-model',
      text: options.reply || 'Test reply',
    };
  };

  return {
    detectedUpdates,
    providerContexts,
    savedEvents,
  };
}

test('Core Agent preferredLanguage overrides text language', async () => {
  const state = mockCoreLanguage(completeProfile({ preferredLanguage: 'th' }));

  await coreAgentService.processWebMessage({
    message: 'שלום',
    channel: 'web',
    channelUserId: 'preferred-over-text',
  });

  assert.equal(state.providerContexts.at(-1).userLanguage, 'th');
  assert.equal(state.detectedUpdates.length, 0);
});

test('Core Agent preferredLanguage overrides channel language', async () => {
  const state = mockCoreLanguage(completeProfile({ preferredLanguage: 'he' }));

  await coreAgentService.processWebMessage({
    message: 'Hello Gringo',
    channel: 'telegram',
    channelUserId: 'preferred-over-channel',
    languageCode: 'ru',
  });

  assert.equal(state.providerContexts.at(-1).userLanguage, 'he');
  assert.equal(state.detectedUpdates.length, 0);
});

test('Core Agent uses a clear message script before the channel language', async () => {
  const state = mockCoreLanguage(completeProfile());

  const result = await coreAgentService.processWebMessage({
    message: 'Hello Gringo',
    channel: 'telegram',
    channelUserId: 'channel-language-text',
    languageCode: 'ar',
  });

  assert.equal(result.category, 'Onboarding');
  assert.equal(state.detectedUpdates.length, 1);
  assert.equal(state.detectedUpdates[0].resolution.language, 'en');
  assert.equal(state.detectedUpdates[0].resolution.source, 'text');
});

test('Core Agent uses channel language when the message has no clear script', async () => {
  const state = mockCoreLanguage(completeProfile());

  const result = await coreAgentService.processWebMessage({
    message: '12345',
    channel: 'telegram',
    channelUserId: 'channel-language',
    languageCode: 'ar',
  });

  assert.equal(result.category, 'Onboarding');
  assert.equal(state.detectedUpdates.length, 1);
  assert.equal(state.detectedUpdates[0].resolution.language, 'ar');
  assert.equal(state.detectedUpdates[0].resolution.source, 'channel');
});

test('Core Agent uses text detection when profile and channel are empty', async () => {
  const state = mockCoreLanguage(completeProfile());

  const result = await coreAgentService.processWebMessage({
    message: 'שלום',
    channel: 'web',
    channelUserId: 'text-language',
  });

  assert.equal(result.category, 'Onboarding');
  assert.equal(state.detectedUpdates.length, 1);
  assert.equal(state.detectedUpdates[0].resolution.language, 'he');
  assert.equal(state.detectedUpdates[0].resolution.source, 'text');
});

test('Core Agent uses default language when no signal exists', async () => {
  const state = mockCoreLanguage(completeProfile({ preferredLanguage: 'en' }));

  await coreAgentService.processWebMessage({
    message: '?!',
    channel: 'web',
    channelUserId: 'default-language',
  });

  assert.equal(state.providerContexts.at(-1).userLanguage, 'en');
  assert.equal(state.detectedUpdates.length, 0);
});

test('Core Agent does not let auto-detected language override a clear message', async () => {
  const state = mockCoreLanguage(completeProfile({ detectedLanguage: 'he', languageSource: 'text' }));

  await coreAgentService.processWebMessage({
    message: 'Hello Gringo',
    channel: 'web',
    channelUserId: 'saved-detected-language',
  });

  assert.equal(state.detectedUpdates.length, 1);
  assert.equal(state.detectedUpdates[0].resolution.language, 'en');
  assert.equal(state.detectedUpdates[0].resolution.source, 'text');
});

test('Core Agent never overwrites preferredLanguage with automatic detection', async () => {
  const state = mockCoreLanguage(completeProfile({ preferredLanguage: 'th', detectedLanguage: 'he' }));

  await coreAgentService.processWebMessage({
    message: 'Привет',
    channel: 'web',
    channelUserId: 'no-preferred-overwrite',
  });

  assert.equal(state.providerContexts.at(-1).userLanguage, 'th');
  assert.equal(state.detectedUpdates.length, 0);
});

test('Core Agent keeps existing intent routing unchanged for job search', async () => {
  const state = mockCoreLanguage(completeProfile({ preferredLanguage: 'th' }));

  const result = await coreAgentService.processWebMessage({
    message: 'I am looking for construction work in Tel Aviv',
    channel: 'web',
    channelUserId: 'intent-routing',
  });

  assert.equal(result.category, 'Jobs');
  assert.match(result.reply, /No results right now|ยังไม่มีผลลัพธ์ในตอนนี้|บริการนี้ไม่พร้อมใช้งานในตอนนี้/);
  assert.doesNotMatch(result.reply, /Aviv Construction/i);
  assert.equal(state.detectedUpdates.length, 0);
});
