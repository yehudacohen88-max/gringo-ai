const test = require('node:test');
const assert = require('node:assert/strict');

const moneyService = require('../src/modules/money/money.service');
const moneyRepository = require('../src/modules/money/money.repository');
const { SAMPLE_EXCHANGE_RATES, SAMPLE_MONEY_TRANSFER_PROVIDERS } = require('../src/modules/money/sample-money-data');
const { env } = require('../src/config/env');
const {
  findProviderById,
  listDirectConsumerComparisonCandidates,
  listInfrastructureCandidates,
  listProviderRegistry,
} = require('../src/modules/money/money-transfer-provider-registry');

const REQUIRED_PROVIDER_IDS = [
  'neema',
  'monox_money',
  'gmt',
  'stb_union',
  'remitly_rewire',
  'paysend',
  'moneygram',
  'ria_money_transfer',
  'moneynet',
  'wise',
  'israel_post_doar_money_transfer',
  'western_union',
  'thunes',
  'tranglo',
  'nium',
  'rapyd',
  'airwallex',
];

test('required provider universe exists in registry', () => {
  const ids = listProviderRegistry().map((provider) => provider.providerId);

  for (const providerId of REQUIRED_PROVIDER_IDS) {
    assert.equal(ids.includes(providerId), true, `${providerId} should exist`);
  }
});

test('Remitly and Rewire are represented as one current provider identity', () => {
  const matching = listProviderRegistry().filter((provider) => /remitly|rewire/i.test(provider.providerName));

  assert.equal(matching.length, 1);
  assert.equal(matching[0].providerId, 'remitly_rewire');
});

test('Western Union lifecycle is represented independently from Israel Post', () => {
  const westernUnion = findProviderById('western_union');
  const israelPost = findProviderById('israel_post_doar_money_transfer');

  assert.ok(westernUnion);
  assert.ok(israelPost);
  assert.notEqual(westernUnion.providerId, israelPost.providerId);
  assert.equal(westernUnion.providerStatus, 'unknown');
  assert.equal(israelPost.providerStatus, 'unknown');
  assert.match(westernUnion.notes, /not marked active through Israel Post/i);
});

test('infrastructure companies are not direct consumer comparison providers', () => {
  const directIds = listDirectConsumerComparisonCandidates().map((provider) => provider.providerId);
  const infrastructureIds = listInfrastructureCandidates().map((provider) => provider.providerId);

  for (const providerId of ['thunes', 'tranglo', 'nium', 'rapyd', 'airwallex']) {
    assert.equal(infrastructureIds.includes(providerId), true);
    assert.equal(directIds.includes(providerId), false);
  }
});

test('unknown capabilities remain unknown and are not converted to false', () => {
  const neema = findProviderById('neema');

  assert.equal(neema.supportsILSToTHB, 'unknown');
  assert.equal(neema.hasProviderAPI, 'unknown');
  assert.equal(neema.supportsLiveQuote, 'unknown');
});

test('registry does not introduce fake fees rates or ranking fields', () => {
  for (const provider of listProviderRegistry()) {
    assert.equal(Object.prototype.hasOwnProperty.call(provider, 'fixedFee'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(provider, 'percentageFee'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(provider, 'providerExchangeRate'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(provider, 'rank'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(provider, 'bestProvider'), false);
  }
});

test('no provider is verified for Israel to Thailand without source-backed verification', () => {
  const verifiedCorridorProviders = listProviderRegistry().filter((provider) =>
    provider.supportsILSToTHB === 'true' && provider.verificationStatus === 'verified'
  );

  assert.deepEqual(verifiedCorridorProviders, []);
});

test('existing Frankfurter reference-rate behavior remains available', async () => {
  const originalFindAllExchangeRates = moneyRepository.findAllExchangeRates;
  const originalEndpoint = env.money.referenceRateEndpoint;

  try {
    env.money.referenceRateEndpoint = '';
    moneyRepository.findAllExchangeRates = async () => SAMPLE_EXCHANGE_RATES;
    const rate = await moneyService.getExchangeRate('ILS', 'THB');

    assert.equal(rate.sourceCurrency, 'ILS');
    assert.equal(rate.targetCurrency, 'THB');
    assert.equal(rate.exchangeRate, '9.20');
    assert.match(rate.sourceName, /Demo data/i);
  } finally {
    moneyRepository.findAllExchangeRates = originalFindAllExchangeRates;
    env.money.referenceRateEndpoint = originalEndpoint;
  }
});

test('existing money-transfer demo comparison behavior remains unchanged', async () => {
  const originalFindAllProviders = moneyRepository.findAllProviders;

  try {
    moneyRepository.findAllProviders = async () => SAMPLE_MONEY_TRANSFER_PROVIDERS;
    const comparison = await moneyService.compareTransfers(2000, 'ILS', 'THB');

    assert.deepEqual(comparison.map((item) => item.providerName), ['Provider B', 'Provider A', 'Provider C']);
    assert.equal(comparison[0].providerExchangeRate, 9.18);
  } finally {
    moneyRepository.findAllProviders = originalFindAllProviders;
  }
});
