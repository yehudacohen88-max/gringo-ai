const communicationService = require('./communication.service');
const channelRegistry = require('./channel-registry');
const channelAdapter = require('./channel-adapter');

module.exports = {
  channelAdapter,
  channelRegistry,
  communicationService,
};
