process.env.MULTI_AGENT_ENABLED = 'false';
process.env.SUPERVISOR_ENABLED = 'false';
process.env.AGENT_EXECUTION_ENABLED = 'false';
process.env.ACTIVE_SUPERVISOR_DELIVERY_ENABLED = 'false';
process.env.SUPERVISOR_MULTI_INTENT_LIVE_ENABLED = 'false';

const test = require('node:test');
const assert = require('node:assert/strict');

const { coreAgentService } = require('../src/modules/core-agent');
const { crmAgentService } = require('../src/modules/crm-agent');
const { env } = require('../src/config/env');
const moneyService = require('../src/modules/money/money.service');
const referenceExchangeRateAdapter = require('../src/modules/money/reference-exchange-rate.adapter');

const ORIGINAL_CONFIG = { ...env.money };

function createLiveRate(overrides = {}) {
  return {
    ok: true,
    sourceCurrency: 'ILS',
    targetCurrency: 'THB',
    exchangeRate: 9.33,
    sourceName: 'Frankfurter reference exchange rate',
    retrievedAt: '2026-09-20T10:15:00.000Z',
    providerUpdatedAt: '2026-09-19',
    rateType: 'reference',
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
    env.money = { ...ORIGINAL_CONFIG };
  }
}

function patchCoreCrm(profile = {}) {
  const baseProfile = {
    userId: 'usr_reference_rate',
    fullName: 'Reference Rate User',
    preferredCurrency: 'THB',
    country: 'Thailand',
    moneyTransferCountry: 'Thailand',
    preferredLanguage: 'en',
    detectedLanguage: 'en',
    languageSource: 'profile',
    workSector: 'Construction',
    profession: 'Ironworker',
    city: 'Tel Aviv',
    wantsJobAlerts: 'Yes',
    wantsExchangeRateAlerts: 'Yes',
    ...profile,
  };

  return [
    [crmAgentService, {
      findOrCreateUser: async (context = {}) => ({
        userId: baseProfile.userId,
        channel: context.channel || 'web',
        channelUserId: context.channelUserId || 'reference-rate-user',
      }),
      getUserMemory: async () => baseProfile,
      getUserLanguage: async () => ({
        preferredLanguage: 'en',
        detectedLanguage: 'en',
        languageSource: 'profile',
        languageUpdatedAt: '',
        language: 'en',
      }),
      updateDetectedLanguage: async () => baseProfile,
      updateUserProfile: async () => baseProfile,
      saveConversation: async (event) => event,
      extractAndUpdateMemory: async () => ({ signals: { interests: [] }, updates: {} }),
    }],
  ];
}

test('valid live reference rate is returned for the requested currency pair', async () => {
  await withPatchedServices([
    [referenceExchangeRateAdapter, {
      fetchReferenceExchangeRate: async (options) => {
        assert.equal(options.sourceCurrency, 'ILS');
        assert.equal(options.targetCurrency, 'THB');
        assert.equal(options.endpoint, 'https://api.frankfurter.dev/v2/rate');
        return createLiveRate();
      },
    }],
  ], async () => {
    env.money.referenceRateEndpoint = 'https://api.frankfurter.dev/v2/rate';

    const rate = await moneyService.getExchangeRate('ILS', 'THB');

    assert.equal(rate.sourceCurrency, 'ILS');
    assert.equal(rate.targetCurrency, 'THB');
    assert.equal(rate.exchangeRate, '9.33');
    assert.equal(rate.sourceName, 'Frankfurter reference exchange rate');
    assert.equal(rate.providerUpdatedAt, '2026-09-19');
    assert.equal(rate.updatedAt, '2026-09-19');
    assert.equal(rate.retrievedAt, '2026-09-20T10:15:00.000Z');
    assert.equal(rate.rateType, 'reference');
  });
});

test('retrieval time and provider rate date are preserved separately', async () => {
  await withPatchedServices([
    [referenceExchangeRateAdapter, {
      fetchReferenceExchangeRate: async () => createLiveRate({
        retrievedAt: '2026-09-20T11:00:00.000Z',
        providerUpdatedAt: '2026-09-18',
      }),
    }],
  ], async () => {
    env.money.referenceRateEndpoint = 'https://api.frankfurter.dev/v2/rate';

    const rate = await moneyService.getExchangeRate('ILS', 'THB');

    assert.equal(rate.retrievedAt, '2026-09-20T11:00:00.000Z');
    assert.equal(rate.providerUpdatedAt, '2026-09-18');
    assert.notEqual(rate.retrievedAt.slice(0, 10), rate.providerUpdatedAt);
  });
});

test('API timeout network malformed and invalid-rate failures fall back safely', async () => {
  for (const errorCode of ['timeout', 'network_error', 'api_request_failed', 'invalid_rate']) {
    await withPatchedServices([
      [referenceExchangeRateAdapter, {
        fetchReferenceExchangeRate: async () => ({
          ok: false,
          errorCode,
          sourceName: 'Frankfurter reference exchange rate',
          rateType: 'reference',
        }),
      }],
    ], async () => {
      env.money.referenceRateEndpoint = 'https://api.frankfurter.dev/v2/rate';

      const rate = await moneyService.getExchangeRate('ILS', 'THB');

      assert.equal(rate.sourceName, 'Demo data - not a live rate.');
      assert.equal(rate.rateType, undefined);
      assert.equal(rate.exchangeRate, '9.20');
    });
  }
});

test('missing configuration preserves existing demo behavior without calling adapter', async () => {
  let called = false;

  await withPatchedServices([
    [referenceExchangeRateAdapter, {
      fetchReferenceExchangeRate: async () => {
        called = true;
        return createLiveRate();
      },
    }],
  ], async () => {
    env.money.referenceRateEndpoint = '';

    const rate = await moneyService.getExchangeRate('ILS', 'THB');

    assert.equal(called, false);
    assert.equal(rate.sourceName, 'Demo data - not a live rate.');
    assert.equal(rate.exchangeRate, '9.20');
  });
});

test('unsupported currency pair is not silently substituted', async () => {
  await withPatchedServices([
    [referenceExchangeRateAdapter, {
      fetchReferenceExchangeRate: async () => ({
        ok: false,
        errorCode: 'currency_pair_mismatch',
        sourceName: 'Frankfurter reference exchange rate',
        rateType: 'reference',
      }),
    }],
  ], async () => {
    env.money.referenceRateEndpoint = 'https://api.frankfurter.dev/v2/rate';

    const rate = await moneyService.getExchangeRate('ILS', 'ABC');

    assert.equal(rate, null);
  });
});

test('provider comparison calculations and rankings remain unchanged', async () => {
  await withPatchedServices([
    [referenceExchangeRateAdapter, {
      fetchReferenceExchangeRate: async () => createLiveRate({ exchangeRate: 99.99 }),
    }],
  ], async () => {
    env.money.referenceRateEndpoint = 'https://api.frankfurter.dev/v2/rate';

    const comparison = await moneyService.compareTransfers(2000, 'ILS', 'THB');

    assert.deepEqual(comparison.map((item) => item.providerName), ['Provider B', 'Provider A', 'Provider C']);
    assert.equal(comparison[0].providerExchangeRate, 9.18);
    assert.equal(Math.round(comparison[0].finalAmountReceived * 100) / 100, 18084.6);
  });
});

test('successful live-rate request is user-facing as reference data only', async () => {
  await withPatchedServices([
    ...patchCoreCrm(),
    [referenceExchangeRateAdapter, {
      fetchReferenceExchangeRate: async () => createLiveRate(),
    }],
  ], async () => {
    env.money.referenceRateEndpoint = 'https://api.frankfurter.dev/v2/rate';

    const response = await coreAgentService.processWebMessage({
      requestId: 'req_reference_rate_live',
      message: 'What is the exchange rate right now?',
      channel: 'web',
      channelUserId: 'reference-rate-live-user',
    });

    assert.match(response.reply, /reference exchange rate is 1 ILS = 9\.33 THB/i);
    assert.match(response.reply, /Provider rate date: 2026-09-19/i);
    assert.match(response.reply, /Retrieved by Gringo: 2026-09-20T10:15:00\.000Z/i);
    assert.match(response.reply, /not a provider customer rate, live quote, or confirmed transfer offer/i);
    assert.doesNotMatch(response.reply, /Demo data - not a live rate/i);
  });
});

test('unavailable API keeps user-facing demo fallback explicitly labeled', async () => {
  await withPatchedServices([
    ...patchCoreCrm(),
    [referenceExchangeRateAdapter, {
      fetchReferenceExchangeRate: async () => ({
        ok: false,
        errorCode: 'network_error',
        sourceName: 'Frankfurter reference exchange rate',
        rateType: 'reference',
      }),
    }],
  ], async () => {
    env.money.referenceRateEndpoint = 'https://api.frankfurter.dev/v2/rate';

    const response = await coreAgentService.processWebMessage({
      requestId: 'req_reference_rate_fallback',
      message: 'What is the exchange rate right now?',
      channel: 'web',
      channelUserId: 'reference-rate-fallback-user',
    });

    assert.match(response.reply, /Demo data - not a live rate/i);
    assert.match(response.reply, /The demo exchange rate is 1 ILS = 9\.20 THB/i);
    assert.match(response.reply, /not a live quote or confirmed transaction offer/i);
  });
});
