const test = require('node:test');
const assert = require('node:assert/strict');

const {
  compareUserSubmittedTransferQuotes,
} = require('../src/modules/money/user-submitted-transfer-quote-comparison');
const {
  createNormalizedProviderQuote,
} = require('../src/modules/money/money-transfer-provider-quote-contract');
const {
  createDemoTrust,
  createReferenceMarketRateTrust,
} = require('../src/modules/money/money-transfer-quote-source-trust');
const {
  normalizeUserSubmittedMoneyTransferQuote,
} = require('../src/modules/money/user-submitted-money-transfer-quote');

function createUserQuote(overrides = {}) {
  const result = normalizeUserSubmittedMoneyTransferQuote({
    providerId: 'monox_money',
    sourceCurrency: 'ILS',
    targetCurrency: 'THB',
    sendAmount: '2000',
    transferFee: undefined,
    totalCustomerCost: undefined,
    customerExchangeRate: undefined,
    recipientAmount: '21500',
    deliveryMethod: 'bank_account',
    providerQuoteTimestamp: '2026-09-23T09:00:00.000Z',
    userSubmittedAt: '2026-09-23T09:05:00.000Z',
    ...overrides,
  });

  assert.equal(result.ok, true);
  return result.quote;
}

test('matching user-submitted quotes calculate recipient difference without ranking providers', () => {
  const monox = createUserQuote({
    providerId: 'monox_money',
    recipientAmount: '21500',
  });
  const neema = createUserQuote({
    providerId: 'neema',
    recipientAmount: '21800',
  });

  const comparison = compareUserSubmittedTransferQuotes(monox, neema);

  assert.equal(comparison.comparisonStatus, 'comparable');
  assert.equal(comparison.sourceCurrency, 'ILS');
  assert.equal(comparison.targetCurrency, 'THB');
  assert.equal(comparison.sendAmount, 2000);
  assert.equal(comparison.recipientAmountA, 21500);
  assert.equal(comparison.recipientAmountB, 21800);
  assert.equal(comparison.recipientAmountDifference, 300);
  assert.equal(comparison.providerA.providerId, 'monox_money');
  assert.equal(comparison.providerB.providerId, 'neema');
  assert.equal(comparison.providerA.verificationStatus, 'user_reported');
  assert.equal(comparison.providerB.verificationStatus, 'user_reported');
  assert.equal(Object.hasOwn(comparison, 'bestProvider'), false);
  assert.equal(Object.hasOwn(comparison, 'ranking'), false);
  assert.equal(Object.hasOwn(comparison, 'savingsIls'), false);
});

test('different currencies are incompatible', () => {
  const comparison = compareUserSubmittedTransferQuotes(
    createUserQuote({ targetCurrency: 'THB' }),
    createUserQuote({ targetCurrency: 'PHP' })
  );

  assert.equal(comparison.comparisonStatus, 'incompatible');
  assert.match(comparison.limitations.join(' '), /currency corridors/i);
});

test('different send amounts are incompatible', () => {
  const comparison = compareUserSubmittedTransferQuotes(
    createUserQuote({ sendAmount: '2000' }),
    createUserQuote({ sendAmount: '2500' })
  );

  assert.equal(comparison.comparisonStatus, 'incompatible');
  assert.match(comparison.limitations.join(' '), /send amounts/i);
});

test('missing recipient amount prevents numeric comparison', () => {
  const comparison = compareUserSubmittedTransferQuotes(
    createUserQuote({ recipientAmount: undefined }),
    createUserQuote({ recipientAmount: '21800' })
  );

  assert.equal(comparison.comparisonStatus, 'insufficient_data');
  assert.equal(comparison.recipientAmountA, null);
  assert.equal(comparison.recipientAmountB, 21800);
  assert.equal(comparison.recipientAmountDifference, null);
  assert.match(comparison.limitations.join(' '), /recipient amount difference cannot be calculated/i);
});

test('missing fee is not treated as zero and explicit zero fee is preserved', () => {
  const missingFee = createUserQuote({ transferFee: undefined });
  const zeroFee = createUserQuote({ providerId: 'neema', transferFee: '0', recipientAmount: '21800' });
  const comparison = compareUserSubmittedTransferQuotes(missingFee, zeroFee);

  assert.equal(comparison.feeKnownA, false);
  assert.equal(comparison.feeKnownB, true);
  assert.equal(zeroFee.transferFee, 0);
  assert.match(comparison.limitations.join(' '), /missing fees are not treated as zero/i);
});

test('unknown total cost prevents total-cost equivalence claims', () => {
  const comparison = compareUserSubmittedTransferQuotes(
    createUserQuote({ totalCustomerCost: undefined }),
    createUserQuote({ providerId: 'neema', recipientAmount: '21800', totalCustomerCost: undefined })
  );

  assert.equal(comparison.totalCostKnownA, false);
  assert.equal(comparison.totalCostKnownB, false);
  assert.match(comparison.limitations.join(' '), /Total customer cost equivalence is not established/i);
});

test('unknown delivery method produces conditional comparison', () => {
  const comparison = compareUserSubmittedTransferQuotes(
    createUserQuote({ deliveryMethod: undefined }),
    createUserQuote({ providerId: 'neema', recipientAmount: '21800', deliveryMethod: 'bank_account' })
  );

  assert.equal(comparison.comparisonStatus, 'conditional');
  assert.equal(comparison.deliveryMethodMatch, null);
  assert.match(comparison.limitations.join(' '), /Delivery method equivalence is not established/i);
});

test('different known delivery methods are flagged', () => {
  const comparison = compareUserSubmittedTransferQuotes(
    createUserQuote({ deliveryMethod: 'bank_account' }),
    createUserQuote({ providerId: 'neema', recipientAmount: '21800', deliveryMethod: 'cash_pickup' })
  );

  assert.equal(comparison.comparisonStatus, 'conditional');
  assert.equal(comparison.deliveryMethodMatch, false);
  assert.match(comparison.limitations.join(' '), /Delivery methods differ/i);
});

test('user-reported source trust and timestamps are preserved', () => {
  const comparison = compareUserSubmittedTransferQuotes(
    createUserQuote({ providerQuoteTimestamp: undefined, userSubmittedAt: '2026-09-23T09:05:00.000Z' }),
    createUserQuote({ providerId: 'neema', recipientAmount: '21800', userSubmittedAt: '2026-09-23T09:10:00.000Z' })
  );

  assert.equal(comparison.providerA.sourceType, 'user_submitted_quote');
  assert.equal(comparison.providerA.verificationStatus, 'user_reported');
  assert.equal(comparison.providerA.freshnessStatus, 'unknown');
  assert.equal(comparison.providerA.userSubmittedAt, '2026-09-23T09:05:00.000Z');
  assert.equal(comparison.providerB.userSubmittedAt, '2026-09-23T09:10:00.000Z');
  assert.match(comparison.freshnessWarning, /freshness is unknown/i);
  assert.match(comparison.limitations.join(' '), /not verified current provider offers/i);
});

test('reference-market rates cannot enter as provider quotes', () => {
  const referenceRate = createNormalizedProviderQuote({
    providerId: 'frankfurter',
    sourceCurrency: 'ILS',
    targetCurrency: 'THB',
    sendAmount: '2000',
    recipientAmount: '21800',
    sourceTrust: createReferenceMarketRateTrust({ providerId: 'frankfurter' }),
  });

  const comparison = compareUserSubmittedTransferQuotes(createUserQuote(), referenceRate);

  assert.equal(comparison.comparisonStatus, 'incompatible');
  assert.match(comparison.limitations.join(' '), /user-submitted quotes/i);
});

test('demo data cannot enter as user-reported quotes', () => {
  const demoQuote = createNormalizedProviderQuote({
    providerId: 'demo_provider',
    sourceCurrency: 'ILS',
    targetCurrency: 'THB',
    sendAmount: '2000',
    recipientAmount: '21800',
    sourceTrust: createDemoTrust({ providerId: 'demo_provider' }),
  });

  const comparison = compareUserSubmittedTransferQuotes(createUserQuote(), demoQuote);

  assert.equal(comparison.comparisonStatus, 'incompatible');
  assert.match(comparison.limitations.join(' '), /user-reported verification status/i);
});

