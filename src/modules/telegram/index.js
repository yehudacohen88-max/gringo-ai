const telegramClientService = require('./telegram-client.service');
const telegramDeliveryService = require('./telegram-delivery.service');
const telegramLinkService = require('./telegram-link.service');
const telegramMessageService = require('./telegram-message.service');
const telegramUpdateService = require('./telegram-update.service');
const telegramMessageMapper = require('./telegram-message.mapper');
const telegramRoutes = require('./telegram.routes');

module.exports = {
  telegramClientService,
  telegramDeliveryService,
  telegramLinkService,
  telegramMessageMapper,
  telegramMessageService,
  telegramRoutes,
  telegramUpdateService,
};
