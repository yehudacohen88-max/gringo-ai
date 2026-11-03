const { logServerError } = require('./logRedaction');
const { languageFromRequest, messageFor } = require('./userFacingCopy');

function clientStatus(error) {
  const numeric = Number(error && error.statusCode);
  if (Number.isInteger(numeric) && numeric >= 400 && numeric <= 599) return numeric;
  return 500;
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    next(error);
    return;
  }

  const isJsonParseError = error instanceof SyntaxError && error.status === 400 && 'body' in error;
  const statusCode = isJsonParseError ? 400 : clientStatus(error);

  if (statusCode >= 500) {
    logServerError(error, req);
    res.status(statusCode).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: messageFor(languageFromRequest(req), 'internal'),
        details: [],
      },
    });
    return;
  }

  const body = {
    message: isJsonParseError ? 'Invalid JSON request body.' : error.message || 'Unexpected server error.',
    details: error.details || [],
  };
  if (!isJsonParseError && typeof error.code === 'string' && error.code) body.code = error.code;

  res.status(statusCode).json({
    error: body,
  });
}

module.exports = { errorHandler };
