const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AVAILABILITY_STATUSES,
  DELIVERY_METHODS,
  createNormalizedProviderQuote,
  isProviderQuoteAvailable,
} = require('../src/modules/money/money-transfer-provider-quote-contract');
const {
  createDemoTrust,
  createQuoteSourceTrust,
  createReferenceMarketRateTrust,
  isDemo,
  isUserReported,
} = require('../src/modules/money/money-transfer-quote-source-trust');

test('complete provider quote normalizes correctly', () => {
  const sourceTrust = createQuoteSourceTrust({
    sourceType: 'live_provider_quote',
    providerId: 'provider_1',
    retrievedAt: '2026-09-22T10:00:00.000Z',
    providerQuoteTimestamp: '2026-09-22T09:59:00.000Z',
    freshnessStatus: 'fresh',
  });

  const quote = createNormalizedProviderQuote({
    quoteId: 'quote_1',
    providerId: 'provider_1',
    providerName: 'Provider One',
    sourceCurrency: 'ils',
    targetCurrency: 'thb',
    sendAmount: '2000',
    transferFee: '25.5',
    totalCustomerCost: '2025.5',
    customerExchangeRate: '9.12',
    recipientAmount: '18240',
    deliveryMethod: 'bank_account',
    estimatedDelivery: 'same day',
    quoteRetrievedAt: '2026-09-22T10:00:00.000Z',
    providerQuoteTimestamp: '2026-09-22T09:59:00.000Z',
    providerQuoteExpiresAt: '2026-09-22T10:15:00.000Z',
    sourceTrust,
    availabilityStatus: 'available',
    notes: 'Provider supplied all fields.',
  });

  assert.deepEqual(quote, {
    quoteId: 'quote_1',
    providerId: 'provider_1',
    providerName: 'Provider One',
    sourceCurrency: 'ILS',
    targetCurrency: 'THB',
    sendAmount: 2000,
    transferFee: 25.5,
    totalCustomerCost: 2025.5,
    customerExchangeRate: 9.12,
    recipientAmount: 18240,
    deliveryMethod: 'bank_account',
    estimatedDelivery: 'same day',
    quoteRetrievedAt: '2026-09-22T10:00:00.000Z',
    providerQuoteTimestamp: '2026-09-22T09:59:00.000Z',
    providerQuoteExpiresAt: '2026-09-22T10:15:00.000Z',
    reporterType: 'user',
    evidenceStatus: 'none',
    evidenceType: null,
    evidenceReference: null,
    observedAt: null,
    sourceTrust,
    availabilityStatus: 'available',
    notes: ['Provider supplied all fields.'],
  });
  assert.equal(isProviderQuoteAvailable(quote), true);
});

test('missing transferFee remains null and is not assumed zero', () => {
  const quote = createNormalizedProviderQuote({
    sourceTrust: { sourceType: 'live_provider_quote' },
    sendAmount: '1000',
  });

  assert.equal(quote.transferFee, null);
});

test('missing recipientAmount remains null and is not calculated', () => {
  const quote = createNormalizedProviderQuote({
    sourceTrust: { sourceType: 'live_provider_quote' },
    sendAmount: '1000',
    transferFee: '10',
    customerExchangeRate: '9',
  });

  assert.equal(quote.recipientAmount, null);
});

test('missing customerExchangeRate remains null', () => {
  const quote = createNormalizedProviderQuote({
    sourceTrust: { sourceType: 'live_provider_quote' },
    recipientAmount: '9000',
  });

  assert.equal(quote.customerExchangeRate, null);
});

test('missing totalCustomerCost remains null and is not derived from send amount plus fee', () => {
  const quote = createNormalizedProviderQuote({
    sourceTrust: { sourceType: 'live_provider_quote' },
    sendAmount: '1000',
    transferFee: '25',
  });

  assert.equal(quote.totalCustomerCost, null);
});

test('missing delivery method becomes unknown and missing delivery estimate remains null', () => {
  const quote = createNormalizedProviderQuote({
    sourceTrust: { sourceType: 'live_provider_quote' },
    deliveryMethod: '',
  });

  assert.equal(quote.deliveryMethod, 'unknown');
  assert.equal(quote.estimatedDelivery, null);
});

test('provider timestamps are preserved', () => {
  const quote = createNormalizedProviderQuote({
    sourceTrust: { sourceType: 'public_provider_quote' },
    quoteRetrievedAt: '2026-09-22T10:00:00.000Z',
    providerQuoteTimestamp: '2026-09-22T09:30:00.000Z',
    providerQuoteExpiresAt: '2026-09-22T10:30:00.000Z',
  });

  assert.equal(quote.quoteRetrievedAt, '2026-09-22T10:00:00.000Z');
  assert.equal(quote.providerQuoteTimestamp, '2026-09-22T09:30:00.000Z');
  assert.equal(quote.providerQuoteExpiresAt, '2026-09-22T10:30:00.000Z');
});

test('source trust object is preserved through normalization', () => {
  const sourceTrust = createQuoteSourceTrust({
    sourceType: 'public_provider_quote',
    providerId: 'provider_public',
    retrievedAt: '2026-09-22T10:00:00.000Z',
    freshnessStatus: 'unknown',
  });

  const quote = createNormalizedProviderQuote({ sourceTrust });

  assert.deepEqual(quote.sourceTrust, sourceTrust);
});

test('user_submitted_quote remains user-reported', () => {
  const quote = createNormalizedProviderQuote({
    sourceTrust: {
      sourceType: 'user_submitted_quote',
      providerId: 'provider_user',
      userSubmittedAt: '2026-09-22T10:00:00.000Z',
    },
    customerExchangeRate: '9.1',
  });

  assert.equal(quote.sourceTrust.sourceType, 'user_submitted_quote');
  assert.equal(quote.sourceTrust.verificationStatus, 'user_reported');
  assert.equal(isUserReported(quote.sourceTrust), true);
  assert.equal(quote.customerExchangeRate, 9.1);
});

test('demo remains demo', () => {
  const quote = createNormalizedProviderQuote({
    sourceTrust: createDemoTrust({ providerId: 'provider_demo' }),
    transferFee: '10',
  });

  assert.equal(quote.sourceTrust.sourceType, 'demo');
  assert.equal(quote.sourceTrust.verificationStatus, 'demo');
  assert.equal(isDemo(quote.sourceTrust), true);
});

test('reference_market_rate cannot silently become a provider quote', () => {
  const quote = createNormalizedProviderQuote({
    providerId: 'frankfurter',
    sourceTrust: createReferenceMarketRateTrust({
      providerId: 'frankfurter',
      retrievedAt: '2026-09-22T10:00:00.000Z',
      providerQuoteTimestamp: '2026-09-22',
    }),
    availabilityStatus: 'available',
    customerExchangeRate: '10.25',
    transferFee: '0',
    recipientAmount: '10250',
  });

  assert.equal(quote.sourceTrust.sourceType, 'reference_market_rate');
  assert.equal(quote.availabilityStatus, 'unavailable');
  assert.equal(quote.customerExchangeRate, null);
  assert.equal(quote.transferFee, null);
  assert.equal(quote.recipientAmount, null);
  assert.equal(isProviderQuoteAvailable(quote), false);
});

test('official_public_information cannot silently become a provider transaction quote', () => {
  const quote = createNormalizedProviderQuote({
    providerId: 'provider_information',
    sourceTrust: { sourceType: 'official_public_information', providerId: 'provider_information' },
    availabilityStatus: 'available',
    customerExchangeRate: '9.5',
  });

  assert.equal(quote.sourceTrust.sourceType, 'official_public_information');
  assert.equal(quote.availabilityStatus, 'unavailable');
  assert.equal(quote.customerExchangeRate, null);
  assert.equal(isProviderQuoteAvailable(quote), false);
});

test('Frankfurter rate is not copied into customerExchangeRate', () => {
  const frankfurterRate = {
    sourceCurrency: 'ILS',
    targetCurrency: 'THB',
    exchangeRate: 10.25,
    sourceName: 'Frankfurter reference exchange rate',
    rateType: 'reference',
  };

  const quote = createNormalizedProviderQuote({
    providerId: 'frankfurter',
    sourceCurrency: frankfurterRate.sourceCurrency,
    targetCurrency: frankfurterRate.targetCurrency,
    customerExchangeRate: frankfurterRate.exchangeRate,
    sourceTrust: { sourceType: 'reference_market_rate', providerId: 'frankfurter' },
  });

  assert.equal(quote.customerExchangeRate, null);
});

test('generic currencies work without hard-coded corridors', () => {
  const quote = createNormalizedProviderQuote({
    sourceCurrency: 'usd',
    targetCurrency: 'php',
    sendAmount: '150',
    sourceTrust: { sourceType: 'live_provider_quote', providerId: 'provider_generic' },
  });

  assert.equal(quote.sourceCurrency, 'USD');
  assert.equal(quote.targetCurrency, 'PHP');
  assert.equal(quote.sendAmount, 150);
});

test('no ranking savings or best-provider fields are performed or returned', () => {
  const quote = createNormalizedProviderQuote({
    sourceTrust: { sourceType: 'live_provider_quote' },
    rank: 1,
    bestProvider: true,
    savingsVsOtherProvider: 42,
  });

  assert.equal(Object.prototype.hasOwnProperty.call(quote, 'rank'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(quote, 'bestProvider'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(quote, 'savingsVsOtherProvider'), false);
});

test('allowed delivery methods and availability statuses are explicit', () => {
  assert.deepEqual(DELIVERY_METHODS, ['bank_account', 'cash_pickup', 'card', 'wallet', 'unknown']);
  assert.deepEqual(AVAILABILITY_STATUSES, ['available', 'unavailable', 'unknown', 'expired']);
});
