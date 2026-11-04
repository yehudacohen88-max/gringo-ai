const { crmAgentService } = require('../modules/crm-agent');
const { resolveWebUserContext } = require('./requireWebIdentity');
const { isOwnedBy } = require('./recordOwner');

const CLIENT_IDENTITY_FIELDS = ['userId', 'ownerUserId', 'channelUserId', 'channel', 'ownerKey', 'webId', 'webIdentityBoundAt'];

function sendNotFound(res) {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'Not found.',
      details: [],
    },
  });
}

function stripClientIdentity(body, extraFields = []) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {};
  const copy = { ...body };
  for (const key of [...CLIENT_IDENTITY_FIELDS, ...extraFields]) delete copy[key];
  return copy;
}

// Reads the signed web session only. create is for the first mutation, when
// a profile row is required. Reads of a new cookie do not insert a row and
// do not attach legacy web_<timestamp> or local-web-user profiles.
async function loadWebProfile(req, { create = false } = {}) {
  const context = resolveWebUserContext(req);
  if (create) {
    // Lazy require: privacy loads the CRM module, which this file also loads.
    await require('../modules/privacy/privacy.controller').assertWebConsent(context);
  }
  const profile = create
    ? await crmAgentService.findOrCreateUser(context)
    : await crmAgentService.findUserByChannel(context.channel, context.channelUserId);
  const userId = profile && profile.userId ? String(profile.userId) : '';
  return {
    context,
    profile: profile || null,
    userId,
  };
}

function sameOwner(record, userId) {
  return isOwnedBy(record, userId);
}

module.exports = {
  CLIENT_IDENTITY_FIELDS,
  loadWebProfile,
  sameOwner,
  sendNotFound,
  stripClientIdentity,
};
