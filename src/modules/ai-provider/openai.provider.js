const { env } = require('../../config/env');
const { AiProviderError } = require('./ai-provider.errors');
const { buildDeveloperInstructions, buildUserPrompt } = require('./gringo-prompt.service');

function readResponseText(body) {
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

async function createResponse(context = {}) {
  if (!env.ai.apiKey) {
    throw new AiProviderError('AI_API_KEY is not configured.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.ai.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: env.ai.model,
        input: [
          {
            role: 'developer',
            content: [
              {
                type: 'input_text',
                text: buildDeveloperInstructions(),
              },
            ],
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: buildUserPrompt(context),
              },
            ],
          },
        ],
        max_output_tokens: 350,
      }),
      signal: controller.signal,
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new AiProviderError('AI provider request failed.', {
        status: response.status,
        message: body.error?.message || '',
      });
    }

    const text = readResponseText(body);

    if (!text) {
      throw new AiProviderError('AI provider returned an empty response.');
    }

    return {
      provider: 'openai',
      model: env.ai.model,
      text,
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new AiProviderError('AI provider request timed out.');
    }

    if (error instanceof AiProviderError) {
      throw error;
    }

    throw new AiProviderError('AI provider is unavailable.', {
      message: error.message,
    });
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  createResponse,
};
