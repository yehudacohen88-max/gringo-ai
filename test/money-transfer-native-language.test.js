const test = require('node:test');
const assert = require('node:assert/strict');

const { SupervisorService, financeConsumerAgent } = require('../src/modules/agents');

const HEBREW_MVP = 'אני רוצה לשלוח 2000 שקל לתאילנד, איפה הכי משתלם?';
const HEBREW_ALT = 'תעזור לי להעביר 1500 שקלים לתאילנד';
const HEBREW_SALARY_AND_TRANSFER = 'לא קיבלתי את המשכורת שלי ואני רוצה לשלוח 2,000 ILS לתאילנד.';
const HEBREW_INDIA = 'אני רוצה לשלוח 2000 שקל להודו';
const GENERIC_PARTIAL = 'Some parts could not be completed yet.';
const GENERIC_PARTIAL_FOLLOW_UP = 'Tell me the missing detail and I can continue.';

function aggregate(overrides = {}) {
  return {
    planId: 'plan_native_1',
    status: 'partial',
    domainResults: [],
    combinedFacts: [],
    suggestedProfileUpdates: [],
    followUpQuestions: [],
    warnings: [],
    blockedDomains: [],
    failedDomains: [],
    createdAt: '2026-08-02T08:00:00.000Z',
    ...overrides,
  };
}

test('Finance owns the transfer response languages', () => {
  assert.deepEqual([...financeConsumerAgent.transferResponseLanguages], ['he', 'en']);
  assert.equal(financeConsumerAgent.supportsTransferResponseLanguage('he'), true);
  assert.equal(financeConsumerAgent.supportsTransferResponseLanguage('en'), true);
  assert.equal(financeConsumerAgent.supportsTransferResponseLanguage('he-IL'), true);
  assert.equal(financeConsumerAgent.supportsTransferResponseLanguage('ru'), false);
});

test('native-language preservation follows existing finance.transfer recognition', () => {
  const service = new SupervisorService();
  const hebrew = { userLanguage: 'he', textLanguage: 'he' };

  assert.equal(service.shouldPreserveOriginalTransferLanguage(HEBREW_MVP, hebrew), true);
  assert.equal(service.shouldPreserveOriginalTransferLanguage(HEBREW_ALT, hebrew), true);
  assert.equal(service.shouldPreserveOriginalTransferLanguage('I want to send 2000 ILS to Thailand', {
    userLanguage: 'en',
    textLanguage: 'en',
  }), true);
  assert.equal(service.shouldPreserveOriginalTransferLanguage(HEBREW_SALARY_AND_TRANSFER, hebrew), false);
  assert.equal(service.shouldPreserveOriginalTransferLanguage(HEBREW_INDIA, hebrew), false);
  assert.equal(service.shouldPreserveOriginalTransferLanguage('איפה הכי משתלם?', hebrew), false);
  assert.equal(service.shouldPreserveOriginalTransferLanguage(HEBREW_MVP, {
    userLanguage: 'en',
    textLanguage: 'he',
  }), false);
  assert.equal(service.shouldPreserveOriginalTransferLanguage(HEBREW_MVP, {
    userLanguage: 'ru',
    textLanguage: 'ru',
  }), false);
  assert.equal(service.shouldPreserveOriginalTransferLanguage('send money to Thailand and calculate my salary', {
    userLanguage: 'en',
    textLanguage: 'en',
  }), false);
});

test('finance.transfer partial with a complete message omits generic English partial text', async () => {
  const service = new SupervisorService();
  const noData = 'I do not currently have enough real reported observations for ILS → THB to compare options. I will not show demo provider ranking as a recommendation.';
  const differentAmount = 'I have saved reports for ILS → THB, but no direct report for 1500 ILS:\n\nNeema\nSend: 2,000 ILS';
  const cases = [
    {
      message: noData,
      warnings: ['reported_quote_unverified', 'insufficient_reported_quote_data'],
    },
    {
      message: differentAmount,
      warnings: ['reported_quote_unverified', 'no_same_amount_reported_quote'],
    },
  ];

  for (const item of cases) {
    const input = aggregate({
      warnings: item.warnings,
      domainResults: [
        {
          taskId: 'task_transfer',
          domain: 'finance_consumer',
          status: 'partial',
          output: {
            capability: 'finance.transfer',
            message: item.message,
            responseLanguage: 'en',
            suppressGenericFollowUp: true,
          },
        },
      ],
    });
    const before = JSON.stringify(input);
    const response = await service.buildUserResponse(input, { resolvedLanguage: 'en' });

    assert.equal(JSON.stringify(input), before);
    assert.equal(input.status, 'partial');
    assert.equal(input.domainResults[0].status, 'partial');
    assert.equal(response, item.message);
    assert.equal(response.includes(GENERIC_PARTIAL), false);
    assert.equal(response.includes(GENERIC_PARTIAL_FOLLOW_UP), false);
    assert.equal(response.includes('reported_quote_unverified'), false);
  }
});

test('unrelated partial Supervisor responses keep the generic limitation', async () => {
  const service = new SupervisorService();
  const response = await service.buildUserResponse(aggregate({
    domainResults: [
      {
        taskId: 'task_salary',
        domain: 'employment_salary',
        status: 'partial',
        output: { message: 'I found one useful salary note.' },
      },
    ],
  }), { resolvedLanguage: 'en' });

  assert.equal(response.includes('I found one useful salary note.'), true);
  assert.equal(response.includes(GENERIC_PARTIAL), true);
  assert.equal(response.includes(GENERIC_PARTIAL_FOLLOW_UP), true);
});

test('a partial finance.transfer message does not hide an unrelated partial reply', async () => {
  const service = new SupervisorService();
  const response = await service.buildUserResponse(aggregate({
    domainResults: [
      {
        taskId: 'task_transfer',
        domain: 'finance_consumer',
        status: 'partial',
        output: {
          capability: 'finance.transfer',
          message: 'Saved transfer reports.',
        },
      },
      {
        taskId: 'task_salary',
        domain: 'employment_salary',
        status: 'partial',
        output: { message: 'I found one useful salary note.' },
      },
    ],
  }), { resolvedLanguage: 'en' });

  assert.equal(response.includes(GENERIC_PARTIAL), true);
  assert.equal(response.includes(GENERIC_PARTIAL_FOLLOW_UP), true);
});

test('finance.transfer partial without a user message keeps the generic limitation', async () => {
  const service = new SupervisorService();
  const response = await service.buildUserResponse(aggregate({
    domainResults: [
      {
        taskId: 'task_transfer',
        domain: 'finance_consumer',
        status: 'partial',
        output: { capability: 'finance.transfer' },
      },
    ],
  }), { resolvedLanguage: 'en' });

  assert.equal(response.includes(GENERIC_PARTIAL), true);
  assert.equal(response.includes(GENERIC_PARTIAL_FOLLOW_UP), true);
});
