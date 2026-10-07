const test = require('node:test');
const assert = require('node:assert/strict');

const {
  employmentSalaryAgent,
  financeConsumerAgent,
  healthLifeCommunityAgent,
  resultContract,
  setUserSubmittedTransferQuoteRepositoryForTest,
} = require('../src/modules/agents');
const moneyService = require('../src/modules/money/money.service');
const serviceService = require('../src/modules/services/service.service');
const knowledgeAgentService = require('../src/modules/knowledge-agent/knowledge-agent.service');
const crmAgentService = require('../src/modules/crm-agent/crm-agent.service');

test.afterEach(() => {
  setUserSubmittedTransferQuoteRepositoryForTest(null);
});

function createTask(overrides = {}) {
  return {
    taskId: 'task_finance_1',
    conversationId: 'web:user',
    requestId: 'req_finance_1',
    domain: 'finance_consumer',
    capability: 'finance.budget',
    priority: 'normal',
    input: {},
    metadata: {},
    createdAt: '2026-08-02T08:00:00.000Z',
    ...overrides,
  };
}

async function withPatchedServices(patches, callback) {
  const originals = [];

  for (const [service, methods] of patches) {
    for (const [name, replacement] of Object.entries(methods)) {
      originals.push([service, name, service[name]]);
      service[name] = replacement;
    }
  }

  try {
    return await callback();
  } finally {
    originals.reverse().forEach(([service, name, original]) => {
      service[name] = original;
    });
  }
}

function assertResultContract(result) {
  assert.deepEqual(Object.keys(result), [
    'taskId',
    'status',
    'output',
    'factsLearned',
    'suggestedProfileUpdates',
    'followUpQuestions',
    'warnings',
    'completedAt',
  ]);
  assert.equal(result.taskId, 'task_finance_1');
  assert.equal(Array.isArray(result.factsLearned), true);
  assert.equal(Array.isArray(result.suggestedProfileUpdates), true);
  assert.equal(Array.isArray(result.followUpQuestions), true);
  assert.equal(Array.isArray(result.warnings), true);
  assert.equal(resultContract.validateResultContract(result), true);
}

function createStoredQuote(overrides = {}) {
  const { quote: quoteOverrides = {}, ...storedOverrides } = overrides;
  const quote = {
    providerId: 'monox_money',
    providerName: 'Monox / Monox Money',
    sourceCurrency: 'ILS',
    targetCurrency: 'THB',
    sendAmount: 2000,
    transferFee: 20,
    totalCustomerCost: 2020,
    customerExchangeRate: 10.9,
    recipientAmount: 21800,
    deliveryMethod: 'unknown',
    estimatedDelivery: null,
    reporterType: 'user',
    evidenceStatus: 'none',
    evidenceType: null,
    evidenceReference: null,
    observedAt: '2026-10-05T10:30:00.000Z',
    sourceTrust: {
      sourceType: 'user_submitted_quote',
      verificationStatus: 'user_reported',
      freshnessStatus: 'unknown',
    },
    availabilityStatus: 'unknown',
    notes: [],
    ...quoteOverrides,
  };

  return {
    storedQuoteId: overrides.storedQuoteId || `stored_${quote.providerId}`,
    userId: overrides.userId || 'user_finance_1',
    savedAt: overrides.savedAt || '2026-10-05T11:00:00.000Z',
    providerId: quote.providerId,
    providerName: quote.providerName,
    sourceCurrency: quote.sourceCurrency,
    targetCurrency: quote.targetCurrency,
    sendAmount: quote.sendAmount,
    transferFee: quote.transferFee,
    totalCustomerCost: quote.totalCustomerCost,
    customerExchangeRate: quote.customerExchangeRate,
    recipientAmount: quote.recipientAmount,
    reporterType: quote.reporterType,
    evidenceStatus: quote.evidenceStatus,
    evidenceType: quote.evidenceType,
    evidenceReference: quote.evidenceReference,
    observedAt: quote.observedAt,
    quote,
    ...storedOverrides,
  };
}

function setQuoteRepositoryReturning(quotes = [], assertions = () => {}) {
  setUserSubmittedTransferQuoteRepositoryForTest({
    findRecentUserSubmittedTransferQuotes: async (payload) => {
      assertions(payload);
      return { ok: true, quotes };
    },
    saveUserSubmittedTransferQuote: async () => {
      throw new Error('save should not be called');
    },
  });
}

test('finance.budget returns a safe budget summary when required data exists', async () => {
  const result = await financeConsumerAgent.execute(createTask({
    capability: 'finance.budget',
    input: {
      monthlyIncome: 5000,
      monthlyExpenses: 3500,
      currency: 'ILS',
    },
  }));

  assert.equal(result.status, 'success');
  assert.equal(result.output.capability, 'finance.budget');
  assert.equal(result.output.estimatedRemaining, 1500);
  assert.match(result.output.safetyNotice, /not financial advice/i);
  assertResultContract(result);
});

test('finance.budget blocks with one focused question when required input is missing', async () => {
  const result = await financeConsumerAgent.execute(createTask({ capability: 'finance.budget', input: { monthlyIncome: 5000 } }));

  assert.equal(result.status, 'blocked');
  assert.equal(result.output, null);
  assert.deepEqual(result.warnings, ['missing_required_input']);
  assert.equal(result.followUpQuestions.length, 1);
  assertResultContract(result);
});

test('finance.transfer uses saved reported observations instead of demo provider ranking', async () => {
  let compareCalled = false;
  const storedQuote = createStoredQuote();

  setQuoteRepositoryReturning([storedQuote], (payload) => {
    assert.equal(payload.userId, 'user_finance_1');
    assert.equal(payload.requesterUserId, 'user_finance_1');
    assert.equal(payload.sourceCurrency, 'ILS');
    assert.equal(payload.targetCurrency, 'THB');
  });

  await withPatchedServices([
    [moneyService, {
      compareTransfers: async () => {
        compareCalled = true;
        return [];
      },
    }],
  ], async () => {
    const result = await financeConsumerAgent.execute(createTask({
      capability: 'finance.transfer',
      input: {
        amount: 2000,
        sourceCurrency: 'ILS',
        targetCurrency: 'THB',
        userId: 'user_finance_1',
      },
    }));

    assert.equal(compareCalled, false);
    assert.equal(result.status, 'success');
    assert.equal(result.output.capability, 'finance.transfer');
    assert.equal(result.output.directAmountMatch, true);
    assert.equal(result.output.reportedQuotes.length, 1);
    assert.match(result.output.message, /Monox \/ Monox Money/);
    assert.match(result.output.message, /21,800 THB/);
    assert.match(result.output.message, /20 ILS/);
    assert.doesNotMatch(result.output.message, /Demo data/i);
    assert.equal(result.output.bestOption, undefined);
    assert.equal(result.output.demoNotice, undefined);
    assert.equal(result.output.safetyNotice, moneyService.SAFETY_NOTICE);
    assert.equal(result.warnings.includes('reported_quote_unverified'), true);
    assertResultContract(result);
  });
});

test('finance.transfer does not scale different-amount reported observations', async () => {
  setQuoteRepositoryReturning([createStoredQuote()]);

  const result = await financeConsumerAgent.execute(createTask({
    capability: 'finance.transfer',
    input: {
      amount: 4000,
      sourceCurrency: 'ILS',
      targetCurrency: 'THB',
      userId: 'user_finance_1',
    },
  }));

  assert.equal(result.status, 'partial');
  assert.equal(result.output.directAmountMatch, false);
  assert.equal(result.output.reportedQuotes[0].quote.recipientAmount, 21800);
  assert.match(result.output.message, /no direct report for 4000 ILS/i);
  assert.match(result.output.message, /did not calculate missing recipient amounts/i);
  assert.doesNotMatch(result.output.message, /43600/);
  assert.doesNotMatch(result.output.message, /43,600/);
  assert.doesNotMatch(result.output.message, /By recipient amount only/);
  assert.equal(result.warnings.includes('no_same_amount_reported_quote'), true);
  assertResultContract(result);
});

test('finance.transfer preserves ambassador and evidence-submitted provenance wording', async () => {
  setQuoteRepositoryReturning([
    createStoredQuote({
      quote: {
        providerId: 'neema',
        providerName: 'Neema',
        reporterType: 'ambassador',
        evidenceStatus: 'submitted',
        evidenceType: 'transfer_receipt',
        evidenceReference: 'evidence_opaque_1',
        recipientAmount: 21900,
      },
    }),
  ]);

  const result = await financeConsumerAgent.execute(createTask({
    capability: 'finance.transfer',
    input: {
      amount: 2000,
      sourceCurrency: 'ILS',
      targetCurrency: 'THB',
      userId: 'user_finance_1',
    },
  }));

  assert.equal(result.status, 'success');
  assert.match(result.output.message, /Reported by an ambassador/);
  assert.match(result.output.message, /Evidence was submitted; it was not verified with the provider/);
  assert.match(result.output.message, /not verified with the provider/);
  assert.equal((result.output.message.match(/Gringo/g) || []).length, 1);
  assert.doesNotMatch(result.output.message, /provider verified/i);
  assert.doesNotMatch(result.output.message, /verified by Gringo/i);
  assertResultContract(result);
});

test('finance.transfer omits missing optional quote fields without calculation', async () => {
  setQuoteRepositoryReturning([
    createStoredQuote({
      quote: {
        transferFee: null,
        totalCustomerCost: null,
        customerExchangeRate: null,
        recipientAmount: 21500,
      },
    }),
  ]);

  const result = await financeConsumerAgent.execute(createTask({
    capability: 'finance.transfer',
    input: {
      amount: 2000,
      sourceCurrency: 'ILS',
      targetCurrency: 'THB',
      userId: 'user_finance_1',
    },
  }));

  assert.equal(result.status, 'success');
  assert.match(result.output.message, /21,500 THB/);
  assert.doesNotMatch(result.output.message, /Fee:/);
  assert.doesNotMatch(result.output.message, /Total cost:/);
  assert.doesNotMatch(result.output.message, /Reported customer rate:/);
  assert.doesNotMatch(result.output.message, /10\.75|10\.9/);
  assertResultContract(result);
});

test('finance.transfer returns insufficient reported data without demo ranking when no observations exist', async () => {
  let compareCalled = false;
  setQuoteRepositoryReturning([]);

  await withPatchedServices([
    [moneyService, {
      compareTransfers: async () => {
        compareCalled = true;
        return [{ providerName: 'Demo Provider' }];
      },
    }],
  ], async () => {
    const result = await financeConsumerAgent.execute(createTask({
      capability: 'finance.transfer',
      input: {
        amount: 2000,
        sourceCurrency: 'ILS',
        targetCurrency: 'THB',
        userId: 'user_finance_1',
      },
    }));

    assert.equal(compareCalled, false);
    assert.equal(result.status, 'partial');
    assert.match(result.output.message, /not currently have enough real reported observations/i);
    assert.match(result.output.message, /will not show demo provider ranking/i);
    assert.doesNotMatch(result.output.message, /Demo Provider/);
    assert.equal(result.warnings.includes('insufficient_reported_quote_data'), true);
    assertResultContract(result);
  });
});

test('finance.transfer returns Hebrew reported-observation summary for Hebrew transfer request', async () => {
  setQuoteRepositoryReturning([
    createStoredQuote({
      quote: {
        providerId: 'neema',
        providerName: 'Neema',
        reporterType: 'ambassador',
        evidenceStatus: 'submitted',
        recipientAmount: 21800,
      },
    }),
  ]);

  const result = await financeConsumerAgent.execute(createTask({
    capability: 'finance.transfer',
    input: {
      question: 'אני רוצה לשלוח 2000 שקל לבאט, איפה הכי משתלם?',
      amount: 2000,
      sourceCurrency: 'ILS',
      targetCurrency: 'THB',
      userId: 'user_finance_1',
    },
  }));

  assert.equal(result.status, 'success');
  assert.match(result.output.message, /לפי דיווחים שנשמרו ב-Gringo עבור העברות של 2,000 ILS לתאילנד:/);
  assert.match(result.output.message, /דווח על ידי שגריר/);
  assert.match(result.output.message, /אסמכתא נמסרה; היא לא אומתה מול הספק/);
  assert.equal((result.output.message.match(/Gringo/g) || []).length, 1);
  assert.doesNotMatch(result.output.message, /\.\./);
  assert.doesNotMatch(result.output.message, /האסמכתא אומתה/);
  assert.doesNotMatch(result.output.message, /אומתה על ידי/);
  assertResultContract(result);
});

function reportedQuote(overrides = {}) {
  return createStoredQuote({
    quote: {
      transferFee: null,
      totalCustomerCost: null,
      customerExchangeRate: null,
      observedAt: null,
      reporterType: 'user',
      evidenceStatus: 'none',
      evidenceType: null,
      evidenceReference: null,
      ...overrides,
    },
  });
}

function hebrewTransferInput(amount = 2000) {
  return {
    question: 'אני רוצה לשלוח 2000 שקל לתאילנד, איפה הכי משתלם?',
    amount,
    sourceCurrency: 'ILS',
    targetCurrency: 'THB',
    userId: 'user_finance_1',
  };
}

test('finance.transfer Hebrew layout compares two same-amount reports by recipient amount only', async () => {
  setQuoteRepositoryReturning([
    reportedQuote({
      providerId: 'neema',
      providerName: 'Neema',
      recipientAmount: 21800,
      transferFee: 20,
    }),
    reportedQuote({
      providerId: 'monox_money',
      providerName: 'Monox / Monox Money',
      recipientAmount: 21500,
    }),
  ]);

  const result = await financeConsumerAgent.execute(createTask({
    capability: 'finance.transfer',
    input: hebrewTransferInput(),
  }));

  assert.equal(result.output.message, [
    'לפי דיווחים שנשמרו ב-Gringo עבור העברות של 2,000 ILS לתאילנד:',
    'Neema\nשליחה: 2,000 ILS\nקבלה: 21,800 THB\nעמלה שדווחה: 20 ILS',
    'Monox / Monox Money\nשליחה: 2,000 ILS\nקבלה: 21,500 THB',
    'לפי סכום הקבלה בלבד, בדיווח של Neema המקבל קיבל 300 THB יותר.',
    'חשוב: אלה דיווחים שנמסרו ואינם הצעות חיות או מידע רשמי מהחברות. נתונים חסרים לא חושבו.',
  ].join('\n\n'));
  assert.equal((result.output.message.match(/Gringo/g) || []).length, 1);
  assert.doesNotMatch(result.output.message, /הכי|משתלם|best|cheapest/i);
  assertResultContract(result);
});

test('finance.transfer does not invent a fee when one same-amount report omitted it', async () => {
  setQuoteRepositoryReturning([
    reportedQuote({
      providerId: 'neema',
      providerName: 'Neema',
      recipientAmount: 21800,
      transferFee: 20,
    }),
    reportedQuote({
      providerId: 'monox_money',
      providerName: 'Monox / Monox Money',
      recipientAmount: 21500,
      transferFee: null,
    }),
  ]);

  const result = await financeConsumerAgent.execute(createTask({
    capability: 'finance.transfer',
    input: hebrewTransferInput(),
  }));
  const monoxBlock = result.output.message.split('\n\n').find((block) => block.startsWith('Monox / Monox Money'));

  assert.match(result.output.message, /עמלה שדווחה: 20 ILS/);
  assert.equal((result.output.message.match(/עמלה/g) || []).length, 1);
  assert.doesNotMatch(monoxBlock, /עמלה|2020|10\.9/);
  assert.match(result.output.message, /קיבל 300 THB יותר/);
  assertResultContract(result);
});

test('finance.transfer shows an observation date only when observedAt is stored', async () => {
  setQuoteRepositoryReturning([
    reportedQuote({
      providerId: 'neema',
      providerName: 'Neema',
      recipientAmount: 21800,
      observedAt: '2026-10-05T10:30:00.000Z',
    }),
  ]);

  const withDate = await financeConsumerAgent.execute(createTask({
    capability: 'finance.transfer',
    input: hebrewTransferInput(),
  }));

  assert.match(withDate.output.message, /תאריך תצפית: 5 באוקטובר 2026/);
  assert.doesNotMatch(withDate.output.message, /T10:30|11:00:00|savedAt/);

  setQuoteRepositoryReturning([
    reportedQuote({
      providerId: 'neema',
      providerName: 'Neema',
      recipientAmount: 21800,
      observedAt: null,
      savedAt: '2026-10-05T11:00:00.000Z',
    }),
  ]);

  const withoutDate = await financeConsumerAgent.execute(createTask({
    capability: 'finance.transfer',
    input: hebrewTransferInput(),
  }));

  assert.doesNotMatch(withoutDate.output.message, /תאריך תצפית|2026-10-05|11:00/);
  assertResultContract(withoutDate);
});

test('finance.transfer Hebrew different-amount reports stay unscaled and have no difference line', async () => {
  setQuoteRepositoryReturning([
    reportedQuote({
      providerId: 'neema',
      providerName: 'Neema',
      sendAmount: 2000,
      recipientAmount: 21800,
    }),
  ]);

  const result = await financeConsumerAgent.execute(createTask({
    capability: 'finance.transfer',
    input: hebrewTransferInput(4000),
  }));

  assert.equal(result.status, 'partial');
  assert.match(result.output.message, /לא דיווח ישיר עבור 4000 ILS/);
  assert.match(result.output.message, /לא חישבתי סכומי קבלה/);
  assert.match(result.output.message, /שליחה: 2,000 ILS/);
  assert.match(result.output.message, /קבלה: 21,800 THB/);
  assert.doesNotMatch(result.output.message, /לפי סכום הקבלה בלבד|43,600|43600/);
  assertResultContract(result);
});

test('finance.transfer does not choose a provider when recipient amounts tie', async () => {
  setQuoteRepositoryReturning([
    reportedQuote({
      providerId: 'neema',
      providerName: 'Neema',
      recipientAmount: 21800,
    }),
    reportedQuote({
      providerId: 'monox_money',
      providerName: 'Monox / Monox Money',
      recipientAmount: 21800,
    }),
  ]);

  const result = await financeConsumerAgent.execute(createTask({
    capability: 'finance.transfer',
    input: hebrewTransferInput(),
  }));

  assert.match(result.output.message, /לפי סכום הקבלה בלבד, הדיווחים האלה נותנים אותו סכום למקבל\. לא נבחר ספק\./);
  assert.doesNotMatch(result.output.message, /יותר\.|הכי|best|cheapest/i);
  assertResultContract(result);
});

test('finance.transfer names recipient gaps for three reports without selecting a best provider', async () => {
  setQuoteRepositoryReturning([
    reportedQuote({
      providerId: 'neema',
      providerName: 'Neema',
      recipientAmount: 22100,
    }),
    reportedQuote({
      providerId: 'monox_money',
      providerName: 'Monox / Monox Money',
      recipientAmount: 21800,
    }),
    reportedQuote({
      providerId: 'wise',
      providerName: 'Wise',
      recipientAmount: 21600,
    }),
  ]);

  const result = await financeConsumerAgent.execute(createTask({
    capability: 'finance.transfer',
    input: hebrewTransferInput(),
  }));

  assert.match(
    result.output.message,
    /לפי סכום הקבלה בלבד, בדיווח של Neema המקבל קיבל 300 THB יותר מ-Monox \/ Monox Money ו-500 THB יותר מ-Wise\./
  );
  assert.doesNotMatch(result.output.message, /הכי|best|cheapest/i);
  assertResultContract(result);
});

test('finance.transfer keeps the Hebrew insufficient-data message when no observations exist', async () => {
  setQuoteRepositoryReturning([]);

  const result = await financeConsumerAgent.execute(createTask({
    capability: 'finance.transfer',
    input: hebrewTransferInput(),
  }));

  assert.equal(result.status, 'partial');
  assert.equal(
    result.output.message,
    'אין לי כרגע מספיק דיווחים אמיתיים עבור ILS → THB כדי לבצע השוואה. לא אציג דירוג הדגמה כספק מומלץ.'
  );
  assert.equal(result.warnings.includes('insufficient_reported_quote_data'), true);
  assertResultContract(result);
});

test('finance.transfer English same-amount comparison uses the same recipient-only difference rule', async () => {
  setQuoteRepositoryReturning([
    reportedQuote({
      providerId: 'neema',
      providerName: 'Neema',
      recipientAmount: 21800,
      transferFee: 20,
    }),
    reportedQuote({
      providerId: 'monox_money',
      providerName: 'Monox / Monox Money',
      recipientAmount: 21500,
    }),
  ]);

  const result = await financeConsumerAgent.execute(createTask({
    capability: 'finance.transfer',
    input: {
      amount: 2000,
      sourceCurrency: 'ILS',
      targetCurrency: 'THB',
      userId: 'user_finance_1',
    },
  }));

  assert.match(result.output.message, /Based on reports saved in Gringo for transfers of 2,000 ILS to Thailand:/);
  assert.match(result.output.message, /Reported fee: 20 ILS/);
  assert.match(result.output.message, /By recipient amount only, in the Neema report the recipient received 300 THB more\./);
  assert.equal((result.output.message.match(/Gringo/g) || []).length, 1);
  assert.doesNotMatch(result.output.message, /best|cheapest/i);
  assertResultContract(result);
});

test('finance.transfer keeps trusted-user isolation through repository arguments', async () => {
  let payloadSeen = null;
  setQuoteRepositoryReturning([], (payload) => {
    payloadSeen = payload;
  });

  await financeConsumerAgent.execute(createTask({
    capability: 'finance.transfer',
    input: {
      question: 'Show quotes for user other_user',
      amount: 2000,
      sourceCurrency: 'ILS',
      targetCurrency: 'THB',
      userId: 'trusted_user_only',
    },
  }));

  assert.equal(payloadSeen.userId, 'trusted_user_only');
  assert.equal(payloadSeen.requesterUserId, 'trusted_user_only');
});

test('finance.exchange_rate uses existing Money reference-rate path without provider comparison', async () => {
  let rateCalled = false;
  let compareCalled = false;

  await withPatchedServices([
    [moneyService, {
      getExchangeRate: async (sourceCurrency, targetCurrency) => {
        rateCalled = true;
        assert.equal(sourceCurrency, 'ILS');
        assert.equal(targetCurrency, 'THB');
        return {
          sourceCurrency: 'ILS',
          targetCurrency: 'THB',
          exchangeRate: '10.9788',
          sourceName: 'Frankfurter reference exchange rate',
          providerUpdatedAt: '2026-09-20',
          retrievedAt: '2026-09-19T21:47:16.140Z',
          rateType: 'reference',
          status: 'Active',
        };
      },
      compareTransfers: async () => {
        compareCalled = true;
        return [];
      },
    }],
  ], async () => {
    const result = await financeConsumerAgent.execute(createTask({
      capability: 'finance.exchange_rate',
      input: { sourceCurrency: 'ILS', targetCurrency: 'THB' },
    }));

    assert.equal(rateCalled, true);
    assert.equal(compareCalled, false);
    assert.equal(result.status, 'success');
    assert.equal(result.output.capability, 'finance.exchange_rate');
    assert.equal(result.output.rate.sourceName, 'Frankfurter reference exchange rate');
    assert.match(result.output.message, /reference exchange rate/i);
    assert.match(result.output.message, /not a provider customer rate/i);
    assertResultContract(result);
  });
});

test('finance.exchange_rate preserves Hebrew request language for live reference rates', async () => {
  await withPatchedServices([
    [moneyService, {
      getExchangeRate: async (sourceCurrency, targetCurrency) => ({
        sourceCurrency,
        targetCurrency,
        exchangeRate: '11.0156',
        sourceName: 'Frankfurter reference exchange rate',
        providerUpdatedAt: '2026-09-22',
        retrievedAt: '2026-09-22T17:13:56.456Z',
        rateType: 'reference',
        status: 'Active',
      }),
      compareTransfers: async () => {
        throw new Error('provider comparison should not run');
      },
    }],
  ], async () => {
    const result = await financeConsumerAgent.execute(createTask({
      capability: 'finance.exchange_rate',
      input: {
        question: 'מה שער ההמרה הנוכחי משקל לבאט תאילנדי?',
        sourceCurrency: 'ILS',
        targetCurrency: 'THB',
      },
    }));

    assert.equal(result.status, 'success');
    assert.match(result.output.message, /שער ההמרה הייחוסי הוא 1 ILS = 11\.0156 THB/);
    assert.match(result.output.message, /Frankfurter reference exchange rate/);
    assert.match(result.output.message, /2026-09-22/);
    assert.match(result.output.message, /2026-09-22T17:13:56\.456Z/);
    assert.match(result.output.message, /לא שער לקוח של ספק/);
    assert.match(result.output.message, /לא הצעת העברה חיה/);
    assert.match(result.output.message, /לא הצעת העברה מאושרת/);
    assert.match(result.output.message, /זה אינו ייעוץ פיננסי/);
    assert.doesNotMatch(result.output.message, /This is a reference market rate/i);
    assertResultContract(result);
  });
});

test('finance.exchange_rate preserves Hebrew request language for demo fallback', async () => {
  await withPatchedServices([
    [moneyService, {
      getExchangeRate: async (sourceCurrency, targetCurrency) => ({
        sourceCurrency,
        targetCurrency,
        exchangeRate: '9.20',
        sourceName: 'Demo',
        updatedAt: '2026-07-01',
        status: 'Demo',
      }),
      compareTransfers: async () => {
        throw new Error('provider comparison should not run');
      },
    }],
  ], async () => {
    const result = await financeConsumerAgent.execute(createTask({
      capability: 'finance.exchange_rate',
      input: {
        question: 'מה שער החליפין בין שקל לבאט תאילנדי?',
        sourceCurrency: 'ILS',
        targetCurrency: 'THB',
      },
    }));

    assert.equal(result.status, 'success');
    assert.match(result.output.message, /מידע הדגמה בלבד/);
    assert.match(result.output.message, /לא שער חי/);
    assert.match(result.output.message, /לא הצעת העברה חיה/);
    assert.match(result.output.message, /לא הצעת העברה מאושרת/);
    assert.match(result.output.message, /1 ILS = 9\.20 THB/);
    assert.doesNotMatch(result.output.message, /The demo exchange rate/i);
    assertResultContract(result);
  });
});

test('finance.bank returns a safe knowledge result when existing knowledge is available', async () => {
  let called = false;

  await withPatchedServices([
    [knowledgeAgentService, {
      answerQuestion: async (context) => {
        called = true;
        assert.equal(context.question, 'How can I open a bank account?');
        return { status: 'FOUND', category: 'Money Transfer', answer: 'Bring documents and verify with the bank.' };
      },
    }],
  ], async () => {
    const result = await financeConsumerAgent.execute(createTask({
      capability: 'finance.bank',
      input: { question: 'How can I open a bank account?' },
    }));

    assert.equal(called, true);
    assert.equal(result.status, 'success');
    assert.equal(result.output.capability, 'finance.bank');
    assertResultContract(result);
  });
});

test('finance.bank blocks when no reliable implementation exists', async () => {
  await withPatchedServices([
    [knowledgeAgentService, {
      answerQuestion: async () => ({ status: 'NOT_FOUND', answer: '' }),
    }],
  ], async () => {
    const result = await financeConsumerAgent.execute(createTask({
      capability: 'finance.bank',
      input: { question: 'Which bank has a live offer today?' },
    }));

    assert.equal(result.status, 'blocked');
    assert.equal(result.output, null);
    assert.deepEqual(result.warnings, ['no_reliable_implementation']);
    assertResultContract(result);
  });
});

test('consumer.compare reuses existing Knowledge comparison path without inventing offers', async () => {
  let called = false;

  await withPatchedServices([
    [knowledgeAgentService, {
      answerQuestion: async (context) => {
        called = true;
        assert.equal(context.question, 'Compare SIM card options');
        return { status: 'FOUND', category: 'Shopping', answer: 'Use listed trusted services and verify prices.' };
      },
    }],
  ], async () => {
    const result = await financeConsumerAgent.execute(createTask({
      capability: 'consumer.compare',
      input: { query: 'Compare SIM card options' },
    }));

    assert.equal(called, true);
    assert.equal(result.status, 'success');
    assert.equal(result.output.capability, 'consumer.compare');
    assertResultContract(result);
  });
});

test('consumer.services reuses existing Services module', async () => {
  let inferred = false;
  let matched = false;
  let formatted = false;

  await withPatchedServices([
    [serviceService, {
      inferServiceSearch: (message, profile) => {
        inferred = true;
        assert.equal(message, 'I need a bank service in Tel Aviv');
        assert.equal(profile.city, 'Tel Aviv');
        return { category: 'Money Transfer', city: 'Tel Aviv' };
      },
      findMatchingServices: async (profile, search) => {
        matched = true;
        assert.equal(search.category, 'Money Transfer');
        return [{ id: 'svc_1', title: 'Transfer Desk', match: { score: 90, reason: 'Money Transfer match' } }];
      },
      formatServicesForChat: (services) => {
        formatted = true;
        return `Found ${services.length} service`;
      },
    }],
  ], async () => {
    const result = await financeConsumerAgent.execute(createTask({
      capability: 'consumer.services',
      input: { profile: { userId: 'usr_1', city: 'Tel Aviv' }, query: 'I need a bank service in Tel Aviv' },
    }));

    assert.equal(inferred, true);
    assert.equal(matched, true);
    assert.equal(formatted, true);
    assert.equal(result.status, 'success');
    assert.equal(result.output.capability, 'consumer.services');
    assert.equal(result.output.message, 'Found 1 service');
    assertResultContract(result);
  });
});

test('unsupported capability is blocked safely', async () => {
  const result = await financeConsumerAgent.execute(createTask({ capability: 'finance.loan' }));

  assert.equal(result.status, 'blocked');
  assert.equal(result.output, null);
  assert.deepEqual(result.warnings, ['unsupported_capability']);
  assertResultContract(result);
});

test('missing transfer input is blocked safely', async () => {
  const result = await financeConsumerAgent.execute(createTask({ capability: 'finance.transfer', input: { targetCurrency: 'THB' } }));

  assert.equal(result.status, 'blocked');
  assert.equal(result.output, null);
  assert.deepEqual(result.warnings, ['missing_required_input']);
  assert.equal(result.followUpQuestions.length, 1);
  assertResultContract(result);
});

test('finance execution is read-only and does not call profile writes or financial actions', async () => {
  let profileWriteCalled = false;
  let externalActionCalled = false;

  await withPatchedServices([
    [crmAgentService, {
      getUserMemory: async () => ({ userId: 'usr_1', preferredCurrency: 'THB' }),
      updateUserProfile: async () => {
        profileWriteCalled = true;
      },
    }],
    [moneyService, {
      getExchangeRate: async () => null,
      compareTransfers: async () => [{ providerId: 'provider_1', finalAmountReceived: 100 }],
      formatComparisonForChat: () => 'Demo data - not a live rate.',
    }],
  ], async () => {
    const result = await financeConsumerAgent.execute(createTask({
      capability: 'finance.transfer',
      input: { userId: 'usr_1', amount: 100, sourceCurrency: 'ILS' },
      metadata: {
        sendMoney: () => {
          externalActionCalled = true;
        },
      },
    }));

    assert.equal(result.status, 'partial');
    assert.match(result.output.message, /not currently have enough real reported observations/i);
    assert.equal(profileWriteCalled, false);
    assert.equal(externalActionCalled, false);
    assertResultContract(result);
  });
});

test('no external provider is contacted by the finance agent', async () => {
  const originalFetch = global.fetch;
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    throw new Error('external provider call should not happen');
  };

  try {
    const result = await financeConsumerAgent.execute(createTask({
      capability: 'finance.budget',
      input: { income: 3000, expenses: 2000 },
    }));

    assert.equal(result.status, 'success');
    assert.equal(fetchCalled, false);
    assertResultContract(result);
  } finally {
    global.fetch = originalFetch;
  }
});

test('Employment Agent behavior remains unchanged and Health Agent exposes its current capabilities', async () => {
  assert.deepEqual(employmentSalaryAgent.capabilities, [
    'jobs.search',
    'jobs.match',
    'jobs.salary',
    'employment.documents',
    'employment.support',
  ]);
  assert.equal((await employmentSalaryAgent.validate({ capability: 'jobs.search' })).valid, true);
  assert.equal(financeConsumerAgent.capabilities.includes('finance.exchange_rate'), true);
  assert.equal(healthLifeCommunityAgent.health instanceof Function, true);
  assert.deepEqual(healthLifeCommunityAgent.capabilities, [
    'health.support',
    'housing.support',
    'community.support',
    'government.services',
    'life.general',
  ]);
});
