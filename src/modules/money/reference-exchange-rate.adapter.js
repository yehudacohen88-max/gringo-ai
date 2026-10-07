const DEFAULT_TIMEOUT_MS = 5000;
const SOURCE_NAME = 'Frankfurter reference exchange rate';

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function normalizeCurrency(value) {
  return cleanText(value).toUpperCase();
}

function failure(errorCode) {
  return {
    ok: false,
    errorCode,
    sourceName: SOURCE_NAME,
    rateType: 'reference',
  };
}

function isValidDateOnly(value) {
  const text = cleanText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;

  const parsed = new Date(`${text}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text;
}

function buildRateUrl(endpoint, sourceCurrency, targetCurrency) {
  const baseEndpoint = cleanText(endpoint).replace(/\/+$/, '');
  if (!baseEndpoint) return null;

  try {
    return new URL(
      `${baseEndpoint}/${encodeURIComponent(sourceCurrency.toLowerCase())}/${encodeURIComponent(targetCurrency.toLowerCase())}`
    ).toString();
  } catch (error) {
    return null;
  }
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch (error) {
    return null;
  }
}

async function fetchReferenceExchangeRate(options = {}) {
  const sourceCurrency = normalizeCurrency(options.sourceCurrency);
  const targetCurrency = normalizeCurrency(options.targetCurrency);
  const endpoint = cleanText(options.endpoint);
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const now = typeof options.now === 'function' ? options.now : () => new Date();

  if (!sourceCurrency || !targetCurrency || !endpoint || typeof fetchImpl !== 'function') {
    return failure('missing_configuration');
  }

  const url = buildRateUrl(endpoint, sourceCurrency, targetCurrency);
  if (!url) return failure('missing_configuration');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
      },
      signal: controller.signal,
    });

    const body = await readJsonResponse(response);
    if (!response || !response.ok || !body || typeof body !== 'object') {
      return failure('api_request_failed');
    }

    const responseSource = normalizeCurrency(body.base);
    const responseTarget = normalizeCurrency(body.quote);
    if (responseSource !== sourceCurrency || responseTarget !== targetCurrency) {
      return failure('currency_pair_mismatch');
    }

    const exchangeRate = Number(body.rate);
    if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
      return failure('invalid_rate');
    }

    if (!isValidDateOnly(body.date)) {
      return failure('invalid_provider_timestamp');
    }

    return {
      ok: true,
      sourceCurrency,
      targetCurrency,
      exchangeRate,
      sourceName: SOURCE_NAME,
      retrievedAt: now().toISOString(),
      providerUpdatedAt: cleanText(body.date),
      rateType: 'reference',
    };
  } catch (error) {
    if (error?.name === 'AbortError') return failure('timeout');
    return failure('network_error');
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  SOURCE_NAME,
  fetchReferenceExchangeRate,
};
