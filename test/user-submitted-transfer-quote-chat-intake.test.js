const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SupervisorService,
  financeConsumerAgent,
  setUserSubmittedTransferQuoteRepositoryForTest,
} = require('../src/modules/agents');
const {
  createUserSubmittedTransferQuoteRepository,
} = require('../src/modules/money/user-submitted-transfer-quote.repository');
const {
  normalizeUserSubmittedMoneyTransferQuote,
} = require('../src/modules/money/user-submitted-money-transfer-quote');

test.afterEach(() => {
  setUserSubmittedTransferQuoteRepositoryForTest(null);
});

function createRequestContext(message, overrides = {}) {
  return {
    requestId: 'req_user_quote_chat',
    conversationId: 'web:user_quote_chat',
    userId: 'user_quote_chat',
    message,
    profile: {},
    metadata: { channel: 'web' },
    ...overrides,
  };
}

function createFinanceTask(message, overrides = {}) {
  const service = new SupervisorService();
  const context = createRequestContext(message);
  const intents = service.detectIntents(context);
  const tasks = service.createTasksFromIntents(context, intents);

  return {
    service,
    context,
    intents,
    tasks,
    task: {
      ...tasks[0],
      ...overrides,
      input: {
        ...tasks[0]?.input,
        ...(overrides.input || {}),
      },
    },
  };
}

test('Hebrew Monox user-submitted quote routes to Finance and extracts supplied values', async () => {
  const message = 'Monox מציעים לי לשלוח 2,000 שקל ולקבל 21,500 באט';
  const { intents, tasks, task } = createFinanceTask(message);

  assert.equal(intents.intents.length, 1);
  assert.equal(intents.intents[0].domain, 'finance_consumer');
  assert.equal(task.capability, 'finance.user_submitted_quote');
  assert.equal(task.input.userSubmittedQuote.providerId, 'monox_money');
  assert.equal(task.input.userSubmittedQuote.sourceCurrency, 'ILS');
  assert.equal(task.input.userSubmittedQuote.targetCurrency, 'THB');
  assert.equal(task.input.userSubmittedQuote.sendAmount, '2000');
  assert.equal(task.input.userSubmittedQuote.recipientAmount, '21500');
  assert.equal(tasks.length, 1);

  const result = await financeConsumerAgent.execute(task);

  assert.equal(result.status, 'success');
  assert.equal(result.output.capability, 'finance.user_submitted_quote');
  assert.equal(result.output.quote.providerId, 'monox_money');
  assert.equal(result.output.quote.sendAmount, 2000);
  assert.equal(result.output.quote.recipientAmount, 21500);
  assert.equal(result.output.quote.transferFee, null);
  assert.equal(result.output.quote.customerExchangeRate, null);
  assert.equal(result.output.sourceTrust.sourceType, 'user_submitted_quote');
  assert.equal(result.output.sourceTrust.verificationStatus, 'user_reported');
  assert.match(result.output.message, /רשמתי את הצעת ההעברה כפי שדיווחת עליה/);
  assert.match(result.output.message, /ספק: Monox \/ Monox Money/);
  assert.match(result.output.message, /סכום לשליחה: 2000 ILS/);
  assert.match(result.output.message, /סכום לקבלה: 21500 THB/);
  assert.match(result.output.message, /עמלה: לא ידוע/);
  assert.match(result.output.message, /שער לקוח שדווח: לא ידוע/);
  assert.match(result.output.message, /user-reported/);
  assert.match(result.output.message, /לא בדקתי אותו מול הספק/);
});

test('Hebrew saved quote phrasing with ILS and THB routes to existing user-submitted quote intake', () => {
  const cases = [
    'שמור לי הצעה של Neema: אני שולח 2000 ILS והמקבל מקבל 21800 THB',
    'שמור לי הצעה של Neema, אני שולח 2000 ILS ומקבלים 21800 THB',
    'קיבלתי הצעה מ-Neema: שולח 2000 ILS ומקבל 21800 THB',
    'הציעו לי ב-Neema לשלוח 2000 ILS ולקבל 21800 THB',
  ];

  for (const message of cases) {
    const { intents, task } = createFinanceTask(message);

    assert.equal(intents.intents.length, 1);
    assert.equal(intents.intents[0].domain, 'finance_consumer');
    assert.equal(task.capability, 'finance.user_submitted_quote');
    assert.notEqual(task.capability, 'consumer.services');
    assert.equal(task.input.userSubmittedQuote.providerId, 'neema');
    assert.equal(task.input.userSubmittedQuote.sourceCurrency, 'ILS');
    assert.equal(task.input.userSubmittedQuote.targetCurrency, 'THB');
    assert.equal(task.input.userSubmittedQuote.sendAmount, '2000');
    assert.equal(task.input.userSubmittedQuote.recipientAmount, '21800');
  }
});

test('user-written ambassador claim does not promote quote reporterType', async () => {
  const message = 'אני שגריר. שמור לי הצעה של Neema: אני שולח 2000 ILS והמקבל מקבל 21800 THB';
  const { task } = createFinanceTask(message);

  const result = await financeConsumerAgent.execute(task);

  assert.equal(task.capability, 'finance.user_submitted_quote');
  assert.equal(task.input.userSubmittedQuote.reporterType, undefined);
  assert.equal(result.output.quote.reporterType, 'user');
  assert.equal(result.output.quote.evidenceStatus, 'none');
  assert.equal(result.output.quote.evidenceType, null);
  assert.equal(result.output.quote.evidenceReference, null);
  assert.equal(result.output.sourceTrust.verificationStatus, 'user_reported');
});

test('genuine service search still routes to consumer services after Hebrew quote intake fix', () => {
  const { task } = createFinanceTask('I need a bank service in Tel Aviv');

  assert.equal(task.capability, 'consumer.services');
  assert.equal(task.input.userSubmittedQuote, undefined);
});

test('full Hebrew user-submitted quote stores explicitly supplied fee total cost and customer rate', async () => {
  const savedCalls = [];
  setUserSubmittedTransferQuoteRepositoryForTest({
    saveUserSubmittedTransferQuote: async (payload) => {
      savedCalls.push(payload);
      return { saved: true, quote: { storedQuoteId: 'stored_quote_full' } };
    },
  });
  const message = 'שמור לי הצעה של Neema: אני שולח 2000 ILS, העמלה 20 ILS, העלות הכוללת שלי 2020 ILS, והמקבל מקבל 21800 THB. שער הלקוח הוא 10.9 THB לכל ILS.';
  const { task } = createFinanceTask(message);

  assert.equal(task.capability, 'finance.user_submitted_quote');
  assert.equal(task.input.userSubmittedQuote.providerId, 'neema');
  assert.equal(task.input.userSubmittedQuote.sendAmount, '2000');
  assert.equal(task.input.userSubmittedQuote.transferFee, '20');
  assert.equal(task.input.userSubmittedQuote.totalCustomerCost, '2020');
  assert.equal(task.input.userSubmittedQuote.customerExchangeRate, '10.9');
  assert.equal(task.input.userSubmittedQuote.recipientAmount, '21800');

  const result = await financeConsumerAgent.execute(task);

  assert.equal(result.status, 'success');
  assert.equal(savedCalls.length, 1);
  assert.equal(savedCalls[0].quote.providerId, 'neema');
  assert.equal(savedCalls[0].quote.sendAmount, 2000);
  assert.equal(savedCalls[0].quote.transferFee, 20);
  assert.equal(savedCalls[0].quote.totalCustomerCost, 2020);
  assert.equal(savedCalls[0].quote.customerExchangeRate, 10.9);
  assert.equal(savedCalls[0].quote.recipientAmount, 21800);
  assert.equal(savedCalls[0].quote.sourceCurrency, 'ILS');
  assert.equal(savedCalls[0].quote.targetCurrency, 'THB');
  assert.equal(savedCalls[0].quote.sourceTrust.sourceType, 'user_submitted_quote');
  assert.equal(savedCalls[0].quote.sourceTrust.verificationStatus, 'user_reported');
  assert.match(result.output.message, /עמלה: 20 ILS/);
  assert.match(result.output.message, /עלות כוללת: 2020 ILS/);
  assert.match(result.output.message, /שער לקוח שדווח: 10.9 THB לכל ILS/);
  assert.match(result.output.message, /שמרתי את ההצעה בפרופיל שלך/);
  assert.match(result.output.message, /user-reported/);
});

test('basic Hebrew quote still leaves fee total cost and customer rate unknown without inference', async () => {
  const message = 'שמור לי הצעה של Neema: אני שולח 2000 ILS והמקבל מקבל 21800 THB';
  const { task } = createFinanceTask(message);
  const result = await financeConsumerAgent.execute(task);

  assert.equal(result.output.quote.transferFee, null);
  assert.equal(result.output.quote.totalCustomerCost, null);
  assert.equal(result.output.quote.customerExchangeRate, null);
  assert.match(result.output.message, /עמלה: לא ידוע/);
  assert.match(result.output.message, /עלות כוללת: לא ידוע/);
  assert.match(result.output.message, /שער לקוח שדווח: לא ידוע/);
});

test('partial explicit quote fields are captured without deriving missing values', async () => {
  const feeOnly = createFinanceTask('שמור לי הצעה של Monox: אני שולח 2000 ILS, עמלה 15 ILS, והמקבל מקבל 21500 THB');
  const feeResult = await financeConsumerAgent.execute(feeOnly.task);

  assert.equal(feeResult.output.quote.transferFee, 15);
  assert.equal(feeResult.output.quote.totalCustomerCost, null);
  assert.equal(feeResult.output.quote.customerExchangeRate, null);

  const totalOnly = createFinanceTask('שמור לי הצעה של Neema: אני שולח 2000 ILS, עלות כוללת 2020 ILS, והמקבל מקבל 21800 THB');
  const totalResult = await financeConsumerAgent.execute(totalOnly.task);

  assert.equal(totalResult.output.quote.transferFee, null);
  assert.equal(totalResult.output.quote.totalCustomerCost, 2020);
  assert.equal(totalResult.output.quote.customerExchangeRate, null);

  const rateOnly = createFinanceTask('שמור לי הצעה של Neema: אני שולח 2000 ILS והמקבל מקבל 21800 THB. השער שקיבלתי הוא 10.9 באט לשקל');
  const rateResult = await financeConsumerAgent.execute(rateOnly.task);

  assert.equal(rateResult.output.quote.transferFee, null);
  assert.equal(rateResult.output.quote.totalCustomerCost, null);
  assert.equal(rateResult.output.quote.customerExchangeRate, 10.9);
});

test('Hebrew currency aliases normalize in explicit user-submitted quote fields', async () => {
  const cases = [
    'שמור לי הצעה של Neema: אני שולח 2000 שקל, עמלה 20 שקל, והמקבל מקבל 21800 באט',
    'שמור לי הצעה של Neema: אני שולח 2000 שקלים, לקחו לי עמלה של 20 שקלים, והמקבל מקבל 21800 באט תאילנדי',
    'שמור לי הצעה של Neema: אני שולח 2000 ₪, העמלה היא 20 ₪, והמקבל מקבל 21800 THB',
  ];

  for (const message of cases) {
    const { task } = createFinanceTask(message);
    const result = await financeConsumerAgent.execute(task);

    assert.equal(result.output.quote.sourceCurrency, 'ILS');
    assert.equal(result.output.quote.targetCurrency, 'THB');
    assert.equal(result.output.quote.transferFee, 20);
    assert.equal(result.output.quote.recipientAmount, 21800);
  }
});

test('valid single quote with trusted user identity is saved once for the resolved user', async () => {
  const savedCalls = [];
  setUserSubmittedTransferQuoteRepositoryForTest({
    saveUserSubmittedTransferQuote: async (payload) => {
      savedCalls.push(payload);
      return { saved: true, quote: { storedQuoteId: 'stored_quote_1' } };
    },
  });
  const message = 'Monox מציעים לי לשלוח 2,000 שקל ולקבל 21,500 באט';
  const { task } = createFinanceTask(message, {
    requestId: 'req_save_single_quote',
    taskId: 'task_save_single_quote',
  });

  const result = await financeConsumerAgent.execute(task);
  const retryResult = await financeConsumerAgent.execute(task);

  assert.equal(result.status, 'success');
  assert.equal(retryResult.status, 'success');
  assert.equal(savedCalls.length, 1);
  assert.equal(savedCalls[0].userId, 'user_quote_chat');
  assert.equal(savedCalls[0].requesterUserId, 'user_quote_chat');
  assert.equal(savedCalls[0].quote.providerId, 'monox_money');
  assert.equal(savedCalls[0].quote.sourceTrust.sourceType, 'user_submitted_quote');
  assert.equal(savedCalls[0].quote.sourceTrust.verificationStatus, 'user_reported');
  assert.equal(result.output.quotePersistence.status, 'saved');
  assert.match(result.output.message, /שמרתי את ההצעה בפרופיל שלך/);
  assert.doesNotMatch(result.output.message, /user_quote_chat/);
});

test('missing trusted identity does not save and does not falsely claim success', async () => {
  let saveCalls = 0;
  setUserSubmittedTransferQuoteRepositoryForTest({
    saveUserSubmittedTransferQuote: async () => {
      saveCalls += 1;
      return { saved: true };
    },
  });
  const message = 'Monox מציעים לי לשלוח 2,000 שקל ולקבל 21,500 באט';
  const { task } = createFinanceTask(message, {
    input: { userId: '' },
  });

  const result = await financeConsumerAgent.execute(task);

  assert.equal(saveCalls, 0);
  assert.equal(result.status, 'success');
  assert.equal(result.output.quotePersistence.status, 'missing_identity');
  assert.match(result.output.message, /לא שמרתי את ההצעה/);
  assert.match(result.output.message, /לא זיהיתי פרופיל משתמש מאומת/);
});

test('repository failure preserves useful quote summary without claiming save', async () => {
  let saveCalls = 0;
  setUserSubmittedTransferQuoteRepositoryForTest({
    saveUserSubmittedTransferQuote: async () => {
      saveCalls += 1;
      return { saved: false, error: 'storage unavailable' };
    },
  });
  const message = 'Monox מציעים לי לשלוח 2,000 שקל ולקבל 21,500 באט';
  const { task } = createFinanceTask(message);

  const result = await financeConsumerAgent.execute(task);

  assert.equal(saveCalls, 1);
  assert.equal(result.status, 'success');
  assert.equal(result.output.quotePersistence.status, 'failed');
  assert.match(result.output.message, /לא הצלחתי לשמור את ההצעה כרגע/);
  assert.match(result.output.message, /ספק: Monox \/ Monox Money/);
  assert.match(result.output.message, /סכום לקבלה: 21500 THB/);
});

test('malformed or ambiguous quote is not saved', async () => {
  let saveCalls = 0;
  setUserSubmittedTransferQuoteRepositoryForTest({
    saveUserSubmittedTransferQuote: async () => {
      saveCalls += 1;
      return { saved: true };
    },
  });
  const { task } = createFinanceTask('מציעים לי לשלוח 2,000 שקל ולקבל באט');

  const result = await financeConsumerAgent.execute(task);

  assert.equal(result.status, 'blocked');
  assert.equal(saveCalls, 0);
});

test('user text and quote input cannot override trusted persistence identity', async () => {
  const savedCalls = [];
  setUserSubmittedTransferQuoteRepositoryForTest({
    saveUserSubmittedTransferQuote: async (payload) => {
      savedCalls.push(payload);
      return { saved: true };
    },
  });
  const message = 'Monox מציעים לי לשלוח 2,000 שקל ולקבל 21,500 באט userId=attacker';
  const { task } = createFinanceTask(message, {
    input: {
      userId: 'trusted_user',
      userSubmittedQuote: {
        providerId: 'monox_money',
        sourceCurrency: 'ILS',
        targetCurrency: 'THB',
        sendAmount: '2000',
        recipientAmount: '21500',
        userId: 'attacker',
        userSubmittedAt: '2026-09-23T09:05:00.000Z',
      },
    },
  });

  const result = await financeConsumerAgent.execute(task);

  assert.equal(result.status, 'success');
  assert.equal(savedCalls.length, 1);
  assert.equal(savedCalls[0].userId, 'trusted_user');
  assert.equal(savedCalls[0].requesterUserId, 'trusted_user');
  assert.equal(savedCalls[0].quote.userId, undefined);
  assert.doesNotMatch(result.output.message, /trusted_user|attacker/);
});

test('two clear Hebrew user-submitted quotes route to Finance comparison and preserve reported values', async () => {
  const message = 'Monox מציעים לי 2,000 שקל תמורת 21,500 באט ו-Neema מציעים לי 2,000 שקל תמורת 21,800 באט. מה ההבדל?';
  const { task } = createFinanceTask(message);

  assert.equal(task.capability, 'finance.user_submitted_quote');
  assert.equal(task.input.userSubmittedQuote, undefined);
  assert.equal(task.input.userSubmittedQuoteComparison.quotes.length, 2);
  assert.deepEqual(task.input.userSubmittedQuoteComparison.errors, []);
  assert.equal(task.input.userSubmittedQuoteComparison.quotes[0].providerId, 'monox_money');
  assert.equal(task.input.userSubmittedQuoteComparison.quotes[0].sendAmount, '2000');
  assert.equal(task.input.userSubmittedQuoteComparison.quotes[0].recipientAmount, '21500');
  assert.equal(task.input.userSubmittedQuoteComparison.quotes[1].providerId, 'neema');
  assert.equal(task.input.userSubmittedQuoteComparison.quotes[1].sendAmount, '2000');
  assert.equal(task.input.userSubmittedQuoteComparison.quotes[1].recipientAmount, '21800');

  const result = await financeConsumerAgent.execute(task);

  assert.equal(result.status, 'success');
  assert.equal(result.output.comparison.comparisonStatus, 'conditional');
  assert.equal(result.output.comparison.recipientAmountDifference, 300);
  assert.equal(result.output.comparison.feeKnownA, false);
  assert.equal(result.output.comparison.feeKnownB, false);
  assert.equal(result.output.comparison.totalCostKnownA, false);
  assert.equal(result.output.comparison.totalCostKnownB, false);
  assert.equal(result.output.comparison.deliveryMethodMatch, null);
  assert.equal(result.output.quoteA.sourceTrust.verificationStatus, 'user_reported');
  assert.equal(result.output.quoteB.sourceTrust.verificationStatus, 'user_reported');
  assert.match(result.output.message, /Monox \/ Monox Money: לשלוח 2000 ILS, לקבל 21500 THB/);
  assert.match(result.output.message, /Neema: לשלוח 2000 ILS, לקבל 21800 THB/);
  assert.match(result.output.message, /הפרש בסכום לקבלה: 300 THB/);
  assert.match(result.output.message, /סטטוס השוואה: conditional/);
  assert.match(result.output.message, /עמלות: לא ידוע/);
  assert.match(result.output.message, /לא קבעתי מי הכי טוב/);
  assert.doesNotMatch(result.output.message, /חיסכון בשקלים.*300/);
});

test('two-quote comparison still works and is not persisted in this sprint', async () => {
  let saveCalls = 0;
  setUserSubmittedTransferQuoteRepositoryForTest({
    saveUserSubmittedTransferQuote: async () => {
      saveCalls += 1;
      return { saved: true };
    },
  });
  const message = 'Monox מציעים לי 2,000 שקל תמורת 21,500 באט ו-Neema מציעים לי 2,000 שקל תמורת 21,800 באט. מה ההבדל?';
  const { task } = createFinanceTask(message);
  const result = await financeConsumerAgent.execute(task);

  assert.equal(result.status, 'success');
  assert.equal(result.output.comparison.recipientAmountDifference, 300);
  assert.equal(saveCalls, 0);
});

test('explicit same-amount phrasing allows omitted second send amount', async () => {
  const message = 'Monox מציעים לי 2,000 שקל תמורת 21,500 באט ו-Neema מציעים לי 21,800 באט, שניהם על אותו סכום. מה ההבדל?';
  const { task } = createFinanceTask(message);

  assert.equal(task.input.userSubmittedQuoteComparison.usedSharedSendAmount, true);
  assert.equal(task.input.userSubmittedQuoteComparison.quotes[1].sendAmount, '2000');

  const result = await financeConsumerAgent.execute(task);

  assert.equal(result.status, 'success');
  assert.equal(result.output.comparison.recipientAmountDifference, 300);
});

test('missing second send amount without explicit equivalence asks for clarification', async () => {
  const message = 'Monox מציעים לי 2,000 שקל תמורת 21,500 באט ו-Neema מציעים לי 21,800 באט. מה ההבדל?';
  const { task } = createFinanceTask(message);

  assert.equal(task.input.userSubmittedQuoteComparison.errors.includes('missing_second_send_amount'), true);

  const result = await financeConsumerAgent.execute(task);

  assert.equal(result.status, 'blocked');
  assert.equal(result.output, null);
  assert.match(result.followUpQuestions[0], /לכל ספק כמה שקל שולחים/);
});

test('ambiguous provider-to-amount mapping asks for clarification', async () => {
  const message = 'Monox ו-Neema מציעים לי 2,000 שקל תמורת 21,500 ו-21,800 באט. מה ההבדל?';
  const { task } = createFinanceTask(message);

  assert.equal(task.input.userSubmittedQuoteComparison.errors.includes('missing_amount'), true);

  const result = await financeConsumerAgent.execute(task);

  assert.equal(result.status, 'blocked');
  assert.equal(result.output, null);
  assert.match(result.followUpQuestions[0], /אם שתי ההצעות הן על אותו סכום/);
});

test('different known send amounts return incompatible comparison without recommendation', async () => {
  const message = 'Monox מציעים לי 2,000 שקל תמורת 21,500 באט ו-Neema מציעים לי 2,500 שקל תמורת 21,800 באט. מה ההבדל?';
  const { task } = createFinanceTask(message);
  const result = await financeConsumerAgent.execute(task);

  assert.equal(result.status, 'partial');
  assert.equal(result.output.comparison.comparisonStatus, 'incompatible');
  assert.match(result.output.message, /סטטוס השוואה: incompatible/);
  assert.match(result.output.message, /לא קבעתי מי הכי טוב/);
});

test('comparison preserves missing fee and explicit zero fee distinctions', async () => {
  const message = 'Monox מציעים לי 2,000 שקל תמורת 21,500 באט ו-Neema מציעים לי 2,000 שקל תמורת 21,800 באט עמלה 0. מה ההבדל?';
  const { task } = createFinanceTask(message);
  const result = await financeConsumerAgent.execute(task);

  assert.equal(result.output.quoteA.transferFee, null);
  assert.equal(result.output.quoteB.transferFee, 0);
  assert.equal(result.output.comparison.feeKnownA, false);
  assert.equal(result.output.comparison.feeKnownB, true);
  assert.match(result.output.message, /עמלות: לא ידוע/);
});

test('known provider names resolve through the existing registry identities', () => {
  const cases = [
    ['Neema מציעים לי לשלוח 2,000 שקל ולקבל 21,500 באט', 'neema'],
    ['GMT מציעים לי לשלוח 2,000 שקל ולקבל 21,500 באט', 'gmt'],
    ['Remitly מציעים לי לשלוח 2,000 שקל ולקבל 21,500 באט', 'remitly_rewire'],
    ['Rewire מציעים לי לשלוח 2,000 שקל ולקבל 21,500 באט', 'remitly_rewire'],
  ];

  for (const [message, providerId] of cases) {
    const { task } = createFinanceTask(message);
    assert.equal(task.capability, 'finance.user_submitted_quote');
    assert.equal(task.input.userSubmittedQuote.providerId, providerId);
  }
});

test('ambiguous user-submitted quote report asks a focused follow-up instead of guessing', async () => {
  const { task } = createFinanceTask('מציעים לי לשלוח 2,000 שקל ולקבל באט');

  assert.equal(task.capability, 'finance.user_submitted_quote');

  const result = await financeConsumerAgent.execute(task);

  assert.equal(result.status, 'blocked');
  assert.equal(result.output, null);
  assert.equal(result.followUpQuestions.length, 1);
  assert.match(result.followUpQuestions[0], /איזה ספק/);
  assert.match(result.followUpQuestions[0], /כמה באט/);
});

test('normal exchange-rate questions keep the existing live reference-rate route', () => {
  const service = new SupervisorService();
  const context = createRequestContext('מה שער ההמרה הנוכחי משקל לבאט תאילנדי?');
  const plan = service.createPlan(context);
  const withTasks = service.buildTaskSkeleton(plan, context);
  const [task] = withTasks.tasks;

  assert.equal(task.domain, 'finance_consumer');
  assert.equal(task.capability, 'finance.exchange_rate');
  assert.equal(task.input.sourceCurrency, 'ILS');
  assert.equal(task.input.targetCurrency, 'THB');
  assert.equal(task.input.userSubmittedQuote, undefined);
});

function createStoredQuote(overrides = {}) {
  const { quote: quoteOverrides = {}, ...recordOverrides } = overrides;
  return {
    storedQuoteId: 'stored_quote_latest',
    userId: 'user_quote_chat',
    savedAt: '2026-09-28T12:00:00.000Z',
    quote: {
      providerId: 'monox_money',
      providerName: 'Monox / Monox Money',
      sourceCurrency: 'ILS',
      targetCurrency: 'THB',
      sendAmount: 2000,
      transferFee: null,
      totalCustomerCost: null,
      customerExchangeRate: null,
      recipientAmount: 21500,
      deliveryMethod: 'unknown',
      sourceTrust: {
        sourceType: 'user_submitted_quote',
        verificationStatus: 'user_reported',
        freshnessStatus: 'unknown',
      },
      ...quoteOverrides,
    },
    ...recordOverrides,
  };
}

function createNormalizedQuote(overrides = {}) {
  const result = normalizeUserSubmittedMoneyTransferQuote({
    providerId: 'monox_money',
    sourceCurrency: 'ILS',
    targetCurrency: 'THB',
    sendAmount: '2000',
    recipientAmount: '21500',
    userSubmittedAt: '2026-09-28T10:00:00.000Z',
    ...overrides,
  });

  assert.equal(result.ok, true);
  return result.quote;
}

function createSavedQuoteRepository() {
  let id = 0;
  let tick = 0;
  return createUserSubmittedTransferQuoteRepository({
    localRows: [],
    useLocalFallback: () => true,
    idGenerator: () => `stored_quote_${++id}`,
    now: () => `2026-09-28T12:00:0${++tick}.000Z`,
  });
}

async function saveQuote(repository, userId, overrides = {}) {
  return repository.saveUserSubmittedTransferQuote({
    userId,
    requesterUserId: userId,
    quote: createNormalizedQuote(overrides),
  });
}

test('Hebrew last saved transfer quote request routes to Finance saved-quote retrieval', () => {
  const message = 'מה הייתה הצעת העברת הכספים האחרונה ששמרתי אצלך?';
  const { task } = createFinanceTask(message);

  assert.equal(task.domain, 'finance_consumer');
  assert.equal(task.capability, 'finance.saved_user_submitted_quote');
  assert.equal(task.input.userId, 'user_quote_chat');
});

test('saved transfer quote retrieval returns latest user-reported quote in Hebrew', async () => {
  const calls = [];
  setUserSubmittedTransferQuoteRepositoryForTest({
    findRecentUserSubmittedTransferQuotes: async (payload) => {
      calls.push(payload);
      return { ok: true, quotes: [createStoredQuote()] };
    },
  });
  const { task } = createFinanceTask('תראה לי את ההצעה האחרונה ששמרתי');

  const result = await financeConsumerAgent.execute(task);

  assert.equal(result.status, 'success');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    userId: 'user_quote_chat',
    requesterUserId: 'user_quote_chat',
    providerId: undefined,
    limit: 1,
  });
  assert.equal(result.output.capability, 'finance.saved_user_submitted_quote');
  assert.equal(result.output.sourceTrust.sourceType, 'user_submitted_quote');
  assert.equal(result.output.sourceTrust.verificationStatus, 'user_reported');
  assert.match(result.output.message, /הצעת העברת הכספים האחרונה/);
  assert.match(result.output.message, /ספק: Monox \/ Monox Money/);
  assert.match(result.output.message, /סכום לשליחה: 2000 ILS/);
  assert.match(result.output.message, /סכום לקבלה: 21500 THB/);
  assert.match(result.output.message, /נשמר בתאריך: 2026-09-28T12:00:00.000Z/);
  assert.match(result.output.message, /user-reported/);
  assert.match(result.output.message, /לא אומתה מול הספק/);
  assert.doesNotMatch(result.output.message, /עמלה:/);
  assert.doesNotMatch(result.output.message, /user_quote_chat/);
});

test('saved transfer quote retrieval includes explicitly stored fee total cost and customer rate', async () => {
  setUserSubmittedTransferQuoteRepositoryForTest({
    findRecentUserSubmittedTransferQuotes: async () => ({
      ok: true,
      quotes: [createStoredQuote({
        quote: {
          providerId: 'neema',
          providerName: 'Neema',
          recipientAmount: 21800,
          transferFee: 20,
          totalCustomerCost: 2020,
          customerExchangeRate: 10.9,
        },
      })],
    }),
  });
  const { task } = createFinanceTask('מה הייתה ההצעה האחרונה ששמרתי מ-Neema?');

  const result = await financeConsumerAgent.execute(task);

  assert.equal(result.status, 'success');
  assert.match(result.output.message, /ספק: Neema/);
  assert.match(result.output.message, /סכום לשליחה: 2000 ILS/);
  assert.match(result.output.message, /עמלה: 20 ILS/);
  assert.match(result.output.message, /עלות כוללת: 2020 ILS/);
  assert.match(result.output.message, /סכום לקבלה: 21800 THB/);
  assert.match(result.output.message, /שער לקוח שדווח: 10.9 THB לכל ILS/);
  assert.match(result.output.message, /user-reported/);
});

test('saved transfer quote retrieval does not calculate missing total cost customer rate or fee', async () => {
  const cases = [
    {
      name: 'missing total cost',
      quote: { transferFee: 20, totalCustomerCost: null, customerExchangeRate: 10.9 },
      absent: /עלות כוללת:/,
      present: [/עמלה: 20 ILS/, /שער לקוח שדווח: 10.9 THB לכל ILS/],
    },
    {
      name: 'missing customer rate',
      quote: { transferFee: 20, totalCustomerCost: 2020, customerExchangeRate: null },
      absent: /שער לקוח שדווח:/,
      present: [/עמלה: 20 ILS/, /עלות כוללת: 2020 ILS/],
    },
    {
      name: 'missing fee',
      quote: { transferFee: null, totalCustomerCost: 2020, customerExchangeRate: 10.9 },
      absent: /עמלה:/,
      present: [/עלות כוללת: 2020 ILS/, /שער לקוח שדווח: 10.9 THB לכל ILS/],
    },
  ];

  for (const testCase of cases) {
    setUserSubmittedTransferQuoteRepositoryForTest({
      findRecentUserSubmittedTransferQuotes: async () => ({
        ok: true,
        quotes: [createStoredQuote({
          quote: {
            providerId: 'neema',
            providerName: 'Neema',
            recipientAmount: 21800,
            ...testCase.quote,
          },
        })],
      }),
    });
    const { task } = createFinanceTask(`תראה לי את ההצעה האחרונה ששמרתי מ-Neema ${testCase.name}`);

    const result = await financeConsumerAgent.execute(task);

    assert.equal(result.status, 'success');
    assert.doesNotMatch(result.output.message, testCase.absent);
    for (const pattern of testCase.present) {
      assert.match(result.output.message, pattern);
    }
  }
});

test('saved transfer quote retrieval filters by requested Neema provider', async () => {
  const calls = [];
  setUserSubmittedTransferQuoteRepositoryForTest({
    findRecentUserSubmittedTransferQuotes: async (payload) => {
      calls.push(payload);
      return {
        ok: true,
        quotes: [createStoredQuote({
          quote: {
            providerId: 'neema',
            providerName: 'Neema',
            recipientAmount: 21800,
          },
        })],
      };
    },
  });
  const { task } = createFinanceTask('מה הייתה הצעת העברת הכספים האחרונה ששמרתי אצלך מחברת Neema?');

  const result = await financeConsumerAgent.execute(task);

  assert.equal(task.capability, 'finance.saved_user_submitted_quote');
  assert.equal(task.input.savedTransferQuoteRecall.requestedProviderId, 'neema');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].providerId, 'neema');
  assert.equal(result.status, 'success');
  assert.match(result.output.message, /ספק: Neema/);
  assert.match(result.output.message, /סכום לקבלה: 21800 THB/);
  assert.doesNotMatch(result.output.message, /Monox/);
});

test('exact Hebrew provider-specific saved quote request returns Neema when Monox is latest overall', async () => {
  const repository = createUserSubmittedTransferQuoteRepository({
    localRows: [],
    useLocalFallback: () => true,
    idGenerator: (() => {
      let id = 0;
      return () => `stored_quote_${++id}`;
    })(),
    now: (() => {
      const timestamps = [
        '2026-09-28T10:00:00.000Z',
        '2026-09-28T11:00:00.000Z',
      ];
      let index = 0;
      return () => timestamps[index++] || '2026-09-28T11:00:00.000Z';
    })(),
  });

  await repository.saveUserSubmittedTransferQuote({
    userId: 'user_quote_chat',
    requesterUserId: 'user_quote_chat',
    quote: createNormalizedQuote({
      providerId: 'neema',
      recipientAmount: '21800',
      userSubmittedAt: '2026-09-28T09:00:00.000Z',
    }),
  });
  await repository.saveUserSubmittedTransferQuote({
    userId: 'user_quote_chat',
    requesterUserId: 'user_quote_chat',
    quote: createNormalizedQuote({
      providerId: 'monox_money',
      recipientAmount: '21500',
      userSubmittedAt: '2026-09-28T09:30:00.000Z',
    }),
  });
  setUserSubmittedTransferQuoteRepositoryForTest(repository);

  const { task } = createFinanceTask('מה הייתה הצעת העברת הכספים האחרונה ששמרתי אצלך מחברת Neema?');
  const result = await financeConsumerAgent.execute(task);

  assert.equal(task.capability, 'finance.saved_user_submitted_quote');
  assert.equal(task.input.savedTransferQuoteRecall.requestedProviderId, 'neema');
  assert.equal(result.status, 'success');
  assert.match(result.output.message, /ספק: Neema/);
  assert.match(result.output.message, /סכום לקבלה: 21800 THB/);
  assert.doesNotMatch(result.output.message, /Monox/);
  assert.doesNotMatch(result.output.message, /21500 THB/);
});

test('saved quote comparison compares two latest saved provider quotes by recipient amount only', async () => {
  const repository = createSavedQuoteRepository();
  await saveQuote(repository, 'user_quote_chat', {
    providerId: 'monox_money',
    recipientAmount: '21500',
  });
  await saveQuote(repository, 'user_quote_chat', {
    providerId: 'neema',
    recipientAmount: '21800',
  });
  setUserSubmittedTransferQuoteRepositoryForTest(repository);

  const { task } = createFinanceTask('מה עדיף, ההצעה של Monox או Neema?');
  const result = await financeConsumerAgent.execute(task);

  assert.equal(task.capability, 'finance.saved_user_submitted_quote_comparison');
  assert.deepEqual(task.input.savedTransferQuoteComparison.providerIds, ['monox_money', 'neema']);
  assert.equal(result.status, 'success');
  assert.equal(result.output.comparison.recipientAmountDifference, 300);
  assert.equal(result.output.quoteA.sourceTrust.verificationStatus, 'user_reported');
  assert.equal(result.output.quoteB.sourceTrust.verificationStatus, 'user_reported');
  assert.match(result.output.message, /Monox \/ Monox Money: 2000 ILS -> 21500 THB/);
  assert.match(result.output.message, /Neema: 2000 ILS -> 21800 THB/);
  assert.match(result.output.message, /Neema נותנת 300 THB יותר למקבל/);
  assert.match(result.output.message, /user-reported/);
  assert.match(result.output.message, /לא אומתו מול הספקים/);
  assert.doesNotMatch(result.output.message, /זולה|הכי טוב|הספק הטוב|חיסכון בשקלים/);
});

test('saved quote comparison does not substitute latest overall quote when one provider is missing', async () => {
  const repository = createSavedQuoteRepository();
  await saveQuote(repository, 'user_quote_chat', {
    providerId: 'monox_money',
    recipientAmount: '21500',
  });
  setUserSubmittedTransferQuoteRepositoryForTest(repository);

  const { task } = createFinanceTask('השווה לי בין Monox ל-Neema');
  const result = await financeConsumerAgent.execute(task);

  assert.equal(task.capability, 'finance.saved_user_submitted_quote_comparison');
  assert.equal(result.status, 'partial');
  assert.match(result.output.message, /יש לי הצעה שמורה של Monox \/ Monox Money/);
  assert.match(result.output.message, /אין לי עדיין הצעה שמורה של Neema/);
  assert.match(result.output.message, /לא יכול לבצע השוואה מלאה/);
  assert.doesNotMatch(result.output.message, /21500 THB/);
});

test('saved quote comparison with different send amounts does not declare a winner', async () => {
  const repository = createSavedQuoteRepository();
  await saveQuote(repository, 'user_quote_chat', {
    providerId: 'monox_money',
    sendAmount: '2000',
    recipientAmount: '21500',
  });
  await saveQuote(repository, 'user_quote_chat', {
    providerId: 'neema',
    sendAmount: '2500',
    recipientAmount: '21800',
  });
  setUserSubmittedTransferQuoteRepositoryForTest(repository);

  const { task } = createFinanceTask('מי נותן יותר, Monox או Neema?');
  const result = await financeConsumerAgent.execute(task);

  assert.equal(result.status, 'partial');
  assert.equal(result.output.comparison.comparisonStatus, 'incompatible');
  assert.match(result.output.message, /אינן ניתנות להשוואה ישירה/);
  assert.doesNotMatch(result.output.message, /נותנת .* יותר למקבל/);
});

test('saved quote comparison with different currencies does not declare a winner', async () => {
  const repository = createSavedQuoteRepository();
  await saveQuote(repository, 'user_quote_chat', {
    providerId: 'monox_money',
    sourceCurrency: 'ILS',
    targetCurrency: 'THB',
    recipientAmount: '21500',
  });
  await saveQuote(repository, 'user_quote_chat', {
    providerId: 'neema',
    sourceCurrency: 'USD',
    targetCurrency: 'PHP',
    recipientAmount: '21800',
  });
  setUserSubmittedTransferQuoteRepositoryForTest(repository);

  const { task } = createFinanceTask('איזו הצעה טובה יותר, Monox או Neema?');
  const result = await financeConsumerAgent.execute(task);

  assert.equal(result.status, 'partial');
  assert.equal(result.output.comparison.comparisonStatus, 'incompatible');
  assert.match(result.output.message, /אינן ניתנות להשוואה ישירה/);
  assert.doesNotMatch(result.output.message, /נותנת .* יותר למקבל/);
});

test('saved quote comparison keeps unknown fees from becoming lower-cost claims', async () => {
  const repository = createSavedQuoteRepository();
  await saveQuote(repository, 'user_quote_chat', {
    providerId: 'monox_money',
    recipientAmount: '21500',
    transferFee: undefined,
  });
  await saveQuote(repository, 'user_quote_chat', {
    providerId: 'neema',
    recipientAmount: '21800',
    transferFee: undefined,
  });
  setUserSubmittedTransferQuoteRepositoryForTest(repository);

  const { task } = createFinanceTask('מי נותן לי יותר, Monox או Neema?');
  const result = await financeConsumerAgent.execute(task);

  assert.equal(result.output.comparison.feeKnownA, false);
  assert.equal(result.output.comparison.feeKnownB, false);
  assert.match(result.output.message, /העמלות או העלות הכוללת אינן ידועות/);
  assert.doesNotMatch(result.output.message, /זול|זולה|עלות נמוכה|cheaper/i);
});

test('saved quote comparison preserves trusted-user isolation', async () => {
  const repository = createSavedQuoteRepository();
  await saveQuote(repository, 'user_quote_chat', {
    providerId: 'monox_money',
    recipientAmount: '21500',
  });
  await saveQuote(repository, 'other_user', {
    providerId: 'neema',
    recipientAmount: '21800',
  });
  setUserSubmittedTransferQuoteRepositoryForTest(repository);

  const { task } = createFinanceTask('השווה לי בין Monox ל-Neema');
  const result = await financeConsumerAgent.execute(task);

  assert.equal(result.status, 'partial');
  assert.match(result.output.message, /אין לי עדיין הצעה שמורה של Neema/);
  assert.doesNotMatch(result.output.message, /21800 THB/);
  assert.doesNotMatch(result.output.message, /other_user/);
});

test('saved quote comparison preserves provider order when question is reversed', async () => {
  const repository = createSavedQuoteRepository();
  await saveQuote(repository, 'user_quote_chat', {
    providerId: 'monox_money',
    recipientAmount: '21500',
  });
  await saveQuote(repository, 'user_quote_chat', {
    providerId: 'neema',
    recipientAmount: '21800',
  });
  setUserSubmittedTransferQuoteRepositoryForTest(repository);

  const { task } = createFinanceTask('השווה לי בין Neema ל-Monox');
  const result = await financeConsumerAgent.execute(task);

  assert.equal(task.capability, 'finance.saved_user_submitted_quote_comparison');
  assert.deepEqual(task.input.savedTransferQuoteComparison.providerIds, ['neema', 'monox_money']);
  assert.equal(result.output.comparison.recipientAmountDifference, -300);
  assert.match(result.output.message, /Neema: 2000 ILS -> 21800 THB/);
  assert.match(result.output.message, /Monox \/ Monox Money: 2000 ILS -> 21500 THB/);
  assert.match(result.output.message, /Neema נותנת 300 THB יותר למקבל/);
});

test('saved transfer quote retrieval filters by provider aliases', () => {
  const cases = [
    ['תראה לי את ההצעה האחרונה ששמרתי מחברת Monox Money', 'monox_money'],
    ['תראה לי את ההצעה האחרונה ששמרתי מחברת GMT', 'gmt'],
    ['תראה לי את ההצעה האחרונה ששמרתי מחברת Rewire', 'remitly_rewire'],
    ['תראה לי את ההצעה האחרונה ששמרתי מחברת Remitly', 'remitly_rewire'],
  ];

  for (const [message, providerId] of cases) {
    const { task } = createFinanceTask(message);
    assert.equal(task.capability, 'finance.saved_user_submitted_quote');
    assert.equal(task.input.savedTransferQuoteRecall.requestedProviderId, providerId);
  }
});

test('saved transfer quote retrieval does not substitute another provider when requested provider has no quote', async () => {
  const calls = [];
  setUserSubmittedTransferQuoteRepositoryForTest({
    findRecentUserSubmittedTransferQuotes: async (payload) => {
      calls.push(payload);
      return { ok: true, quotes: [] };
    },
  });
  const { task } = createFinanceTask('מה הייתה הצעת העברת הכספים האחרונה ששמרתי אצלך מחברת Neema?');

  const result = await financeConsumerAgent.execute(task);

  assert.equal(result.status, 'partial');
  assert.equal(calls[0].providerId, 'neema');
  assert.match(result.output.message, /מחברת Neema/);
  assert.doesNotMatch(result.output.message, /Monox/);
});

test('saved transfer quote retrieval asks for clarification when more than one provider is requested', async () => {
  let readCalls = 0;
  setUserSubmittedTransferQuoteRepositoryForTest({
    findRecentUserSubmittedTransferQuotes: async () => {
      readCalls += 1;
      return { ok: true, quotes: [createStoredQuote()] };
    },
  });
  const { task } = createFinanceTask('תראה לי את ההצעה האחרונה ששמרתי אצלך מ-Neema או Monox');

  const result = await financeConsumerAgent.execute(task);

  assert.equal(task.input.savedTransferQuoteRecall.providerAmbiguous, true);
  assert.equal(readCalls, 0);
  assert.equal(result.status, 'blocked');
  assert.match(result.output.message, /איזה ספק/);
});

test('saved transfer quote retrieval includes fee only when known', async () => {
  setUserSubmittedTransferQuoteRepositoryForTest({
    findRecentUserSubmittedTransferQuotes: async () => ({
      ok: true,
      quotes: [createStoredQuote({ quote: { transferFee: 12 } })],
    }),
  });
  const { task } = createFinanceTask('מה ההצעה האחרונה שלי להעברת כסף?');

  const result = await financeConsumerAgent.execute(task);

  assert.equal(result.status, 'success');
  assert.match(result.output.message, /עמלה: 12 ILS/);
});

test('saved transfer quote retrieval reports no saved quote clearly', async () => {
  setUserSubmittedTransferQuoteRepositoryForTest({
    findRecentUserSubmittedTransferQuotes: async () => ({ ok: true, quotes: [] }),
  });
  const { task } = createFinanceTask('מה הייתה הצעת העברת הכספים האחרונה ששמרתי אצלך?');

  const result = await financeConsumerAgent.execute(task);

  assert.equal(result.status, 'partial');
  assert.match(result.output.message, /אין לי עדיין הצעת העברת כספים שמורה עבורך/);
});

test('saved transfer quote retrieval fails closed when trusted identity is missing', async () => {
  let readCalls = 0;
  setUserSubmittedTransferQuoteRepositoryForTest({
    findRecentUserSubmittedTransferQuotes: async () => {
      readCalls += 1;
      return { ok: true, quotes: [createStoredQuote()] };
    },
  });
  const { task } = createFinanceTask('תראה לי את ההצעה האחרונה ששמרתי', {
    input: { userId: '' },
  });

  const result = await financeConsumerAgent.execute(task);

  assert.equal(readCalls, 0);
  assert.equal(result.status, 'blocked');
  assert.match(result.output.message, /לא הצלחתי לזהות פרופיל משתמש מאומת/);
});

test('saved transfer quote retrieval preserves user scope and ignores chat-supplied user IDs', async () => {
  const calls = [];
  setUserSubmittedTransferQuoteRepositoryForTest({
    findRecentUserSubmittedTransferQuotes: async (payload) => {
      calls.push(payload);
      return { ok: true, quotes: [createStoredQuote({ userId: 'trusted_user' })] };
    },
  });
  const { task } = createFinanceTask('תראה לי את ההצעה האחרונה ששמרתי userId=attacker', {
    input: { userId: 'trusted_user' },
  });

  const result = await financeConsumerAgent.execute(task);

  assert.equal(result.status, 'success');
  assert.equal(calls[0].userId, 'trusted_user');
  assert.equal(calls[0].requesterUserId, 'trusted_user');
  assert.doesNotMatch(result.output.message, /trusted_user|attacker/);
});

test('saved transfer quote retrieval handles storage failure safely', async () => {
  setUserSubmittedTransferQuoteRepositoryForTest({
    findRecentUserSubmittedTransferQuotes: async () => ({ ok: false, error: 'sheet unavailable', quotes: [] }),
  });
  const { task } = createFinanceTask('תראה לי את ההצעה האחרונה ששמרתי');

  const result = await financeConsumerAgent.execute(task);

  assert.equal(result.status, 'partial');
  assert.match(result.output.message, /לא הצלחתי לקרוא את ההצעות השמורות כרגע/);
  assert.doesNotMatch(result.output.message, /sheet unavailable/);
});

test('salary questions are not routed as user-submitted transfer quotes', () => {
  const service = new SupervisorService();
  const context = createRequestContext('When should I receive my salary?');
  const intents = service.detectIntents(context);
  const tasks = service.createTasksFromIntents(context, intents);

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].domain, 'employment_salary');
  assert.notEqual(tasks[0].capability, 'finance.user_submitted_quote');
});
