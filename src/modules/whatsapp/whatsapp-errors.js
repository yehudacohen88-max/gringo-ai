class WhatsAppConnectorError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'WhatsAppConnectorError';
    this.statusCode = options.statusCode || 500;
    this.retryable = Boolean(options.retryable);
  }
}

function safeWhatsAppWarning(message) {
  console.warn(`[whatsapp] ${message}`);
}

module.exports = {
  WhatsAppConnectorError,
  safeWhatsAppWarning,
};
