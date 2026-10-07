const { coreAgentService } = require('../core-agent');
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
    const status = await coreAgentService.getOnboardingStatus({
      channel: req.query.channel || 'web',
      channelUserId: req.query.channelUserId || 'local-web-user',
    });
    const profile = status.profile || {};

    res.status(200).json({
      country: profile.lastMoneyTransferCountry || profile.moneyTransferCountry || profile.country || '',
      targetCurrency: profile.preferredCurrency || '',
      sourceCurrency: 'ILS',
      amount: profile.lastMoneyTransferAmount || '',
      profile,
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
