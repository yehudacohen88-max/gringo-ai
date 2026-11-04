const moneyRepository = require('./money.repository');
const { env } = require('../../config/env');
const referenceExchangeRateAdapter = require('./reference-exchange-rate.adapter');
const { SAMPLE_EXCHANGE_RATES, SAMPLE_MONEY_TRANSFER_PROVIDERS } = require('./sample-money-data');
const {
  assistantCatalogReply,
  catalogMeta,
  moduleEnabled,
  readPilotCatalog,
  tagCatalog,
} = require('../../shared/pilotCatalog');

const SAFETY_NOTICE = 'Rates, fees, delivery times, providers, and availability may change. Confirm the final amount and terms directly with the provider before sending. This is not financial advice.';
const DEMO_NOTICE = 'Demo data - not a live rate. This is demonstration data only, not a live quote or confirmed transaction offer.';

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function normalizeCurrency(value) {
  return cleanText(value).toUpperCase();
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function parseDeliveryHours(deliveryTime = '') {
  const normalized = cleanText(deliveryTime).toLowerCase();
  const number = Number((normalized.match(/\d+/) || [0])[0]);

  if (normalized.includes('hour')) return number || 2;
  if (normalized.includes('same day')) return 12;
  if (normalized.includes('day')) return (number || 1) * 24;

  return 999;
}

function isDemoRate(rate) {
  if (!rate || typeof rate !== 'object') return false;
  if (rate.demo === true || rate.dataSource === 'demo') return true;
  if (String(rate.rateId || '').endsWith('_demo')) return true;
  if (String(rate.status || '').toLowerCase() === 'demo') return true;
  return /demo data/i.test(String(rate.sourceName || ''));
}

async function readExchangeRateCatalog() {
  return readPilotCatalog({
    moduleName: 'money',
    read: () => moneyRepository.findAllExchangeRates(),
    samples: SAMPLE_EXCHANGE_RATES,
    idFields: ['rateId'],
  });
}

async function readProviderCatalog() {
  return readPilotCatalog({
    moduleName: 'money',
    read: () => moneyRepository.findAllProviders(),
    samples: SAMPLE_MONEY_TRANSFER_PROVIDERS,
    idFields: ['providerId'],
  });
}

async function readLiveReferenceRate(sourceCurrency, targetCurrency) {
  if (!cleanText(env.money?.referenceRateEndpoint)) return null;

  const liveRate = await referenceExchangeRateAdapter.fetchReferenceExchangeRate({
    sourceCurrency,
    targetCurrency,
    endpoint: env.money?.referenceRateEndpoint,
    timeoutMs: env.money?.referenceRateTimeoutMs,
  });

  if (!liveRate?.ok) return null;

  return {
    rateId: `reference_${liveRate.sourceCurrency.toLowerCase()}_${liveRate.targetCurrency.toLowerCase()}`,
    sourceCurrency: liveRate.sourceCurrency,
    targetCurrency: liveRate.targetCurrency,
    exchangeRate: String(liveRate.exchangeRate),
    sourceName: liveRate.sourceName,
    updatedAt: liveRate.providerUpdatedAt || '',
    status: 'Active',
    rateType: 'reference',
    retrievedAt: liveRate.retrievedAt,
    providerUpdatedAt: liveRate.providerUpdatedAt || '',
  };
}

async function describeExchangeRate(sourceCurrency, targetCurrency) {
  if (!moduleEnabled('money')) return { state: 'disabled', rate: null, demo: false };

  const source = normalizeCurrency(sourceCurrency);
  const target = normalizeCurrency(targetCurrency);
  const liveRate = await readLiveReferenceRate(source, target);
  if (liveRate) return { state: 'ok', rate: liveRate, demo: false };

  const catalog = await readExchangeRateCatalog();
  const rate = catalog.records.find(
    (item) =>
      item.status === 'Active' &&
      normalizeCurrency(item.sourceCurrency) === source &&
      normalizeCurrency(item.targetCurrency) === target
  ) || null;

  if (rate) return { state: catalog.state, rate, demo: catalog.demo || isDemoRate(rate) };
  if (catalog.state === 'unavailable' || catalog.state === 'disabled') {
    return { state: catalog.state, rate: null, demo: false };
  }
  return { state: 'empty', rate: null, demo: false };
}

async function getExchangeRate(sourceCurrency, targetCurrency) {
  const described = await describeExchangeRate(sourceCurrency, targetCurrency);
  return described.rate;
}

async function resolveExchangeRate(sourceCurrency, targetCurrency) {
  if (module.exports.getExchangeRate !== getExchangeRate) {
    const rate = await module.exports.getExchangeRate(sourceCurrency, targetCurrency);
    return {
      rate: rate || null,
      state: rate ? (isDemoRate(rate) ? 'demo' : 'ok') : 'empty',
      demo: isDemoRate(rate),
    };
  }
  return describeExchangeRate(sourceCurrency, targetCurrency);
}

async function getActiveProviders(targetCurrency, sourceCurrency = '') {
  const target = normalizeCurrency(targetCurrency);
  const source = normalizeCurrency(sourceCurrency);
  const catalog = await readProviderCatalog();
  const providers = catalog.records.filter((provider) => {
    if (provider.status !== 'Active') return false;
    if (target && normalizeCurrency(provider.targetCurrency) !== target) return false;
    if (source && normalizeCurrency(provider.sourceCurrency) !== source) return false;
    return true;
  });
  return tagCatalog(providers, catalog.state, catalog.demo);
}

function calculateTransfer(provider, amount) {
  const sentAmount = toNumber(amount);
  const fixedFee = toNumber(provider.fixedFee);
  const percentageFee = toNumber(provider.percentageFee);
  const percentageFeeAmount = sentAmount * (percentageFee / 100);
  const transferFee = fixedFee + percentageFeeAmount;
  const amountConverted = Math.max(sentAmount - transferFee, 0);
  const providerExchangeRate = toNumber(provider.providerExchangeRate);
  const finalAmountReceived = amountConverted * providerExchangeRate;

  return {
    providerId: provider.providerId,
    providerName: provider.providerName,
    sourceCurrency: normalizeCurrency(provider.sourceCurrency),
    targetCurrency: normalizeCurrency(provider.targetCurrency),
    amountSent: sentAmount,
    transferFee,
    amountConverted,
    providerExchangeRate,
    finalAmountReceived,
    estimatedDeliveryTime: provider.deliveryTime,
    payoutMethod: provider.payoutMethod,
    websiteUrl: provider.websiteUrl,
    ...(provider.demo ? { demo: true, dataSource: 'demo', demoLabel: provider.demoLabel || '' } : {}),
  };
}

async function compareTransfers(amount, sourceCurrency, targetCurrency) {
  const providers = await getActiveProviders(targetCurrency, sourceCurrency);
  const meta = catalogMeta(providers);
  const results = providers
    .filter((provider) => {
      const sentAmount = toNumber(amount);
      const minimum = toNumber(provider.minimumAmount);
      const maximum = toNumber(provider.maximumAmount);
      return (!minimum || sentAmount >= minimum) && (!maximum || sentAmount <= maximum);
    })
    .map((provider) => calculateTransfer(provider, amount))
    .sort((a, b) => {
      if (b.finalAmountReceived !== a.finalAmountReceived) return b.finalAmountReceived - a.finalAmountReceived;
      if (a.transferFee !== b.transferFee) return a.transferFee - b.transferFee;
      return parseDeliveryHours(a.estimatedDeliveryTime) - parseDeliveryHours(b.estimatedDeliveryTime);
    });
  const state = results.length ? meta.state : (meta.state === 'ok' || meta.state === 'demo' ? 'empty' : meta.state);
  return tagCatalog(results, state, Boolean(meta.demo && results.length));
}

async function resolveTransferComparison(amount, sourceCurrency, targetCurrency) {
  if (module.exports.compareTransfers !== compareTransfers) {
    const results = await module.exports.compareTransfers(amount, sourceCurrency, targetCurrency);
    const list = Array.isArray(results) ? results : [];
    const demo = list.some((item) => item && item.demo === true);
    return {
      results: list,
      state: list.length ? (demo ? 'demo' : 'ok') : 'empty',
      demo,
    };
  }
  const results = await compareTransfers(amount, sourceCurrency, targetCurrency);
  const meta = catalogMeta(results);
  return { results, state: meta.state, demo: meta.demo };
}

async function getBestTransferOption(amount, sourceCurrency, targetCurrency) {
  const results = await compareTransfers(amount, sourceCurrency, targetCurrency);
  return results[0] || null;
}

function formatMoney(value, currency) {
  return `${Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${currency}`;
}

function formatComparisonForChat(amount, sourceCurrency, targetCurrency, comparison = [], options = {}) {
  const meta = catalogMeta(comparison);
  const state = options.state || meta.state;
  const language = options.language || 'en';
  const demo = options.demo === true || meta.demo || comparison.some((item) => item && item.demo);

  if (!comparison.length || state === 'disabled' || state === 'unavailable') {
    const resolved = !comparison.length && (state === 'ok' || state === 'demo') ? 'empty' : state;
    return assistantCatalogReply(resolved, language);
  }

  const lines = comparison.map((result, index) => {
    const label = result.demo ? 'Demo: ' : '';
    return `${index + 1}. ${label}${result.providerName}: recipient gets about ${formatMoney(
      result.finalAmountReceived,
      targetCurrency
    )}. Fee: ${formatMoney(result.transferFee, sourceCurrency)}. Delivery: ${result.estimatedDeliveryTime}. Payout: ${
      result.payoutMethod
    }.`;
  });

  const notice = demo ? (language === 'en' ? DEMO_NOTICE : assistantCatalogReply('demo', language)) : '';
  const bestLabel = demo ? 'best demo option' : 'best option';

  return [
    notice,
    `For ${formatMoney(amount, sourceCurrency)} to ${targetCurrency}, the ${bestLabel} is ${comparison[0].providerName}.`,
    ...lines,
    SAFETY_NOTICE,
  ].filter(Boolean).join('\n');
}

module.exports = {
  DEMO_NOTICE,
  SAFETY_NOTICE,
  calculateTransfer,
  compareTransfers,
  describeExchangeRate,
  formatComparisonForChat,
  getActiveProviders,
  getBestTransferOption,
  getExchangeRate,
  isDemoRate,
  resolveExchangeRate,
  resolveTransferComparison,
};
