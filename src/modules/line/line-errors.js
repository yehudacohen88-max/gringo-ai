class LineConnectorError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'LineConnectorError';
    this.statusCode = options.statusCode || 500;
    this.retryable = options.retryable !== false;
    this.failureCode = options.failureCode || 'line_connector_error';
  }
}

function safeLineWarning(message) {
  console.warn(`[LINE] ${message}`);
}

module.exports = {
  LineConnectorError,
  safeLineWarning,
};
