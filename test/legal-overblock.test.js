const test = require('node:test');
const assert = require('node:assert/strict');

const { classifyUserQuestion } = require('../src/modules/knowledge-agent/legal-topic-detector');
const { LEGAL_DISCLAIMER } = require('../src/modules/knowledge-agent/legal-disclaimer');
const { RIGHTS_UNVERIFIED_FALLBACK_LEAD } = require('../src/modules/knowledge-agent/rights-unverified-fallback');
const { coreAgentService } = require('../src/modules/core-agent');
const { aiProviderService } = require('../src/modules/ai-provider');
const { crmAgentService } = require('../src/modules/crm-agent');

const CASES = [
  ['he', 'איך אני שולח את המשכורת שלי לתאילנד?', 'money transfer'],
  ['he', 'מתי מגיע לי האוטובוס לתל אביב?', 'transport'],
  ['he', 'איבדתי את הדרכון, איפה השגרירות?', 'documents/embassy'],
  ['he', 'איפה מחדשים דרכון?', 'documents'],
  ['th', 'ฉันป่วย โรงพยาบาลอยู่ที่ไหน', 'healthcare: I am sick, where is hospital'],
  ['hi', 'मैं बीमार हूँ, अस्पताल कहाँ है?', 'healthcare: I am sick where hospital'],
  ['hi', 'मैं पैसे कैसे निकालूँ?', 'money: how do I withdraw money'],
  ['hi', 'छुट्टी के दिन बाज़ार खुला है?', 'shopping: is market open on holiday'],
  ['en', 'I am sick, where is the nearest clinic?', 'healthcare (no legal word)'],
  ['en', 'what is the exchange rate for my salary to THB', 'exchange'],
  ['th', 'ส่งค่าจ้างกลับบ้านยังไง', 'money: send wages home'],
];

const DISCLAIMERS = Object.values(LEGAL_DISCLAIMER).map((entry) => entry.text);
const LEADS = Object.values(RIGHTS_UNVERIFIED_FALLBACK_LEAD);

test('ordinary non-legal questions are not sent to the rights fallback', { timeout: 120000 }, async () => {
  const saved = {
    userId: 'usr_overblock',
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
  crmAgentService.getUserMemory = async () => saved;
  crmAgentService.getUserLanguage = async () => saved;
  crmAgentService.findOrCreateUser = async () => ({ userId: saved.userId, channel: 'web', channelUserId: 'overblock' });
  crmAgentService.updateDetectedLanguage = async () => saved;
  crmAgentService.updateUserProfile = async () => saved;
  crmAgentService.saveConversation = async (event) => event;
  crmAgentService.extractAndUpdateMemory = async () => ({ signals: { interests: [] } });
  aiProviderService.generateReply = async () => ({ provider: 'mock', model: 'm', text: 'MOCK_AI_ORDINARY' });

  assert.equal(CASES.length, 11);
  for (const [language, phrasing, intent] of CASES) {
    const classified = classifyUserQuestion(phrasing);
    assert.equal(classified.disposition === 'legal' || classified.disposition === 'uncertain', false, intent);
    saved.preferredLanguage = language;
    saved.language = language;
    saved.detectedLanguage = language;
    const result = await coreAgentService.processWebMessage({
      message: phrasing,
      channel: 'web',
      channelUserId: 'overblock',
      explicitLanguage: language,
    });
    const reply = String(result.reply || '');
    for (const lead of LEADS) assert.equal(reply.includes(lead), false, intent);
    for (const disclaimer of DISCLAIMERS) assert.equal(reply.includes(disclaimer), false, intent);
  }
});
