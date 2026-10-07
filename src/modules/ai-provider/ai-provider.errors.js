class AiProviderError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'AiProviderError';
    this.details = details;
  }
}

module.exports = {
  AiProviderError,
};
