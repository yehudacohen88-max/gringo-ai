const test = require('node:test');
const assert = require('node:assert/strict');

const { languageDetectionService } = require('../src/modules/language');
const {
  TranslationService,
  translationCacheService,
  translationMetricsService,
} = require('../src/modules/translation');

function createMockProvider(overrides = {}) {
  const calls = [];

  return {
    calls,
    getProviderName: () => 'mock',
    isAvailable: () => true,
    translateText: async (text, sourceLanguage, targetLanguage) => {
      calls.push({ text, sourceLanguage, targetLanguage });
      if (overrides.fail) {
        const error = new Error('mock provider unavailable');
        error.failureType = 'unavailable provider';
        throw error;
      }
      return {
        translatedText: `[${targetLanguage}] ${text}`,
      };
    },
  };
}

const LANGUAGE_FIXTURES = [
  { language: 'en', text: 'Hello Gringo' },
  { language: 'he', text: 'שלום גרינגו' },
  { language: 'ar', text: 'مرحبا غرینغو' },
  { language: 'th', text: 'สวัสดี กริงโก' },
  { language: 'si', text: 'ආයුබෝවන් ග්‍රින්ගෝ' },
  { language: 'hi', text: 'नमस्ते ग्रिंगो' },
  { language: 'ru', text: 'Привет Гринго' },
  { language: 'tl', text: 'Kumusta Gringo', explicitLanguage: 'tagalog' },
];

test('Sprint 23 supported languages resolve safely', () => {
  for (const fixture of LANGUAGE_FIXTURES) {
    const resolution = languageDetectionService.resolveLanguage({
      explicitLanguage: fixture.explicitLanguage,
      text: fixture.text,
    });

    assert.equal(resolution.language, fixture.language);
    assert.equal(resolution.supported, true);
  }
});

test('Sprint 23 incoming translation sends non-English text to English only once', async () => {
  translationCacheService.clear();
  const provider = createMockProvider();
  const service = new TranslationService(provider);

  for (const fixture of LANGUAGE_FIXTURES.filter((item) => item.language !== 'en')) {
    const result = await service.translateText(fixture.text, fixture.language, 'en');

    assert.equal(result.targetLanguage, 'en');
    assert.equal(result.translated, true);
  }

  assert.equal(provider.calls.length, LANGUAGE_FIXTURES.length - 1);
});

test('Sprint 23 outgoing translation sends English responses to each target language once', async () => {
  translationCacheService.clear();
  const provider = createMockProvider();
  const service = new TranslationService(provider);

  for (const fixture of LANGUAGE_FIXTURES.filter((item) => item.language !== 'en')) {
    const result = await service.translateText('I found updates for you.', 'en', fixture.language);

    assert.equal(result.sourceLanguage, 'en');
    assert.equal(result.targetLanguage, fixture.language);
    assert.equal(result.translated, true);
  }

  assert.equal(provider.calls.length, LANGUAGE_FIXTURES.length - 1);
});

test('Sprint 23 English and same-language messages skip provider calls', async () => {
  translationCacheService.clear();
  const provider = createMockProvider();
  const service = new TranslationService(provider);

  const result = await service.translateText('Hello Gringo', 'en', 'en');

  assert.equal(result.translated, false);
  assert.equal(result.fallbackUsed, false);
  assert.equal(provider.calls.length, 0);
});

test('Sprint 23 translation failure falls back without blocking or storing content in metrics', async () => {
  translationCacheService.clear();
  translationMetricsService.resetMetrics();
  const provider = createMockProvider({ fail: true });
  const service = new TranslationService(provider);

  const originalText = 'שלום גרינגו';
  const result = await service.translateText(originalText, 'he', 'en');
  const metrics = translationMetricsService.getMetrics();

  assert.equal(result.translatedText, originalText);
  assert.equal(result.translated, false);
  assert.equal(result.fallbackUsed, true);
  assert.equal(metrics.failedTranslations, 1);
  assert.equal(JSON.stringify(metrics).includes(originalText), false);
});
