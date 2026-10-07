const test = require('node:test');
const assert = require('node:assert/strict');

const { TranslationService, createDisabledTranslationProvider } = require('../src/modules/translation');

test('returns structured result for empty text', async () => {
  const service = new TranslationService(createDisabledTranslationProvider());

  const result = await service.translateText('', 'en', 'he');

  assert.deepEqual(result, {
    translatedText: '',
    sourceLanguage: 'en',
    targetLanguage: 'he',
    provider: 'disabled',
    translated: false,
    fallbackUsed: false,
  });
});

test('returns original text when source and target language are identical', async () => {
  const service = new TranslationService({
    translateText: async () => 'should not be used',
    isAvailable: () => true,
    getProviderName: () => 'test-provider',
  });

  const result = await service.translateText('Hello', 'en', 'en');

  assert.equal(result.translatedText, 'Hello');
  assert.equal(result.translated, false);
  assert.equal(result.fallbackUsed, false);
});

test('returns controlled fallback for unsupported source language', async () => {
  const service = new TranslationService(createDisabledTranslationProvider());

  const result = await service.translateText('Bonjour', 'fr', 'en');

  assert.equal(result.translatedText, 'Bonjour');
  assert.equal(result.sourceLanguage, '');
  assert.equal(result.targetLanguage, 'en');
  assert.equal(result.translated, false);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.errorCode, 'UNSUPPORTED_SOURCE_LANGUAGE');
});

test('returns controlled fallback for unsupported target language', async () => {
  const service = new TranslationService(createDisabledTranslationProvider());

  const result = await service.translateText('Hello', 'en', 'fr');

  assert.equal(result.translatedText, 'Hello');
  assert.equal(result.sourceLanguage, 'en');
  assert.equal(result.targetLanguage, '');
  assert.equal(result.translated, false);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.errorCode, 'UNSUPPORTED_TARGET_LANGUAGE');
});

test('disabled provider fallback keeps original text available', async () => {
  const service = new TranslationService(createDisabledTranslationProvider());

  const result = await service.translateText('Hello', 'en', 'he');

  assert.equal(result.translatedText, 'Hello');
  assert.equal(result.provider, 'disabled');
  assert.equal(result.translated, false);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.errorCode, 'PROVIDER_UNAVAILABLE');
});

test('provider errors are converted to safe fallback results', async () => {
  const service = new TranslationService({
    translateText: async () => {
      throw new Error('secret provider stack');
    },
    isAvailable: () => true,
    getProviderName: () => 'test-provider',
  });

  const result = await service.translateText('Hello', 'en', 'he');

  assert.equal(result.translatedText, 'Hello');
  assert.equal(result.provider, 'test-provider');
  assert.equal(result.translated, false);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.errorCode, 'PROVIDER_ERROR');
  assert.equal(JSON.stringify(result).includes('secret provider stack'), false);
});

test('available provider can return translated structured result', async () => {
  const service = new TranslationService({
    translateText: async (text, sourceLanguage, targetLanguage) => `${text}:${sourceLanguage}-${targetLanguage}`,
    isAvailable: () => true,
    getProviderName: () => 'test-provider',
  });

  const result = await service.translateText('Hello', 'en', 'he');

  assert.deepEqual(result, {
    translatedText: 'Hello:en-he',
    sourceLanguage: 'en',
    targetLanguage: 'he',
    provider: 'test-provider',
    translated: true,
    fallbackUsed: false,
  });
});

test('detectAndTranslate detects source language before translating', async () => {
  const service = new TranslationService({
    translateText: async (text, sourceLanguage, targetLanguage) => `${sourceLanguage}:${targetLanguage}:${text}`,
    isAvailable: () => true,
    getProviderName: () => 'test-provider',
  });

  const result = await service.detectAndTranslate('שלום', 'en');

  assert.equal(result.sourceLanguage, 'he');
  assert.equal(result.targetLanguage, 'en');
  assert.equal(result.translatedText, 'he:en:שלום');
});

test('does not mutate original input object values', async () => {
  const service = new TranslationService(createDisabledTranslationProvider());
  const input = Object.freeze({
    text: 'Hello',
    sourceLanguage: 'English',
    targetLanguage: 'Hebrew',
  });

  await service.translateText(input.text, input.sourceLanguage, input.targetLanguage);

  assert.deepEqual(input, {
    text: 'Hello',
    sourceLanguage: 'English',
    targetLanguage: 'Hebrew',
  });
});
