const { coreAgentService } = require('../core-agent');
const { requireExplicitConfirm, resolveWebUserContext } = require('../../shared/requireWebIdentity');
const telegramLinkService = require('./telegram-link.service');

async function ownedProfile(req) {
  const userContext = resolveWebUserContext(req);
  const onboardingStatus = await coreAgentService.getOnboardingStatus(userContext);
  const profile = onboardingStatus.profile || {};
  if (!profile.userId) {
    const error = new Error('A verified web session is required.');
    error.statusCode = 401;
    error.code = 'WEB_SESSION_REQUIRED';
    throw error;
  }
  return profile;
}

async function createLinkCode(req, res, next) {
  try {
    const profile = await ownedProfile(req);
    const linkCode = await telegramLinkService.createLinkCode(profile.userId);
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
    requireExplicitConfirm(req);
    const profile = await ownedProfile(req);
    if (!profile.telegramUserId) {
      res.status(409).json({
        error: {
          code: 'CHANNEL_NOT_CONNECTED',
          message: 'Telegram is not connected to this profile.',
          details: [],
        },
      });
      return;
    }
    const updated = await telegramLinkService.disconnectTelegram(profile.userId);
    res.status(200).json({ profile: updated });
  } catch (error) {
    next(error);
  }
}

async function history(req, res, next) {
  try {
    res.status(200).json({ history: await telegramLinkService.getLinkHistory('') });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createLinkCode,
  disconnect,
  history,
};
