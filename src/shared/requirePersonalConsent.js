// Web routes that create or change personal data use this after
// attachWebIdentity. Reads (GET/HEAD) stay open so a worker who withdrew can
// still see and export their data. The services check again on their own
// (src/modules/privacy/privacy-guard.js), so this is a first line only.
async function requirePersonalConsent(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  try {
    const { assertWebConsent } = require('../modules/privacy/privacy.controller');
    const { resolveWebUserContext } = require('./requireWebIdentity');
    await assertWebConsent(resolveWebUserContext(req));
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = { requirePersonalConsent };
