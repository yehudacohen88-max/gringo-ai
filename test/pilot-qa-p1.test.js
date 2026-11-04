// Regressions for the pilot QA findings (Nov 2026): Thai onboarding shown in
// English with a Hebrew failure notice, a question saved as the country, and
// a fallback that promised a follow-up nobody sends.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const validation = require('../src/modules/core-agent/onboarding.validation');
const { STRINGS, normalizeOnboardingLanguage } = require('../src/modules/core-agent/onboarding.i18n');
const onboarding = require('../src/modules/core-agent/onboarding.service');
const core = require('../src/modules/core-agent/core-agent.service');
const { crmAgentService } = require('../src/modules/crm-agent');

test('the founder country answer is rejected; real countries normalize in he/en/th', () => {
  assert.equal(validation.normalizeCountry('אתה יכול לכתוב בתאית?'), '');
  assert.equal(validation.normalizeCountry('can you write in Thai'), '');
  assert.equal(validation.normalizeCountry('12345'), '');
  assert.equal(validation.normalizeCountry('ไทย'), 'Thailand');
  assert.equal(validation.normalizeCountry('תאילנד'), 'Thailand');
  assert.equal(validation.normalizeCountry('thailand'), 'Thailand');
  assert.equal(validation.normalizeCountry('Sri Lanka'), 'Sri Lanka');
  assert.equal(validation.normalizeCountry('อื่นๆ'), 'Other');
});

test('other onboarding fields reject questions, links, digits and long text', () => {
  assert.equal(validation.normalizeFullName('Somchai Jaidee'), 'Somchai Jaidee');
  assert.equal(validation.normalizeFullName('สมชาย ใจดี'), 'สมชาย ใจดี');
  assert.equal(validation.normalizeFullName('what is this?'), '');
  assert.equal(validation.normalizeFullName('0501234567'), '');
  assert.equal(validation.normalizeFullName('a b c d e f g'), '');
  assert.equal(validation.normalizeCity('Tel Aviv'), 'Tel Aviv');
  assert.equal(validation.normalizeCity('www.example.com'), '');
  assert.equal(validation.normalizeProfession('ช่างเหล็ก'), 'ช่างเหล็ก');
  assert.equal(validation.normalizeProfession('ทำงานอะไรได้บ้าง'), '');
  assert.equal(validation.normalizeWorkSector('ก่อสร้าง'), 'Construction');
  assert.equal(validation.normalizeWorkSector('חקלאות'), 'Agriculture');
  assert.equal(validation.normalizeWorkSector('3'), 'Caregiving');
  assert.equal(validation.normalizeWorkSector('banana'), '');
  assert.equal(validation.normalizeBoolean('ใช่'), 'Yes');
  assert.equal(validation.normalizeBoolean('לא'), 'No');
  assert.equal(validation.normalizeBoolean('maybe'), '');
  assert.equal(validation.normalizeCurrency('บาท'), 'THB');
  assert.equal(validation.normalizeCurrency('usd'), 'USD');
  assert.equal(validation.normalizeCurrency('hello'), '');
  assert.equal(validation.isSkipAnswer('ข้าม'), true);
});

test('onboarding language accepts native names and only he/en/th', () => {
  assert.equal(normalizeOnboardingLanguage('ไทย'), 'th');
  assert.equal(normalizeOnboardingLanguage('תאית'), 'th');
  assert.equal(normalizeOnboardingLanguage('Thai'), 'th');
  assert.equal(normalizeOnboardingLanguage('עברית'), 'he');
  assert.equal(normalizeOnboardingLanguage('English'), 'en');
  assert.equal(normalizeOnboardingLanguage('Klingon'), '');
});

test('every onboarding string exists in he, en and th', () => {
  for (const lang of ['he', 'th']) {
    for (const group of ['questions', 'invalid', 'labels']) {
      assert.deepEqual(Object.keys(STRINGS[lang][group]).sort(), Object.keys(STRINGS.en[group]).sort(), `${lang}.${group}`);
    }
    for (const key of ['questionDuringOnboarding', 'required', 'correct', 'done', 'summaryTitle']) {
      assert.ok(STRINGS[lang][key], `${lang}.${key}`);
    }
  }
  for (const field of onboarding.ONBOARDING_FIELDS) {
    for (const lang of ['he', 'en', 'th']) assert.ok(STRINGS[lang].questions[field.key], `${lang}.${field.key}`);
  }
  assert.equal(onboarding.ONBOARDING_FIELDS[0].key, 'preferredLanguage');
});

test('the profile write guard refuses an invalid country before it reaches the store', async () => {
  assert.throws(() => onboarding.sanitizeProfileUpdates({ country: 'אתה יכול לכתוב בתאית?' }), { code: 'INVALID_PROFILE_VALUE' });
  assert.deepEqual(onboarding.sanitizeProfileUpdates({ country: 'ไทย', workSector: 'בניין' }), { country: 'Thailand', workSector: 'Construction' });
  const calls = [];
  const original = crmAgentService.updateUserProfile;
  crmAgentService.updateUserProfile = async (...args) => { calls.push(args); return {}; };
  try {
    await assert.rejects(onboarding.updateUserProfile({ channel: 'telegram', channelUserId: 'qa-guard-1' }, { country: 'can you help?' }), { code: 'INVALID_PROFILE_VALUE' });
    assert.equal(calls.length, 0);
  } finally {
    crmAgentService.updateUserProfile = original;
  }
});

test('Thai onboarding with a Hebrew Telegram app: Thai questions, invalid country re-asked, values persisted', async () => {
  const ctx = { channel: 'telegram', channelUserId: 'qa-thai-1', language: 'he' };
  let r = await onboarding.handleMessage('hello', ctx);
  assert.match(r.reply, new RegExp(STRINGS.he.questions.preferredLanguage.slice(0, 10)));
  r = await onboarding.handleMessage('ไทย', ctx);
  assert.ok(r.reply.includes(STRINGS.th.questions.fullName));
  r = await onboarding.handleMessage('Somchai Jaidee', ctx);
  r = await onboarding.handleMessage('אתה יכול לכתוב בתאית?', ctx);
  assert.equal(r.invalid, true);
  assert.ok(r.reply.includes(STRINGS.th.invalid.country));
  assert.ok(r.reply.includes(STRINGS.th.questionDuringOnboarding));
  assert.equal(r.profile.country || '', '');
  r = await onboarding.handleMessage('ไทย', ctx);
  assert.equal(r.profile.country, 'Thailand');
  for (const answer of ['ก่อสร้าง', 'ช่างเหล็ก', 'Tel Aviv', 'ใช่', 'บาท', 'ไม่']) r = await onboarding.handleMessage(answer, ctx);
  assert.equal(r.complete, true);
  assert.ok(r.reply.includes(STRINGS.th.done));
  const status = await onboarding.getStatus(ctx);
  assert.equal(status.complete, true);
  const p = status.profile;
  assert.deepEqual(
    [p.preferredLanguage, p.fullName, p.country, p.workSector, p.profession, p.city, p.wantsJobAlerts, p.preferredCurrency, p.wantsExchangeRateAlerts],
    ['th', 'Somchai Jaidee', 'Thailand', 'Construction', 'ช่างเหล็ก', 'Tel Aviv', 'Yes', 'THB', 'No']
  );
});

test('a bad country saved before this fix is asked again', async () => {
  const ctx = { channel: 'telegram', channelUserId: 'qa-legacy-1', language: 'th' };
  const user = await crmAgentService.findOrCreateUser(ctx);
  await crmAgentService.updateUserProfile(user.userId, {
    preferredLanguage: 'th', language: 'th', fullName: 'Somchai', country: 'אתה יכול לכתוב בתאית?', workSector: 'Construction',
    profession: 'Skipped', city: 'Skipped', wantsJobAlerts: 'No', preferredCurrency: 'THB', wantsExchangeRateAlerts: 'No',
  });
  const status = await onboarding.getStatus(ctx);
  assert.equal(status.complete, false);
  assert.ok(status.prompt.includes(STRINGS.th.questions.country));
});

test('the unsure fallback and AI prompt never promise a follow-up', () => {
  const promise = /will check|get back|come back|יבדוק ויחזור|יחזור אליך|กลับมาตอบ|จะตรวจสอบและกลับมา/i;
  for (const lang of ['he', 'en', 'th']) {
    const text = core.createFriendlyFallback(lang);
    assert.doesNotMatch(text, promise, lang);
    assert.match(text, /kavlaoved\.org\.il/);
  }
  const prompt = require('../src/modules/ai-provider/gringo-prompt.service.js');
  const src = fs.readFileSync(path.join(__dirname, '../src/modules/ai-provider/gringo-prompt.service.js'), 'utf8');
  assert.doesNotMatch(src, /say that Gringo will check and return/);
  assert.match(src, /Never promise to check, follow up/);
  assert.ok(prompt);
});

test('the incoming language-failure reply is not Hebrew-only', () => {
  const src = fs.readFileSync(path.join(__dirname, '../src/modules/core-agent/core-agent.service.js'), 'utf8');
  assert.doesNotMatch(src, /reply: INCOMING_LANGUAGE_FAILURE_REPLY,\s*replyLanguage: 'he'/);
  assert.match(src, /incomingLanguageFailureReply\(failureLanguage\)/);
});
