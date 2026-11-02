const { COOKIE_NAME, parseCookieHeader } = require('./webIdentity');

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function isJsonContentType(value) {
  return /^application\/json(?:\s*;|$)/i.test(String(value || '').trim());
}

function hasSessionCookie(req) {
  const cookies = parseCookieHeader(req.headers && req.headers.cookie);
  return Boolean(cookies[COOKIE_NAME]);
}

function publicProtocol(req) {
  const forwarded = String(req.get('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase();
  if (forwarded === 'https' || forwarded === 'http') return forwarded;
  return String(req.protocol || 'http').toLowerCase();
}

// Host must match. An http Origin is rejected when the public scheme is https.
// An https Origin is allowed when the app only sees http and no forwarded scheme,
// because a TLS terminator may not mark the request https.
function originMatchesRequest(origin, req) {
  if (!origin || origin === 'null') return false;
  let url;
  try {
    url = new URL(origin);
  } catch (error) {
    return false;
  }
  if (url.host !== String(req.get('host') || '')) return false;
  const proto = publicProtocol(req);
  if (proto === 'https') return url.protocol === 'https:';
  if (url.protocol === 'http:') return true;
  return url.protocol === 'https:' && !req.get('x-forwarded-proto');
}

function rejectCrossSite(res) {
  res.status(403).json({
    error: {
      code: 'CROSS_SITE_REQUEST_REJECTED',
      message: 'Cross-site state changes are not allowed.',
      details: [],
    },
  });
}

function requireSameOrigin(req, res, next) {
  if (!UNSAFE_METHODS.has(String(req.method || '').toUpperCase())) {
    next();
    return;
  }

  // Referer is ignored. It is not a CSRF proof.
  // Explicit SameSite=Lax is not covered by Chrome's old 2-minute Lax+POST
  // exception (that exception was only for cookies that omitted SameSite).
  // Fail closed anyway when a session cookie arrives without a same-origin
  // browser signal, so an older client that both sends the cookie and omits
  // Origin cannot change profile, link-code, or disconnect state.
  const fetchSite = String(req.get('sec-fetch-site') || '').trim().toLowerCase();
  const origin = req.get('origin');
  if (fetchSite === 'cross-site' || fetchSite === 'same-site') {
    rejectCrossSite(res);
    return;
  }

  if (origin) {
    if (!originMatchesRequest(origin, req)) {
      rejectCrossSite(res);
      return;
    }
  } else if (fetchSite === 'same-origin') {
    // A same-origin fetch site is enough when Origin was stripped.
  } else if (hasSessionCookie(req) || (fetchSite && fetchSite !== 'none')) {
    rejectCrossSite(res);
    return;
  }

  if (!isJsonContentType(req.get('content-type'))) {
    res.status(415).json({
      error: {
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'State-changing requests must use application/json.',
        details: [],
      },
    });
    return;
  }

  next();
}

module.exports = {
  requireSameOrigin,
};
