const test = require('node:test');
const assert = require('node:assert/strict');

const {
  TranslationService,
  translationCacheService,
  translationMetricsService,
} = require('../src/modules/translation');
const { TRANSLATION_FAILURE_TYPES } = require('../src/modules/translation/translation.constants');

function failingProvider(failureType, options = {}) {
  let calls = 0;
  return {
    async translateText() {
      calls += 1;
      if (options.succeedOnSecondCall && calls === 2) {
        return { translatedText: 'translated after retry' };
      }
      const error = new Error(options.message || 'provider failed');
      error.failureType = failureType;
      if (options.status) error.status = options.status;
      throw error;
    },
    isAvailable: () => true,
    getProviderName: () => 'recovery-test',
    getCalls: () => calls,
  };
}

test('timeout failure is classified and falls back to original text', async () => {
  translationCacheService.clear();
  const provider = failingProvider(TRANSLATION_FAILURE_TYPES.TIMEOUT);
  const service = new TranslationService(provider);

  const result = await service.translateText('Hello', 'en', 'he');

  assert.equal(provider.getCalls(), 2);
  assert.equal(result.translatedText, 'Hello');
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.errorCode, 'PROVIDER_TIMEOUT');
  assert.equal(result.failureType, 'timeout');
});

test('transient failure retries once and can recover successfully', async () => {
  translationCacheService.clear();
  const provider = failingProvider(TRANSLATION_FAILURE_TYPES.TIMEOUT, { succeedOnSecondCall: true });
  const service = new TranslationService(provider);

  const result = await service.translateText('Hello', 'en', 'he');

  assert.equal(provider.getCalls(), 2);
  assert.equal(result.translatedText, 'translated after retry');
  assert.equal(result.translated, true);
  assert.equal(result.fallbackUsed, false);
});

test('transient retry failure returns a safe fallback', async () => {
  translationCacheService.clear();
  const provider = failingProvider(TRANSLATION_FAILURE_TYPES.TIMEOUT);
  const service = new TranslationService(provider);

  const result = await service.translateText('Hello', 'en', 'he');

  assert.equal(provider.getCalls(), 2);
  assert.equal(result.translatedText, 'Hello');
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.errorCode, 'PROVIDER_TIMEOUT');
  assert.equal(result.failureType, 'timeout');
});

test('provider unavailable does not call provider and uses fallback', async () => {
  translationCacheService.clear();
  let calls = 0;
  const service = new TranslationService({
    translateText: async () => {
      calls += 1;
      return { translatedText: 'unused' };
    },
    isAvailable: () => false,
    getProviderName: () => 'offline-provider',
  });

  const result = await service.translateText('Hello', 'en', 'he');

  assert.equal(calls, 0);
  assert.equal(result.translatedText, 'Hello');
  assert.equal(result.errorCode, 'PROVIDER_UNAVAILABLE');
  assert.equal(result.failureType, 'unavailable_provider');
});

test('rate limit is classified and retried once', async () => {
  translationCacheService.clear();
  const provider = failingProvider(TRANSLATION_FAILURE_TYPES.RATE_LIMIT, { status: 429 });
  const service = new TranslationService(provider);

  const result = await service.translateText('Hello', 'en', 'he');

  assert.equal(provider.getCalls(), 2);
  assert.equal(result.translatedText, 'Hello');
  assert.equal(result.errorCode, 'PROVIDER_RATE_LIMIT');
  assert.equal(result.failureType, 'rate_limit');
});

test('fallback result does not expose provider message content', async () => {
  translationCacheService.clear();
  const provider = failingProvider(TRANSLATION_FAILURE_TYPES.UNKNOWN, {
    message: 'private user text should not leak',
  });
  const service = new TranslationService(provider);

  const result = await service.translateText('Hello', 'en', 'he');

  assert.equal(result.translatedText, 'Hello');
  assert.equal(JSON.stringify(result).includes('private user text'), false);
});

test('failed translations are not cached', async () => {
  translationCacheService.clear();
  translationMetricsService.resetMetrics();
  const provider = failingProvider(TRANSLATION_FAILURE_TYPES.UNKNOWN);
  const service = new TranslationService(provider);

  await service.translateText('Hello', 'en', 'he');
  await service.translateText('Hello', 'en', 'he');

  assert.equal(provider.getCalls(), 2);
  assert.equal(translationMetricsService.getMetrics().cacheHits, 0);
});
