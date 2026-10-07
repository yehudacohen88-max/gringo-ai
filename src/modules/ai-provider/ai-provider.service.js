const { env } = require('../../config/env');
const openAiProvider = require('./openai.provider');

const providers = {
  openai: openAiProvider,
};

function getProvider() {
  const providerName = String(env.ai.provider || '').toLowerCase();
  const provider = providers[providerName];

  if (!provider) {
    throw new Error(`Unsupported AI provider: ${env.ai.provider}`);
  }

  return provider;
}

async function generateReply(context = {}) {
  const provider = getProvider();
  return provider.createResponse(context);
}

module.exports = {
  generateReply,
};
