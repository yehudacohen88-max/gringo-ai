class CommunicationError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'CommunicationError';
    this.channel = options.channel || '';
    this.feature = options.feature || '';
    this.retryable = options.retryable !== false;
    this.failureCode = options.failureCode || 'communication_error';
  }
}

function safeCommunicationLog(event = {}) {
  const safeEvent = {
    type: event.type || 'communication',
    channel: event.channel || '',
    fallbackUsed: Boolean(event.fallbackUsed),
    feature: event.feature || '',
    status: event.status || '',
    failureCode: event.failureCode || '',
  };
  console.log(`[Communication] ${JSON.stringify(safeEvent)}`);
}

module.exports = {
  CommunicationError,
  safeCommunicationLog,
};
