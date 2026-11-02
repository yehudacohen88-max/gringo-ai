function errorHandler(error, req, res, next) {
  const isJsonParseError = error instanceof SyntaxError && error.status === 400 && 'body' in error;
  const statusCode = isJsonParseError ? 400 : error.statusCode || 500;
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
