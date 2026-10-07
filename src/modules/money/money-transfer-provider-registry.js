const CAPABILITY_VALUES = Object.freeze(['true', 'false', 'unknown']);
const VERIFICATION_STATUSES = Object.freeze(['verified', 'partially_verified', 'unverified', 'historical']);
const PROVIDER_STATUSES = Object.freeze(['active', 'inactive', 'historical', 'unknown']);

const UNKNOWN_CAPABILITIES = Object.freeze({
  countryOfOperation: 'unknown',
  supportsSendingFromIsrael: 'unknown',
  supportsThailand: 'unknown',
  supportsILS: 'unknown',
  supportsTHB: 'unknown',
  supportsILSToTHB: 'unknown',
  supportsBankDeposit: 'unknown',
  supportsCashPickup: 'unknown',
  supportsCardPayout: 'unknown',
  supportsWalletPayout: 'unknown',
  hasPublicQuote: 'unknown',
  hasProviderAPI: 'unknown',
  hasPartnerAPI: 'unknown',
  hasAffiliateProgram: 'unknown',
  hasWhiteLabel: 'unknown',
  hasEmbeddedFinanceCapability: 'unknown',
  supportsLiveQuote: 'unknown',
  supportsIndicativeQuote: 'unknown',
});

function createProvider(overrides = {}) {
  return {
    ...UNKNOWN_CAPABILITIES,
    providerId: '',
    providerName: '',
    providerCategory: '',
    providerStatus: 'unknown',
    verificationStatus: 'unverified',
    officialWebsite: 'unknown',
    quoteSource: 'unknown',
    apiDocumentationUrl: 'unknown',
    lastVerifiedAt: '',
    source: 'Sprint 24.5.6A provider universe; capabilities not verified in this sprint.',
    notes: '',
    ...overrides,
  };
}

const MONEY_TRANSFER_PROVIDER_REGISTRY = Object.freeze([
  createProvider({
    providerId: 'neema',
    providerName: 'Neema',
    providerCategory: 'migrant_worker_focused_provider',
    notes: 'Included as a high-priority Israel / migrant-worker provider candidate. ILS to THB support, fees, payout methods, and API availability require verification.',
  }),
  createProvider({
    providerId: 'monox_money',
    providerName: 'Monox / Monox Money',
    providerCategory: 'israeli_remittance_provider',
    notes: 'Included as a high-priority Israel remittance candidate. Capabilities require verification.',
  }),
  createProvider({
    providerId: 'gmt',
    providerName: 'GMT',
    providerCategory: 'israeli_remittance_provider',
    notes: 'Included as a high-priority Israel remittance candidate. Capabilities require verification.',
  }),
  createProvider({
    providerId: 'stb_union',
    providerName: 'STB Union',
    providerCategory: 'israeli_remittance_provider',
    notes: 'Included as a high-priority Israel remittance candidate. Capabilities require verification.',
  }),
  createProvider({
    providerId: 'remitly_rewire',
    providerName: 'Remitly / Rewire',
    providerCategory: 'consumer_remittance_provider',
    notes: 'Single current-provider identity record to avoid accidental duplicate comparison entries for Remitly and historical Rewire naming.',
  }),
  createProvider({
    providerId: 'paysend',
    providerName: 'Paysend',
    providerCategory: 'consumer_remittance_provider',
    notes: 'Included as a consumer remittance candidate. Israel to Thailand capability requires verification.',
  }),
  createProvider({
    providerId: 'moneygram',
    providerName: 'MoneyGram',
    providerCategory: 'consumer_remittance_provider',
    notes: 'Included as a consumer remittance candidate. Israel to Thailand capability requires verification.',
  }),
  createProvider({
    providerId: 'ria_money_transfer',
    providerName: 'Ria Money Transfer',
    providerCategory: 'consumer_remittance_provider',
    notes: 'Included as a consumer remittance candidate. Israel to Thailand capability requires verification.',
  }),
  createProvider({
    providerId: 'western_union',
    providerName: 'Western Union',
    providerCategory: 'consumer_remittance_provider',
    providerStatus: 'unknown',
    notes: 'Kept independently identifiable. Not marked active through Israel Post without current verification.',
  }),
  createProvider({
    providerId: 'israel_post_doar_money_transfer',
    providerName: 'Israel Post / DOAR MONEY TRANSFER',
    providerCategory: 'bank_or_postal_transfer_provider',
    providerStatus: 'unknown',
    notes: 'Postal/bank transfer candidate. Current Western Union relationship and current corridor support require verification.',
  }),
  createProvider({
    providerId: 'moneynet',
    providerName: 'Moneynet',
    providerCategory: 'israeli_remittance_provider',
    notes: 'Included as an Israel remittance candidate. Capabilities require verification.',
  }),
  createProvider({
    providerId: 'wise',
    providerName: 'Wise',
    providerCategory: 'consumer_remittance_provider',
    notes: 'Included as a consumer transfer candidate. Israel to Thailand capability requires verification.',
  }),
  createProvider({
    providerId: 'revolut',
    providerName: 'Revolut',
    providerCategory: 'consumer_remittance_provider',
    notes: 'Included as an additional consumer transfer candidate. Israel to Thailand capability requires verification.',
  }),
  createProvider({
    providerId: 'thunes',
    providerName: 'Thunes',
    providerCategory: 'cross_border_api_provider',
    notes: 'Infrastructure/API candidate only. Must not automatically appear as a consumer comparison provider.',
  }),
  createProvider({
    providerId: 'tranglo',
    providerName: 'Tranglo',
    providerCategory: 'cross_border_api_provider',
    notes: 'Infrastructure/API candidate only. Must not automatically appear as a consumer comparison provider.',
  }),
  createProvider({
    providerId: 'nium',
    providerName: 'Nium',
    providerCategory: 'cross_border_api_provider',
    notes: 'Infrastructure/API candidate only. Must not automatically appear as a consumer comparison provider.',
  }),
  createProvider({
    providerId: 'rapyd',
    providerName: 'Rapyd',
    providerCategory: 'payment_infrastructure_provider',
    notes: 'Infrastructure / embedded-finance candidate only. Must not automatically appear as a consumer comparison provider.',
  }),
  createProvider({
    providerId: 'airwallex',
    providerName: 'Airwallex',
    providerCategory: 'payment_infrastructure_provider',
    notes: 'Infrastructure / embedded-finance candidate only. Must not automatically appear as a consumer comparison provider.',
  }),
]);

function listProviderRegistry() {
  return MONEY_TRANSFER_PROVIDER_REGISTRY.map((provider) => ({ ...provider }));
}

function findProviderById(providerId) {
  return listProviderRegistry().find((provider) => provider.providerId === providerId) || null;
}

function listDirectConsumerComparisonCandidates() {
  return listProviderRegistry().filter((provider) =>
    [
      'consumer_remittance_provider',
      'israeli_remittance_provider',
      'migrant_worker_focused_provider',
      'bank_or_postal_transfer_provider',
    ].includes(provider.providerCategory)
  );
}

function listInfrastructureCandidates() {
  return listProviderRegistry().filter((provider) =>
    ['payment_infrastructure_provider', 'cross_border_api_provider'].includes(provider.providerCategory)
  );
}

module.exports = {
  CAPABILITY_VALUES,
  MONEY_TRANSFER_PROVIDER_REGISTRY,
  PROVIDER_STATUSES,
  VERIFICATION_STATUSES,
  findProviderById,
  listDirectConsumerComparisonCandidates,
  listInfrastructureCandidates,
  listProviderRegistry,
};
