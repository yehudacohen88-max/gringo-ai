const test = require('node:test');
const assert = require('node:assert/strict');

const moneyService = require('../src/modules/money/money.service');
const moneyRepository = require('../src/modules/money/money.repository');
const referenceExchangeRateAdapter = require('../src/modules/money/reference-exchange-rate.adapter');
const { SAMPLE_MONEY_TRANSFER_PROVIDERS } = require('../src/modules/money/sample-money-data');
const { env } = require('../src/config/env');
const {
  SOURCE_TYPES,
  FRESHNESS_STATUSES,
  QUOTE_VERIFICATION_STATUSES,
  createDemoTrust,
  createQuoteSourceTrust,
  createReferenceMarketRateTrust,
  createUnavailableTrust,
  isDemo,
  isProviderTransactionQuote,
  isReferenceMarketRate,
  isUnavailable,
  isUserReported,
} = require('../src/modules/money/money-transfer-quote-source-trust');
const { listProviderRegistry } = require('../src/modules/money/money-transfer-provider-registry');

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

test('trust model exposes the required source freshness and verification statuses', () => {
  assert.deepEqual(SOURCE_TYPES, [
    'live_provider_quote',
    'public_provider_quote',
    'official_public_information',
    'user_submitted_quote',
    'reference_market_rate',
    'demo',
    'unavailable',
  ]);
  assert.deepEqual(FRESHNESS_STATUSES, ['fresh', 'stale', 'unknown', 'not_applicable']);
  assert.deepEqual(QUOTE_VERIFICATION_STATUSES, ['verified_source', 'user_reported', 'unverified', 'demo']);
});

test('Frankfurter reference data remains reference_market_rate and not a provider quote', () => {
  const trust = createReferenceMarketRateTrust({
    providerId: 'frankfurter',
    retrievedAt: '2026-09-22T10:00:00.000Z',
    providerQuoteTimestamp: '2026-09-22',
    freshnessStatus: 'fresh',
  });

  assert.equal(trust.sourceType, 'reference_market_rate');
  assert.equal(trust.providerId, 'frankfurter');
  assert.equal(trust.verificationStatus, 'verified_source');
  assert.equal(isReferenceMarketRate(trust), true);
  assert.equal(isProviderTransactionQuote(trust), false);
});

test('live provider quote is distinguishable from public provider quote', () => {
  const liveQuote = createQuoteSourceTrust({
    sourceType: 'live_provider_quote',
    providerId: 'provider_live',
    retrievedAt: '2026-09-22T10:00:00.000Z',
    providerQuoteTimestamp: '2026-09-22T10:00:00.000Z',
    freshnessStatus: 'fresh',
  });
  const publicQuote = createQuoteSourceTrust({
    sourceType: 'public_provider_quote',
    providerId: 'provider_public',
    providerQuoteTimestamp: '2026-09-21T10:00:00.000Z',
    freshnessStatus: 'unknown',
  });

  assert.equal(liveQuote.sourceType, 'live_provider_quote');
  assert.equal(publicQuote.sourceType, 'public_provider_quote');
  assert.equal(isProviderTransactionQuote(liveQuote), true);
  assert.equal(isProviderTransactionQuote(publicQuote), true);
  assert.notEqual(liveQuote.sourceType, publicQuote.sourceType);
});

test('official public information is not treated as a transaction quote', () => {
  const trust = createQuoteSourceTrust({
    sourceType: 'official_public_information',
    providerId: 'provider_information',
    retrievedAt: '2026-09-22T10:00:00.000Z',
  });

  assert.equal(trust.sourceType, 'official_public_information');
  assert.equal(trust.verificationStatus, 'verified_source');
  assert.equal(isProviderTransactionQuote(trust), false);
});

test('user-submitted quote remains user_reported and is not labeled official', () => {
  const trust = createQuoteSourceTrust({
    sourceType: 'user_submitted_quote',
    providerId: 'provider_user_reported',
    userSubmittedAt: '2026-09-22T10:00:00.000Z',
  });

  assert.equal(trust.verificationStatus, 'user_reported');
  assert.equal(isUserReported(trust), true);
  assert.equal(isProviderTransactionQuote(trust), false);
});

test('demo data remains demo', () => {
  const trust = createDemoTrust({ providerId: 'provider_demo' });

  assert.equal(trust.sourceType, 'demo');
  assert.equal(trust.freshnessStatus, 'not_applicable');
  assert.equal(trust.verificationStatus, 'demo');
  assert.equal(isDemo(trust), true);
  assert.equal(isProviderTransactionQuote(trust), false);
});

test('missing provider data becomes unavailable', () => {
  const trust = createUnavailableTrust({ providerId: 'missing_provider' });

  assert.equal(trust.sourceType, 'unavailable');
  assert.equal(trust.freshnessStatus, 'not_applicable');
  assert.equal(trust.verificationStatus, 'unverified');
  assert.equal(isUnavailable(trust), true);
});

test('trust model does not infer rates fees recipient amounts or ranking', () => {
  const trust = createQuoteSourceTrust({
    sourceType: 'live_provider_quote',
    providerId: 'provider_live',
    exchangeRate: '9.2',
    fixedFee: '20',
    recipientAmount: '18000',
    rank: 1,
    bestProvider: true,
  });

  assert.equal(Object.prototype.hasOwnProperty.call(trust, 'exchangeRate'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(trust, 'fixedFee'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(trust, 'recipientAmount'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(trust, 'rank'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(trust, 'bestProvider'), false);
});

test('existing provider registry remains unchanged by quote trust model', () => {
  const before = listProviderRegistry();
  createQuoteSourceTrust({ sourceType: 'live_provider_quote', providerId: 'neema' });
  const after = listProviderRegistry();

  assert.deepEqual(after, before);
});

test('existing live Frankfurter flow remains unchanged', async () => {
  const originalEndpoint = env.money.referenceRateEndpoint;

  await withPatchedServices([
    [referenceExchangeRateAdapter, {
      fetchReferenceExchangeRate: async () => ({
        ok: true,
        sourceCurrency: 'ILS',
        targetCurrency: 'THB',
        exchangeRate: 10.25,
        sourceName: 'Frankfurter reference exchange rate',
        retrievedAt: '2026-09-22T10:00:00.000Z',
        providerUpdatedAt: '2026-09-22',
        rateType: 'reference',
      }),
    }],
  ], async () => {
    env.money.referenceRateEndpoint = 'https://api.frankfurter.dev/v2/rate';

    const rate = await moneyService.getExchangeRate('ILS', 'THB');

    assert.equal(rate.exchangeRate, '10.25');
    assert.equal(rate.sourceName, 'Frankfurter reference exchange rate');
    assert.equal(rate.rateType, 'reference');
    assert.equal(rate.providerUpdatedAt, '2026-09-22');
  });

  env.money.referenceRateEndpoint = originalEndpoint;
});

test('existing Finance transfer comparison behavior remains unchanged', async () => {
  await withPatchedServices([
    [moneyRepository, {
      findAllProviders: async () => SAMPLE_MONEY_TRANSFER_PROVIDERS,
    }],
  ], async () => {
    const comparison = await moneyService.compareTransfers(2000, 'ILS', 'THB');

    assert.deepEqual(comparison.map((item) => item.providerName), ['Provider B', 'Provider A', 'Provider C']);
    assert.equal(comparison[0].providerExchangeRate, 9.18);
  });
});
