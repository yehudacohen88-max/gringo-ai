const test = require('node:test');
const assert = require('node:assert/strict');

const { SupervisorService } = require('../src/modules/agents');
const { translationService } = require('../src/modules/translation');

function aggregate(overrides = {}) {
  return {
    planId: 'plan_secret_1',
    status: 'completed',
    domainResults: [
      {
        taskId: 'task_secret_1',
        domain: 'employment_salary',
        status: 'completed',
        output: { message: 'I found jobs that may fit you.' },
      },
    ],
    combinedFacts: [],
    suggestedProfileUpdates: [{ field: 'city', value: 'Tel Aviv' }],
    followUpQuestions: [],
    warnings: [],
    blockedDomains: [],
    failedDomains: [],
    createdAt: '2026-08-02T08:00:00.000Z',
    ...overrides,
  };
}

async function withPatchedTranslation(replacement, callback) {
  const original = translationService.translateText;
  translationService.translateText = replacement;
  try {
    return await callback();
  } finally {
    translationService.translateText = original;
  }
}

test('completed result builds one response', async () => {
  const service = new SupervisorService();
  const response = await service.buildUserResponse(aggregate());

  assert.equal(response.includes('I found jobs that may fit you.'), true);
  assert.equal(response.includes('Tell me which detail you want to check next.'), true);
});

test('partial result includes useful output and short limitation', async () => {
  const service = new SupervisorService();
  const response = await service.buildUserResponse(aggregate({
    status: 'partial',
    domainResults: [
      { taskId: 'task_1', domain: 'employment_salary', status: 'completed', output: { message: 'I found one useful option.' } },
      { taskId: 'task_2', domain: 'finance_consumer', status: 'blocked', output: null },
    ],
  }));

  assert.equal(response.includes('I found one useful option.'), true);
  assert.equal(response.includes('Some parts could not be completed yet.'), true);
});

test('failed result returns safe response', async () => {
  const service = new SupervisorService();
  const response = await service.buildUserResponse(aggregate({ status: 'failed', domainResults: [] }));

  assert.match(response, /could not complete/i);
  assert.match(response, /try again/i);
});

test('blocked result asks one question and duplicate questions are removed', async () => {
  const service = new SupervisorService();
  const response = await service.buildUserResponse(aggregate({
    status: 'blocked',
    domainResults: [{ taskId: 'task_1', domain: 'finance_consumer', status: 'blocked', output: null }],
    followUpQuestions: ['What city should I use?', 'What city should I use?', 'What budget should I use?'],
  }));

  assert.equal(response, 'What city should I use?');
});

test('empty result returns fallback', async () => {
  const service = new SupervisorService();
  const response = await service.buildUserResponse(aggregate({ status: 'empty', domainResults: [] }));

  assert.match(response, /do not have enough information/i);
});

test('internal IDs, agent names, domains, and suggested profile updates are not exposed', async () => {
  const service = new SupervisorService();
  const response = await service.buildUserResponse(aggregate({
    combinedFacts: ['safe fact'],
    warnings: ['unsupported_capability', 'execution_failed'],
  }));

  assert.equal(response.includes('plan_secret_1'), false);
  assert.equal(response.includes('task_secret_1'), false);
  assert.equal(response.includes('employment_salary'), false);
  assert.equal(response.includes('Employment Agent'), false);
  assert.equal(response.includes('suggestedProfileUpdates'), false);
  assert.equal(response.includes('Tel Aviv'), false);
});

test('internal warnings are filtered and safe warnings may be shown', async () => {
  const service = new SupervisorService();
  const response = await service.buildUserResponse(aggregate({
    warnings: ['missing_required_input', 'Demo data - not a live rate.'],
  }));

  assert.equal(response.includes('missing_required_input'), false);
  assert.equal(response.includes('Demo data - not a live rate.'), true);
});

test('reported_quote_unverified stays internal and is not rendered as user text', async () => {
  const service = new SupervisorService();
  const input = aggregate({
    warnings: ['reported_quote_unverified', 'Demo data - not a live rate.'],
    domainResults: [
      {
        taskId: 'task_transfer',
        domain: 'finance_consumer',
        status: 'completed',
        output: {
          message: 'Saved transfer reports.',
          responseLanguage: 'en',
          suppressGenericFollowUp: true,
        },
      },
    ],
  });
  const before = JSON.stringify(input);
  const response = await service.buildUserResponse(input, { resolvedLanguage: 'en' });

  assert.equal(JSON.stringify(input), before);
  assert.equal(input.warnings.includes('reported_quote_unverified'), true);
  assert.equal(response.includes('reported_quote_unverified'), false);
  assert.equal(response.includes('Saved transfer reports.'), true);
  assert.equal(response.includes('Demo data - not a live rate.'), true);
});

test('translation called once for non-English response', async () => {
  const service = new SupervisorService();
  const calls = [];

  await withPatchedTranslation(async (text, sourceLanguage, targetLanguage) => {
    calls.push({ text, sourceLanguage, targetLanguage });
    return { translatedText: `he:${text}`, translated: true, fallbackUsed: false };
  }, async () => {
    const response = await service.buildUserResponse(aggregate(), { resolvedLanguage: 'he' });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].sourceLanguage, 'en');
    assert.equal(calls[0].targetLanguage, 'he');
    assert.equal(response.startsWith('he:'), true);
  });
});

test('translation failure returns English response', async () => {
  const service = new SupervisorService();

  await withPatchedTranslation(async () => {
    throw new Error('translation failed');
  }, async () => {
    const response = await service.buildUserResponse(aggregate(), { resolvedLanguage: 'he' });

    assert.equal(response.includes('I found jobs that may fit you.'), true);
  });
});

test('English response skips translation', async () => {
  const service = new SupervisorService();
  let calls = 0;

  await withPatchedTranslation(async () => {
    calls += 1;
    return { translatedText: 'unused', translated: true, fallbackUsed: false };
  }, async () => {
    await service.buildUserResponse(aggregate(), { resolvedLanguage: 'en' });
    assert.equal(calls, 0);
  });
});

test('aggregated result is not mutated', async () => {
  const service = new SupervisorService();
  const input = aggregate({
    followUpQuestions: ['What city?'],
    warnings: ['Demo data - not a live rate.'],
  });
  const before = JSON.stringify(input);

  await service.buildUserResponse(input, { resolvedLanguage: 'en' });

  assert.equal(JSON.stringify(input), before);
});
