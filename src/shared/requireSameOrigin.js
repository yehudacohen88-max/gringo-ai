const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function isJsonContentType(value) {
  return /^application\/json(?:\s*;|$)/i.test(String(value || '').trim());
}

function originMatchesHost(origin, hostHeader) {
  if (!origin || origin === 'null' || !hostHeader) return false;
  let url;
  try {
    url = new URL(origin);
  } catch (error) {
    return false;
  }
  return url.host === hostHeader;
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

  const fetchSite = String(req.get('sec-fetch-site') || '').trim().toLowerCase();
  if (fetchSite === 'cross-site') {
    rejectCrossSite(res);
    return;
  }

  const origin = req.get('origin');
  if (origin && !originMatchesHost(origin, req.get('host'))) {
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
