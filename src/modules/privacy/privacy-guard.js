// Central consent checks for the service layer. Every service that creates
// or changes personal data asks here first, so a new route, webhook, admin
// action or scheduled job cannot skip the consent gate by calling the service
// directly. privacy.service is required lazily to avoid load-order cycles.

function service() {
  return require('./privacy.service');
}

function consentRequiredError() {
  const error = new Error('Privacy consent is required before Gringo can save personal data.');
  error.statusCode = 403;
  error.code = 'CONSENT_REQUIRED';
  return error;
}

async function userAllowed(userId) {
  try {
    return await service().allowsProcessingForUser(userId);
  } catch (error) {
    return false;
  }
}

async function identityAllowed(channel, channelUserId) {
  try {
    return await service().allowsPersonalProcessing({ channel, channelUserId });
  } catch (error) {
    return false;
  }
}

async function assertUserAllowed(userId) {
  if (!(await userAllowed(userId))) throw consentRequiredError();
}

async function assertIdentityAllowed(channel, channelUserId) {
  if (!(await identityAllowed(channel, channelUserId))) throw consentRequiredError();
}

module.exports = {
  assertIdentityAllowed,
  assertUserAllowed,
  consentRequiredError,
  identityAllowed,
  userAllowed,
};
