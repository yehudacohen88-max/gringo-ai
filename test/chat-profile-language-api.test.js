const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

let profile = {};
let calls = {};

const coreAgentService = {
  getOnboardingStatus: async () => ({
    complete: true,
    profile,
    summary: 'Profile summary',
  }),
  updateUserProfile: async (context, updates) => {
    calls.updateUserProfile.push({ context, updates });
    profile = { ...profile, ...updates };
    return profile;
  },
};

const crmAgentService = {
  getUserLanguage: async (user = {}) => ({
    preferredLanguage: normalizeLanguage(user.preferredLanguage),
    detectedLanguage: normalizeLanguage(user.detectedLanguage),
    languageSource: ['explicit', 'profile', 'channel', 'text', 'default'].includes(user.languageSource)
      ? user.languageSource
      : '',
    languageUpdatedAt: user.languageUpdatedAt || '',
    language: normalizeLanguage(user.preferredLanguage) || normalizeLanguage(user.detectedLanguage) || '',
  }),
  setPreferredLanguage: async (userId, language) => {
    calls.setPreferredLanguage.push({ userId, language });
    const preferredLanguage = normalizeLanguage(language);
    if (!preferredLanguage) {
      const error = new Error(`Unsupported language: ${language}`);
      error.statusCode = 400;
      throw error;
    }
    profile = { ...profile, preferredLanguage, languageSource: 'explicit' };
    return profile;
  },
  clearPreferredLanguage: async (userId) => {
    calls.clearPreferredLanguage.push({ userId });
    profile = { ...profile, preferredLanguage: '' };
    return profile;
  },
  saveConversation: async (event) => event,
};

const originalLoad = Module._load;
Module._load = function loadStub(request, parent, isMain) {
  if (parent?.filename?.endsWith('chat.controller.js') && request === '../core-agent') {
    return { coreAgentService };
  }
  if (parent?.filename?.endsWith('chat.controller.js') && request === '../crm-agent') {
    return { crmAgentService };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const chatController = require('../src/modules/chat/chat.controller');

Module._load = originalLoad;

function normalizeLanguage(value = '') {
  const normalized = String(value || '').trim().toLowerCase().replace(/_/g, '-');
  const primary = normalized.split('-')[0];
  const aliases = {
    english: 'en',
    hebrew: 'he',
    iw: 'he',
    arabic: 'ar',
    thai: 'th',
    sinhala: 'si',
    hindi: 'hi',
    russian: 'ru',
    tagalog: 'tl',
    filipino: 'tl',
  };
  const code = aliases[normalized] || aliases[primary] || primary;
  return ['en', 'he', 'ar', 'th', 'si', 'hi', 'ru', 'tl'].includes(code) ? code : '';
}

function mockProfile(overrides = {}) {
  return {
    userId: 'usr_profile_language_api',
    channel: 'web',
    channelUserId: 'profile-language-api-user',
    fullName: 'Somchai',
    country: 'Thailand',
    preferredLanguage: '',
    detectedLanguage: 'he',
    languageSource: 'text',
    city: 'Tel Aviv',
    workSector: 'Construction',
    ...overrides,
  };
}

function reset(overrides = {}) {
  profile = mockProfile(overrides);
  calls = {
    clearPreferredLanguage: [],
    setPreferredLanguage: [],
    updateUserProfile: [],
  };
}

async function invoke(handler, req = {}) {
  const result = {
    statusCode: undefined,
    body: undefined,
    error: undefined,
  };
  const res = {
    status(code) {
      result.statusCode = code;
      return this;
    },
    json(body) {
      result.body = body;
      return this;
    },
  };
  await handler(
    {
      query: {},
      body: {},
      ...req,
    },
    res,
    (error) => {
      result.error = error;
    }
  );
  return result;
}

test('GET profile returns language fields', async () => {
  reset({ preferredLanguage: 'th', detectedLanguage: 'he', languageSource: 'text' });

  const result = await invoke(chatController.getProfile, {
    query: { channel: 'web', channelUserId: 'profile-language-api-user' },
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.profile.preferredLanguage, 'th');
  assert.equal(result.body.profile.detectedLanguage, 'he');
  assert.equal(result.body.profile.languageSource, 'text');
});

test('GET profile returns empty language fields for old profiles', async () => {
  reset();
  delete profile.preferredLanguage;
  delete profile.detectedLanguage;
  delete profile.languageSource;

  const result = await invoke(chatController.getProfile, {
    query: { channel: 'web', channelUserId: 'profile-language-api-user' },
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.profile.preferredLanguage, '');
  assert.equal(result.body.profile.detectedLanguage, '');
  assert.equal(result.body.profile.languageSource, '');
  assert.equal(result.body.profile.fullName, 'Somchai');
});

test('PUT profile updates preferredLanguage through CRM language service', async () => {
  reset();

  const result = await invoke(chatController.updateProfile, {
    body: {
      channel: 'web',
      channelUserId: 'profile-language-api-user',
      preferredLanguage: 'iw',
    },
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.profile.preferredLanguage, 'he');
  assert.deepEqual(calls.setPreferredLanguage, [{ userId: 'usr_profile_language_api', language: 'iw' }]);
});

test('PUT profile accepts null preferredLanguage as Auto mode', async () => {
  reset({ preferredLanguage: 'th', detectedLanguage: 'he' });

  const result = await invoke(chatController.updateProfile, {
    body: {
      channel: 'web',
      channelUserId: 'profile-language-api-user',
      preferredLanguage: null,
    },
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.profile.preferredLanguage, '');
  assert.equal(result.body.profile.detectedLanguage, 'he');
  assert.deepEqual(calls.clearPreferredLanguage, [{ userId: 'usr_profile_language_api' }]);
});

test('PUT profile rejects invalid preferredLanguage', async () => {
  reset();

  const result = await invoke(chatController.updateProfile, {
    body: {
      channel: 'web',
      channelUserId: 'profile-language-api-user',
      preferredLanguage: 'fr',
    },
  });

  assert.equal(result.error.statusCode, 400);
  assert.equal(result.error.message, 'Unsupported language: fr');
});

test('PUT profile preserves existing profile fields during language-only update', async () => {
  reset({ preferredLanguage: '', city: 'Tel Aviv', workSector: 'Construction' });

  const result = await invoke(chatController.updateProfile, {
    body: {
      channel: 'web',
      channelUserId: 'profile-language-api-user',
      preferredLanguage: 'en',
    },
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.profile.fullName, 'Somchai');
  assert.equal(result.body.profile.country, 'Thailand');
  assert.equal(result.body.profile.city, 'Tel Aviv');
  assert.equal(result.body.profile.workSector, 'Construction');
  assert.deepEqual(calls.updateUserProfile, []);
});
