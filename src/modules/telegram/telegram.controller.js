const { coreAgentService } = require('../core-agent');
const telegramLinkService = require('./telegram-link.service');

async function getUserContext(req) {
  const onboardingStatus = await coreAgentService.getOnboardingStatus({
    channel: req.query.channel || req.body.channel || 'web',
    channelUserId: req.query.channelUserId || req.body.channelUserId || 'local-web-user',
  });
  return {
    user: onboardingStatus.user,
    profile: onboardingStatus.profile || {},
  };
}

async function createLinkCode(req, res, next) {
  try {
    const userContext = await getUserContext(req);
    const linkCode = await telegramLinkService.createLinkCode(userContext.profile.userId);
    res.status(201).json({
      linkCode,
      instruction: `Send /link ${linkCode.code} to the Gringo Telegram bot.`,
    });
  } catch (error) {
    next(error);
  }
}

async function disconnect(req, res, next) {
  try {
    const userContext = await getUserContext(req);
    const profile = await telegramLinkService.disconnectTelegram(userContext.profile.userId);
    res.status(200).json({ profile });
  } catch (error) {
    next(error);
  }
}

async function history(req, res, next) {
  try {
    const userContext = await getUserContext(req);
    res.status(200).json({ history: await telegramLinkService.getLinkHistory(userContext.profile.userId) });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createLinkCode,
  disconnect,
  history,
};
