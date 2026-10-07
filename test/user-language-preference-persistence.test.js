const test = require('node:test');
const assert = require('node:assert/strict');

const crmAgentRepository = require('../src/modules/crm-agent/crm-agent.repository');
const { crmAgentService } = require('../src/modules/crm-agent');
const { USER_PROFILE_DEFAULTS } = require('../src/modules/crm-agent/user-profile.model');

function baseProfile(overrides = {}) {
  return {
    ...USER_PROFILE_DEFAULTS,
    userId: 'usr_language_preference',
    channel: 'web',
    channelUserId: 'language-preference-user',
    fullName: 'Somchai',
    country: 'Thailand',
    city: 'Tel Aviv',
    workSector: 'Construction',
    ...overrides,
  };
}

function mockRepository(profile, writes = []) {
  crmAgentRepository.findUserProfileRecordByUserId = async () => ({
    rowNumber: 3,
    profile,
  });
  crmAgentRepository.findUserProfileRecordByChannel = async () => null;
  crmAgentRepository.createUserProfile = async (createdProfile) => createdProfile;
  crmAgentRepository.updateUserProfile = async (rowNumber, updatedProfile) => {
    writes.push({ rowNumber, profile: updatedProfile });
    return updatedProfile;
  };
  return writes;
}

test('saves a valid preferred language', async () => {
  const writes = mockRepository(baseProfile());

  const updated = await crmAgentService.setPreferredLanguage('usr_language_preference', 'th');

  assert.equal(updated.preferredLanguage, 'th');
  assert.equal(updated.languageSource, 'explicit');
  assert.match(updated.languageUpdatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(writes.length, 1);
});

test('normalizes preferred language aliases', async () => {
  const writes = mockRepository(baseProfile());

  const updated = await crmAgentService.setPreferredLanguage('usr_language_preference', 'iw');

  assert.equal(updated.preferredLanguage, 'he');
  assert.equal(updated.languageSource, 'explicit');
  assert.equal(writes.length, 1);
});

test('rejects an unsupported preferred language', async () => {
  const writes = mockRepository(baseProfile());

  await assert.rejects(
    () => crmAgentService.setPreferredLanguage('usr_language_preference', 'fr'),
    /Unsupported language/
  );
  assert.equal(writes.length, 0);
});

test('clears preferredLanguage without clearing detectedLanguage', async () => {
  const writes = mockRepository(
    baseProfile({
      preferredLanguage: 'th',
      detectedLanguage: 'he',
      languageSource: 'text',
      languageUpdatedAt: '2026-07-27T10:00:00.000Z',
    })
  );

  const updated = await crmAgentService.clearPreferredLanguage('usr_language_preference');

  assert.equal(updated.preferredLanguage, '');
  assert.equal(updated.detectedLanguage, 'he');
  assert.equal(updated.languageSource, 'text');
  assert.match(updated.languageUpdatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(writes.length, 1);
});

test('automatic detection does not overwrite preferredLanguage', async () => {
  const writes = mockRepository(
    baseProfile({
      preferredLanguage: 'th',
      detectedLanguage: '',
      languageSource: '',
    })
  );

  const updated = await crmAgentService.updateDetectedLanguage('usr_language_preference', {
    language: 'Russian',
    source: 'text',
  });

  assert.equal(updated.preferredLanguage, 'th');
  assert.equal(updated.detectedLanguage, 'ru');
  assert.equal(updated.languageSource, 'text');
  assert.equal(writes.length, 1);
});

test('does not write when preferred language values are unchanged', async () => {
  const writes = mockRepository(
    baseProfile({
      preferredLanguage: 'he',
      languageSource: 'explicit',
      languageUpdatedAt: '2026-07-27T10:00:00.000Z',
    })
  );

  const profile = await crmAgentService.setPreferredLanguage('usr_language_preference', 'iw');

  assert.equal(profile.preferredLanguage, 'he');
  assert.equal(writes.length, 0);
});

test('does not write when detected language values are unchanged', async () => {
  const writes = mockRepository(
    baseProfile({
      preferredLanguage: 'th',
      detectedLanguage: 'ru',
      languageSource: 'text',
      languageUpdatedAt: '2026-07-27T10:00:00.000Z',
    })
  );

  const profile = await crmAgentService.updateDetectedLanguage('usr_language_preference', {
    language: 'Russian',
    source: 'text',
  });

  assert.equal(profile.detectedLanguage, 'ru');
  assert.equal(writes.length, 0);
});

test('old profiles with empty language fields still return a safe user language object', async () => {
  const legacyProfile = baseProfile({
    language: '',
    preferredLanguage: '',
  });
  delete legacyProfile.detectedLanguage;
  delete legacyProfile.languageSource;
  delete legacyProfile.languageUpdatedAt;

  mockRepository(legacyProfile);

  const language = await crmAgentService.getUserLanguage({ userId: 'usr_language_preference' });

  assert.deepEqual(language, {
    preferredLanguage: '',
    detectedLanguage: '',
    languageSource: '',
    languageUpdatedAt: '',
    language: '',
  });
});

test('language updates preserve unrelated profile data', async () => {
  const writes = mockRepository(baseProfile({ preferredCurrency: 'THB', wantsJobAlerts: 'Yes' }));

  const updated = await crmAgentService.setPreferredLanguage('usr_language_preference', 'English');

  assert.equal(updated.fullName, 'Somchai');
  assert.equal(updated.country, 'Thailand');
  assert.equal(updated.city, 'Tel Aviv');
  assert.equal(updated.workSector, 'Construction');
  assert.equal(updated.preferredCurrency, 'THB');
  assert.equal(updated.wantsJobAlerts, 'Yes');
  assert.equal(writes.length, 1);
});
