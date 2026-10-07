const MONEY_TRANSFER_PROVIDER_FIELDS = [
  'providerId',
  'providerName',
  'sourceCurrency',
  'targetCurrency',
  'feeType',
  'fixedFee',
  'percentageFee',
  'providerExchangeRate',
  'minimumAmount',
  'maximumAmount',
  'deliveryTime',
  'payoutMethod',
  'websiteUrl',
  'status',
  'updatedAt',
];

const MONEY_TRANSFER_PROVIDER_STATUSES = ['Active', 'Inactive'];

module.exports = {
  MONEY_TRANSFER_PROVIDER_FIELDS,
  MONEY_TRANSFER_PROVIDER_STATUSES,
};
