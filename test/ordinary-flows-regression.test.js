const test = require('node:test');
const assert = require('node:assert/strict');

const { classifyUserQuestion } = require('../src/modules/knowledge-agent/legal-topic-detector');
const { LEGAL_DISCLAIMER } = require('../src/modules/knowledge-agent/legal-disclaimer');
const { createHelpReply, createStartIntro } = require('../src/modules/telegram/telegram-message.service');
const { parseLanguageSwitch } = require('../src/modules/language/language-preference');
const { consentGateEnabled } = require('../src/modules/privacy/privacy.service');
const { coreAgentService } = require('../src/modules/core-agent');
const { aiProviderService } = require('../src/modules/ai-provider');
const { crmAgentService } = require('../src/modules/crm-agent');

const ORDINARY = [
  'find me a construction job in Tel Aviv',
  'best rate to send 1000 shekels to Thailand',
  'how much does a transfer cost',
  'I am looking for a room in Tel Aviv',
  'I am sick, where is the nearest clinic?',
  'where do I renew my passport?',
  'hello',
  'אני מחפש עבודה בתל אביב',
  'איפה מחדשים דרכון?',
];

test('ordinary requests are not classified as legal', () => {
  for (const phrasing of ORDINARY) {
    const classified = classifyUserQuestion(phrasing);
    assert.notEqual(classified.disposition, 'legal', phrasing);
    assert.notEqual(classified.disposition, 'uncertain', phrasing);
  }
});

test('start, help, language switch, and consent stay free of the rights disclaimer', () => {
  const disclaimers = Object.values(LEGAL_DISCLAIMER).map((entry) => entry.text);
  for (const language of ['en', 'he', 'th', 'si', 'hi']) {
    for (const text of [createStartIntro('Sam', language), createHelpReply(language)]) {
      for (const disclaimer of disclaimers) {
        assert.equal(String(text).includes(disclaimer), false, language);
      }
      assert.equal(String(text).includes('074-7696161'), false);
      assert.equal(String(text).includes('foreignr@labor.gov.il'), false);
    }
  }
  assert.equal(parseLanguageSwitch('/language he'), 'he');
  assert.equal(parseLanguageSwitch('/language th'), 'th');
  assert.equal(typeof consentGateEnabled, 'function');
});

test('a greeting is not replaced by the legal fallback', async () => {
  const saved = {
    userId: 'usr_ordinary_hello',
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
  crmAgentService.findOrCreateUser = async () => ({ userId: saved.userId, channel: 'web', channelUserId: 'hello' });
  crmAgentService.getUserMemory = async () => saved;
  crmAgentService.getUserLanguage = async () => saved;
  crmAgentService.updateDetectedLanguage = async () => saved;
  crmAgentService.updateUserProfile = async () => saved;
  crmAgentService.saveConversation = async (event) => event;
  crmAgentService.extractAndUpdateMemory = async () => ({ signals: { interests: [] } });
  aiProviderService.generateReply = async () => ({ provider: 'mock', model: 'm', text: 'Hello from the assistant.' });
  const result = await coreAgentService.processWebMessage({
    message: 'hello',
    channel: 'web',
    channelUserId: 'hello',
  });
  assert.equal(String(result.reply).includes(LEGAL_DISCLAIMER.en.text), false);
  assert.equal(String(result.reply).includes('074-7696161'), false);
});
