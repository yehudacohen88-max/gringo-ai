const {
  createQuoteSourceTrust,
  isProviderTransactionQuote,
} = require('./money-transfer-quote-source-trust');

const DELIVERY_METHODS = Object.freeze(['bank_account', 'cash_pickup', 'card', 'wallet', 'unknown']);
const AVAILABILITY_STATUSES = Object.freeze(['available', 'unavailable', 'unknown', 'expired']);
const REPORTER_TYPES = Object.freeze(['user', 'ambassador']);
const EVIDENCE_STATUSES = Object.freeze(['none', 'submitted']);
const EVIDENCE_TYPES = Object.freeze(['transfer_receipt', 'provider_quote_screenshot', 'other']);

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function normalizeCurrency(value) {
  return cleanText(value).toUpperCase();
}

function normalizeEnum(value, allowedValues, fallback) {
  const normalized = cleanText(value);
  return allowedValues.includes(normalized) ? normalized : fallback;
}

function normalizeMoneyValue(value) {
  if (value === undefined || value === null || value === '') return null;

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeTimestamp(value) {
  return cleanText(value) || null;
}

function normalizeNotes(value) {
  if (Array.isArray(value)) {
    return value.map(cleanText).filter(Boolean);
  }

  const note = cleanText(value);
  return note ? [note] : [];
}

function createNormalizedProviderQuote(input = {}) {
  const sourceTrust = createQuoteSourceTrust(input.sourceTrust || { sourceType: 'unavailable' });
  const canRepresentProviderTransaction = isProviderTransactionQuote(sourceTrust) ||
    sourceTrust.sourceType === 'user_submitted_quote' ||
    sourceTrust.sourceType === 'demo';
  const evidenceStatus = normalizeEnum(input.evidenceStatus, EVIDENCE_STATUSES, 'none');
  const evidenceType = EVIDENCE_TYPES.includes(cleanText(input.evidenceType))
    ? cleanText(input.evidenceType)
    : null;

  return {
    quoteId: cleanText(input.quoteId),
    providerId: cleanText(input.providerId),
    providerName: cleanText(input.providerName),
    sourceCurrency: normalizeCurrency(input.sourceCurrency),
    targetCurrency: normalizeCurrency(input.targetCurrency),
    sendAmount: normalizeMoneyValue(input.sendAmount),
    transferFee: canRepresentProviderTransaction ? normalizeMoneyValue(input.transferFee) : null,
    totalCustomerCost: canRepresentProviderTransaction ? normalizeMoneyValue(input.totalCustomerCost) : null,
    customerExchangeRate: canRepresentProviderTransaction ? normalizeMoneyValue(input.customerExchangeRate) : null,
    recipientAmount: canRepresentProviderTransaction ? normalizeMoneyValue(input.recipientAmount) : null,
    deliveryMethod: normalizeEnum(input.deliveryMethod, DELIVERY_METHODS, 'unknown'),
    estimatedDelivery: cleanText(input.estimatedDelivery) || null,
    quoteRetrievedAt: normalizeTimestamp(input.quoteRetrievedAt),
    providerQuoteTimestamp: normalizeTimestamp(input.providerQuoteTimestamp),
    providerQuoteExpiresAt: normalizeTimestamp(input.providerQuoteExpiresAt),
    reporterType: normalizeEnum(input.reporterType, REPORTER_TYPES, 'user'),
    evidenceStatus,
    evidenceType: evidenceStatus === 'submitted' ? evidenceType : null,
    evidenceReference: cleanText(input.evidenceReference) || null,
    observedAt: normalizeTimestamp(input.observedAt),
    sourceTrust,
    availabilityStatus: canRepresentProviderTransaction
      ? normalizeEnum(input.availabilityStatus, AVAILABILITY_STATUSES, 'unknown')
      : 'unavailable',
    notes: normalizeNotes(input.notes),
  };
}

function isProviderQuoteAvailable(quote = {}) {
  return quote.availabilityStatus === 'available' && isProviderTransactionQuote(quote.sourceTrust);
}

module.exports = {
  AVAILABILITY_STATUSES,
  DELIVERY_METHODS,
  EVIDENCE_STATUSES,
  EVIDENCE_TYPES,
  REPORTER_TYPES,
  createNormalizedProviderQuote,
  isProviderQuoteAvailable,
};
