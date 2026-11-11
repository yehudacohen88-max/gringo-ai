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
const { AiBudgetError } = require('../src/modules/ai-provider/ai-budget.service');
const { crmAgentService } = require('../src/modules/crm-agent');
const { knowledgeAgentService } = require('../src/modules/knowledge-agent');
const { translationService } = require('../src/modules/translation');
const { coreAgentService } = require('../src/modules/core-agent');
const { languageDetectionService: lang } = require('../src/modules/language');
const onboarding = require('../src/modules/core-agent/onboarding.service');

Module._load = originalLoad;

const HE_Q = 'מה הזכויות שלי כעובד בניין בישראל';

function profileWith(extra) {
  return {
    userId: 'usr_lang_fix',
    fullName: 'Test',
    country: 'Israel',
    workSector: 'Construction',
    profession: 'Construction worker',
    city: 'Tel Aviv',
    wantsJobAlerts: 'No',
    preferredCurrency: 'ILS',
    wantsExchangeRateAlerts: 'No',
    preferredLanguage: '',
    detectedLanguage: '',
    languageSource: '',
    language: '',
    ...extra,
  };
}

function mock(profile) {
  const state = { translate: [], aiLanguages: [], setPreferred: [] };
  crmAgentService.findOrCreateUser = async () => ({ userId: profile.userId, channel: 'telegram', channelUserId: 'tg-test' });
  crmAgentService.getUserMemory = async () => profile;
  crmAgentService.getUserLanguage = async (loaded) => ({
    preferredLanguage: loaded.preferredLanguage || '',
    detectedLanguage: loaded.detectedLanguage || '',
    languageSource: loaded.languageSource || '',
    languageUpdatedAt: '',
    language: loaded.preferredLanguage || loaded.detectedLanguage || loaded.language || '',
  });
  crmAgentService.updateDetectedLanguage = async () => ({});
  crmAgentService.setPreferredLanguage = async (id, language) => {
    state.setPreferred.push(language);
    profile.preferredLanguage = language;
    profile.languageSource = 'explicit';
    return { ...profile };
  };
  crmAgentService.updateUserProfile = async (id, updates) => ({ ...profile, ...updates });
  crmAgentService.saveConversation = async (event) => event;
  crmAgentService.extractAndUpdateMemory = async () => ({ signals: { interests: [] } });
  knowledgeAgentService.answerQuestion = async () => ({
    answer: 'Workers in Israel generally have rights.',
    category: 'Workers Rights',
    status: 'FOUND',
    relevantKnowledge: [],
  });
  aiProviderService.generateReply = async (input) => {
    state.aiLanguages.push(input.userLanguage);
    return { provider: 'mock', model: 'm', text: 'AI' };
  };
  translationService.getProviderName = () => 'mock';
  translationService.translateText = async (text, sourceLanguage, targetLanguage) => {
    state.translate.push(`${sourceLanguage}->${targetLanguage}`);
    return {
      translatedText: targetLanguage === 'en' ? 'What are my rights as a construction worker in Israel' : `[${targetLanguage}] ${text}`,
      sourceLanguage,
      targetLanguage,
      provider: 'mock',
      translated: true,
      fallbackUsed: false,
    };
  };
  return state;
}

const send = (message, languageCode = '', channelUserId = 'tg-test') => coreAgentService.processWebMessage({
  message,
  channel: 'telegram',
  channelUserId,
  languageCode,
});

test('resolver: a Hebrew sentence with one English word stays Hebrew', () => {
  assert.equal(lang.detectMessageLanguage('מה זה WhatsApp בעבודה').language, 'he');
  assert.equal(lang.detectMessageLanguage('מה זה WhatsApp בעבודה').clear, true);
  assert.equal(lang.resolveReplyLanguage({ text: 'מה זה WhatsApp בעבודה', channelLanguage: 'en' }).language, 'he');
});

test('resolver: historical, auto-detected and legacy values do not beat a clear script', () => {
  assert.equal(lang.resolveReplyLanguage({ text: HE_Q, profile: { detectedLanguage: 'th' } }).language, 'he');
  assert.equal(lang.resolveReplyLanguage({ text: HE_Q, profile: { language: 'Thai' } }).language, 'he');
  assert.equal(lang.resolveReplyLanguage({ text: HE_Q, profile: { languageSource: 'text', detectedLanguage: 'th' } }).language, 'he');
  assert.equal(lang.resolveIncomingLanguage({ text: HE_Q, channelLanguage: 'en' }).language, 'he');
  assert.equal(lang.resolveIncomingLanguage({ text: HE_Q, channelLanguage: 'th' }).language, 'he');
});

test('resolver: only languageSource explicit outranks a clear Hebrew message', () => {
  const explicit = lang.resolveReplyLanguage({
    text: HE_Q,
    profile: { preferredLanguage: 'th', languageSource: 'explicit' },
  });
  assert.equal(explicit.language, 'th');
  assert.equal(explicit.conflict, true);
  assert.equal(explicit.messageLanguage, 'he');

  for (const languageSource of ['text', 'detected', 'telegram', 'app', 'profile', 'channel', 'default', '']) {
    const profile = { preferredLanguage: 'th', ...(languageSource ? { languageSource } : {}) };
    assert.equal(lang.resolveReplyLanguage({ text: HE_Q, profile }).language, 'he', languageSource || 'missing');
    assert.equal(lang.resolveReplyLanguage({ text: HE_Q, profile }).conflict, false, languageSource || 'missing');
  }
  assert.equal(lang.resolveReplyLanguage({ text: HE_Q, profile: { preferredLanguage: 'th' } }).language, 'he');

  assert.equal(lang.resolveReplyLanguage({
    text: 'What are my rights at work?',
    profile: { preferredLanguage: 'th', languageSource: 'explicit' },
  }).conflict, true);
  assert.equal(lang.resolveReplyLanguage({
    text: 'สิทธิของฉันในฐานะคนงาน',
    profile: { preferredLanguage: 'th', languageSource: 'explicit' },
  }).conflict, false);
});

test('resolver: emoji or digits fall back to the channel language, then English', () => {
  assert.equal(lang.resolveReplyLanguage({ text: '👍', channelLanguage: 'he' }).language, 'he');
  assert.equal(lang.resolveReplyLanguage({ text: '123', profile: { detectedLanguage: 'th' } }).language, 'en');
  assert.equal(lang.resolveReplyLanguage({ text: '👍' }).language, 'en');
  assert.equal(lang.resolveReplyLanguage({ text: '👍', profile: { preferredLanguage: 'th', languageSource: 'explicit' } }).language, 'th');
  assert.equal(lang.resolveReplyLanguage({ text: '👍', profile: { preferredLanguage: 'th', languageSource: 'explicit' } }).conflict, false);
  assert.equal(lang.resolveReplyLanguage({ text: '👍', profile: { preferredLanguage: 'th', languageSource: 'text' } }).language, 'en');
  assert.equal(lang.resolveReplyLanguage({ text: '👍', profile: { preferredLanguage: 'th' } }).language, 'en');
});

test('saved Thai plus a Hebrew question: Thai reply, Hebrew switch notice, Hebrew is still the source text', async () => {
  const state = mock(profileWith({ preferredLanguage: 'th', language: 'th', languageSource: 'explicit' }));
  const result = await send(HE_Q, 'en');
  assert.equal(state.translate.includes('he->en'), true);
  assert.equal(state.translate.includes('en->th'), false);
  assert.match(result.reply, /ตอนนี้ฉันยังไม่มีข้อมูลที่ยืนยันแล้ว/);
  assert.match(result.reply, /התשובה בתאית/);
  assert.match(result.reply, /שלח: עברית/);
  assert.doesNotMatch(result.reply, /Workers in Israel generally/);
});

test('saved Thai plus a Thai question: no conflict notice', async () => {
  mock(profileWith({ preferredLanguage: 'th', language: 'th', languageSource: 'explicit' }));
  const result = await send('สิทธิของฉันในฐานะคนงานก่อสร้าง', 'th', 'tg-thai-match');
  assert.match(result.reply, /ตอนนี้ฉันยังไม่มีข้อมูลที่ยืนยันแล้ว/);
  assert.doesNotMatch(result.reply, /התשובה/);
  assert.doesNotMatch(result.reply, /The answer is in/);
  assert.doesNotMatch(result.reply, /Workers in Israel generally/);
});

test('saved Hebrew plus a Hebrew question on an English phone: Hebrew reply, no notice', async () => {
  const state = mock(profileWith({ preferredLanguage: 'he', language: 'he', languageSource: 'explicit' }));
  const result = await send(HE_Q, 'en', 'tg-he-match');
  assert.equal(state.translate.includes('he->en'), true);
  assert.equal(state.translate.includes('en->he'), false);
  assert.match(result.reply, /אין לי מידע מאומת/);
  assert.doesNotMatch(result.reply, /התשובה ב/);
  assert.doesNotMatch(result.reply, /Workers in Israel generally/);
});

test('language switches via עברית, ไทย, English and /language he|th|en', async () => {
  const hebrew = mock(profileWith({ preferredLanguage: 'th', language: 'th', languageSource: 'explicit' }));
  const toHebrew = await send('עברית', 'th', 'tg-switch-he');
  assert.deepEqual(hebrew.setPreferred, ['he']);
  assert.equal(toHebrew.status, 'LANGUAGE_UPDATED');
  assert.equal(toHebrew.reply, 'מעכשיו אענה לך בעברית.');

  const thai = mock(profileWith({ preferredLanguage: 'he', languageSource: 'explicit' }));
  const toThai = await send('/language th', 'en', 'tg-switch-th');
  assert.deepEqual(thai.setPreferred, ['th']);
  assert.equal(toThai.reply, 'ต่อจากนี้ฉันจะตอบเป็นภาษาไทย');

  const english = mock(profileWith({ preferredLanguage: 'th', languageSource: 'explicit' }));
  const toEnglish = await send('English', 'th', 'tg-switch-en');
  assert.deepEqual(english.setPreferred, ['en']);
  assert.equal(toEnglish.reply, 'From now on I will reply in English.');

  const command = mock(profileWith({ preferredLanguage: 'en', languageSource: 'explicit' }));
  assert.equal((await send('/language@GringoPilotBot he', 'en', 'tg-switch-cmd')).status, 'LANGUAGE_UPDATED');
  assert.deepEqual(command.setPreferred, ['he']);
  assert.equal((await send('ไทย', 'en', 'tg-switch-word')).status, 'LANGUAGE_UPDATED');
});

test('preferredLanguage th with languageSource text or missing stays with the Hebrew message', async () => {
  for (const extra of [
    { preferredLanguage: 'th', languageSource: 'text' },
    { preferredLanguage: 'th' },
  ]) {
    const state = mock(profileWith(extra));
    const result = await send(HE_Q, 'en', `tg-not-explicit-${extra.languageSource || 'missing'}`);
    assert.equal(state.translate.includes('he->en'), true);
    assert.equal(state.translate.includes('en->th'), false);
    assert.match(result.reply, /אין לי מידע מאומת/);
    assert.doesNotMatch(result.reply, /\[th\]/);
    assert.doesNotMatch(result.reply, /התשובה בתאית/);
    assert.doesNotMatch(result.reply, /Workers in Israel generally/);
  }
});

test('a clear Hebrew question with no explicit preference follows the message, not a Thai hint or an English phone', async () => {
  for (const extra of [{ detectedLanguage: 'th' }, { language: 'Thai' }, {}]) {
    mock(profileWith(extra));
    const result = await send(HE_Q, 'en', `tg-onboard-${extra.detectedLanguage || extra.language || 'none'}`);
    assert.equal(result.status, 'ONBOARDING');
    assert.match(result.reply, /באיזו שפה נוח לך/);
  }
});

test('onboarding stores the language answer as an explicit user choice', async () => {
  const ctx = { channel: 'telegram', channelUserId: 'explicit-lang-choice', language: 'en' };
  const result = await onboarding.handleMessage('עברית', ctx);
  assert.equal(result.profile.preferredLanguage, 'he');
  assert.equal(result.profile.languageSource, 'explicit');
  assert.equal(result.profile.language, 'he');
});

test('fallback and daily-limit replies use the saved language and carry the conflict notice', async () => {
  const fallback = mock(profileWith({ preferredLanguage: 'th', language: 'th', languageSource: 'explicit' }));
  knowledgeAgentService.answerQuestion = async () => ({ answer: '', category: 'Other', status: 'NOT_FOUND', relevantKnowledge: [] });
  aiProviderService.generateReply = async () => {
    throw new Error('provider down');
  };
  const fallbackResult = await send(HE_Q, 'en', 'tg-fallback');
  assert.match(fallbackResult.reply, /ตอนนี้ฉันยังไม่มีข้อมูลที่ยืนยันแล้ว/);
  assert.match(fallbackResult.reply, /התשובה בתאית/);
  assert.equal(fallback.translate.includes('he->en'), true);

  mock(profileWith({ preferredLanguage: 'he', language: 'he', languageSource: 'explicit' }));
  knowledgeAgentService.answerQuestion = async () => ({ answer: '', category: 'Other', status: 'NOT_FOUND', relevantKnowledge: [] });
  aiProviderService.generateReply = async () => {
    throw new AiBudgetError('user_daily_limit');
  };
  const limited = await send('hello there', 'th', 'tg-limit');
  assert.match(limited.reply, /הגעת למגבלת השאלות היומית/);
  assert.match(limited.reply, /The answer is in Hebrew/);
  assert.match(limited.reply, /send: English/);
});
