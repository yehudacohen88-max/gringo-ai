const test = require('node:test');
const assert = require('node:assert/strict');

const { TranslationService, translationCacheService, translationMetricsService } = require('../src/modules/translation');

function reset() {
  translationCacheService.clear();
  translationMetricsService.resetMetrics();
  process.env.TRANSLATION_CACHE_ENABLED = 'true';
  process.env.TRANSLATION_CACHE_TTL_MINUTES = '60';
}

function createProvider(options = {}) {
  const state = {
    calls: 0,
  };
  return {
    state,
    provider: {
      async translateText(text, sourceLanguage, targetLanguage) {
        state.calls += 1;
        if (options.fail) throw new Error('provider failed');
        return {
          translatedText: `${targetLanguage}:${text}`,
        };
      },
      isAvailable: () => true,
      getProviderName: () => 'metrics-provider',
    },
  };
}

test('metrics increment for successful provider translation', async () => {
  reset();
  const { provider } = createProvider();
  const service = new TranslationService(provider);

  await service.translateText('Hello', 'en', 'he');

  const metrics = translationMetricsService.getMetrics();
  assert.equal(metrics.translationRequests, 1);
  assert.equal(metrics.successfulTranslations, 1);
  assert.equal(metrics.failedTranslations, 0);
  assert.equal(metrics.cacheHits, 0);
  assert.equal(metrics.cacheMisses, 1);
});

test('cache hit is counted and provider is not called again', async () => {
  reset();
  const { provider, state } = createProvider();
  const service = new TranslationService(provider);

  await service.translateText('Hello', 'en', 'he');
  await service.translateText('Hello', 'en', 'he');

  const metrics = translationMetricsService.getMetrics();
  assert.equal(state.calls, 1);
  assert.equal(metrics.translationRequests, 2);
  assert.equal(metrics.successfulTranslations, 2);
  assert.equal(metrics.cacheHits, 1);
  assert.equal(metrics.cacheMisses, 1);
});

test('failure is counted and not cached', async () => {
  reset();
  const { provider, state } = createProvider({ fail: true });
  const service = new TranslationService(provider);

  await service.translateText('Hello', 'en', 'he');
  await service.translateText('Hello', 'en', 'he');

  const metrics = translationMetricsService.getMetrics();
  assert.equal(state.calls, 2);
  assert.equal(metrics.translationRequests, 2);
  assert.equal(metrics.successfulTranslations, 0);
  assert.equal(metrics.failedTranslations, 2);
  assert.equal(metrics.cacheHits, 0);
  assert.equal(metrics.cacheMisses, 2);
});

test('latency and provider latency are recorded', async () => {
  reset();
  const { provider } = createProvider();
  const service = new TranslationService(provider);

  await service.translateText('Hello', 'en', 'he');

  const metrics = translationMetricsService.getMetrics();
  assert.equal(Number.isInteger(metrics.averageLatencyMs), true);
  assert.equal(Number.isInteger(metrics.providerLatencyMs), true);
  assert.equal(metrics.averageLatencyMs >= 0, true);
  assert.equal(metrics.providerLatencyMs >= 0, true);
});

test('metrics snapshot never stores message content', async () => {
  reset();
  const { provider } = createProvider();
  const service = new TranslationService(provider);
  const privateText = 'Private message that must not be stored';

  await service.translateText(privateText, 'en', 'he');

  const metricsJson = JSON.stringify(translationMetricsService.getMetrics());
  assert.equal(metricsJson.includes(privateText), false);
  assert.equal(metricsJson.includes('he:Private'), false);
});
