const test = require('node:test');
const assert = require('node:assert/strict');
const aiBudget = require('../src/modules/ai-provider/ai-budget.service');
const openAiProvider = require('../src/modules/ai-provider/openai.provider');
const aiProviderService = require('../src/modules/ai-provider/ai-provider.service');
const { createOpenAiTranslationProvider } = require('../src/modules/translation/providers/openai-translation.provider');

const KEYS = ['AI_ENABLED', 'AI_DAILY_USER_LIMIT', 'AI_DAILY_GLOBAL_LIMIT', 'AI_DAILY_TOKEN_LIMIT'];
function withEnv(values, fn) {
  return async () => {
    const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
    Object.assign(process.env, values);
    aiBudget.reset();
    const original = openAiProvider.createResponse;
    try { await fn(); } finally {
      openAiProvider.createResponse = original;
      for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
      aiBudget.reset();
    }
  };
}

function stubProvider(calls) {
  openAiProvider.createResponse = async () => { calls.push(1); return { provider: 'openai', model: 'm', text: 'ok', usage: { total_tokens: 100 } }; };
}

test('kill switch AI_ENABLED=false makes no provider call', withEnv({ AI_ENABLED: 'false' }, async () => {
  const calls = []; stubProvider(calls);
  await assert.rejects(aiProviderService.generateReply({ budgetKey: 'u1' }), { name: 'AiBudgetError', reason: 'disabled' });
  assert.equal(calls.length, 0);
}));

test('per-user daily limit blocks only that user', withEnv({ AI_DAILY_USER_LIMIT: '2', AI_DAILY_GLOBAL_LIMIT: '100' }, async () => {
  const calls = []; stubProvider(calls);
  await aiProviderService.generateReply({ budgetKey: 'u1' });
  await aiProviderService.generateReply({ budgetKey: 'u1' });
  await assert.rejects(aiProviderService.generateReply({ budgetKey: 'u1' }), { reason: 'user_daily_limit' });
  await aiProviderService.generateReply({ budgetKey: 'u2' });
  assert.equal(calls.length, 3);
}));

test('global daily limit blocks everyone', withEnv({ AI_DAILY_USER_LIMIT: '10', AI_DAILY_GLOBAL_LIMIT: '2' }, async () => {
  const calls = []; stubProvider(calls);
  await aiProviderService.generateReply({ budgetKey: 'a' });
  await aiProviderService.generateReply({ budgetKey: 'b' });
  await assert.rejects(aiProviderService.generateReply({ budgetKey: 'c' }), { reason: 'global_daily_limit' });
  assert.equal(calls.length, 2);
}));

test('token limit uses reported usage', withEnv({ AI_DAILY_TOKEN_LIMIT: '150' }, async () => {
  const calls = []; stubProvider(calls);
  await aiProviderService.generateReply({ budgetKey: 'a' });
  await aiProviderService.generateReply({ budgetKey: 'a' });
  await assert.rejects(aiProviderService.generateReply({ budgetKey: 'a' }), { reason: 'global_token_limit' });
  assert.equal(aiBudget.snapshot().tokens, 200);
}));

test('counters reset on a new UTC day', withEnv({ AI_DAILY_GLOBAL_LIMIT: '1' }, async () => {
  aiBudget.reserve('x', new Date('2026-01-01T10:00:00Z'));
  assert.throws(() => aiBudget.reserve('y', new Date('2026-01-01T23:00:00Z')), { reason: 'global_daily_limit' });
  aiBudget.reserve('y', new Date('2026-01-02T00:01:00Z'));
}));

test('snapshot exposes no user keys', withEnv({}, async () => {
  aiBudget.reserve('secret-user-key');
  const text = JSON.stringify(aiBudget.snapshot());
  assert.ok(!text.includes('secret-user-key'));
  assert.equal(aiBudget.snapshot().users, 1);
}));

test('translation provider respects kill switch without fetching', withEnv({ AI_ENABLED: 'false' }, async () => {
  let fetched = 0;
  const provider = createOpenAiTranslationProvider({ apiKey: 'k', model: 'm', fetchImpl: async () => { fetched += 1; } });
  await assert.rejects(provider.translateText('hi', 'en', 'th'), { failureType: 'unavailable_provider' });
  assert.equal(fetched, 0);
}));
