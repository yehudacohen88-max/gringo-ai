const test = require('node:test');
const assert = require('node:assert/strict');

const { classifyQuestion } = require('../src/modules/knowledge-agent/knowledge-classifier.service');
const kb = require('../src/modules/knowledge-agent/knowledge-base.service');
const { passesLegalVerification, knowledgeSafeForAi } = require('../src/modules/knowledge-agent/legal-verification');
const { PENDING_NATIVE_SPEAKER_REVIEW: TOPIC_REVIEW } = require('../src/modules/knowledge-agent/topic-mappings');
const {
  PENDING_NATIVE_SPEAKER_REVIEW,
  RIGHTS_UNVERIFIED_FALLBACK,
  createRightsUnverifiedFallback,
} = require('../src/modules/knowledge-agent/rights-unverified-fallback');
const { buildUserPrompt } = require('../src/modules/ai-provider/gringo-prompt.service');
const { coreAgentService } = require('../src/modules/core-agent');
const { aiProviderService } = require('../src/modules/ai-provider');
const { crmAgentService } = require('../src/modules/crm-agent');
const { languageFromProfile } = require('../src/shared/userFacingCopy');
const { createHelpReply, createStartIntro } = require('../src/modules/telegram/telegram-message.service');
const {
  languageConflictNotice,
  languageSwitchReply,
  parseLanguageSwitch,
} = require('../src/modules/language/language-preference');
const { languageDetectionService } = require('../src/modules/language');

const CONSTRUCTION = [
  'What are my rights as a construction worker in Israel?',
  'מה הזכויות שלי כעובד בניין בישראל?',
  'สิทธิของฉันในฐานะคนงานก่อสร้างในอิสราเอลมีอะไรบ้าง',
  'ඊශ්‍රායලයේ ඉදිකිරීම් කම්කරුවෙකු ලෙස මගේ අයිතිවාසිකම් මොනවාද?',
  'इज़राइल में निर्माण मज़दूर के रूप में मेरे क्या अधिकार हैं?',
];

const LEGAL_CLAIM = /\d|%|@|https?:|125|150|ninth day|שעות עבודה ומנוחה/;

async function category(question) {
  return (await classifyQuestion({ question })).category;
}

function approvedRecord(overrides = {}) {
  return {
    id: 'future-reviewed-rights',
    category: 'Workers Rights',
    domain: 'employment',
    title: 'Reviewed example',
    answer: 'A reviewed statement that is only shown because the gate passed.',
    source: {
      verified: true,
      url: 'https://example.test/reviewed-rights',
      title: 'Example statute',
      verifiedAt: '2026-11-01',
      contentStatus: 'approved',
      reviewedBy: 'legal-review',
    },
    ...overrides,
  };
}

test('construction-worker rights questions classify as Workers Rights in every pilot language', async () => {
  for (const question of CONSTRUCTION) {
    assert.equal(await category(question), 'Workers Rights', question);
  }
  assert.equal(await category('What are my זכויות as a construction worker?'), 'Workers Rights');
  assert.equal(await category('אני עובד שעות נוספות, כמה מגיע לי?'), 'Workers Rights');
  assert.equal(await category('לא שילמו לי משכורת החודש'), 'Workers Rights');
  assert.equal(await category('ค่าล่วงเวลาคิดอย่างไร'), 'Workers Rights');
  assert.equal(await category('ค่าจ้างของฉันยังไม่ได้รับ'), 'Workers Rights');
  assert.equal(await category('අතිකාල ගෙවීම'), 'Workers Rights');
  assert.equal(await category('ओवरटाइम का भुगतान'), 'Workers Rights');
});

test('job and money questions keep their categories', async () => {
  assert.equal(await category('I am looking for a construction job'), 'Jobs FAQ');
  assert.equal(await category('אני מחפש עבודה בבניין'), 'Jobs FAQ');
  assert.equal(await category('how much do I pay to transfer money to Thailand'), 'Money Transfer Companies');
});

test('normalizeText keeps Hebrew, Thai, Sinhala and Devanagari letters', () => {
  assert.equal(kb.normalizeText('זכויות עובד'), 'זכויות עובד');
  assert.ok(kb.normalizeText('สวัสดี สิทธิ').includes('สวัสดี'));
  assert.ok(kb.normalizeText('අයිතිවාසිකම්').includes('අයිති'));
  assert.ok(kb.normalizeText('अधिकार').includes('अधिकार'));
});

test('Hebrew keywords match in mid-sentence and with a prefix letter', () => {
  const jobs = kb.loadKnowledgeItems().find((entry) => entry.id === 'jobs-faq-001');
  assert.equal(kb.hasPositiveRelevanceEvidence(jobs, 'אני מחפש עבודה בתל אביב', 'Jobs FAQ'), true);
  assert.equal(kb.hasPositiveRelevanceEvidence(jobs, 'אני מחפש עבודה', 'Jobs FAQ'), true);
});

test('English keyword matching keeps whole-word behavior', () => {
  const rights = kb.loadKnowledgeItems().find((entry) => entry.id === 'workers-rights-002');
  assert.equal(kb.hasPositiveRelevanceEvidence(rights, 'my employer did not pay my missing salary', 'Workers Rights'), true);
  assert.equal(kb.hasPositiveRelevanceEvidence(rights, 'unsalaryish', 'Housing'), false);
});

test('existing legal records fail the verification gate and are not served', async () => {
  const legal = kb.loadKnowledgeItems().filter((item) => item.category === 'Workers Rights' || item.domain === 'employment');
  assert.ok(legal.length > 0);
  for (const item of legal) {
    assert.equal(passesLegalVerification(item), false, item.id);
  }

  for (const question of CONSTRUCTION) {
    const result = await kb.searchKnowledgeBase(await classifyQuestion({ question }));
    assert.equal(result.legalFallback, true, question);
    assert.equal(result.relevantKnowledge.length, 0, question);
    assert.equal(result.answer, '', question);
    assert.equal(result.matches.includes('workers-rights-001'), false, question);
    assert.doesNotMatch(result.answer, LEGAL_CLAIM);
  }

  const english = await kb.searchKnowledgeBase(await classifyQuestion({
    question: 'What are my rights as a construction worker in Israel?',
  }));
  assert.equal(english.withheldUnverifiedIds.includes('workers-rights-001'), true);
});

test('a record is presentable only with source, date, approved status and review metadata', () => {
  const record = approvedRecord();
  assert.equal(passesLegalVerification(record), true);
  assert.equal(passesLegalVerification(approvedRecord({ source: { ...record.source, url: 'https://example.test/only-url', verifiedAt: '', contentStatus: '', reviewedBy: '' } })), false);
  assert.equal(passesLegalVerification(approvedRecord({ source: { ...record.source, verifiedAt: '' } })), false);
  assert.equal(passesLegalVerification(approvedRecord({ source: { ...record.source, contentStatus: 'draft' } })), false);
  assert.equal(passesLegalVerification(approvedRecord({ source: { ...record.source, reviewedBy: '' } })), false);
  assert.equal(passesLegalVerification(approvedRecord({ source: { ...record.source, verified: false } })), false);
});

test('unverified legal knowledge is removed before it can reach the AI prompt', () => {
  const generic = kb.loadKnowledgeItems().find((item) => item.id === 'workers-rights-001');
  const housing = { id: 'housing-1', category: 'Housing', title: 'Room', answer: 'A shared room may be available.' };
  const safe = knowledgeSafeForAi([generic, housing, approvedRecord()]);
  assert.deepEqual(safe.map((item) => item.id), ['housing-1', 'future-reviewed-rights']);
  const prompt = buildUserPrompt({
    message: 'What are my rights as a construction worker?',
    relevantKnowledge: [generic],
  });
  assert.equal(prompt.includes(generic.answer), false);
  assert.match(prompt, /None available/);
});

test('rights questions with no verified record skip the AI and use the fixed fallback', async () => {
  assert.equal(coreAgentService.shouldUseAiProvider('rights', { status: 'NOT_FOUND', legalFallback: true }), false);
  assert.equal(coreAgentService.shouldUseAiProvider('hello', { status: 'NOT_FOUND', legalFallback: false }), true);

  const calls = [];
  const profile = {
    userId: 'usr_rights_gate',
    fullName: 'Test',
    country: 'Thailand',
    workSector: 'Construction',
    profession: 'Worker',
    city: 'Tel Aviv',
    wantsJobAlerts: 'No',
    preferredCurrency: 'ILS',
    wantsExchangeRateAlerts: 'No',
    preferredLanguage: 'en',
    languageSource: 'explicit',
    detectedLanguage: 'en',
    language: 'en',
  };
  crmAgentService.findOrCreateUser = async () => ({ userId: profile.userId, channel: 'web', channelUserId: 'rights-gate' });
  crmAgentService.getUserMemory = async () => profile;
  crmAgentService.updateDetectedLanguage = async () => profile;
  crmAgentService.updateUserProfile = async () => profile;
  crmAgentService.saveConversation = async (event) => event;
  crmAgentService.extractAndUpdateMemory = async () => ({ signals: { interests: [] } });
  aiProviderService.generateReply = async () => {
    calls.push('ai');
    return { provider: 'mock', model: 'm', text: 'Invented overtime is 125%.' };
  };

  const result = await coreAgentService.processWebMessage({
    message: 'What are my rights as a construction worker in Israel?',
    channel: 'web',
    channelUserId: 'rights-gate',
  });

  assert.deepEqual(calls, []);
  assert.equal(result.status, 'LEGAL_UNVERIFIED');
  assert.equal(result.reply, RIGHTS_UNVERIFIED_FALLBACK.en);
  assert.equal(result.ai.attempted, false);
  assert.doesNotMatch(result.reply, /125%|Workers in Israel generally/);
});

test('the rights fallback exists in five languages and makes no legal claim', () => {
  for (const language of ['he', 'th', 'en', 'si', 'hi']) {
    const text = createRightsUnverifiedFallback(language);
    assert.equal(text, RIGHTS_UNVERIFIED_FALLBACK[language]);
    assert.ok(text.length > 40, language);
    assert.doesNotMatch(text, LEGAL_CLAIM, language);
  }
  assert.match(RIGHTS_UNVERIFIED_FALLBACK.en, /not legal advice/i);
  assert.match(RIGHTS_UNVERIFIED_FALLBACK.en, /contract/i);
  assert.match(RIGHTS_UNVERIFIED_FALLBACK.en, /payslips/i);
  assert.match(RIGHTS_UNVERIFIED_FALLBACK.he, /לא ייעוץ משפטי/);
  assert.match(RIGHTS_UNVERIFIED_FALLBACK.he, /תלוש/);
  assert.deepEqual(PENDING_NATIVE_SPEAKER_REVIEW, ['th', 'si', 'hi']);
  assert.deepEqual(TOPIC_REVIEW, ['th', 'si', 'hi']);
  assert.match(RIGHTS_UNVERIFIED_FALLBACK.th, /[\u0e00-\u0e7f]/);
  assert.match(RIGHTS_UNVERIFIED_FALLBACK.si, /[\u0d80-\u0dff]/);
  assert.match(RIGHTS_UNVERIFIED_FALLBACK.hi, /[\u0900-\u097f]/);
});

test('commands use an explicit language only, then detected language, then the channel', () => {
  assert.equal(languageFromProfile({
    preferredLanguage: 'th',
    languageSource: 'text',
    detectedLanguage: 'he',
    language: 'th',
  }), 'he');
  assert.equal(languageFromProfile({
    preferredLanguage: 'si',
    languageSource: 'explicit',
    detectedLanguage: 'en',
    language: 'en',
  }), 'si');
  assert.equal(languageFromProfile({
    preferredLanguage: 'th',
    language: 'th',
  }, 'en'), 'en');
  assert.match(createStartIntro('Dan', 'he'), /שלום Dan/);
  assert.match(createHelpReply('he'), /עבודה/);
  assert.match(createHelpReply('th'), /[\u0e00-\u0e7f]/);
  assert.match(createStartIntro('Namal', 'si'), /[\u0d80-\u0dff]/);
  assert.match(createHelpReply('hi'), /\/language hi/);
});

test('Sinhala and Hindi can be selected explicitly and a conflict notice exists', () => {
  assert.equal(parseLanguageSwitch('/language si'), 'si');
  assert.equal(parseLanguageSwitch('සිංහල'), 'si');
  assert.equal(parseLanguageSwitch('/language hi'), 'hi');
  assert.equal(parseLanguageSwitch('हिंदी'), 'hi');
  assert.match(languageSwitchReply('si', true), /[\u0d80-\u0dff]/);
  assert.match(languageSwitchReply('hi', true), /[\u0900-\u097f]/);
  const notice = languageConflictNotice({
    conflict: true,
    messageLanguage: 'si',
    language: 'he',
  });
  assert.match(notice, /සිංහල/);
  assert.equal(languageDetectionService.resolveReplyLanguage({
    text: 'What are my rights?',
    profile: { preferredLanguage: 'si', languageSource: 'explicit' },
  }).language, 'si');
});
