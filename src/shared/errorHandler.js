function errorHandler(error, req, res, next) {
  const isJsonParseError = error instanceof SyntaxError && error.status === 400 && 'body' in error;
  const statusCode = isJsonParseError ? 400 : error.statusCode || 500;

  res.status(statusCode).json({
    error: {
      message: isJsonParseError ? 'Invalid JSON request body.' : error.message || 'Unexpected server error.',
      details: error.details || [],
    },
  });
}

module.exports = { errorHandler };
