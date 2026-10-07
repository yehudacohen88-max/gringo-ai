const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeUserSubmittedMoneyTransferQuote,
  validateUserSubmittedQuoteInput,
} = require('../src/modules/money/user-submitted-money-transfer-quote');
const { listProviderRegistry } = require('../src/modules/money/money-transfer-provider-registry');

function createValidInput(overrides = {}) {
  return {
    providerId: 'remitly_rewire',
    sourceCurrency: 'ILS',
    targetCurrency: 'THB',
    sendAmount: '2000',
    transferFee: '12',
    totalCustomerCost: '2012',
    customerExchangeRate: '10.75',
    recipientAmount: '21500',
    deliveryMethod: 'bank_account',
    estimatedDelivery: 'same day shown by user',
    providerQuoteTimestamp: '2026-09-23T09:00:00.000Z',
    userSubmittedAt: '2026-09-23T09:05:00.000Z',
    ...overrides,
  };
}

test('valid manually supplied quote normalizes through the existing contract', () => {
  const result = normalizeUserSubmittedMoneyTransferQuote(createValidInput());

  assert.equal(result.ok, true);
  assert.equal(result.providerKnown, true);
  assert.equal(result.quote.providerId, 'remitly_rewire');
  assert.equal(result.quote.providerName, 'Remitly / Rewire');
  assert.equal(result.quote.sourceCurrency, 'ILS');
  assert.equal(result.quote.targetCurrency, 'THB');
  assert.equal(result.quote.sendAmount, 2000);
  assert.equal(result.quote.transferFee, 12);
  assert.equal(result.quote.totalCustomerCost, 2012);
  assert.equal(result.quote.customerExchangeRate, 10.75);
  assert.equal(result.quote.recipientAmount, 21500);
  assert.equal(result.quote.deliveryMethod, 'bank_account');
  assert.equal(result.quote.estimatedDelivery, 'same day shown by user');
  assert.equal(result.quote.reporterType, 'user');
  assert.equal(result.quote.evidenceStatus, 'none');
  assert.equal(result.quote.evidenceType, null);
  assert.equal(result.quote.evidenceReference, null);
  assert.equal(result.quote.observedAt, null);
});

test('source type is user_submitted_quote and verification remains user_reported', () => {
  const result = normalizeUserSubmittedMoneyTransferQuote(createValidInput());

  assert.equal(result.quote.sourceTrust.sourceType, 'user_submitted_quote');
  assert.equal(result.quote.sourceTrust.verificationStatus, 'user_reported');
  assert.equal(result.quote.sourceTrust.freshnessStatus, 'unknown');
  assert.notEqual(result.quote.sourceTrust.sourceType, 'live_provider_quote');
  assert.notEqual(result.quote.sourceTrust.sourceType, 'public_provider_quote');
  assert.notEqual(result.quote.sourceTrust.verificationStatus, 'verified_source');
});

test('ambassador evidence-backed quote preserves evidence metadata without becoming verified live or official', () => {
  const result = normalizeUserSubmittedMoneyTransferQuote(createValidInput({
    providerId: 'monox_money',
    reporterType: 'ambassador',
    evidenceStatus: 'submitted',
    evidenceType: 'transfer_receipt',
    evidenceReference: 'evidence_test_001',
    observedAt: '2026-10-05T10:30:00Z',
  }));

  assert.equal(result.ok, true);
  assert.equal(result.quote.reporterType, 'ambassador');
  assert.equal(result.quote.evidenceStatus, 'submitted');
  assert.equal(result.quote.evidenceType, 'transfer_receipt');
  assert.equal(result.quote.evidenceReference, 'evidence_test_001');
  assert.equal(result.quote.observedAt, '2026-10-05T10:30:00Z');
  assert.equal(result.quote.sourceTrust.sourceType, 'user_submitted_quote');
  assert.equal(result.quote.sourceTrust.verificationStatus, 'user_reported');
  assert.equal(result.quote.availabilityStatus, 'unknown');
  assert.notEqual(result.quote.sourceTrust.verificationStatus, 'verified_source');
  assert.notEqual(result.quote.availabilityStatus, 'available');
  assert.equal(result.quote.notes.some((note) => /does not mean provider verification/i.test(note)), true);
});

test('missing optional monetary fields remain null and supplied fields distinguish omissions', () => {
  const result = normalizeUserSubmittedMoneyTransferQuote(createValidInput({
    transferFee: undefined,
    totalCustomerCost: undefined,
    customerExchangeRate: undefined,
    recipientAmount: undefined,
  }));

  assert.equal(result.quote.transferFee, null);
  assert.equal(result.quote.totalCustomerCost, null);
  assert.equal(result.quote.customerExchangeRate, null);
  assert.equal(result.quote.recipientAmount, null);
  assert.equal(result.suppliedFields.transferFee, true);
  assert.equal(result.suppliedFields.totalCustomerCost, true);
  assert.equal(result.suppliedFields.customerExchangeRate, true);
  assert.equal(result.suppliedFields.recipientAmount, true);

  const omitted = normalizeUserSubmittedMoneyTransferQuote({
    providerId: 'remitly_rewire',
    sourceCurrency: 'ILS',
    targetCurrency: 'THB',
    sendAmount: '2000',
    userSubmittedAt: '2026-09-23T09:05:00.000Z',
  });

  assert.equal(omitted.quote.transferFee, null);
  assert.equal(omitted.suppliedFields.transferFee, false);
});

test('explicit zero fee remains distinguishable from missing fee', () => {
  const zeroFee = normalizeUserSubmittedMoneyTransferQuote(createValidInput({ transferFee: '0' }));
  const missingFee = normalizeUserSubmittedMoneyTransferQuote(createValidInput({ transferFee: undefined }));

  assert.equal(zeroFee.quote.transferFee, 0);
  assert.equal(zeroFee.suppliedFields.transferFee, true);
  assert.equal(missingFee.quote.transferFee, null);
  assert.equal(missingFee.suppliedFields.transferFee, true);
});

test('invalid or negative monetary input is rejected', () => {
  const result = normalizeUserSubmittedMoneyTransferQuote(createValidInput({
    sendAmount: '-1',
    transferFee: 'not a number',
    recipientAmount: '-4',
  }));

  assert.equal(result.ok, false);
  assert.equal(result.quote.availabilityStatus, 'unavailable');
  assert.deepEqual(result.errors.map((error) => error.field), ['sendAmount', 'transferFee', 'recipientAmount']);
});

test('non-positive or invalid exchange rate is rejected', () => {
  for (const customerExchangeRate of ['0', '-1', 'not a rate', Infinity]) {
    const result = normalizeUserSubmittedMoneyTransferQuote(createValidInput({ customerExchangeRate }));

    assert.equal(result.ok, false);
    assert.equal(result.errors.some((error) => error.field === 'customerExchangeRate'), true);
  }
});

test('currency validation works generically', () => {
  const valid = normalizeUserSubmittedMoneyTransferQuote(createValidInput({
    providerId: 'wise',
    sourceCurrency: 'usd',
    targetCurrency: 'php',
  }));
  const invalid = normalizeUserSubmittedMoneyTransferQuote(createValidInput({
    sourceCurrency: 'US',
    targetCurrency: '123',
  }));

  assert.equal(valid.ok, true);
  assert.equal(valid.quote.sourceCurrency, 'USD');
  assert.equal(valid.quote.targetCurrency, 'PHP');
  assert.equal(invalid.ok, false);
  assert.deepEqual(invalid.errors.map((error) => error.field), ['sourceCurrency', 'targetCurrency']);
});

test('provider identity resolves through the registry', () => {
  const result = normalizeUserSubmittedMoneyTransferQuote(createValidInput({ providerId: 'wise' }));

  assert.equal(result.providerKnown, true);
  assert.equal(result.provider.providerId, 'wise');
  assert.equal(result.quote.providerName, 'Wise');
});

test('unknown provider is handled safely without inventing a verified provider', () => {
  const result = normalizeUserSubmittedMoneyTransferQuote(createValidInput({ providerId: 'unknown_transfer_app' }));

  assert.equal(result.ok, true);
  assert.equal(result.providerKnown, false);
  assert.equal(result.provider, null);
  assert.equal(result.quote.providerId, 'unknown_transfer_app');
  assert.equal(result.quote.providerName, '');
  assert.equal(result.quote.availabilityStatus, 'unavailable');
  assert.match(result.quote.notes.join(' '), /Provider identity was not found/i);
});

test('Rewire and Remitly do not create duplicate provider identities', () => {
  const remitly = normalizeUserSubmittedMoneyTransferQuote(createValidInput({ providerId: 'remitly' }));
  const rewire = normalizeUserSubmittedMoneyTransferQuote(createValidInput({ providerId: 'rewire' }));

  assert.equal(remitly.quote.providerId, 'remitly_rewire');
  assert.equal(rewire.quote.providerId, 'remitly_rewire');
  assert.equal(remitly.provider.providerId, rewire.provider.providerId);
});

test('user-submitted data does not alter registry capabilities', () => {
  const before = listProviderRegistry();

  normalizeUserSubmittedMoneyTransferQuote(createValidInput({
    providerId: 'neema',
    sourceCurrency: 'ILS',
    targetCurrency: 'THB',
  }));

  const after = listProviderRegistry();
  assert.deepEqual(after, before);
  assert.equal(after.find((provider) => provider.providerId === 'neema').supportsILSToTHB, 'unknown');
});

test('no recipient amount fee rate or total cost is inferred', () => {
  const result = normalizeUserSubmittedMoneyTransferQuote(createValidInput({
    transferFee: undefined,
    totalCustomerCost: undefined,
    customerExchangeRate: '10',
    recipientAmount: undefined,
  }));

  assert.equal(result.quote.transferFee, null);
  assert.equal(result.quote.totalCustomerCost, null);
  assert.equal(result.quote.recipientAmount, null);
  assert.equal(result.quote.customerExchangeRate, 10);
});

test('Frankfurter and demo data are not used as fallbacks', () => {
  const result = normalizeUserSubmittedMoneyTransferQuote(createValidInput({
    transferFee: undefined,
    totalCustomerCost: undefined,
    customerExchangeRate: undefined,
    recipientAmount: undefined,
    sourceName: 'Frankfurter reference exchange rate',
    demoRate: '9.20',
  }));

  assert.equal(result.ok, true);
  assert.equal(result.quote.customerExchangeRate, null);
  assert.equal(result.quote.transferFee, null);
  assert.match(result.quote.notes.join(' '), /No recipient amount, fee, rate, total cost, delivery time, Frankfurter rate, or demo data was inferred/i);
});

test('provider quote timestamp and user submission timestamp remain distinct', () => {
  const result = normalizeUserSubmittedMoneyTransferQuote(createValidInput({
    providerQuoteTimestamp: '2026-09-23T08:30:00.000Z',
    userSubmittedAt: '2026-09-23T09:05:00.000Z',
  }));

  assert.equal(result.quote.providerQuoteTimestamp, '2026-09-23T08:30:00.000Z');
  assert.equal(result.quote.quoteRetrievedAt, '2026-09-23T09:05:00.000Z');
  assert.equal(result.quote.sourceTrust.providerQuoteTimestamp, '2026-09-23T08:30:00.000Z');
  assert.equal(result.quote.sourceTrust.userSubmittedAt, '2026-09-23T09:05:00.000Z');
  assert.equal(result.quote.sourceTrust.verificationStatus, 'user_reported');
});

test('sensitive fields are rejected and not normalized into quote output', () => {
  const errors = validateUserSubmittedQuoteInput(createValidInput({
    passportNumber: '123456789',
    bankAccountNumber: '987654321',
    recipientName: 'Sensitive Person',
  }));

  assert.deepEqual(errors.map((error) => error.field), ['passportNumber', 'bankAccountNumber', 'recipientName']);
});
