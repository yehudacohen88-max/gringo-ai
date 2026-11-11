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
        output: {
          calculation: { basicGrossPay: 400, regularHours: 10, hourlyRate: 40, currency: 'ILS' },
          message: 'Your employer can keep your passport if you agree.',
        },
      },
    ],
  }, { language: 'he' });
  assert.match(overtime, /basic gross pay is 400 ILS/);
  assert.match(overtime, /אין לי מידע מאומת/);
  assert.doesNotMatch(overtime, /if you agree/);
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
  const guarded = guardGeneratedLegalOutput('You should get 150% on Saturday.', {
    question: 'how much should I get paid for Saturday?',
    language: 'en',
    legalSegment: true,
  });
  assert.equal(guarded, RIGHTS_UNVERIFIED_FALLBACK.en);
  assert.match(buildDeveloperInstructions(), /do not state a statutory percentage/i);
});

test('a pattern-free legal claim never reaches the user without a matching verified record', () => {
  const claim = 'Your employer can keep your passport if you agree.';
  const guarded = guardGeneratedLegalOutput(claim, {
    question: 'can my boss keep my passport?',
    language: 'en',
    legalSegment: true,
    verifiedLegalContext: true,
  });
  assert.equal(guarded, RIGHTS_UNVERIFIED_FALLBACK.en);
  assert.equal(guarded.includes(claim), false);

  const flagged = guardLegalReply(claim, {
    question: 'can my boss keep my passport?',
    legalSegment: true,
    legalClaimsVerified: true,
    verifiedLegalContext: true,
  });
  assert.equal(flagged, RIGHTS_UNVERIFIED_FALLBACK.en);
  assert.equal(flagged.includes('if you agree'), false);
});

test('a verified overtime record does not authorize a passport claim', () => {
  const overtime = {
    id: 'israel_overtime_pay_multipliers_section_16a',
    topic: 'overtime_pay_multipliers',
    title: 'Overtime pay multipliers',
    category: 'Workers Rights',
    keywords: ['overtime pay', '125%'],
    source: {
      verified: true,
      url: 'https://example.test/overtime',
      verifiedAt: '2026-11-01',
      contentStatus: 'approved',
      reviewedBy: 'legal-review',
    },
  };
  const claim = 'Your employer can keep your passport if you agree.';
  const reply = guardLegalReply(claim, {
    question: 'can my boss keep my passport?',
    legalSegment: true,
    verifiedRecords: [overtime],
  });
  assert.equal(reply, RIGHTS_UNVERIFIED_FALLBACK.en);
  assert.equal(reply.includes(claim), false);
});

test('unsupported passport, dismissal, deduction and leave claims fall closed in he, en and th', () => {
  const cases = [
    ['can my boss keep my passport?', 'en'],
    ['can they fire me if I am sick?', 'en'],
    ['can they deduct for housing?', 'en'],
    ['am I entitled to sick leave?', 'en'],
    ['מותר למעסיק לקחת לי את הדרכון?', 'he'],
    ['אפשר לפטר אותי אם אני חולה?', 'he'],
    ['אפשר לנכות לי על דיור?', 'he'],
    ['מגיעים לי ימי מחלה?', 'he'],
    ['นายจ้างยึดหนังสือเดินทางของฉันได้ไหม', 'th'],
    ['นายจ้างไล่ฉันออกได้ไหม', 'th'],
    ['นายจ้างหักค่าที่พักได้ไหม', 'th'],
    ['ฉันได้ลาป่วยไหม', 'th'],
  ];
  for (const [question, language] of cases) {
    const reply = guardLegalReply('Your employer can keep your passport if you agree.', {
      question,
      language,
      legalSegment: true,
      verifiedRecords: [],
    });
    assert.equal(reply, RIGHTS_UNVERIFIED_FALLBACK[language], question);
    assert.equal(reply.includes('if you agree'), false, question);
  }
});

test('mixed intent keeps job listings and user-supplied arithmetic, and still falls closed on the legal part', () => {
  const job = supervisorService.composeResponse({
    status: 'success',
    items: [
      {
        status: 'success',
        sourceQuestion: 'find me a job',
        output: { message: 'Relevant jobs:\n1. Helper - Tel Aviv' },
      },
      {
        status: 'success',
        sourceQuestion: 'can my boss keep my passport?',
        output: { message: 'Your employer can keep your passport if you agree.', legalClaimsVerified: true },
      },
    ],
  }, { language: 'en' });
  assert.match(job, /Relevant jobs/);
  assert.match(job, /I do not have verified information on this yet/);
  assert.doesNotMatch(job, /if you agree/);

  const arithmetic = supervisorService.composeResponse({
    status: 'success',
    items: [
      {
        status: 'success',
        sourceQuestion: 'calculate 10 hours at 40 shekels',
        output: { message: 'For 10 regular hours at 40 ILS per hour, your basic gross pay for those regular hours is 400 ILS.' },
      },
      {
        status: 'success',
        sourceQuestion: 'can they deduct for housing?',
        output: { message: 'Yes, housing can be deducted from your wage.' },
      },
    ],
  }, { language: 'he' });
  assert.match(arithmetic, /basic gross pay for those regular hours/);
  assert.match(arithmetic, /אין לי מידע מאומת/);
  assert.doesNotMatch(arithmetic, /deducted from your wage/);
});

test('mixed free text is not kept just because it also mentions a job or asks a question', () => {
  const mixed = 'Relevant jobs: Helper in Tel Aviv. Your employer can keep your passport if you agree.';
  for (const language of ['en', 'he', 'th']) {
    const reply = guardLegalReply(mixed, {
      question: 'find me a job and can my boss keep my passport?',
      language,
      legalSegment: true,
    });
    assert.equal(reply, RIGHTS_UNVERIFIED_FALLBACK[language], language);
    assert.equal(reply.includes('keep your passport'), false, language);
    assert.equal(reply.includes('Relevant jobs'), false, language);
  }
  for (const language of ['en', 'he', 'th']) {
    const embedded = guardLegalReply('Since your employer may deduct housing, how much do you pay?', {
      question: 'can they deduct for housing?',
      language,
      legalSegment: true,
    });
    assert.equal(embedded, RIGHTS_UNVERIFIED_FALLBACK[language], language);
    assert.equal(embedded.includes('deduct housing'), false, language);
  }
});

test('structured job results stay beside the fallback, and only a record answer may state the law', () => {
  const jobs = guardLegalReply('Your employer can keep your passport if you agree.', {
    question: 'find me a job and can my boss keep my passport?',
    language: 'en',
    legalSegment: true,
    output: {
      capability: 'jobs.search',
      jobs: [{ title: 'Helper', city: 'Tel Aviv' }],
    },
  });
  assert.match(jobs, /1\. Helper - Tel Aviv/);
  assert.match(jobs, /I do not have verified information on this yet/);
  assert.doesNotMatch(jobs, /if you agree/);

  const overtime = {
    id: 'overtime-reviewed',
    topic: 'overtime_pay_multipliers',
    title: 'Overtime pay multipliers',
    answer: 'Reviewed overtime answer from the record.',
    source: {
      verified: true,
      title: 'Hours of Work and Rest Law',
      url: 'https://example.test/overtime',
      verifiedAt: '2026-11-01',
      contentStatus: 'approved',
      reviewedBy: 'legal-review',
    },
  };
  const invented = guardGeneratedLegalOutput('Overtime is whatever the employer decides.', {
    question: 'what is my overtime?',
    language: 'en',
    legalSegment: true,
    verifiedRecords: [overtime],
  });
  assert.match(invented, /Reviewed overtime answer from the record/);
  assert.match(invented, /https:\/\/example\.test\/overtime/);
  assert.doesNotMatch(invented, /whatever the employer decides/);
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
