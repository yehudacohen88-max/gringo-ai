const test = require('node:test');
const assert = require('node:assert/strict');

const {
  USER_SUBMITTED_TRANSFER_QUOTE_FIELDS,
  createUserSubmittedTransferQuoteRepository,
} = require('../src/modules/money/user-submitted-transfer-quote.repository');
const {
  normalizeUserSubmittedMoneyTransferQuote,
} = require('../src/modules/money/user-submitted-money-transfer-quote');
const {
  createNormalizedProviderQuote,
} = require('../src/modules/money/money-transfer-provider-quote-contract');
const {
  createDemoTrust,
  createReferenceMarketRateTrust,
} = require('../src/modules/money/money-transfer-quote-source-trust');

function createQuote(overrides = {}) {
  const result = normalizeUserSubmittedMoneyTransferQuote({
    providerId: 'monox_money',
    sourceCurrency: 'ILS',
    targetCurrency: 'THB',
    sendAmount: '2000',
    transferFee: undefined,
    totalCustomerCost: undefined,
    customerExchangeRate: undefined,
    recipientAmount: '21500',
    deliveryMethod: undefined,
    providerQuoteTimestamp: '2026-09-23T09:00:00.000Z',
    userSubmittedAt: '2026-09-23T09:05:00.000Z',
    ...overrides,
  });

  assert.equal(result.ok, true);
  return result.quote;
}

function createRepository(overrides = {}) {
  let id = 0;
  let tick = 0;
  return createUserSubmittedTransferQuoteRepository({
    localRows: [],
    useLocalFallback: () => true,
    idGenerator: () => `stored_quote_${++id}`,
    now: () => `2026-09-23T10:00:0${++tick}.000Z`,
    ...overrides,
  });
}

test('save and retrieve a valid user-reported quote for the same user', async () => {
  const repository = createRepository();
  const quote = createQuote();

  const saved = await repository.saveUserSubmittedTransferQuote({
    userId: 'user_a',
    requesterUserId: 'user_a',
    quote,
  });
  const recent = await repository.findRecentUserSubmittedTransferQuotes({
    userId: 'user_a',
    requesterUserId: 'user_a',
    limit: 5,
  });

  assert.equal(saved.saved, true);
  assert.equal(saved.quote.storedQuoteId, 'stored_quote_1');
  assert.equal(saved.quote.userId, 'user_a');
  assert.equal(recent.ok, true);
  assert.equal(recent.quotes.length, 1);
  assert.equal(recent.quotes[0].storedQuoteId, 'stored_quote_1');
  assert.equal(recent.quotes[0].quote.providerId, 'monox_money');
});

test('User A cannot retrieve User B quotes and forged scope is rejected', async () => {
  const repository = createRepository();

  await repository.saveUserSubmittedTransferQuote({
    userId: 'user_b',
    requesterUserId: 'user_b',
    quote: createQuote(),
  });

  const userAQuotes = await repository.findRecentUserSubmittedTransferQuotes({
    userId: 'user_a',
    requesterUserId: 'user_a',
  });

  assert.deepEqual(userAQuotes.quotes, []);
  await assert.rejects(
    () => repository.findRecentUserSubmittedTransferQuotes({
      userId: 'user_b',
      requesterUserId: 'user_a',
    }),
    /not authorized/i
  );
  await assert.rejects(
    () => repository.saveUserSubmittedTransferQuote({
      userId: 'user_b',
      requesterUserId: 'user_a',
      quote: createQuote(),
    }),
    /not authorized/i
  );
});

test('missing identity fails closed', async () => {
  const repository = createRepository();

  await assert.rejects(
    () => repository.saveUserSubmittedTransferQuote({
      userId: '',
      requesterUserId: '',
      quote: createQuote(),
    }),
    /userId is required/i
  );
  await assert.rejects(
    () => repository.findRecentUserSubmittedTransferQuotes({
      userId: 'user_a',
      requesterUserId: '',
    }),
    /requesterUserId is required/i
  );
});

test('non-user-reported quotes are rejected', async () => {
  const repository = createRepository();
  const referenceQuote = createNormalizedProviderQuote({
    providerId: 'frankfurter',
    sourceCurrency: 'ILS',
    targetCurrency: 'THB',
    sendAmount: '2000',
    recipientAmount: '21800',
    sourceTrust: createReferenceMarketRateTrust({ providerId: 'frankfurter' }),
  });
  const demoQuote = createNormalizedProviderQuote({
    providerId: 'demo',
    sourceCurrency: 'ILS',
    targetCurrency: 'THB',
    sendAmount: '2000',
    recipientAmount: '21800',
    sourceTrust: createDemoTrust({ providerId: 'demo' }),
  });

  await assert.rejects(
    () => repository.saveUserSubmittedTransferQuote({
      userId: 'user_a',
      requesterUserId: 'user_a',
      quote: referenceQuote,
    }),
    /user-submitted quotes/i
  );
  await assert.rejects(
    () => repository.saveUserSubmittedTransferQuote({
      userId: 'user_a',
      requesterUserId: 'user_a',
      quote: demoQuote,
    }),
    /user-submitted quotes/i
  );
});

test('original source trust timestamps are preserved and savedAt is separate', async () => {
  const repository = createRepository();
  const quote = createQuote({
    providerQuoteTimestamp: '2026-09-23T08:30:00.000Z',
    userSubmittedAt: '2026-09-23T09:05:00.000Z',
  });

  await repository.saveUserSubmittedTransferQuote({
    userId: 'user_a',
    requesterUserId: 'user_a',
    quote,
  });
  const recent = await repository.findRecentUserSubmittedTransferQuotes({
    userId: 'user_a',
    requesterUserId: 'user_a',
  });
  const stored = recent.quotes[0];

  assert.equal(stored.savedAt, '2026-09-23T10:00:01.000Z');
  assert.equal(stored.quote.providerQuoteTimestamp, '2026-09-23T08:30:00.000Z');
  assert.equal(stored.quote.quoteRetrievedAt, '2026-09-23T09:05:00.000Z');
  assert.equal(stored.quote.sourceTrust.providerQuoteTimestamp, '2026-09-23T08:30:00.000Z');
  assert.equal(stored.quote.sourceTrust.userSubmittedAt, '2026-09-23T09:05:00.000Z');
  assert.equal(stored.quote.sourceTrust.freshnessStatus, 'unknown');
  assert.notEqual(stored.savedAt, stored.quote.providerQuoteTimestamp);
});

test('ambassador evidence metadata is stored and retrieved without changing source trust', async () => {
  const repository = createRepository();
  const quote = createQuote({
    providerId: 'monox_money',
    reporterType: 'ambassador',
    evidenceStatus: 'submitted',
    evidenceType: 'transfer_receipt',
    evidenceReference: 'evidence_test_001',
    observedAt: '2026-10-05T10:30:00Z',
  });

  await repository.saveUserSubmittedTransferQuote({
    userId: 'user_a',
    requesterUserId: 'user_a',
    quote,
  });
  const recent = await repository.findRecentUserSubmittedTransferQuotes({
    userId: 'user_a',
    requesterUserId: 'user_a',
  });
  const stored = recent.quotes[0];

  assert.equal(stored.reporterType, 'ambassador');
  assert.equal(stored.evidenceStatus, 'submitted');
  assert.equal(stored.evidenceType, 'transfer_receipt');
  assert.equal(stored.evidenceReference, 'evidence_test_001');
  assert.equal(stored.observedAt, '2026-10-05T10:30:00Z');
  assert.equal(stored.quote.reporterType, 'ambassador');
  assert.equal(stored.quote.evidenceStatus, 'submitted');
  assert.equal(stored.quote.evidenceType, 'transfer_receipt');
  assert.equal(stored.quote.evidenceReference, 'evidence_test_001');
  assert.equal(stored.quote.observedAt, '2026-10-05T10:30:00Z');
  assert.equal(stored.quote.sourceTrust.sourceType, 'user_submitted_quote');
  assert.equal(stored.quote.sourceTrust.verificationStatus, 'user_reported');
  assert.notEqual(stored.quote.availabilityStatus, 'available');
});

test('unknown fields remain unknown and are not promoted', async () => {
  const repository = createRepository();
  const quote = createQuote({
    transferFee: undefined,
    totalCustomerCost: undefined,
    customerExchangeRate: undefined,
    deliveryMethod: undefined,
  });

  await repository.saveUserSubmittedTransferQuote({
    userId: 'user_a',
    requesterUserId: 'user_a',
    quote,
  });
  const recent = await repository.findRecentUserSubmittedTransferQuotes({
    userId: 'user_a',
    requesterUserId: 'user_a',
  });
  const storedQuote = recent.quotes[0].quote;

  assert.equal(storedQuote.transferFee, null);
  assert.equal(storedQuote.totalCustomerCost, null);
  assert.equal(storedQuote.customerExchangeRate, null);
  assert.equal(storedQuote.deliveryMethod, 'unknown');
  assert.equal(storedQuote.sourceTrust.sourceType, 'user_submitted_quote');
  assert.equal(storedQuote.sourceTrust.verificationStatus, 'user_reported');
});

test('historical rows without evidence fields load with safe user provenance defaults', async () => {
  const legacyFields = USER_SUBMITTED_TRANSFER_QUOTE_FIELDS.filter((field) => ![
    'reporterType',
    'evidenceStatus',
    'evidenceType',
    'evidenceReference',
    'observedAt',
  ].includes(field));
  const row = legacyFields.map((field) => {
    const values = {
      storedQuoteId: 'stored_quote_legacy',
      userId: 'user_a',
      savedAt: '2026-09-23T10:00:01.000Z',
      providerId: 'monox_money',
      providerName: 'Monox / Monox Money',
      sourceCurrency: 'ILS',
      targetCurrency: 'THB',
      sendAmount: '2000',
      recipientAmount: '21500',
      deliveryMethod: 'unknown',
      sourceTrustJson: JSON.stringify({
        sourceType: 'user_submitted_quote',
        verificationStatus: 'user_reported',
        freshnessStatus: 'unknown',
      }),
      notesJson: JSON.stringify([]),
      quoteJson: JSON.stringify({
        providerId: 'monox_money',
        providerName: 'Monox / Monox Money',
        sourceCurrency: 'ILS',
        targetCurrency: 'THB',
        sendAmount: 2000,
        recipientAmount: 21500,
        sourceTrust: {
          sourceType: 'user_submitted_quote',
          verificationStatus: 'user_reported',
          freshnessStatus: 'unknown',
        },
      }),
    };
    return values[field] ?? '';
  });
  const repository = createRepository({
    useLocalFallback: () => false,
    sheetExists: async () => true,
    readRows: async () => [legacyFields, row],
  });

  const recent = await repository.findRecentUserSubmittedTransferQuotes({
    userId: 'user_a',
    requesterUserId: 'user_a',
  });
  const stored = recent.quotes[0];

  assert.equal(stored.reporterType, 'user');
  assert.equal(stored.evidenceStatus, 'none');
  assert.equal(stored.evidenceType, null);
  assert.equal(stored.evidenceReference, null);
  assert.equal(stored.observedAt, null);
  assert.equal(stored.quote.reporterType, 'user');
  assert.equal(stored.quote.evidenceStatus, 'none');
  assert.equal(stored.quote.evidenceType, null);
  assert.equal(stored.quote.evidenceReference, null);
  assert.equal(stored.quote.observedAt, null);
});

test('legacy rows load stored optional quote columns when quoteJson is incomplete', async () => {
  const row = USER_SUBMITTED_TRANSFER_QUOTE_FIELDS.map((field) => {
    const values = {
      storedQuoteId: 'stored_quote_legacy',
      userId: 'user_a',
      savedAt: '2026-09-23T10:00:01.000Z',
      providerId: 'neema',
      providerName: 'Neema',
      sourceCurrency: 'ILS',
      targetCurrency: 'THB',
      sendAmount: '2000',
      transferFee: '20',
      totalCustomerCost: '2020',
      customerExchangeRate: '10.9',
      recipientAmount: '21800',
      deliveryMethod: 'unknown',
      sourceTrustJson: JSON.stringify({
        sourceType: 'user_submitted_quote',
        verificationStatus: 'user_reported',
        freshnessStatus: 'unknown',
      }),
      notesJson: JSON.stringify([]),
      quoteJson: JSON.stringify({
        providerId: 'neema',
        providerName: 'Neema',
        sourceCurrency: 'ILS',
        targetCurrency: 'THB',
        sourceTrust: {
          sourceType: 'user_submitted_quote',
          verificationStatus: 'user_reported',
          freshnessStatus: 'unknown',
        },
      }),
    };
    return values[field] ?? '';
  });
  const repository = createRepository({
    useLocalFallback: () => false,
    sheetExists: async () => true,
    readRows: async () => [USER_SUBMITTED_TRANSFER_QUOTE_FIELDS, row],
  });

  const recent = await repository.findRecentUserSubmittedTransferQuotes({
    userId: 'user_a',
    requesterUserId: 'user_a',
  });

  assert.equal(recent.ok, true);
  assert.equal(recent.quotes.length, 1);
  assert.equal(recent.quotes[0].quote.sendAmount, 2000);
  assert.equal(recent.quotes[0].quote.transferFee, 20);
  assert.equal(recent.quotes[0].quote.totalCustomerCost, 2020);
  assert.equal(recent.quotes[0].quote.customerExchangeRate, 10.9);
  assert.equal(recent.quotes[0].quote.recipientAmount, 21800);
  assert.equal(recent.quotes[0].sourceTrust.verificationStatus, 'user_reported');
});

test('currency corridor filtering works', async () => {
  const repository = createRepository();

  await repository.saveUserSubmittedTransferQuote({
    userId: 'user_a',
    requesterUserId: 'user_a',
    quote: createQuote({ sourceCurrency: 'ILS', targetCurrency: 'THB' }),
  });
  await repository.saveUserSubmittedTransferQuote({
    userId: 'user_a',
    requesterUserId: 'user_a',
    quote: createQuote({ providerId: 'wise', sourceCurrency: 'USD', targetCurrency: 'PHP' }),
  });

  const filtered = await repository.findRecentUserSubmittedTransferQuotes({
    userId: 'user_a',
    requesterUserId: 'user_a',
    sourceCurrency: 'ILS',
    targetCurrency: 'THB',
  });

  assert.equal(filtered.quotes.length, 1);
  assert.equal(filtered.quotes[0].sourceCurrency, 'ILS');
  assert.equal(filtered.quotes[0].targetCurrency, 'THB');
});

test('provider filtering returns only quotes for the requested provider', async () => {
  const repository = createRepository();

  await repository.saveUserSubmittedTransferQuote({
    userId: 'user_a',
    requesterUserId: 'user_a',
    quote: createQuote({ providerId: 'monox_money', recipientAmount: '21500' }),
  });
  await repository.saveUserSubmittedTransferQuote({
    userId: 'user_a',
    requesterUserId: 'user_a',
    quote: createQuote({ providerId: 'neema', recipientAmount: '21800' }),
  });

  const filtered = await repository.findRecentUserSubmittedTransferQuotes({
    userId: 'user_a',
    requesterUserId: 'user_a',
    providerId: 'neema',
    limit: 5,
  });

  assert.equal(filtered.ok, true);
  assert.equal(filtered.quotes.length, 1);
  assert.equal(filtered.quotes[0].providerId, 'neema');
  assert.equal(filtered.quotes[0].quote.providerId, 'neema');
  assert.equal(filtered.quotes[0].quote.recipientAmount, 21800);
});

test('results are newest first with deterministic tie handling and bounded limit', async () => {
  const localRows = [];
  const repository = createUserSubmittedTransferQuoteRepository({
    localRows,
    useLocalFallback: () => true,
    idGenerator: (() => {
      const ids = ['stored_quote_1', 'stored_quote_2', 'stored_quote_3'];
      return () => ids.shift();
    })(),
    now: (() => {
      const times = [
        '2026-09-23T10:00:00.000Z',
        '2026-09-23T10:00:00.000Z',
        '2026-09-23T10:00:01.000Z',
      ];
      return () => times.shift();
    })(),
  });

  for (const providerId of ['monox_money', 'neema', 'gmt']) {
    await repository.saveUserSubmittedTransferQuote({
      userId: 'user_a',
      requesterUserId: 'user_a',
      quote: createQuote({ providerId }),
    });
  }

  const recent = await repository.findRecentUserSubmittedTransferQuotes({
    userId: 'user_a',
    requesterUserId: 'user_a',
    limit: 2,
  });

  assert.deepEqual(recent.quotes.map((quote) => quote.storedQuoteId), [
    'stored_quote_3',
    'stored_quote_2',
  ]);
});

test('persistence failure is surfaced without false success', async () => {
  const repository = createUserSubmittedTransferQuoteRepository({
    useLocalFallback: () => false,
    sheetExists: async () => true,
    appendRow: async () => {
      throw new Error('sheet unavailable');
    },
    idGenerator: () => 'stored_quote_1',
    now: () => '2026-09-23T10:00:00.000Z',
  });

  const result = await repository.saveUserSubmittedTransferQuote({
    userId: 'user_a',
    requesterUserId: 'user_a',
    quote: createQuote(),
  });

  assert.equal(result.saved, false);
  assert.match(result.error, /sheet unavailable/);
  assert.equal(result.quote, undefined);
});

test('missing Google Sheet is initialized with the quote header before first append', async () => {
  const calls = [];
  const repository = createUserSubmittedTransferQuoteRepository({
    useLocalFallback: () => false,
    sheetName: () => 'UserSubmittedTransferQuotes',
    sheetExists: async (sheetName) => {
      calls.push(['exists', sheetName]);
      return false;
    },
    ensureSheet: async (sheetName, headerRow) => {
      calls.push(['ensure', sheetName, headerRow]);
    },
    appendRow: async (sheetName, row) => {
      calls.push(['append', sheetName, row]);
    },
    idGenerator: () => 'stored_quote_1',
    now: () => '2026-09-23T10:00:00.000Z',
  });

  const result = await repository.saveUserSubmittedTransferQuote({
    userId: 'user_a',
    requesterUserId: 'user_a',
    quote: createQuote(),
  });

  assert.equal(result.saved, true);
  assert.deepEqual(calls[0], ['exists', 'UserSubmittedTransferQuotes']);
  assert.deepEqual(calls[1], ['ensure', 'UserSubmittedTransferQuotes', USER_SUBMITTED_TRANSFER_QUOTE_FIELDS]);
  assert.equal(calls[2][0], 'append');
  assert.equal(calls[2][1], 'UserSubmittedTransferQuotes');
});

test('existing Google Sheet is not recreated and subsequent appends reuse initialization', async () => {
  const calls = [];
  const repository = createUserSubmittedTransferQuoteRepository({
    useLocalFallback: () => false,
    sheetName: () => 'UserSubmittedTransferQuotes',
    sheetExists: async (sheetName) => {
      calls.push(['exists', sheetName]);
      return true;
    },
    ensureSheet: async (sheetName, headerRow) => {
      calls.push(['ensure', sheetName, headerRow]);
    },
    appendRow: async (sheetName, row) => {
      calls.push(['append', sheetName, row]);
    },
    idGenerator: (() => {
      const ids = ['stored_quote_1', 'stored_quote_2'];
      return () => ids.shift();
    })(),
    now: (() => {
      const times = ['2026-09-23T10:00:00.000Z', '2026-09-23T10:00:01.000Z'];
      return () => times.shift();
    })(),
  });

  await repository.saveUserSubmittedTransferQuote({
    userId: 'user_a',
    requesterUserId: 'user_a',
    quote: createQuote(),
  });
  await repository.saveUserSubmittedTransferQuote({
    userId: 'user_a',
    requesterUserId: 'user_a',
    quote: createQuote({ providerId: 'neema' }),
  });

  assert.equal(calls.filter((call) => call[0] === 'exists').length, 1);
  assert.equal(calls.filter((call) => call[0] === 'ensure').length, 0);
  assert.equal(calls.filter((call) => call[0] === 'append').length, 2);
});

test('retrieval initializes a missing Google Sheet and returns empty history', async () => {
  const calls = [];
  const repository = createUserSubmittedTransferQuoteRepository({
    useLocalFallback: () => false,
    sheetName: () => 'UserSubmittedTransferQuotes',
    sheetExists: async (sheetName) => {
      calls.push(['exists', sheetName]);
      return false;
    },
    ensureSheet: async (sheetName, headerRow) => {
      calls.push(['ensure', sheetName, headerRow]);
    },
    readRows: async (sheetName) => {
      calls.push(['read', sheetName]);
      return [USER_SUBMITTED_TRANSFER_QUOTE_FIELDS];
    },
  });

  const result = await repository.findRecentUserSubmittedTransferQuotes({
    userId: 'user_a',
    requesterUserId: 'user_a',
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.quotes, []);
  assert.deepEqual(calls[1], ['ensure', 'UserSubmittedTransferQuotes', USER_SUBMITTED_TRANSFER_QUOTE_FIELDS]);
  assert.deepEqual(calls[2], ['read', 'UserSubmittedTransferQuotes']);
});
