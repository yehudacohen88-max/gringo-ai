const moneyRepository = require('./money.repository');
const { env } = require('../../config/env');
const referenceExchangeRateAdapter = require('./reference-exchange-rate.adapter');
const { SAMPLE_EXCHANGE_RATES, SAMPLE_MONEY_TRANSFER_PROVIDERS } = require('./sample-money-data');

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

async function readExchangeRates() {
  try {
    const rates = await moneyRepository.findAllExchangeRates();
    return rates.length > 0 ? rates : SAMPLE_EXCHANGE_RATES;
  } catch (error) {
    return SAMPLE_EXCHANGE_RATES;
  }
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

async function readProviders() {
  try {
    const providers = await moneyRepository.findAllProviders();
    return providers.length > 0 ? providers : SAMPLE_MONEY_TRANSFER_PROVIDERS;
  } catch (error) {
    return SAMPLE_MONEY_TRANSFER_PROVIDERS;
  }
}

async function getExchangeRate(sourceCurrency, targetCurrency) {
  const source = normalizeCurrency(sourceCurrency);
  const target = normalizeCurrency(targetCurrency);
  const liveRate = await readLiveReferenceRate(source, target);
  if (liveRate) return liveRate;

  const rates = await readExchangeRates();

  return (
    rates.find(
      (rate) =>
        rate.status === 'Active' &&
        normalizeCurrency(rate.sourceCurrency) === source &&
        normalizeCurrency(rate.targetCurrency) === target
    ) || null
  );
}

async function getActiveProviders(targetCurrency, sourceCurrency = '') {
  const target = normalizeCurrency(targetCurrency);
  const source = normalizeCurrency(sourceCurrency);
  const providers = await readProviders();

  return providers.filter((provider) => {
    if (provider.status !== 'Active') return false;
    if (target && normalizeCurrency(provider.targetCurrency) !== target) return false;
    if (source && normalizeCurrency(provider.sourceCurrency) !== source) return false;
    return true;
  });
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
  };
}

async function compareTransfers(amount, sourceCurrency, targetCurrency) {
  const providers = await getActiveProviders(targetCurrency, sourceCurrency);

  return providers
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
}

async function getBestTransferOption(amount, sourceCurrency, targetCurrency) {
  const results = await compareTransfers(amount, sourceCurrency, targetCurrency);
  return results[0] || null;
}

function formatMoney(value, currency) {
  return `${Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${currency}`;
}

function formatComparisonForChat(amount, sourceCurrency, targetCurrency, comparison = []) {
  if (!comparison.length) {
    return `I did not find an active transfer provider for ${sourceCurrency} to ${targetCurrency}. ${SAFETY_NOTICE}`;
  }

  const lines = comparison.map((result, index) => {
    return `${index + 1}. ${result.providerName}: recipient gets about ${formatMoney(
      result.finalAmountReceived,
      targetCurrency
    )}. Fee: ${formatMoney(result.transferFee, sourceCurrency)}. Delivery: ${result.estimatedDeliveryTime}. Payout: ${
      result.payoutMethod
    }.`;
  });

  return [
    `${DEMO_NOTICE}`,
    `For ${formatMoney(amount, sourceCurrency)} to ${targetCurrency}, the best demo option is ${comparison[0].providerName}.`,
    ...lines,
    SAFETY_NOTICE,
  ].join('\n');
}

module.exports = {
  DEMO_NOTICE,
  SAFETY_NOTICE,
  calculateTransfer,
  compareTransfers,
  formatComparisonForChat,
  getActiveProviders,
  getBestTransferOption,
  getExchangeRate,
};
