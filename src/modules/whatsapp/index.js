const whatsappClientService = require('./whatsapp-client.service');
const whatsappDeliveryService = require('./whatsapp-delivery.service');
const whatsappMessageMapper = require('./whatsapp-message.mapper');
const whatsappMessageService = require('./whatsapp-message.service');
const whatsappWebhookService = require('./whatsapp-webhook.service');

module.exports = {
  whatsappClientService,
  whatsappDeliveryService,
  whatsappMessageMapper,
  whatsappMessageService,
  whatsappRoutes: whatsappWebhookService.createRoutes(),
  whatsappWebhookService,
};
