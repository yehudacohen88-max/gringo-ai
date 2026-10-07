const { createNormalizedProviderQuote } = require('./money-transfer-provider-quote-contract');
const { createQuoteSourceTrust } = require('./money-transfer-quote-source-trust');
const { findProviderById } = require('./money-transfer-provider-registry');

const REMITLY_REWIRE_PROVIDER_ID = 'remitly_rewire';
const REMITLY_PUBLIC_SOURCE_URL = 'https://www.remitly.com/il/en/money-transfer/send-money-to-thailand';

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function normalizeCurrency(value) {
  return cleanText(value).toUpperCase();
}

function parseNumber(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const normalized = String(value).replace(/,/g, '').replace(/[^\d.-]/g, '').trim();
  if (!normalized || normalized === '-') return null;

  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function normalizeDeliveryMethods(deliveryMethods = []) {
  const values = Array.isArray(deliveryMethods) ? deliveryMethods : [deliveryMethods];
  const normalized = new Set();

  values.map((method) => cleanText(method).toLowerCase()).forEach((method) => {
    if (!method) return;
    if (method.includes('bank')) normalized.add('bank_account');
    if (method.includes('cash')) normalized.add('cash_pickup');
  });

  return Array.from(normalized);
}

function createUnavailableResult(errorCode, options = {}) {
  const provider = findProviderById(REMITLY_REWIRE_PROVIDER_ID);
  const retrievedAt = cleanText(options.retrievedAt) || new Date().toISOString();
  const sourceTrust = createQuoteSourceTrust({
    sourceType: 'unavailable',
    providerId: REMITLY_REWIRE_PROVIDER_ID,
    retrievedAt,
  });

  return {
    ok: false,
    errorCode,
    providerId: REMITLY_REWIRE_PROVIDER_ID,
    sourceUrl: REMITLY_PUBLIC_SOURCE_URL,
    quote: createNormalizedProviderQuote({
      providerId: REMITLY_REWIRE_PROVIDER_ID,
      providerName: provider?.providerName || 'Remitly / Rewire',
      sourceCurrency: 'ILS',
      targetCurrency: 'THB',
      quoteRetrievedAt: retrievedAt,
      sourceTrust,
      availabilityStatus: 'unavailable',
      notes: [
        'Remitly public quote unavailable.',
        'No Frankfurter, demo, cached, estimated, login-only, CAPTCHA, or anti-bot bypass data was used.',
      ],
    }),
  };
}

function normalizeRemitlyPublicQuote(sourceData = {}, options = {}) {
  const provider = findProviderById(REMITLY_REWIRE_PROVIDER_ID);
  if (!provider) return createUnavailableResult('provider_not_registered', options);

  const sourceCurrency = normalizeCurrency(sourceData.sourceCurrency);
  const targetCurrency = normalizeCurrency(sourceData.targetCurrency);
  if (sourceCurrency !== 'ILS' || targetCurrency !== 'THB') {
    return createUnavailableResult('unsupported_corridor', options);
  }

  const sourceName = cleanText(sourceData.sourceName);
  const sourceType = cleanText(sourceData.sourceType || sourceData.rateType);
  if (/frankfurter/i.test(sourceName) || sourceType === 'reference' || sourceType === 'reference_market_rate') {
    return createUnavailableResult('reference_rate_not_provider_quote', options);
  }
  if (/demo/i.test(sourceName) || sourceType === 'demo') {
    return createUnavailableResult('demo_data_not_provider_quote', options);
  }

  const rate = parseNumber(sourceData.exchangeRate ?? sourceData.customerExchangeRate);
  if (!rate || rate <= 0) return createUnavailableResult('missing_or_invalid_rate', options);

  const rateLabel = cleanText(sourceData.rateLabel);
  const retrievedAt = cleanText(options.retrievedAt || sourceData.retrievedAt) || new Date().toISOString();
  const providerQuoteTimestamp = cleanText(sourceData.providerQuoteTimestamp);
  const deliveryMethods = normalizeDeliveryMethods(sourceData.deliveryMethods);
  const fee = parseNumber(sourceData.transferFee ?? sourceData.fee);
  const totalCustomerCost = parseNumber(sourceData.totalCustomerCost ?? sourceData.total);
  const sendAmount = parseNumber(sourceData.sendAmount);
  const recipientAmount = parseNumber(sourceData.recipientAmount);
  const notes = [
    `Source: ${REMITLY_PUBLIC_SOURCE_URL}`,
    'Source classification: public_provider_quote, not live_provider_quote.',
    'Any rates shown are subject to change.',
  ];

  if (/welcome/i.test(rateLabel)) {
    notes.push('Displayed rate label: Welcome rate.');
    notes.push('Promotional/welcome rate: do not treat as a standard general customer rate or final transfer offer.');
  } else if (rateLabel) {
    notes.push(`Displayed rate label: ${rateLabel}.`);
  }

  if (cleanText(sourceData.fee) === '-') {
    notes.push('Displayed fee was ambiguous "-", so transferFee remains null.');
  }

  if (deliveryMethods.length) {
    notes.push(`Supported public delivery methods: ${deliveryMethods.join(', ')}.`);
  }

  const sourceTrust = createQuoteSourceTrust({
    sourceType: 'public_provider_quote',
    providerId: REMITLY_REWIRE_PROVIDER_ID,
    retrievedAt,
    providerQuoteTimestamp,
    freshnessStatus: providerQuoteTimestamp ? 'unknown' : 'unknown',
    verificationStatus: 'verified_source',
  });

  return {
    ok: true,
    providerId: REMITLY_REWIRE_PROVIDER_ID,
    sourceUrl: REMITLY_PUBLIC_SOURCE_URL,
    deliveryMethods,
    isPromotionalRate: /welcome/i.test(rateLabel),
    quote: createNormalizedProviderQuote({
      quoteId: cleanText(sourceData.quoteId),
      providerId: REMITLY_REWIRE_PROVIDER_ID,
      providerName: 'Remitly',
      sourceCurrency,
      targetCurrency,
      sendAmount,
      transferFee: fee,
      totalCustomerCost,
      customerExchangeRate: rate,
      recipientAmount,
      deliveryMethod: deliveryMethods.length === 1 ? deliveryMethods[0] : 'unknown',
      estimatedDelivery: null,
      quoteRetrievedAt: retrievedAt,
      providerQuoteTimestamp,
      providerQuoteExpiresAt: cleanText(sourceData.providerQuoteExpiresAt),
      sourceTrust,
      availabilityStatus: 'available',
      notes,
    }),
  };
}

module.exports = {
  REMITLY_PUBLIC_SOURCE_URL,
  REMITLY_REWIRE_PROVIDER_ID,
  normalizeRemitlyPublicQuote,
};
