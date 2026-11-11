const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { passesLegalVerification, knowledgeSafeForAi } = require('../src/modules/knowledge-agent/legal-verification');
const {
  containsUnsupportedStatutoryClaim,
  guardGeneratedLegalOutput,
  guardLegalReply,
  looksLikeLegalOrRightsQuestion,
} = require('../src/modules/knowledge-agent/legal-question-guard');
const { RIGHTS_UNVERIFIED_FALLBACK } = require('../src/modules/knowledge-agent/rights-unverified-fallback');
const { buildDeveloperInstructions, buildUserPrompt } = require('../src/modules/ai-provider/gringo-prompt.service');
const kb = require('../src/modules/knowledge-agent/knowledge-base.service');
const { answerQuestion } = require('../src/modules/knowledge-agent/knowledge-agent.service');
const { classifyQuestion } = require('../src/modules/knowledge-agent/knowledge-classifier.service');
const { supervisorService } = require('../src/modules/agents');
const { coreAgentService } = require('../src/modules/core-agent');
const { aiProviderService } = require('../src/modules/ai-provider');
const { crmAgentService } = require('../src/modules/crm-agent');
const { consentGateEnabled } = require('../src/modules/privacy/privacy.service');

const STATUTE = /125%|150%|175%|200%|ninth day|Wage Protection Law|Hours of Work and Rest Law|section 16/i;

function approved(overrides = {}) {
  return {
    id: 'reviewed',
    category: 'Workers Rights',
    domain: 'employment',
    title: 'Reviewed',
    answer: 'Shown only because the gate passed.',
    source: {
      verified: true,
      url: 'https://example.test/reviewed',
      title: 'Example',
      verifiedAt: '2026-11-01',
      contentStatus: 'approved',
      reviewedBy: 'legal-review',
    },
    ...overrides,
  };
}

function profile() {
  return {
    userId: 'usr_legal_safety',
    fullName: 'Test Worker',
    country: 'Thailand',
    preferredLanguage: 'en',
    languageSource: 'explicit',
    detectedLanguage: 'en',
    language: 'en',
    workSector: 'Construction',
    profession: 'Worker',
    city: 'Tel Aviv',
    wantsJobAlerts: 'No',
    preferredCurrency: 'ILS',
    wantsExchangeRateAlerts: 'No',
  };
}

test('indirect and mixed-language rights questions are detected without the classifier', () => {
  const legal = [
    'is my boss allowed to keep my passport?',
    "can they fire me if I'm sick?",
    'how much should I get paid for Saturday?',
    'מותר למעסיק לקחת לי את הדרכון?',
    'אפשר לפטר אותי אם אני חולה?',
    'כמה מגיע לי על עבודה בשבת?',
    'นายจ้างยึดหนังสือเดินทางของฉันได้ไหม',
    'ถ้าฉันป่วยนายจ้างไล่ฉันออกได้ไหม',
    'क्या मालिक मेरा पासपोर्ट रख सकता है?',
    'සේවා යෝජකයාට මගේ විදේශ ගමන් බලපත්‍රය තබා ගත හැකිද?',
    'What are my rights as a construction worker and find me a job',
  ];
  for (const question of legal) {
    assert.equal(looksLikeLegalOrRightsQuestion(question), true, question);
  }
});

test('job search and money transfer questions are not treated as legal claims', () => {
  const ordinary = [
    'find me a construction job in Tel Aviv',
    'best rate to send 1000 shekels to Thailand',
    'how much does a transfer cost',
    'אני מחפש עבודה בבניין בתל אביב',
    'כמה עולה להעביר 1000 שקל לתאילנד',
    'หางานก่อสร้างในเทלอาวีฟ',
    'ส่งเงิน 1000 ไปไทย อัตราไหนดี',
  ];
  for (const question of ordinary) {
    assert.equal(looksLikeLegalOrRightsQuestion(question), false, question);
    assert.equal(containsUnsupportedStatutoryClaim(question), false, question);
  }
});

test('partial or forged legal metadata is rejected on every presentation path', async () => {
  const record = approved();
  assert.equal(passesLegalVerification(record), true);
  assert.equal(passesLegalVerification(approved({ source: { ...record.source, reviewedBy: '' } })), false);
  assert.equal(passesLegalVerification(approved({ source: { ...record.source, reviewedBy: 'pending' } })), false);
  assert.equal(passesLegalVerification(approved({ source: { ...record.source, verifiedAt: '2026-13-40' } })), false);
  assert.equal(passesLegalVerification(approved({ source: { ...record.source, verifiedAt: 'yesterday' } })), false);
  assert.equal(passesLegalVerification(approved({ source: { ...record.source, contentStatus: 'draft' } })), false);
  assert.equal(passesLegalVerification(approved({ source: { ...record.source, url: 'http://example.test/reviewed' } })), false);
  assert.equal(passesLegalVerification(approved({ source: { ...record.source, verified: 'true' } })), false);

  const forged = approved({
    id: 'forged',
    answer: 'Forged claim: overtime is 125%.',
    source: { ...record.source, reviewedBy: '', contentStatus: 'draft' },
  });
  assert.equal(knowledgeSafeForAi([forged]).length, 0);
  const prompt = buildUserPrompt({ message: 'overtime', relevantKnowledge: [forged] });
  assert.equal(prompt.includes('125%'), false);
  assert.equal(prompt.includes(forged.answer), false);

  const loaded = kb.loadKnowledgeItems().filter((item) => item.category === 'Workers Rights');
  assert.ok(loaded.length > 0);
  assert.equal(loaded.every((item) => passesLegalVerification(item) === false), true);

  const searched = await kb.searchKnowledgeBase(await classifyQuestion({
    question: 'What are my rights as a construction worker in Israel?',
  }));
  assert.equal(searched.legalFallback, true);
  assert.equal(searched.relevantKnowledge.length, 0);
  const answered = await answerQuestion({ question: 'is my boss allowed to keep my passport?' });
  assert.equal(answered.relevantKnowledge.some((item) => item.category === 'Workers Rights'), false);
  assert.equal(answered.relevantKnowledge.every((item) => passesLegalVerification(item) || item.category !== 'Workers Rights'), true);
  assert.doesNotMatch(answered.answer || '', /125%|ninth day|Wage Protection Law/i);
});

test('supervisor synthesis replaces statutory claims and keeps safe help', () => {
  const reply = supervisorService.composeResponse({
    status: 'success',
    items: [
      {
        status: 'success',
        sourceQuestion: 'What are my rights as a construction worker?',
        output: { message: 'Overtime at 125% and the ninth day under the Wage Protection Law.' },
      },
      {
        status: 'success',
        sourceQuestion: 'find me a construction job in Tel Aviv',
        output: { message: 'Relevant jobs:\n1. Helper - Tel Aviv' },
      },
    ],
  }, { language: 'en' });

  assert.match(reply, /Relevant jobs/);
  assert.match(reply, /I do not have verified information on this yet/);
  assert.doesNotMatch(reply, STATUTE);
});

test('mixed supervisor replies keep arithmetic and polite help without statutory rates', () => {
  const overtime = supervisorService.composeResponse({
    status: 'partial',
    items: [
      {
        status: 'success',
        sourceQuestion: 'How much overtime should I get for 10 hours at 40 ILS?',
        output: { message: 'For 10 regular hours at 40 ILS per hour, your basic gross pay for those regular hours is 400 ILS.' },
      },
    ],
  }, { language: 'he' });
  assert.match(overtime, /basic gross pay for those regular hours/);
  assert.match(overtime, /אין לי מידע מאומת/);
  assert.doesNotMatch(overtime, STATUTE);

  const wages = supervisorService.composeResponse({
    status: 'success',
    items: [
      {
        status: 'success',
        sourceQuestion: "My employer didn't pay me. How do I ask them?",
        output: { message: 'I should not guess the missing-salary rule. Ask the employer clearly and keep your records.' },
      },
    ],
  }, { language: 'th' });
  assert.match(wages, new RegExp(RIGHTS_UNVERIFIED_FALLBACK.th.slice(0, 12)));
  assert.doesNotMatch(wages, STATUTE);
  assert.doesNotMatch(wages, /should not guess the missing-salary rule/);
});

test('classifier bypass: an indirect legal question does not call the model', async () => {
  const calls = [];
  const saved = profile();
  crmAgentService.findOrCreateUser = async () => ({ userId: saved.userId, channel: 'web', channelUserId: 'legal-safety' });
  crmAgentService.getUserMemory = async () => saved;
  crmAgentService.updateDetectedLanguage = async () => saved;
  crmAgentService.updateUserProfile = async () => saved;
  crmAgentService.saveConversation = async (event) => event;
  crmAgentService.extractAndUpdateMemory = async () => ({ signals: { interests: [] } });
  aiProviderService.generateReply = async () => {
    calls.push('ai');
    return { provider: 'mock', model: 'm', text: 'Your employer may keep it. Overtime is 125%.' };
  };

  const result = await coreAgentService.processWebMessage({
    message: 'is my boss allowed to keep my passport?',
    channel: 'web',
    channelUserId: 'legal-safety',
  });

  assert.equal(calls.length, 0);
  assert.match(result.reply, /I do not have verified information on this yet/);
  assert.match(result.reply, /not legal advice/);
  assert.doesNotMatch(result.reply, STATUTE);
});

test('ordinary job and money questions are not replaced by the legal fallback', async () => {
  const calls = [];
  const saved = profile();
  crmAgentService.getUserMemory = async () => saved;
  crmAgentService.findOrCreateUser = async () => ({ userId: saved.userId, channel: 'web', channelUserId: 'ordinary' });
  crmAgentService.updateDetectedLanguage = async () => saved;
  crmAgentService.updateUserProfile = async () => saved;
  crmAgentService.saveConversation = async (event) => event;
  crmAgentService.extractAndUpdateMemory = async () => ({ signals: { interests: [] } });
  aiProviderService.generateReply = async () => {
    calls.push('ai');
    return { provider: 'mock', model: 'm', text: 'AI should not invent a statute.' };
  };

  for (const message of [
    'find me a construction job in Tel Aviv',
    'best rate to send 1000 shekels to Thailand',
    'how much does a transfer cost',
  ]) {
    const result = await coreAgentService.processWebMessage({
      message,
      channel: 'web',
      channelUserId: 'ordinary',
    });
    assert.equal(result.reply.includes(RIGHTS_UNVERIFIED_FALLBACK.en), false, message);
    assert.doesNotMatch(result.reply, STATUTE, message);
  }
});

test('generated text with a statutory percentage is replaced when nothing was verified', () => {
  const guarded = guardGeneratedLegalOutput('You should get 150% on Saturday.', { language: 'en', verifiedLegalContext: false });
  assert.equal(guarded, RIGHTS_UNVERIFIED_FALLBACK.en);
  const kept = guardGeneratedLegalOutput('You should get 150% on Saturday.', { language: 'en', verifiedLegalContext: true });
  assert.match(kept, /150%/);
  assert.match(buildDeveloperInstructions(), /do not state a statutory percentage/i);
});

test('privacy consent and onboarding language set stay as they were', () => {
  assert.equal(typeof consentGateEnabled, 'function');
  const onboarding = fs.readFileSync(path.join(__dirname, '../src/modules/core-agent/onboarding.i18n.js'), 'utf8');
  assert.match(onboarding, /ONBOARDING_LANGUAGES = Object\.freeze\(\['he', 'en', 'th'\]\)/);
  assert.match(onboarding, /Thai strings still need a native-speaker review/);
  const guard = fs.readFileSync(path.join(__dirname, '../src/modules/knowledge-agent/legal-question-guard.js'), 'utf8');
  assert.match(guard, /Pending native-speaker review/);
  assert.equal(RIGHTS_UNVERIFIED_FALLBACK.en.includes('usr_'), false);
});
