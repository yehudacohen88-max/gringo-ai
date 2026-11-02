const PERSONAL_DATA_BLOCK_CODE = 'PERSONAL_DATA_TEMPORARILY_UNAVAILABLE';
const PERSONAL_DATA_BLOCK_MESSAGE = 'This personal-data route is temporarily unavailable until verified worker identity is applied.';

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

function blockPersonalDataVariants(req, res, next) {
  const normalized = normalizeRequestPath(req.originalUrl || req.url || '');
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
  if (isBlockedPersonalDataPath(normalized.path)) {
    blockPersonalDataRoute(req, res);
    return;
  }
  next();
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
  normalizeRequestPath,
  personalDataUnavailableError,
  refusePersonalDataChannelUserId,
};
