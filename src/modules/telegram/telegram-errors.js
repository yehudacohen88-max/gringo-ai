class TelegramConnectorError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'TelegramConnectorError';
    this.statusCode = options.statusCode || 500;
    this.retryable = Boolean(options.retryable);
  }
}

function safeTelegramWarning(message) {
  console.warn(`[telegram] ${message}`);
}

module.exports = {
  TelegramConnectorError,
  safeTelegramWarning,
};
