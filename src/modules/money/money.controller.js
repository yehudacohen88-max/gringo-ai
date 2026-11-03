const { loadWebProfile } = require('../../shared/webPersonalData');
const { catalogMessage } = require('../../shared/pilotCatalog');
const { languageFromRequest } = require('../../shared/userFacingCopy');
const moneyService = require('./money.service');

function moneyFields(described, language) {
  const state = described.state || 'empty';
  const demo = described.demo === true;
  return {
    availability: state,
    demo,
    message: state === 'ok' ? '' : catalogMessage(demo ? 'demo' : state, language),
    ...(demo ? { demoNotice: language === 'en' ? moneyService.DEMO_NOTICE : catalogMessage('demo', language) } : {}),
    safetyNotice: moneyService.SAFETY_NOTICE,
  };
}

async function getRate(req, res, next) {
  try {
    const language = languageFromRequest(req);
    const described = await moneyService.resolveExchangeRate(req.query.sourceCurrency || 'ILS', req.query.targetCurrency || 'THB');
    res.status(200).json({
      rate: described.rate,
      ...moneyFields(described, language),
    });
  } catch (error) {
    next(error);
  }
}

async function compareTransfers(req, res, next) {
  try {
    const language = languageFromRequest(req);
    const amount = Number(req.query.amount || 0);
    const sourceCurrency = req.query.sourceCurrency || 'ILS';
    const targetCurrency = req.query.targetCurrency || 'THB';
    const [rate, transfers] = await Promise.all([
      moneyService.resolveExchangeRate(sourceCurrency, targetCurrency),
      moneyService.resolveTransferComparison(amount, sourceCurrency, targetCurrency),
    ]);
    const described = transfers.state === 'ok' && rate.state !== 'ok' && !transfers.results.length ? rate : transfers;

    res.status(200).json({
      amount,
      sourceCurrency,
      targetCurrency,
      rate: rate.rate,
      results: transfers.results,
      bestOption: transfers.results[0] || null,
      rateAvailability: rate.state,
      ...moneyFields(described, language),
    });
  } catch (error) {
    next(error);
  }
}

async function getProfileMoneyDefaults(req, res, next) {
  try {
    const { profile, userId } = await loadWebProfile(req);
    const source = userId && profile ? profile : {};
    res.status(200).json({
      country: source.lastMoneyTransferCountry || source.moneyTransferCountry || source.country || '',
      targetCurrency: source.preferredCurrency || '',
      sourceCurrency: 'ILS',
      amount: source.lastMoneyTransferAmount || '',
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  compareTransfers,
  getProfileMoneyDefaults,
  getRate,
};
