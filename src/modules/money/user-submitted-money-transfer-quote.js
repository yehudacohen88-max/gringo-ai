const {
  DELIVERY_METHODS,
  EVIDENCE_STATUSES,
  EVIDENCE_TYPES,
  REPORTER_TYPES,
  createNormalizedProviderQuote,
} = require('./money-transfer-provider-quote-contract');
const { createQuoteSourceTrust } = require('./money-transfer-quote-source-trust');
const { findProviderById, listProviderRegistry } = require('./money-transfer-provider-registry');

const OPTIONAL_MONETARY_FIELDS = Object.freeze([
  'transferFee',
  'totalCustomerCost',
  'customerExchangeRate',
  'recipientAmount',
]);

const REQUIRED_FIELDS = Object.freeze([
  'providerId',
  'sourceCurrency',
  'targetCurrency',
  'sendAmount',
  'userSubmittedAt',
]);

const SENSITIVE_FIELDS = Object.freeze([
  'passportNumber',
  'passport',
  'bankAccount',
  'bankAccountNumber',
  'iban',
  'cardNumber',
  'recipientName',
  'recipientPhone',
  'phoneNumber',
  'screenshot',
]);

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function hasOwn(input, field) {
  return Object.prototype.hasOwnProperty.call(input, field);
}

function normalizeProviderId(providerId) {
  const value = cleanText(providerId).toLowerCase();
  if (['remitly', 'rewire', 'remitly_rewire'].includes(value)) return 'remitly_rewire';
  return value;
}

function normalizeCurrency(value) {
  return cleanText(value).toUpperCase();
}

function isValidCurrency(value) {
  return /^[A-Z]{3}$/.test(value);
}

function parseNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const number = Number(value.replace(/,/g, ''));
    return Number.isFinite(number) ? number : null;
  }
  return null;
}

function addError(errors, field, code, message) {
  errors.push({ field, code, message });
}

function createSuppliedFields(input = {}) {
  return {
    providerId: hasOwn(input, 'providerId'),
    sourceCurrency: hasOwn(input, 'sourceCurrency'),
    targetCurrency: hasOwn(input, 'targetCurrency'),
    sendAmount: hasOwn(input, 'sendAmount'),
    transferFee: hasOwn(input, 'transferFee'),
    totalCustomerCost: hasOwn(input, 'totalCustomerCost'),
    customerExchangeRate: hasOwn(input, 'customerExchangeRate'),
    recipientAmount: hasOwn(input, 'recipientAmount'),
    deliveryMethod: hasOwn(input, 'deliveryMethod'),
    estimatedDelivery: hasOwn(input, 'estimatedDelivery'),
    providerQuoteTimestamp: hasOwn(input, 'providerQuoteTimestamp'),
    userSubmittedAt: hasOwn(input, 'userSubmittedAt'),
    reporterType: hasOwn(input, 'reporterType'),
    evidenceStatus: hasOwn(input, 'evidenceStatus'),
    evidenceType: hasOwn(input, 'evidenceType'),
    evidenceReference: hasOwn(input, 'evidenceReference'),
    observedAt: hasOwn(input, 'observedAt'),
  };
}

function validateUserSubmittedQuoteInput(input = {}) {
  const errors = [];

  for (const field of SENSITIVE_FIELDS) {
    if (hasOwn(input, field) && cleanText(input[field])) {
      addError(errors, field, 'sensitive_field_not_allowed', `${field} must not be collected for quote normalization.`);
    }
  }

  for (const field of REQUIRED_FIELDS) {
    if (!hasOwn(input, field) || cleanText(input[field]) === '') {
      addError(errors, field, 'required', `${field} is required.`);
    }
  }

  const sourceCurrency = normalizeCurrency(input.sourceCurrency);
  const targetCurrency = normalizeCurrency(input.targetCurrency);
  if (hasOwn(input, 'sourceCurrency') && !isValidCurrency(sourceCurrency)) {
    addError(errors, 'sourceCurrency', 'invalid_currency', 'sourceCurrency must be a three-letter currency code.');
  }
  if (hasOwn(input, 'targetCurrency') && !isValidCurrency(targetCurrency)) {
    addError(errors, 'targetCurrency', 'invalid_currency', 'targetCurrency must be a three-letter currency code.');
  }

  if (hasOwn(input, 'sendAmount')) {
    const sendAmount = parseNumber(input.sendAmount);
    if (sendAmount === null || sendAmount < 0) {
      addError(errors, 'sendAmount', 'invalid_monetary_amount', 'sendAmount must be a finite non-negative number.');
    }
  }

  for (const field of ['transferFee', 'totalCustomerCost', 'recipientAmount']) {
    if (hasOwn(input, field) && cleanText(input[field]) !== '') {
      const number = parseNumber(input[field]);
      if (number === null || number < 0) {
        addError(errors, field, 'invalid_monetary_amount', `${field} must be a finite non-negative number when supplied.`);
      }
    }
  }

  if (hasOwn(input, 'customerExchangeRate') && cleanText(input.customerExchangeRate) !== '') {
    const rate = parseNumber(input.customerExchangeRate);
    if (rate === null || rate <= 0) {
      addError(errors, 'customerExchangeRate', 'invalid_exchange_rate', 'customerExchangeRate must be a finite positive number when supplied.');
    }
  }

  if (hasOwn(input, 'deliveryMethod') && cleanText(input.deliveryMethod) !== '') {
    const deliveryMethod = cleanText(input.deliveryMethod);
    if (!DELIVERY_METHODS.includes(deliveryMethod)) {
      addError(errors, 'deliveryMethod', 'invalid_delivery_method', 'deliveryMethod is not supported by the quote contract.');
    }
  }

  if (hasOwn(input, 'reporterType') && cleanText(input.reporterType) !== '' && !REPORTER_TYPES.includes(cleanText(input.reporterType))) {
    addError(errors, 'reporterType', 'invalid_reporter_type', 'reporterType must be user or ambassador when supplied.');
  }

  if (hasOwn(input, 'evidenceStatus') && cleanText(input.evidenceStatus) !== '' && !EVIDENCE_STATUSES.includes(cleanText(input.evidenceStatus))) {
    addError(errors, 'evidenceStatus', 'invalid_evidence_status', 'evidenceStatus must be none or submitted when supplied.');
  }

  if (hasOwn(input, 'evidenceType') && cleanText(input.evidenceType) !== '' && !EVIDENCE_TYPES.includes(cleanText(input.evidenceType))) {
    addError(errors, 'evidenceType', 'invalid_evidence_type', 'evidenceType is not supported.');
  }

  return errors;
}

function createUnavailableQuote(input, suppliedFields, errors) {
  const providerId = normalizeProviderId(input.providerId);
  const sourceTrust = createQuoteSourceTrust({
    sourceType: 'unavailable',
    providerId,
    userSubmittedAt: cleanText(input.userSubmittedAt),
    providerQuoteTimestamp: cleanText(input.providerQuoteTimestamp),
  });

  return {
    ok: false,
    errors,
    suppliedFields,
    provider: null,
    providerKnown: false,
    quote: createNormalizedProviderQuote({
      providerId,
      sourceCurrency: input.sourceCurrency,
      targetCurrency: input.targetCurrency,
      sendAmount: input.sendAmount,
      quoteRetrievedAt: cleanText(input.userSubmittedAt) || null,
      providerQuoteTimestamp: cleanText(input.providerQuoteTimestamp),
      sourceTrust,
      availabilityStatus: 'unavailable',
      notes: 'User-submitted quote could not be normalized. No fallback, estimate, Frankfurter, or demo data was used.',
    }),
  };
}

function normalizeUserSubmittedMoneyTransferQuote(input = {}) {
  const suppliedFields = createSuppliedFields(input);
  const errors = validateUserSubmittedQuoteInput(input);

  if (errors.length > 0) {
    return createUnavailableQuote(input, suppliedFields, errors);
  }

  const providerId = normalizeProviderId(input.providerId);
  const provider = findProviderById(providerId);
  const providerKnown = Boolean(provider);
  const sourceTrust = createQuoteSourceTrust({
    sourceType: 'user_submitted_quote',
    providerId,
    providerQuoteTimestamp: cleanText(input.providerQuoteTimestamp),
    userSubmittedAt: cleanText(input.userSubmittedAt),
    freshnessStatus: 'unknown',
    verificationStatus: 'user_reported',
  });
  const notes = [
    'User-submitted quote: unverified and not an official provider quote.',
    'No recipient amount, fee, rate, total cost, delivery time, Frankfurter rate, or demo data was inferred.',
  ];
  const reporterType = cleanText(input.reporterType) === 'ambassador' ? 'ambassador' : 'user';
  const evidenceStatus = cleanText(input.evidenceStatus) === 'submitted' ? 'submitted' : 'none';
  const evidenceType = evidenceStatus === 'submitted' ? cleanText(input.evidenceType) : '';

  if (!providerKnown) {
    notes.push('Provider identity was not found in the registry; no provider capabilities were inferred.');
  }

  if (reporterType === 'ambassador' && evidenceStatus === 'submitted') {
    notes.push('Ambassador evidence was submitted, but this does not mean provider verification, Gringo verification, official information, or a live quote.');
  }

  const quote = createNormalizedProviderQuote({
    quoteId: cleanText(input.quoteId),
    providerId,
    providerName: provider?.providerName || cleanText(input.providerName),
    sourceCurrency: input.sourceCurrency,
    targetCurrency: input.targetCurrency,
    sendAmount: input.sendAmount,
    transferFee: input.transferFee,
    totalCustomerCost: input.totalCustomerCost,
    customerExchangeRate: input.customerExchangeRate,
    recipientAmount: input.recipientAmount,
    deliveryMethod: cleanText(input.deliveryMethod) || 'unknown',
    estimatedDelivery: input.estimatedDelivery,
    quoteRetrievedAt: cleanText(input.userSubmittedAt),
    providerQuoteTimestamp: cleanText(input.providerQuoteTimestamp),
    reporterType,
    evidenceStatus,
    evidenceType,
    evidenceReference: cleanText(input.evidenceReference),
    observedAt: cleanText(input.observedAt),
    sourceTrust,
    availabilityStatus: providerKnown ? 'unknown' : 'unavailable',
    notes,
  });

  return {
    ok: true,
    errors: [],
    suppliedFields,
    provider: provider ? { ...provider } : null,
    providerKnown,
    quote,
  };
}

module.exports = {
  OPTIONAL_MONETARY_FIELDS,
  REQUIRED_FIELDS,
  SENSITIVE_FIELDS,
  normalizeProviderId,
  normalizeUserSubmittedMoneyTransferQuote,
  validateUserSubmittedQuoteInput,
};
