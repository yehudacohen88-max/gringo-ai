const test = require('node:test');
const assert = require('node:assert/strict');

const {
  TranslationService,
  createOpenAiTranslationProvider,
  createTranslationProviderFromEnvironment,
} = require('../src/modules/translation');

function jsonResponse(body, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  };
}

test('OpenAI translation provider reports available when API key exists', () => {
  const provider = createOpenAiTranslationProvider({
    apiKey: 'test-key',
    fetchImpl: async () => jsonResponse({ output_text: 'שלום' }),
  });

  assert.equal(provider.isAvailable(), true);
  assert.equal(provider.getProviderName(), 'openai');
});

test('OpenAI translation provider reports unavailable when API key is missing', () => {
  const provider = createOpenAiTranslationProvider({
    apiKey: '',
    fetchImpl: async () => jsonResponse({ output_text: 'שלום' }),
  });

  assert.equal(provider.isAvailable(), false);
  assert.equal(provider.getProviderName(), 'openai');
});

test('OpenAI translation provider returns successful translated text', async () => {
  let request;
  const provider = createOpenAiTranslationProvider({
    apiKey: 'test-key',
    model: 'test-model',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return jsonResponse({ output_text: 'שלום' });
    },
  });

  const result = await provider.translateText('Hello', 'en', 'he');

  assert.equal(result.translatedText, 'שלום');
  assert.equal(request.url, 'https://api.openai.com/v1/responses');
  assert.equal(request.options.headers.authorization, 'Bearer test-key');
  assert.equal(JSON.parse(request.options.body).model, 'test-model');
});

test('Translation service converts provider error to controlled fallback', async () => {
  const provider = createOpenAiTranslationProvider({
    apiKey: 'test-key',
    fetchImpl: async () => jsonResponse({ error: { message: 'do not expose' } }, false, 500),
  });
  const service = new TranslationService(provider);

  const result = await service.translateText('Hello', 'en', 'he');

  assert.equal(result.translatedText, 'Hello');
  assert.equal(result.provider, 'openai');
  assert.equal(result.translated, false);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.errorCode, 'PROVIDER_ERROR');
  assert.equal(JSON.stringify(result).includes('do not expose'), false);
});

test('Translation service handles timeout or rejected request safely', async () => {
  const provider = createOpenAiTranslationProvider({
    apiKey: 'test-key',
    fetchImpl: async () => {
      const error = new Error('network failure with private details');
      error.name = 'AbortError';
      throw error;
    },
  });
  const service = new TranslationService(provider);

  const result = await service.translateText('Hello', 'en', 'he');

  assert.equal(result.translatedText, 'Hello');
  assert.equal(result.translated, false);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.errorCode, 'PROVIDER_TIMEOUT');
  assert.equal(result.failureType, 'timeout');
  assert.equal(JSON.stringify(result).includes('private details'), false);
});

test('Translation service preserves original text when provider is unavailable', async () => {
  const provider = createOpenAiTranslationProvider({
    apiKey: '',
    fetchImpl: async () => jsonResponse({ output_text: 'שלום' }),
  });
  const service = new TranslationService(provider);

  const result = await service.translateText('Hello', 'en', 'he');

  assert.equal(result.translatedText, 'Hello');
  assert.equal(result.provider, 'openai');
  assert.equal(result.translated, false);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.errorCode, 'PROVIDER_UNAVAILABLE');
});

test('Same source and target language skips provider call', async () => {
  let called = false;
  const provider = createOpenAiTranslationProvider({
    apiKey: 'test-key',
    fetchImpl: async () => {
      called = true;
      return jsonResponse({ output_text: 'unused' });
    },
  });
  const service = new TranslationService(provider);

  const result = await service.translateText('Hello', 'en', 'en');

  assert.equal(called, false);
  assert.equal(result.translatedText, 'Hello');
  assert.equal(result.translated, false);
});

test('Missing API key does not crash provider startup', () => {
  const previousProvider = process.env.TRANSLATION_PROVIDER;
  const previousTranslationKey = process.env.TRANSLATION_API_KEY;
  const previousAiKey = process.env.AI_API_KEY;
  process.env.TRANSLATION_PROVIDER = 'openai';
  delete process.env.TRANSLATION_API_KEY;
  delete process.env.AI_API_KEY;

  try {
    const provider = createTranslationProviderFromEnvironment();
    assert.equal(provider.getProviderName(), 'openai');
    assert.equal(provider.isAvailable(), false);
  } finally {
    if (previousProvider === undefined) delete process.env.TRANSLATION_PROVIDER;
    else process.env.TRANSLATION_PROVIDER = previousProvider;
    if (previousTranslationKey === undefined) delete process.env.TRANSLATION_API_KEY;
    else process.env.TRANSLATION_API_KEY = previousTranslationKey;
    if (previousAiKey === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = previousAiKey;
  }
});

test('Configured OpenAI provider loads when credentials exist', () => {
  const previousProvider = process.env.TRANSLATION_PROVIDER;
  const previousTranslationKey = process.env.TRANSLATION_API_KEY;
  process.env.TRANSLATION_PROVIDER = 'openai';
  process.env.TRANSLATION_API_KEY = 'test-key';

  try {
    const provider = createTranslationProviderFromEnvironment();
    assert.equal(provider.getProviderName(), 'openai');
    assert.equal(provider.isAvailable(), true);
  } finally {
    if (previousProvider === undefined) delete process.env.TRANSLATION_PROVIDER;
    else process.env.TRANSLATION_PROVIDER = previousProvider;
    if (previousTranslationKey === undefined) delete process.env.TRANSLATION_API_KEY;
    else process.env.TRANSLATION_API_KEY = previousTranslationKey;
  }
});
