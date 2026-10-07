const test = require('node:test');
const assert = require('node:assert/strict');

const { env } = require('../src/config/env');
const moneyService = require('../src/modules/money/money.service');
const {
  SOURCE_NAME,
  fetchReferenceExchangeRate,
} = require('../src/modules/money/reference-exchange-rate.adapter');

const ENDPOINT = 'https://api.frankfurter.dev/v2/rate';
const FIXED_NOW = '2026-09-20T10:00:00.000Z';

function jsonResponse(body, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  };
}

function createValidBody(overrides = {}) {
  return {
    date: '2026-09-19',
    base: 'ILS',
    quote: 'THB',
    rate: 9.12,
    ...overrides,
  };
}

function createOptions(overrides = {}) {
  return {
    sourceCurrency: 'ILS',
    targetCurrency: 'THB',
    endpoint: ENDPOINT,
    timeoutMs: 100,
    now: () => new Date(FIXED_NOW),
    fetchImpl: async () => jsonResponse(createValidBody()),
    ...overrides,
  };
}

test('valid Frankfurter response returns a normalized reference exchange-rate result', async () => {
  let request;
  const result = await fetchReferenceExchangeRate(createOptions({
    fetchImpl: async (url, options) => {
      request = { url, options };
      return jsonResponse(createValidBody());
    },
  }));

  assert.deepEqual(result, {
    ok: true,
    sourceCurrency: 'ILS',
    targetCurrency: 'THB',
    exchangeRate: 9.12,
    sourceName: SOURCE_NAME,
    retrievedAt: FIXED_NOW,
    providerUpdatedAt: '2026-09-19',
    rateType: 'reference',
  });
  assert.equal(request.url, 'https://api.frankfurter.dev/v2/rate/ils/thb');
  assert.equal(request.options.method, 'GET');
  assert.equal(request.options.headers.accept, 'application/json');
});

test('currency-pair mismatch fails safely', async () => {
  const result = await fetchReferenceExchangeRate(createOptions({
    fetchImpl: async () => jsonResponse(createValidBody({ base: 'USD' })),
  }));

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, 'currency_pair_mismatch');
});

test('zero negative NaN or infinite rates fail safely', async () => {
  for (const rate of [0, -1, 'not-a-number', Infinity]) {
    const result = await fetchReferenceExchangeRate(createOptions({
      fetchImpl: async () => jsonResponse(createValidBody({ rate })),
    }));

    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'invalid_rate');
  }
});

test('missing configuration fails safely without calling fetch', async () => {
  let called = false;
  const result = await fetchReferenceExchangeRate(createOptions({
    endpoint: '',
    fetchImpl: async () => {
      called = true;
      return jsonResponse(createValidBody());
    },
  }));

  assert.equal(called, false);
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, 'missing_configuration');
});

test('network failure fails safely', async () => {
  const result = await fetchReferenceExchangeRate(createOptions({
    fetchImpl: async () => {
      throw new Error('network failure with private details');
    },
  }));

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, 'network_error');
  assert.equal(JSON.stringify(result).includes('private details'), false);
});

test('timeout fails safely', async () => {
  const result = await fetchReferenceExchangeRate(createOptions({
    timeoutMs: 5,
    fetchImpl: async (url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    }),
  }));

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, 'timeout');
});

test('malformed API response fails safely', async () => {
  const result = await fetchReferenceExchangeRate(createOptions({
    fetchImpl: async () => jsonResponse(null),
  }));

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, 'api_request_failed');
});

test('missing or invalid provider timestamp fails safely', async () => {
  for (const date of ['', 'not-a-date', '2026-02-31']) {
    const result = await fetchReferenceExchangeRate(createOptions({
      fetchImpl: async () => jsonResponse(createValidBody({ date })),
    }));

    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'invalid_provider_timestamp');
  }
});

test('credentials are not exposed in logs or returned errors', async () => {
  const secret = 'secret-live-rate-key';
  const messages = [];
  const originalWarn = console.warn;
  const originalError = console.error;
  console.warn = (...args) => messages.push(args.join(' '));
  console.error = (...args) => messages.push(args.join(' '));

  try {
    const result = await fetchReferenceExchangeRate(createOptions({
      apiKey: secret,
      fetchImpl: async () => {
        throw new Error(`provider rejected ${secret}`);
      },
    }));

    assert.equal(result.ok, false);
    assert.equal(JSON.stringify(result).includes(secret), false);
    assert.equal(messages.join('\n').includes(secret), false);
  } finally {
    console.warn = originalWarn;
    console.error = originalError;
  }
});

test('existing money-transfer behavior remains unchanged and does not use live adapter', async () => {
  const originalFetch = global.fetch;
  const originalEndpoint = env.money.referenceRateEndpoint;
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    return jsonResponse(createValidBody());
  };
  env.money.referenceRateEndpoint = '';

  try {
    const rate = await moneyService.getExchangeRate('ILS', 'THB');
    const comparison = await moneyService.compareTransfers(2000, 'ILS', 'THB');
    const message = moneyService.formatComparisonForChat(2000, 'ILS', 'THB', comparison);

    assert.equal(fetchCalled, false);
    assert.equal(rate.sourceName, 'Demo data - not a live rate.');
    assert.equal(comparison.length > 0, true);
    assert.match(message, /Demo data - not a live rate/i);
  } finally {
    global.fetch = originalFetch;
    env.money.referenceRateEndpoint = originalEndpoint;
  }
});
