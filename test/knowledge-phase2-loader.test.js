const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { classifyUserQuestion } = require('../src/modules/knowledge-agent/legal-topic-detector');
const { guardLegalReply } = require('../src/modules/knowledge-agent/legal-question-guard');
const { passesLegalVerification } = require('../src/modules/knowledge-agent/legal-verification');
const { contentHash } = require('../src/modules/knowledge-agent/source-grounded-record');
const { legalDisclaimerText } = require('../src/modules/knowledge-agent/legal-disclaimer');
const { RIGHTS_UNVERIFIED_FALLBACK_LEAD } = require('../src/modules/knowledge-agent/rights-unverified-fallback');
const kb = require('../src/modules/knowledge-agent/knowledge-base.service');
const { coreAgentService } = require('../src/modules/core-agent');
const { aiProviderService } = require('../src/modules/ai-provider');
const { crmAgentService } = require('../src/modules/crm-agent');

const DRAFTS = path.join(__dirname, '../knowledge/drafts');
const APPROVED_TOPICS = [
  'passport',
  'construction_transfer',
  'minimum_wage',
  'housing',
  'medical_insurance',
  'weekly_rest',
  'sick_leave',
  'severance',
];
const BLOCKED_TOPICS = ['deductions', 'annual_leave', 'deposit', 'complaints'];

const PHRASINGS = {
  passport: {
    he: [
      'האם המעסיק יכול לקחת את הדרכון?',
      'מותר למעסיק לקחת לי את הדרכון?',
      'המעסיק מחזיק לי את הדרכון ולא מחזיר',
    ],
    en: [
      'Is my employer allowed to take my passport?',
      'Can the employer keep my passport?',
      'My boss is holding my passport',
    ],
  },
  construction_transfer: {
    he: [
      'אני עובד בניין. מתי מותר לי לעבור לתאגיד אחר?',
      'מתי אפשר להחליף מעסיק בבניין?',
      'מתי אפשר לעבור לקבלן אחר בענף הבניין?',
    ],
    en: [
      'I work in construction. When can I move to another manpower company?',
      'When can I change employers in construction?',
      'When am I allowed to move to another company? I work in construction.',
    ],
  },
  minimum_wage: {
    he: [
      'מה שכר המינימום',
      'כמה הוא שכר המינימום עכשיו?',
      'מה השכר המינימלי לעובד?',
    ],
    en: [
      'what is the minimum wage',
      'How much is the minimum wage for a foreign worker?',
      'What is the current minimum hourly wage?',
    ],
  },
  housing: {
    he: [
      'אנחנו 10 עובדים בחדר אחד. זה מותר?',
      'המעסיק חייב לדאוג לי למגורים הולמים?',
      'כמה עובדים מותר בחדר?',
    ],
    en: [
      'We are 10 workers in one room. Is that allowed?',
      'Does my employer have to provide suitable housing?',
      'How many workers can share one room?',
    ],
  },
  medical_insurance: {
    he: [
      'המעסיק חייב לעשות לי ביטוח רפואי?',
      'האם מגיע לי ביטוח רפואי מהמעסיק?',
      'מי משלם על הביטוח הרפואי?',
    ],
    en: [
      'Does my employer have to give me health insurance?',
      'Is medical insurance the employer\'s duty?',
      'Who has to arrange my health insurance?',
    ],
  },
  weekly_rest: {
    he: [
      'כמה מנוחה שבועית מגיעה לי?',
      'מותר להעסיק אותי שבעה ימים בשבוע?',
      'האם מגיע לי יום מנוחה שבועי?',
    ],
    en: [
      'weekly rest of 36 hours',
      'Can I be made to work seven days a week?',
      'Do I get a weekly rest day?',
    ],
  },
  sick_leave: {
    he: [
      'כמה ימי מחלה',
      'הייתי חולה שלושה ימים. משלמים לי?',
      'מה מגיע לי בחופשת מחלה?',
    ],
    en: [
      'how many sick leave days',
      'I was sick for three days. Do I get paid?',
      'What sick leave am I entitled to?',
    ],
  },
  severance: {
    he: [
      'מתי מגיעים פיצויי פיטורים?',
      'מגיעים לי פיצויי פיטורים?',
      'אם מפטרים אותי, האם יש פיצויים?',
    ],
    en: [
      'am I entitled to severance',
      'When is severance pay due?',
      'Do I get severance if I am dismissed?',
    ],
  },
};

const BLOCKED_PHRASINGS = {
  deductions: {
    he: ['מה מותר למעסיק לנכות לי מהמשכורת?'],
    en: ['What is my employer allowed to deduct from my salary?'],
  },
  annual_leave: {
    he: ['כמה ימי חופשה בתשלום מגיעים לי?'],
    en: ['How many paid vacation days do I get?'],
  },
  deposit: {
    he: ['איך מקבלים את כסף הפיקדון?'],
    en: ['How do I get my deposit money when I leave Israel?'],
  },
  complaints: {
    he: ['למי אפשר להתלונן על המעסיק?'],
    en: ['Who can I complain to about my employer?'],
  },
};

function readDraft(topic, language) {
  return JSON.parse(fs.readFileSync(path.join(DRAFTS, `${topic}.${language}.json`), 'utf8'));
}

function answerBody(record) {
  return String(record.answer || '').trim();
}

const profile = {
  userId: 'usr_phase2_loader',
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

crmAgentService.findOrCreateUser = async () => ({ userId: profile.userId, channel: 'web', channelUserId: 'phase2-loader' });
crmAgentService.getUserMemory = async () => profile;
crmAgentService.getUserLanguage = async () => profile;
crmAgentService.updateDetectedLanguage = async () => profile;
crmAgentService.updateUserProfile = async () => profile;
crmAgentService.saveConversation = async (event) => event;
crmAgentService.extractAndUpdateMemory = async () => ({ signals: { interests: [] } });
aiProviderService.generateReply = async () => {
  throw new Error('free AI must not run for these questions');
};

async function ask(message, language) {
  profile.preferredLanguage = language;
  profile.language = language;
  profile.detectedLanguage = language;
  const result = await coreAgentService.processWebMessage({
    message,
    channel: 'web',
    channelUserId: 'phase2-loader',
    explicitLanguage: language,
  });
  return String(result.reply || '');
}

test('a missing keywords list does not crash scoring', () => {
  assert.equal(typeof kb.scoreKnowledgeItem({ topic: 'passport' }, 'my passport', ''), 'number');
  assert.doesNotThrow(() => kb.scoreKnowledgeItem({ keywords: null }, 'hello', 'Other'));
  assert.equal(kb.scoreKnowledgeItem({ keywords: null, title: 'unrelated', question: '' }, 'hello', 'Other'), 0);
});

test('retrieved handbook records still carry the fields the content hash uses', () => {
  for (const topic of APPROVED_TOPICS) {
    for (const language of ['he', 'en']) {
      const record = readDraft(topic, language);
      const question = PHRASINGS[topic][language][0];
      const found = kb.findRelevantKnowledge(question, 'Workers Rights').find((item) => item.id === record.id);
      assert.ok(found, record.id);
      assert.equal(found.schema, 'source-grounded', record.id);
      assert.equal(found.language, language, record.id);
      assert.equal(found.section, record.section, record.id);
      assert.equal(found.informationLabel, record.informationLabel, record.id);
      assert.equal(Array.isArray(found.claims), true, record.id);
      assert.equal(contentHash(found), contentHash(record), record.id);
      assert.equal(passesLegalVerification(found), true, record.id);
    }
  }
});

test('each approved topic answers in Hebrew and English from the loaded record', { timeout: 120000 }, async () => {
  const samples = [];
  for (const topic of APPROVED_TOPICS) {
    for (const language of ['he', 'en']) {
      const record = readDraft(topic, language);
      const body = answerBody(record);
      assert.ok(body.length > 40, record.id);
      for (const phrasing of PHRASINGS[topic][language]) {
        const classified = classifyUserQuestion(phrasing);
        assert.equal(classified.disposition, 'legal', phrasing);
        assert.equal(classified.topic, topic, phrasing);
        const reply = await ask(phrasing, language);
        assert.equal(reply.includes(body), true, phrasing);
        assert.equal(reply.includes(record.sourceUrl), true, phrasing);
        assert.equal(reply.includes(legalDisclaimerText(language)), true, phrasing);
        assert.equal(reply.includes(RIGHTS_UNVERIFIED_FALLBACK_LEAD[language]), false, phrasing);
        const other = readDraft(topic, language === 'he' ? 'en' : 'he');
        const otherBody = answerBody(other);
        if (otherBody && otherBody !== body) {
          assert.equal(reply.includes(otherBody), false, phrasing);
        }
        samples.push({ topic, language, phrasing, reply });
      }
    }
  }
  fs.writeFileSync('/tmp/phase2-reply-samples.json', JSON.stringify(samples, null, 2));
  assert.equal(samples.length, APPROVED_TOPICS.length * 2 * 3);
});

test('blocked topics and Thai, Hindi, and Sinhala stay off the reply', { timeout: 120000 }, async () => {
  for (const topic of BLOCKED_TOPICS) {
    for (const language of ['he', 'en', 'th', 'hi', 'si']) {
      const record = readDraft(topic, language);
      assert.equal(kb.loadKnowledgeItems().some((item) => item.id === record.id), false, record.id);
      assert.equal(passesLegalVerification(record), false, record.id);
    }
    for (const language of ['he', 'en']) {
      const record = readDraft(topic, language);
      const body = answerBody(record);
      for (const phrasing of BLOCKED_PHRASINGS[topic][language]) {
        assert.equal(classifyUserQuestion(phrasing).topic, topic, phrasing);
        const reply = await ask(phrasing, language);
        assert.equal(reply.includes(RIGHTS_UNVERIFIED_FALLBACK_LEAD[language]), true, phrasing);
        assert.equal(reply.includes(legalDisclaimerText(language)), true, phrasing);
        if (body) assert.equal(reply.includes(body.slice(0, 80)), false, phrasing);
      }
    }
  }

  for (const topic of APPROVED_TOPICS) {
    for (const language of ['th', 'hi', 'si']) {
      const record = readDraft(topic, language);
      assert.equal(record.status, 'extraction_unreliable', record.id);
      assert.equal(kb.loadKnowledgeItems().some((item) => item.id === record.id), false, record.id);
      assert.equal(passesLegalVerification(record, {
        approvals: [{
          recordId: record.id,
          contentHash: contentHash(record),
          reviewer: 'Yehuda Cohen',
          date: '2026-11-22',
        }],
      }), false, record.id);
    }
  }

  const hidden = [
    ['th', 'นายจ้างยึดหนังสือเดินทางของฉันได้ไหม'],
    ['hi', 'क्या मेरा नियोक्ता मेरा पासपोर्ट अपने पास रख सकता है?'],
    ['si', 'මගේ සේවා යෝජකයාට මගේ විදේශ ගමන් බලපත්‍රය තබා ගන්න පුළුවන්ද?'],
  ];
  const hebrewPassport = answerBody(readDraft('passport', 'he'));
  const englishPassport = answerBody(readDraft('passport', 'en'));
  for (const [language, phrasing] of hidden) {
    const reply = await ask(phrasing, language);
    assert.equal(reply.includes(RIGHTS_UNVERIFIED_FALLBACK_LEAD[language]), true, phrasing);
    assert.equal(reply.includes(hebrewPassport.slice(0, 40)), false, phrasing);
    assert.equal(reply.includes(englishPassport.slice(0, 40)), false, phrasing);
  }
});

test('mixed questions and unknown legal questions do not bypass the gate', { timeout: 120000 }, async () => {
  const wage = answerBody(readDraft('minimum_wage', 'en'));
  const wageHe = answerBody(readDraft('minimum_wage', 'he'));
  const deduction = answerBody(readDraft('deductions', 'en')).slice(0, 80);
  const deductionHe = answerBody(readDraft('deductions', 'he')).slice(0, 80);
  const passport = answerBody(readDraft('passport', 'en'));
  const cases = [
    ['en', 'I want to send money home but my employer has not paid me for two months', wage],
    ['he', 'אני רוצה לשלוח כסף הביתה אבל המעסיק לא שילם לי חודשיים', wageHe],
    ['en', 'find me a job and my employer took my passport', null],
    ['he', 'אני מחפש עבודה והמעסיק לקח לי את הדרכון', null],
  ];
  for (const [language, phrasing, forbiddenWage] of cases) {
    const classified = classifyUserQuestion(phrasing);
    assert.equal(classified.disposition, 'legal', phrasing);
    assert.equal(classified.practical.money || classified.practical.job, true, phrasing);
    const reply = await ask(phrasing, language);
    assert.equal(reply.includes(legalDisclaimerText(language)), true, phrasing);
    assert.equal(reply.includes(RIGHTS_UNVERIFIED_FALLBACK_LEAD[language]), true, phrasing);
    if (forbiddenWage) assert.equal(reply.includes(forbiddenWage.slice(0, 80)), false, phrasing);
    assert.equal(reply.includes('6,443.85'), false, phrasing);
    assert.equal(reply.includes(deduction), false, phrasing);
    assert.equal(reply.includes(deductionHe), false, phrasing);
    assert.equal(reply.includes('if you agree'), false, phrasing);
  }

  const unknown = [
    ['en', 'can they fire me if I am sick?', 'sick_leave'],
    ['en', 'how much should I get paid for Saturday?', 'weekly_rest'],
    ['en', 'What are my rights as a construction worker in Israel?', 'construction_transfer'],
    ['he', 'מה הזכויות שלי כעובד בניין בישראל?', 'construction_transfer'],
  ];
  for (const [language, phrasing, topic] of unknown) {
    const classified = classifyUserQuestion(phrasing);
    assert.equal(classified.disposition, 'legal', phrasing);
    assert.notEqual(classified.topic, topic, phrasing);
    const reply = await ask(phrasing, language);
    const body = answerBody(readDraft(topic, language));
    assert.equal(reply.includes(RIGHTS_UNVERIFIED_FALLBACK_LEAD[language]), true, phrasing);
    assert.equal(reply.includes(body.slice(0, 80)), false, phrasing);
  }
});

test('ordinary non-legal questions do not receive a handbook answer', { timeout: 60000 }, async () => {
  const ordinary = [
    'find me a construction job in Tel Aviv',
    'I am looking for a room in Tel Aviv',
    'best rate to send 1000 shekels to Thailand',
    'hello',
    'where do I renew my passport?',
    'I am sick, where is the nearest clinic?',
    'איפה מחדשים דרכון?',
  ];
  const transfer = answerBody(readDraft('construction_transfer', 'en')).slice(0, 80);
  const housing = answerBody(readDraft('housing', 'en')).slice(0, 80);
  const passport = answerBody(readDraft('passport', 'en')).slice(0, 60);
  const sick = answerBody(readDraft('sick_leave', 'en')).slice(0, 60);
  for (const phrasing of ordinary) {
    const classified = classifyUserQuestion(phrasing);
    assert.notEqual(classified.disposition, 'legal', phrasing);
    assert.notEqual(classified.disposition, 'uncertain', phrasing);
    const reply = await ask(phrasing, 'en');
    assert.equal(reply.includes(transfer), false, phrasing);
    assert.equal(reply.includes(housing), false, phrasing);
    assert.equal(reply.includes(passport), false, phrasing);
    assert.equal(reply.includes(sick), false, phrasing);
    assert.equal(reply.includes(legalDisclaimerText('en')), false, phrasing);
  }
});

test('metadata, a bad hash, the wrong topic, and the wrong language do not display a record', () => {
  const record = readDraft('passport', 'en');
  const tampered = { ...record, answer: `${record.answer}X`, status: 'approved', legalClaimsVerified: true };
  assert.equal(passesLegalVerification(tampered), false);
  const blocked = guardLegalReply('Your employer can keep your passport if you agree.', {
    question: 'Is my employer allowed to take my passport?',
    language: 'en',
    legalSegment: true,
    verifiedRecords: [tampered],
  });
  assert.equal(blocked.includes(answerBody(record).slice(0, 40)), false);
  assert.equal(blocked.includes('if you agree'), false);
  assert.equal(blocked.includes(RIGHTS_UNVERIFIED_FALLBACK_LEAD.en), true);

  const housing = readDraft('housing', 'en');
  const wrongTopic = guardLegalReply('MODEL', {
    question: 'Is my employer allowed to take my passport?',
    language: 'en',
    legalSegment: true,
    verifiedRecords: [housing],
  });
  assert.equal(wrongTopic.includes(answerBody(housing).slice(0, 40)), false);
  assert.equal(wrongTopic.includes('MODEL'), false);

  const wrongLanguage = guardLegalReply('MODEL', {
    question: 'Is my employer allowed to take my passport?',
    language: 'he',
    legalSegment: true,
    verifiedRecords: [record],
  });
  assert.equal(wrongLanguage.includes(answerBody(record).slice(0, 40)), false);
  assert.equal(wrongLanguage.includes(answerBody(readDraft('passport', 'he')).slice(0, 20)), false);
});
