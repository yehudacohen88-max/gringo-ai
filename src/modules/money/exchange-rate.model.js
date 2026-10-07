const EXCHANGE_RATE_FIELDS = [
  'rateId',
  'sourceCurrency',
  'targetCurrency',
  'exchangeRate',
  'sourceName',
  'updatedAt',
  'status',
];

const EXCHANGE_RATE_STATUSES = ['Active', 'Inactive'];

module.exports = {
  EXCHANGE_RATE_FIELDS,
  EXCHANGE_RATE_STATUSES,
};
