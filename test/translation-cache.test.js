const test = require('node:test');
const assert = require('node:assert/strict');

const { TranslationService, translationCacheService } = require('../src/modules/translation');

function createCountingProvider(options = {}) {
  const state = {
    calls: [],
  };
  const provider = {
    async translateText(text, sourceLanguage, targetLanguage) {
      state.calls.push({ text, sourceLanguage, targetLanguage });
      if (options.fail) throw new Error('provider failed');
      return {
        translatedText: `${options.prefix || 'translated'}:${sourceLanguage}-${targetLanguage}:${text}`,
      };
    },
    isAvailable: () => true,
    getProviderName: () => 'counting-provider',
  };
  return { provider, state };
}

function resetCacheEnv() {
  translationCacheService.clear();
  process.env.TRANSLATION_CACHE_ENABLED = 'true';
  process.env.TRANSLATION_CACHE_TTL_MINUTES = '60';
}

test('first request calls provider', async () => {
  resetCacheEnv();
  const { provider, state } = createCountingProvider();
  const service = new TranslationService(provider);

  const result = await service.translateText('Hello', 'en', 'he');

  assert.equal(state.calls.length, 1);
  assert.equal(result.translatedText, 'translated:en-he:Hello');
});

test('second identical request uses cache', async () => {
  resetCacheEnv();
  const { provider, state } = createCountingProvider();
  const service = new TranslationService(provider);

  const first = await service.translateText('Hello', 'en', 'he');
  const second = await service.translateText('Hello', 'en', 'he');

  assert.equal(state.calls.length, 1);
  assert.deepEqual(second, first);
});

test('different target language misses cache', async () => {
  resetCacheEnv();
  const { provider, state } = createCountingProvider();
  const service = new TranslationService(provider);

  await service.translateText('Hello', 'en', 'he');
  await service.translateText('Hello', 'en', 'ar');

  assert.equal(state.calls.length, 2);
});

test('different source language misses cache', async () => {
  resetCacheEnv();
  const { provider, state } = createCountingProvider();
  const service = new TranslationService(provider);

  await service.translateText('Hello', 'en', 'he');
  await service.translateText('Hello', 'ru', 'he');

  assert.equal(state.calls.length, 2);
});

test('expired cache refreshes provider result', async () => {
  resetCacheEnv();
  process.env.TRANSLATION_CACHE_TTL_MINUTES = '0';
  const { provider, state } = createCountingProvider();
  const service = new TranslationService(provider);

  await service.translateText('Hello', 'en', 'he');
  await service.translateText('Hello', 'en', 'he');

  assert.equal(state.calls.length, 2);
});

test('provider errors are never cached', async () => {
  resetCacheEnv();
  const failing = createCountingProvider({ fail: true });
  const service = new TranslationService(failing.provider);

  const first = await service.translateText('Hello', 'en', 'he');
  const second = await service.translateText('Hello', 'en', 'he');

  assert.equal(failing.state.calls.length, 2);
  assert.equal(first.errorCode, 'PROVIDER_ERROR');
  assert.equal(second.errorCode, 'PROVIDER_ERROR');
});

test('disabled cache calls provider for identical requests', async () => {
  resetCacheEnv();
  process.env.TRANSLATION_CACHE_ENABLED = 'false';
  const { provider, state } = createCountingProvider();
  const service = new TranslationService(provider);

  await service.translateText('Hello', 'en', 'he');
  await service.translateText('Hello', 'en', 'he');

  assert.equal(state.calls.length, 2);
});
