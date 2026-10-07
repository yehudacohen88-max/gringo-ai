const { TRANSLATION_FAILURE_TYPES } = require('../translation.constants');

function createProviderError(message, failureType, status = 0) {
  const error = new Error(message);
  error.failureType = failureType;
  if (status) error.status = status;
  return error;
}

function readResponseText(body = {}) {
  if (body.output_text) return String(body.output_text).trim();

  const output = Array.isArray(body.output) ? body.output : [];
  const textParts = output.flatMap((item) => {
    const content = Array.isArray(item.content) ? item.content : [];
    return content
      .filter((contentItem) => contentItem.type === 'output_text' || contentItem.type === 'text')
      .map((contentItem) => contentItem.text || '');
  });

  return textParts.join('\n').trim();
}

function buildTranslationPrompt(text, sourceLanguage, targetLanguage) {
  return [
    'Translate the text from the source language to the target language.',
    'Return only the translated text.',
    'Do not add explanations, notes, markdown, labels, or quotes.',
    `Source language: ${sourceLanguage}`,
    `Target language: ${targetLanguage}`,
    'Text:',
    text,
  ].join('\n');
}

function createOpenAiTranslationProvider(options = {}) {
  const apiKey =
    Object.prototype.hasOwnProperty.call(options, 'apiKey')
      ? options.apiKey
      : process.env.TRANSLATION_API_KEY || process.env.AI_API_KEY || '';
  const model =
    Object.prototype.hasOwnProperty.call(options, 'model')
      ? options.model
      : process.env.TRANSLATION_MODEL || process.env.AI_MODEL || 'gpt-4.1-mini';
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = Number(options.timeoutMs || process.env.TRANSLATION_TIMEOUT_MS || 30000);

  return {
    async translateText(text, sourceLanguage, targetLanguage) {
      if (!apiKey) {
        throw createProviderError(
          'Translation provider is not configured.',
          TRANSLATION_FAILURE_TYPES.UNAVAILABLE_PROVIDER
        );
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetchImpl('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model,
            input: [
              {
                role: 'developer',
                content: [
                  {
                    type: 'input_text',
                    text:
                      'You are a translation engine. Translate faithfully and preserve meaning, names, numbers, and formatting.',
                  },
                ],
              },
              {
                role: 'user',
                content: [
                  {
                    type: 'input_text',
                    text: buildTranslationPrompt(text, sourceLanguage, targetLanguage),
                  },
                ],
              },
            ],
            max_output_tokens: 600,
          }),
          signal: controller.signal,
        });

        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          const failureType =
            response.status === 429
              ? TRANSLATION_FAILURE_TYPES.RATE_LIMIT
              : TRANSLATION_FAILURE_TYPES.UNKNOWN;
          throw createProviderError('Translation provider request failed.', failureType, response.status);
        }

        const translatedText = readResponseText(body);
        if (!translatedText) {
          throw createProviderError(
            'Translation provider returned an empty response.',
            TRANSLATION_FAILURE_TYPES.UNKNOWN
          );
        }

        return {
          translatedText,
        };
      } catch (error) {
        if (error.failureType) throw error;
        if (error.name === 'AbortError') {
          throw createProviderError(
            'Translation provider request timed out.',
            TRANSLATION_FAILURE_TYPES.TIMEOUT
          );
        }
        throw createProviderError('Translation provider is unavailable.', TRANSLATION_FAILURE_TYPES.UNKNOWN);
      } finally {
        clearTimeout(timeout);
      }
    },

    async detectAndTranslate(text, targetLanguage) {
      return this.translateText(text, '', targetLanguage);
    },

    isAvailable() {
      return Boolean(apiKey && fetchImpl);
    },

    getProviderName() {
      return 'openai';
    },
  };
}

module.exports = {
  createOpenAiTranslationProvider,
};
