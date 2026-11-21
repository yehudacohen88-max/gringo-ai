const test = require('node:test');
const assert = require('node:assert/strict');

const { classifyUserQuestion } = require('../src/modules/knowledge-agent/legal-topic-detector');
const { guardLegalReply } = require('../src/modules/knowledge-agent/legal-question-guard');
const { legalDisclaimerText } = require('../src/modules/knowledge-agent/legal-disclaimer');
const { coreAgentService } = require('../src/modules/core-agent');
const { aiProviderService } = require('../src/modules/ai-provider');
const { crmAgentService } = require('../src/modules/crm-agent');

// Practical wording must not switch off the legal gate.
// th/si/hi lines are pending native-speaker review.
const MIXED = [
  ['he', 'אני רוצה לשלוח כסף הביתה אבל המעסיק לא שילם לי חודשיים', 'money', false],
  ['he', 'אני מחפש עבודה והמעסיק לקח לי את הדרכון', 'job', false],
  ['he', 'איפה בית החולים והמעסיק חייב לעשות לי ביטוח רפואי?', 'healthLocation', false],
  ['en', 'I want to send money home but my employer has not paid me for two months', 'money', false],
  ['en', 'find me a job and my employer took my passport', 'job', false],
  ['en', 'where is the hospital and does my employer have to give me health insurance', 'healthLocation', false],
  ['th', 'ฉันอยากส่งเงินกลับบ้าน แต่นายจ้างไม่จ่ายเงินเดือนฉันมาสองเดือน', 'money', true],
  ['th', 'หางานให้ฉันด้วย นายจ้างยึดหนังสือเดินทาง', 'job', true],
  ['th', 'โรงพยาบาลอยู่ที่ไหน และนายจ้างต้องทำประกันสุขภาพให้ฉันไหม', 'healthLocation', true],
  ['hi', 'मैं पैसे भेजना चाहता हूँ लेकिन नियोक्ता ने दो महीने से वेतन नहीं दिया', 'money', true],
  ['hi', 'मुझे नौकरी खोजनी है और नियोक्ता ने पासपोर्ट रख लिया', 'job', true],
  ['hi', 'अस्पताल कहाँ है और क्या नियोक्ता को स्वास्थ्य बीमा कराना ज़रूरी है', 'healthLocation', true],
  ['si', 'මට මුදල් යවන්න ඕන නමුත් සේවා යෝජකයා පඩි ගෙව්වේ නැහැ', 'money', true],
  ['si', 'මට රැකියාවක් සොයන්න, සේවා යෝජකයා විදේශ ගමන් බලපත්‍රය තබා ගත්තා', 'job', true],
  ['si', 'රෝහල කොහෙද, සේවා යෝජකයා සෞඛ්‍ය රක්ෂණය දිය යුතුද', 'healthLocation', true],
];

test('a practical request does not turn off the legal part', () => {
  const counts = { he: 0, en: 0, th: 0, hi: 0, si: 0 };
  for (const [language, phrasing, practicalKey, nativeReview] of MIXED) {
    counts[language] += 1;
    const classified = classifyUserQuestion(phrasing);
    assert.equal(classified.disposition, 'legal', phrasing);
    assert.equal(classified.practical[practicalKey], true, phrasing);
    assert.equal(classified.nativeReviewRequired, nativeReview, phrasing);
  }
  for (const language of Object.keys(counts)) assert.ok(counts[language] >= 3, language);
});

test('trusted transfer rows stay beside the legal fallback and free text does not', () => {
  const reply = guardLegalReply('Your employer owes you 125% and should pay tomorrow.', {
    question: 'I want to send money home but my employer has not paid me for two months',
    language: 'en',
    legalSegment: true,
    output: {
      capability: 'finance.transfer',
      reportedQuotes: [{ providerName: 'Example Transfer', recipientAmount: 1000, targetCurrency: 'THB' }],
      message: 'Your employer owes you 125%.',
    },
  });
  assert.match(reply, /1\. Example Transfer recipient 1000 THB/);
  assert.match(reply, /This is not legal advice/);
  assert.doesNotMatch(reply, /125%/);
});

test('mixed web questions do not call free AI', async () => {
  const calls = [];
  const saved = {
    userId: 'usr_mixed',
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
  crmAgentService.findOrCreateUser = async () => ({ userId: saved.userId, channel: 'web', channelUserId: 'mixed' });
  crmAgentService.getUserMemory = async () => saved;
  crmAgentService.getUserLanguage = async () => saved;
  crmAgentService.updateDetectedLanguage = async () => saved;
  crmAgentService.updateUserProfile = async () => saved;
  crmAgentService.saveConversation = async (event) => event;
  crmAgentService.extractAndUpdateMemory = async () => ({ signals: { interests: [] } });
  aiProviderService.generateReply = async () => {
    calls.push('ai');
    return { provider: 'mock', model: 'm', text: 'MOCK_AI_MIXED' };
  };
  for (const [language, phrasing] of MIXED) {
    saved.preferredLanguage = language;
    saved.language = language;
    saved.detectedLanguage = language;
    const before = calls.length;
    const result = await coreAgentService.processWebMessage({
      message: phrasing,
      channel: 'web',
      channelUserId: 'mixed',
      explicitLanguage: language,
    });
    assert.equal(calls.length, before, phrasing);
    assert.equal(String(result.reply).includes('MOCK_AI_MIXED'), false, phrasing);
    assert.ok(String(result.reply).includes(legalDisclaimerText(language)), phrasing);
  }
});
