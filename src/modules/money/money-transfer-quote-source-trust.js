const SOURCE_TYPES = Object.freeze([
  'live_provider_quote',
  'public_provider_quote',
  'official_public_information',
  'user_submitted_quote',
  'reference_market_rate',
  'demo',
  'unavailable',
]);

const FRESHNESS_STATUSES = Object.freeze(['fresh', 'stale', 'unknown', 'not_applicable']);
const QUOTE_VERIFICATION_STATUSES = Object.freeze(['verified_source', 'user_reported', 'unverified', 'demo']);

const DEFAULTS_BY_SOURCE_TYPE = Object.freeze({
  live_provider_quote: Object.freeze({
    freshnessStatus: 'unknown',
    verificationStatus: 'verified_source',
  }),
  public_provider_quote: Object.freeze({
    freshnessStatus: 'unknown',
    verificationStatus: 'verified_source',
  }),
  official_public_information: Object.freeze({
    freshnessStatus: 'unknown',
    verificationStatus: 'verified_source',
  }),
  user_submitted_quote: Object.freeze({
    freshnessStatus: 'unknown',
    verificationStatus: 'user_reported',
  }),
  reference_market_rate: Object.freeze({
    freshnessStatus: 'unknown',
    verificationStatus: 'verified_source',
  }),
  demo: Object.freeze({
    freshnessStatus: 'not_applicable',
    verificationStatus: 'demo',
  }),
  unavailable: Object.freeze({
    freshnessStatus: 'not_applicable',
    verificationStatus: 'unverified',
  }),
});

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function normalizeEnum(value, allowedValues, fallback) {
  const normalized = cleanText(value);
  return allowedValues.includes(normalized) ? normalized : fallback;
}

function chooseTimestamp(value) {
  return cleanText(value);
}

function createQuoteSourceTrust(input = {}) {
  const sourceType = normalizeEnum(input.sourceType, SOURCE_TYPES, 'unavailable');
  const defaults = DEFAULTS_BY_SOURCE_TYPE[sourceType];

  const freshnessStatus = normalizeEnum(
    input.freshnessStatus,
    FRESHNESS_STATUSES,
    defaults.freshnessStatus
  );
  const verificationStatus = normalizeEnum(
    input.verificationStatus,
    QUOTE_VERIFICATION_STATUSES,
    defaults.verificationStatus
  );

  return {
    sourceType,
    providerId: cleanText(input.providerId),
    retrievedAt: chooseTimestamp(input.retrievedAt),
    providerQuoteTimestamp: chooseTimestamp(input.providerQuoteTimestamp),
    userSubmittedAt: chooseTimestamp(input.userSubmittedAt),
    freshnessStatus,
    verificationStatus,
  };
}

function createReferenceMarketRateTrust(input = {}) {
  return createQuoteSourceTrust({
    ...input,
    sourceType: 'reference_market_rate',
    verificationStatus: 'verified_source',
  });
}

function createDemoTrust(input = {}) {
  return createQuoteSourceTrust({
    ...input,
    sourceType: 'demo',
    freshnessStatus: 'not_applicable',
    verificationStatus: 'demo',
  });
}

function createUnavailableTrust(input = {}) {
  return createQuoteSourceTrust({
    ...input,
    sourceType: 'unavailable',
    freshnessStatus: 'not_applicable',
    verificationStatus: 'unverified',
  });
}

function isProviderTransactionQuote(trust = {}) {
  return ['live_provider_quote', 'public_provider_quote'].includes(trust.sourceType);
}

function isReferenceMarketRate(trust = {}) {
  return trust.sourceType === 'reference_market_rate';
}

function isUserReported(trust = {}) {
  return trust.sourceType === 'user_submitted_quote' || trust.verificationStatus === 'user_reported';
}

function isDemo(trust = {}) {
  return trust.sourceType === 'demo' || trust.verificationStatus === 'demo';
}

function isUnavailable(trust = {}) {
  return trust.sourceType === 'unavailable';
}

module.exports = {
  FRESHNESS_STATUSES,
  QUOTE_VERIFICATION_STATUSES,
  SOURCE_TYPES,
  createDemoTrust,
  createQuoteSourceTrust,
  createReferenceMarketRateTrust,
  createUnavailableTrust,
  isDemo,
  isProviderTransactionQuote,
  isReferenceMarketRate,
  isUnavailable,
  isUserReported,
};
