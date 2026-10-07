const moneyRoutes = require('./money.routes');
const moneyService = require('./money.service');
const providerQuoteContract = require('./money-transfer-provider-quote-contract');
const providerRegistry = require('./money-transfer-provider-registry');
const quoteSourceTrust = require('./money-transfer-quote-source-trust');
const remitlyPublicQuoteAdapter = require('./remitly-public-quote.adapter');
const userSubmittedQuote = require('./user-submitted-money-transfer-quote');
const userSubmittedQuoteComparison = require('./user-submitted-transfer-quote-comparison');
const userSubmittedTransferQuoteRepository = require('./user-submitted-transfer-quote.repository');

module.exports = {
  moneyRoutes,
  moneyService,
  providerQuoteContract,
  providerRegistry,
  quoteSourceTrust,
  remitlyPublicQuoteAdapter,
  userSubmittedQuote,
  userSubmittedQuoteComparison,
  userSubmittedTransferQuoteRepository,
};
