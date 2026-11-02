function reject(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function suppliedChannel(req) {
  const bodyChannel = req.body && typeof req.body === 'object' ? req.body.channel : '';
  const queryChannel = req.query ? req.query.channel : '';
  return String(bodyChannel || queryChannel || '').trim().toLowerCase();
}

// Browser channel and channelUserId are never authorization. A non-web channel
// is rejected so a web request cannot select WhatsApp, Telegram, or LINE.
function resolveWebUserContext(req) {
  const channel = suppliedChannel(req);
  if (channel && channel !== 'web') {
    console.warn('[web-identity] Rejected a web request that named a non-web channel.');
    throw reject(400, 'FOREIGN_CHANNEL_REJECTED', 'Web requests cannot use another channel identity.');
  }

  const webId = req.identity && req.identity.kind === 'web' ? String(req.identity.webId || '') : '';
  if (!webId) {
    throw reject(401, 'WEB_SESSION_REQUIRED', 'A verified web session is required.');
  }

  return {
    channel: 'web',
    channelUserId: webId,
  };
}

function requireExplicitConfirm(req) {
  if (!req.body || req.body.confirm !== true) {
    throw reject(409, 'CONFIRMATION_REQUIRED', 'Disconnect requires confirm: true.');
  }
}

module.exports = {
  requireExplicitConfirm,
  resolveWebUserContext,
};
