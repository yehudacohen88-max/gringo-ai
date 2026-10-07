const test = require('node:test');
const assert = require('node:assert/strict');

const {
  REMITLY_PUBLIC_SOURCE_URL,
  REMITLY_REWIRE_PROVIDER_ID,
  normalizeRemitlyPublicQuote,
} = require('../src/modules/money/remitly-public-quote.adapter');
const { findProviderById } = require('../src/modules/money/money-transfer-provider-registry');

function createVerifiedFixture(overrides = {}) {
  return {
    sourceCurrency: 'ILS',
    targetCurrency: 'THB',
    exchangeRate: '10.8765',
    rateLabel: 'Welcome rate',
    fee: '-',
    deliveryMethods: ['Bank deposit', 'Cash pickup'],
    ...overrides,
  };
}

test('Remitly/Rewire resolves to one existing provider identity', () => {
  const provider = findProviderById(REMITLY_REWIRE_PROVIDER_ID);

  assert.equal(REMITLY_REWIRE_PROVIDER_ID, 'remitly_rewire');
  assert.equal(provider.providerId, 'remitly_rewire');
  assert.match(provider.providerName, /Remitly \/ Rewire/i);
});

test('verified public Remitly ILS to THB data normalizes into one quote', () => {
  const result = normalizeRemitlyPublicQuote(createVerifiedFixture(), {
    retrievedAt: '2026-09-22T10:00:00.000Z',
  });

  assert.equal(result.ok, true);
  assert.equal(result.sourceUrl, REMITLY_PUBLIC_SOURCE_URL);
  assert.equal(result.quote.providerId, 'remitly_rewire');
  assert.equal(result.quote.providerName, 'Remitly');
  assert.equal(result.quote.sourceCurrency, 'ILS');
  assert.equal(result.quote.targetCurrency, 'THB');
  assert.equal(result.quote.customerExchangeRate, 10.8765);
  assert.equal(result.quote.sourceTrust.sourceType, 'public_provider_quote');
  assert.equal(result.quote.sourceTrust.verificationStatus, 'verified_source');
  assert.equal(result.quote.sourceTrust.retrievedAt, '2026-09-22T10:00:00.000Z');
  assert.equal(result.quote.availabilityStatus, 'available');
});

test('Remitly public quote is not classified as live_provider_quote', () => {
  const result = normalizeRemitlyPublicQuote(createVerifiedFixture());

  assert.notEqual(result.quote.sourceTrust.sourceType, 'live_provider_quote');
});

test('Welcome promotional rate status is preserved in adapter metadata and notes', () => {
  const result = normalizeRemitlyPublicQuote(createVerifiedFixture());

  assert.equal(result.isPromotionalRate, true);
  assert.match(result.quote.notes.join(' '), /Welcome rate/i);
  assert.match(result.quote.notes.join(' '), /Promotional\/welcome rate/i);
  assert.match(result.quote.notes.join(' '), /not treat as a standard general customer rate/i);
});

test('missing fee remains null and dash fee is not blindly converted to zero', () => {
  const missingFee = normalizeRemitlyPublicQuote(createVerifiedFixture({ fee: undefined }));
  const dashFee = normalizeRemitlyPublicQuote(createVerifiedFixture({ fee: '-' }));

  assert.equal(missingFee.quote.transferFee, null);
  assert.equal(dashFee.quote.transferFee, null);
  assert.notEqual(dashFee.quote.transferFee, 0);
  assert.match(dashFee.quote.notes.join(' '), /fee was ambiguous/i);
});

test('missing total recipient and send amount remain null and are not invented', () => {
  const result = normalizeRemitlyPublicQuote(createVerifiedFixture());

  assert.equal(result.quote.totalCustomerCost, null);
  assert.equal(result.quote.recipientAmount, null);
  assert.equal(result.quote.sendAmount, null);
});

test('explicit source-provided amount fields are preserved without extrapolating unrelated amounts', () => {
  const result = normalizeRemitlyPublicQuote(createVerifiedFixture({
    sendAmount: '500',
    recipientAmount: '5438.25',
    total: '500',
  }));

  assert.equal(result.quote.sendAmount, 500);
  assert.equal(result.quote.recipientAmount, 5438.25);
  assert.equal(result.quote.totalCustomerCost, 500);
});

test('bank deposit and cash pickup support can be represented without inventing delivery time', () => {
  const result = normalizeRemitlyPublicQuote(createVerifiedFixture());

  assert.deepEqual(result.deliveryMethods, ['bank_account', 'cash_pickup']);
  assert.match(result.quote.notes.join(' '), /bank_account/);
  assert.match(result.quote.notes.join(' '), /cash_pickup/);
  assert.equal(result.quote.deliveryMethod, 'unknown');
  assert.equal(result.quote.estimatedDelivery, null);
});

test('single delivery method can populate the normalized deliveryMethod field', () => {
  const result = normalizeRemitlyPublicQuote(createVerifiedFixture({ deliveryMethods: ['Bank deposit'] }));

  assert.deepEqual(result.deliveryMethods, ['bank_account']);
  assert.equal(result.quote.deliveryMethod, 'bank_account');
});

test('Frankfurter is never used to fill missing Remitly data', () => {
  const result = normalizeRemitlyPublicQuote(createVerifiedFixture({
    exchangeRate: 10.25,
    sourceName: 'Frankfurter reference exchange rate',
    rateType: 'reference',
  }));

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, 'reference_rate_not_provider_quote');
  assert.equal(result.quote.customerExchangeRate, null);
  assert.equal(result.quote.sourceTrust.sourceType, 'unavailable');
});

test('demo data is never used to fill missing Remitly data', () => {
  const result = normalizeRemitlyPublicQuote(createVerifiedFixture({
    exchangeRate: '9.20',
    sourceName: 'Demo data - not a live rate.',
    sourceType: 'demo',
  }));

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, 'demo_data_not_provider_quote');
  assert.equal(result.quote.customerExchangeRate, null);
  assert.equal(result.quote.sourceTrust.sourceType, 'unavailable');
});

test('unexpected source structure fails safely', () => {
  const result = normalizeRemitlyPublicQuote({ unexpected: true }, {
    retrievedAt: '2026-09-22T10:00:00.000Z',
  });

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, 'unsupported_corridor');
  assert.equal(result.quote.availabilityStatus, 'unavailable');
  assert.match(result.quote.notes.join(' '), /No Frankfurter, demo, cached, estimated, login-only, CAPTCHA, or anti-bot bypass data was used/i);
});

test('missing rate fails safely', () => {
  const result = normalizeRemitlyPublicQuote(createVerifiedFixture({ exchangeRate: undefined }));

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, 'missing_or_invalid_rate');
  assert.equal(result.quote.customerExchangeRate, null);
  assert.equal(result.quote.recipientAmount, null);
});

test('invalid rate fails safely', () => {
  const result = normalizeRemitlyPublicQuote(createVerifiedFixture({ exchangeRate: 'not a rate' }));

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, 'missing_or_invalid_rate');
});

test('no login CAPTCHA or anti-bot bypass exists in the adapter', () => {
  const originalFetch = global.fetch;
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    throw new Error('network access should not be used by the foundation adapter');
  };

  try {
    const result = normalizeRemitlyPublicQuote(createVerifiedFixture());

    assert.equal(result.ok, true);
    assert.equal(fetchCalled, false);
  } finally {
    global.fetch = originalFetch;
  }
});
