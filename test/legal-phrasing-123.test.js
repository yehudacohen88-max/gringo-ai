const test = require('node:test');
const assert = require('node:assert/strict');

const questions = require('./fixtures/legal-phrasing/testset-questions.json');
const { classifyUserQuestion } = require('../src/modules/knowledge-agent/legal-topic-detector');
const { PENDING_NATIVE_SPEAKER_REVIEW } = require('../src/modules/knowledge-agent/legal-topic-detector');
const { legalDisclaimerText } = require('../src/modules/knowledge-agent/legal-disclaimer');
const { coreAgentService } = require('../src/modules/core-agent');
const { aiProviderService } = require('../src/modules/ai-provider');
const { crmAgentService } = require('../src/modules/crm-agent');

const LANGUAGES = ['he', 'en', 'th', 'si', 'hi'];

function profile(language) {
  return {
    userId: 'usr_phrasing_123',
    fullName: 'Test Worker',
    country: 'Thailand',
    preferredLanguage: language,
    languageSource: 'explicit',
    detectedLanguage: language,
    language,
    workSector: 'Construction',
    profession: 'Worker',
    city: 'Tel Aviv',
    wantsJobAlerts: 'No',
    preferredCurrency: 'ILS',
    wantsExchangeRateAlerts: 'No',
  };
}

test('the 123 phrasings are flagged for native review in th, si, and hi', () => {
  let count = 0;
  for (const row of questions) {
    for (const language of LANGUAGES) {
      const phrasing = row[language];
      if (!phrasing) continue;
      count += 1;
      const classified = classifyUserQuestion(phrasing);
      assert.equal(classified.disposition, 'legal', `${row.id} ${language}`);
      if (PENDING_NATIVE_SPEAKER_REVIEW.includes(language)) {
        assert.equal(classified.nativeReviewRequired, true, `${row.id} ${language}`);
      }
    }
  }
  assert.equal(count, 123);
});

test('the 123 legal phrasings never reach free AI', { timeout: 180000 }, async () => {
  const calls = [];
  const saved = profile('en');
  crmAgentService.findOrCreateUser = async () => ({ userId: saved.userId, channel: 'web', channelUserId: 'phrasing-123' });
  crmAgentService.getUserMemory = async () => saved;
  crmAgentService.getUserLanguage = async () => saved;
  crmAgentService.updateDetectedLanguage = async () => saved;
  crmAgentService.updateUserProfile = async () => saved;
  crmAgentService.saveConversation = async (event) => event;
  crmAgentService.extractAndUpdateMemory = async () => ({ signals: { interests: [] } });
  aiProviderService.generateReply = async () => {
    calls.push('ai');
    return { provider: 'mock', model: 'm', text: 'MOCK_AI_LEGAL' };
  };

  const passed = { he: 0, en: 0, th: 0, si: 0, hi: 0 };
  for (const row of questions) {
    for (const language of LANGUAGES) {
      const phrasing = row[language];
      if (!phrasing) continue;
      saved.preferredLanguage = language;
      saved.language = language;
      saved.detectedLanguage = language;
      const before = calls.length;
      const result = await coreAgentService.processWebMessage({
        message: phrasing,
        channel: 'web',
        channelUserId: 'phrasing-123',
        explicitLanguage: language,
      });
      const reply = String(result.reply || '');
      assert.equal(calls.length, before, `${row.id} ${language} called AI`);
      assert.equal(reply.includes('MOCK_AI_LEGAL'), false, `${row.id} ${language}`);
      assert.notEqual(result.ai && result.ai.used, true, `${row.id} ${language} ai.used`);
      assert.ok(reply.includes(legalDisclaimerText(language)), `${row.id} ${language} disclaimer`);
      passed[language] += 1;
    }
  }
  assert.deepEqual(passed, { he: 36, en: 36, th: 36, si: 6, hi: 9 });
  assert.equal(calls.length, 0);
});
