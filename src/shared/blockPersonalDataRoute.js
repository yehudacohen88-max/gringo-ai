const { ROUTE_SECURITY } = require('./routeSecurity');

const PERSONAL_DATA_BLOCK_CODE = 'PERSONAL_DATA_TEMPORARILY_UNAVAILABLE';
const PERSONAL_DATA_BLOCK_MESSAGE = 'This personal-data route is temporarily unavailable until verified worker identity is applied.';

function routeTemplateToRegExp(path) {
  const pattern = String(path)
    .split('/')
    .map((part) => (part.startsWith(':') ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('/');
  return new RegExp(`^${pattern}$`);
}

// web-identity rows that sit inside the personal-data family are the only
// requests allowed past the path-variant gate. Everything else in that family
// still fails closed before a data store is touched.
const restoredPersonalMatchers = ROUTE_SECURITY.filter((entry) => entry.classification === 'web-identity').map((entry) => ({
  method: entry.method,
  regex: routeTemplateToRegExp(entry.path),
}));

function isRestoredPersonalRequest(method, path) {
  return restoredPersonalMatchers.some((entry) => entry.method === method && entry.regex.test(path));
}

function personalDataUnavailableError() {
  const error = new Error(PERSONAL_DATA_BLOCK_MESSAGE);
  error.statusCode = 403;
  error.code = PERSONAL_DATA_BLOCK_CODE;
  return error;
}

function normalizeRequestPath(originalUrl) {
  const raw = String(originalUrl || '').split('?')[0].split('#')[0];
  if (/%(?![0-9A-Fa-f]{2})/.test(raw)) return { malformed: true, path: '' };
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch (error) {
    return { malformed: true, path: '' };
  }
  let path = decoded.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return { malformed: false, path: path.toLowerCase() };
}

function isBlockedPersonalDataPath(path) {
  return (
    path.startsWith('/api/documents') ||
    path.startsWith('/api/tasks') ||
    path.startsWith('/api/notifications') ||
    path === '/api/jobs/matches' ||
    path.startsWith('/api/jobs/matches/') ||
    path === '/api/housing/matches' ||
    path.startsWith('/api/housing/matches/') ||
    path === '/api/services/matches' ||
    path.startsWith('/api/services/matches/') ||
    path === '/api/money/defaults' ||
    path.startsWith('/api/money/defaults/') ||
    path === '/api/community/relevant' ||
    path.startsWith('/api/community/relevant/') ||
    /^\/api\/community\/[^/]+\/comments$/.test(path) ||
    /^\/api\/community\/comments\/[^/]+\/flag$/.test(path)
  );
}

function requestPath(req) {
  return String(req.originalUrl || req.url || '').split('?')[0].split('#')[0];
}

function blockPersonalDataVariants(req, res, next) {
  const raw = requestPath(req);
  const normalized = normalizeRequestPath(raw);
  if (normalized.malformed) {
    res.status(400).json({
      error: {
        code: PERSONAL_DATA_BLOCK_CODE,
        message: 'The request path could not be read.',
        details: [],
      },
    });
    return;
  }
  if (!isBlockedPersonalDataPath(normalized.path)) {
    next();
    return;
  }
  const method = String(req.method || '').toUpperCase();
  // Case, encoding, extra slashes, and unsupported methods stay blocked.
  // The live handler sees the original path only when it is already canonical.
  if (raw === normalized.path && isRestoredPersonalRequest(method, normalized.path)) {
    next();
    return;
  }
  blockPersonalDataRoute(req, res);
}

function blockPersonalDataRoute(req, res) {
  res.status(403).json({
    error: {
      code: PERSONAL_DATA_BLOCK_CODE,
      message: PERSONAL_DATA_BLOCK_MESSAGE,
      details: [],
    },
  });
}

// Evaluated as an identity argument so a handler cannot reach a data store
// with a client-chosen user id if the route gate is removed.
function refusePersonalDataChannelUserId() {
  throw personalDataUnavailableError();
}

module.exports = {
  PERSONAL_DATA_BLOCK_CODE,
  PERSONAL_DATA_BLOCK_MESSAGE,
  blockPersonalDataRoute,
  blockPersonalDataVariants,
  isBlockedPersonalDataPath,
  isRestoredPersonalRequest,
  normalizeRequestPath,
  personalDataUnavailableError,
  refusePersonalDataChannelUserId,
};
