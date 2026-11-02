const { loadWebProfile } = require('../../shared/webPersonalData');
const moneyService = require('./money.service');

async function getRate(req, res, next) {
  try {
    const rate = await moneyService.getExchangeRate(req.query.sourceCurrency || 'ILS', req.query.targetCurrency || 'THB');
    res.status(200).json({
      rate,
      demoNotice: moneyService.DEMO_NOTICE,
      safetyNotice: moneyService.SAFETY_NOTICE,
    });
  } catch (error) {
    next(error);
  }
}

async function compareTransfers(req, res, next) {
  try {
    const amount = Number(req.query.amount || 0);
    const sourceCurrency = req.query.sourceCurrency || 'ILS';
    const targetCurrency = req.query.targetCurrency || 'THB';
    const [rate, results] = await Promise.all([
      moneyService.getExchangeRate(sourceCurrency, targetCurrency),
      moneyService.compareTransfers(amount, sourceCurrency, targetCurrency),
    ]);

    res.status(200).json({
      amount,
      sourceCurrency,
      targetCurrency,
      rate,
      results,
      bestOption: results[0] || null,
      demoNotice: moneyService.DEMO_NOTICE,
      safetyNotice: moneyService.SAFETY_NOTICE,
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
