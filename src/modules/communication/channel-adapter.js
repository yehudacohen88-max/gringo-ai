const { CommunicationError } = require('./communication-errors');

const REQUIRED_METHODS = [
  'initialize',
  'receiveMessage',
  'sendMessage',
  'sendInteractiveMessage',
  'sendNotification',
  'linkAccount',
  'unlinkAccount',
  'supportsFeature',
  'healthCheck',
];

function createChannelAdapter(channel, implementation = {}) {
  const adapter = { channel, ...implementation };
  const missing = REQUIRED_METHODS.filter((method) => typeof adapter[method] !== 'function');
  if (missing.length) {
    throw new CommunicationError(`Channel adapter is incomplete: ${missing.join(', ')}`, {
      channel,
      retryable: false,
      failureCode: 'adapter_incomplete',
    });
  }
  return adapter;
}

module.exports = {
  REQUIRED_METHODS,
  createChannelAdapter,
};
