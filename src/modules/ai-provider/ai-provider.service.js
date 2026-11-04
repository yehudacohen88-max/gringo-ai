const { env } = require('../../config/env');
const openAiProvider = require('./openai.provider');
const aiBudget = require('./ai-budget.service');

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
  aiBudget.reserve(context.budgetKey ? String(context.budgetKey) : '');
  const result = await provider.createResponse(context);
  if (result && result.usage) aiBudget.recordUsage(result.usage);
  return result;
}

module.exports = {
  generateReply,
};
