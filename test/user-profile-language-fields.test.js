const test = require('node:test');
const assert = require('node:assert/strict');

const crmAgentRepository = require('../src/modules/crm-agent/crm-agent.repository');
const { crmAgentService } = require('../src/modules/crm-agent');
const {
  USER_PROFILE_DEFAULTS,
  USER_PROFILE_FIELDS,
  normalizeProfileLanguageFields,
} = require('../src/modules/crm-agent/user-profile.model');

function mockRepository(overrides = {}) {
  crmAgentRepository.findUserProfileRecordByUserId = async () => null;
  crmAgentRepository.findUserProfileRecordByChannel = async () => null;
  crmAgentRepository.createUserProfile = async (profile) => profile;
  crmAgentRepository.updateUserProfile = async (rowNumber, profile) => profile;

  Object.assign(crmAgentRepository, overrides);
}

test('new profile defaults language profile fields to empty values', async () => {
  mockRepository();

  const profile = await crmAgentService.findOrCreateUser({
    channel: 'web',
    channelUserId: 'language-empty-user',
  });

  assert.equal(profile.preferredLanguage, '');
  assert.equal(profile.detectedLanguage, '');
  assert.equal(profile.languageSource, '');
  assert.equal(profile.languageUpdatedAt, '');
});

test('existing profile without new language fields still loads with empty values', async () => {
  const legacyProfile = {
    ...USER_PROFILE_DEFAULTS,
    userId: 'usr_legacy_language',
    channel: 'web',
    channelUserId: 'legacy-language-user',
    fullName: 'Legacy User',
  };
  delete legacyProfile.detectedLanguage;
  delete legacyProfile.languageSource;
  delete legacyProfile.languageUpdatedAt;

  mockRepository({
    findUserProfileRecordByUserId: async () => ({
      rowNumber: 2,
      profile: legacyProfile,
    }),
  });

  const memory = await crmAgentService.getUserMemory('usr_legacy_language');

  assert.equal(memory.userId, 'usr_legacy_language');
  assert.equal(memory.fullName, 'Legacy User');
  assert.equal(memory.detectedLanguage, '');
  assert.equal(memory.languageSource, '');
  assert.equal(memory.languageUpdatedAt, '');
});

test('valid supported language values are normalized safely', async () => {
  mockRepository();

  const profile = await crmAgentService.findOrCreateUser({
    channel: 'web',
    channelUserId: 'language-valid-user',
    preferredLanguage: 'Thai',
    detectedLanguage: 'iw',
    languageSource: 'CHANNEL',
    languageUpdatedAt: '2026-07-27T10:00:00.000Z',
  });

  assert.equal(profile.preferredLanguage, 'th');
  assert.equal(profile.detectedLanguage, 'he');
  assert.equal(profile.languageSource, 'channel');
  assert.equal(profile.languageUpdatedAt, '2026-07-27T10:00:00.000Z');
});

test('invalid language values are cleared safely', () => {
  const normalized = normalizeProfileLanguageFields({
    preferredLanguage: 'fr',
    detectedLanguage: 'klingon',
    languageSource: 'guess',
    languageUpdatedAt: '2026-07-27T10:00:00.000Z',
  });

  assert.equal(normalized.preferredLanguage, '');
  assert.equal(normalized.detectedLanguage, '');
  assert.equal(normalized.languageSource, '');
  assert.equal(normalized.languageUpdatedAt, '2026-07-27T10:00:00.000Z');
});

test('existing profile data remains unchanged when language fields are updated', async () => {
  const existingProfile = {
    ...USER_PROFILE_DEFAULTS,
    userId: 'usr_existing_language',
    channel: 'web',
    channelUserId: 'existing-language-user',
    fullName: 'Somchai',
    country: 'Thailand',
    city: 'Tel Aviv',
    workSector: 'Construction',
    preferredLanguage: 'Thai',
  };

  mockRepository({
    findUserProfileRecordByUserId: async () => ({
      rowNumber: 4,
      profile: existingProfile,
    }),
  });

  const updated = await crmAgentService.updateUserProfile('usr_existing_language', {
    detectedLanguage: 'Russian',
    languageSource: 'text',
    languageUpdatedAt: '2026-07-27T11:00:00.000Z',
  });

  assert.equal(updated.fullName, 'Somchai');
  assert.equal(updated.country, 'Thailand');
  assert.equal(updated.city, 'Tel Aviv');
  assert.equal(updated.workSector, 'Construction');
  assert.equal(updated.preferredLanguage, 'Thai');
  assert.equal(updated.detectedLanguage, 'ru');
  assert.equal(updated.languageSource, 'text');
});

test('profile field list keeps preferredLanguage and appends new language columns', () => {
  assert.equal(USER_PROFILE_FIELDS.includes('preferredLanguage'), true);
  assert.equal(USER_PROFILE_FIELDS.at(-3), 'detectedLanguage');
  assert.equal(USER_PROFILE_FIELDS.at(-2), 'languageSource');
  assert.equal(USER_PROFILE_FIELDS.at(-1), 'languageUpdatedAt');
});
