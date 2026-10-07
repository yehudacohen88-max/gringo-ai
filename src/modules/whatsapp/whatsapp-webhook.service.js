const express = require('express');
const { env } = require('../../config/env');
const whatsappDeliveryService = require('./whatsapp-delivery.service');
const whatsappMessageMapper = require('./whatsapp-message.mapper');
const whatsappMessageService = require('./whatsapp-message.service');
const { communicationService } = require('../communication');
const managerRepository = require('../manager-agent/manager-agent.repository');
const { safeWhatsAppWarning } = require('./whatsapp-errors');

const processedMessageIds = [];
const MAX_PROCESSED_IDS = 500;
const webhookHealth = {
  lastWebhookReceivedAt: '',
  lastWebhookStatus: 'Not received',
};

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function rememberMessageId(messageId) {
  const id = cleanText(messageId);
  if (!id) return;
  processedMessageIds.push(id);
  while (processedMessageIds.length > MAX_PROCESSED_IDS) processedMessageIds.shift();
}

function wasProcessed(messageId) {
  const id = cleanText(messageId);
  return Boolean(id && processedMessageIds.includes(id));
}

async function wasPersistedMessageProcessed(messageId) {
  const id = cleanText(messageId);
  if (!id) return false;
  try {
    const conversations = await managerRepository.readConversationHistory();
    return conversations.some((event) => String(event.question || '').includes(`[whatsappMessageId:${id};`));
  } catch (error) {
    return false;
  }
}

function verifyWebhook(req, res) {
  const mode = cleanText(req.query['hub.mode']);
  const token = cleanText(req.query['hub.verify_token']);
  const challenge = cleanText(req.query['hub.challenge']);

  if (mode === 'subscribe' && token && token === env.whatsapp?.verifyToken) {
    res.status(200).send(challenge);
    return;
  }

  res.status(403).json({ error: { message: 'WhatsApp webhook verification failed.' } });
}

async function processMappedMessage(message = {}, handler) {
  if (wasProcessed(message.messageId) || (await wasPersistedMessageProcessed(message.messageId))) {
    rememberMessageId(message.messageId);
    return { duplicate: true, messageId: message.messageId };
  }
  rememberMessageId(message.messageId);

  const adaptedMessage = communicationService.receiveMessage('whatsapp', message);
  const result = await handler(adaptedMessage);
  try {
    const delivery = await whatsappMessageService.sendReply(adaptedMessage, result.reply, {
      buttons: result.buttons,
      listRows: result.listRows,
    });
    await whatsappMessageService.recordDeliveryStatus(
      adaptedMessage,
      result.user?.userId,
      result.reply,
      delivery?.status || result.status || 'WHATSAPP_DELIVERED',
      delivery?.skipped ? 'template_required' : 'delivered'
    );
  } catch (deliveryError) {
    await whatsappMessageService.recordDeliveryStatus(
      adaptedMessage,
      result.user?.userId,
      result.reply,
      'WHATSAPP_DELIVERY_FAILED',
      'failed'
    );
    safeWhatsAppWarning('WhatsApp delivery failed for one reply.');
  }
  return { processed: true, messageId: message.messageId };
}

async function receiveWebhook(req, res, next) {
  try {
    webhookHealth.lastWebhookReceivedAt = new Date().toISOString();
    webhookHealth.lastWebhookStatus = 'Received';
    if (env.whatsapp?.enabled !== true) {
      res.status(200).json({ ok: true, disabled: true });
      return;
    }

    const textMessages = whatsappMessageMapper.getTextMessages(req.body);
    const interactiveMessages = whatsappMessageMapper.getInteractiveMessages(req.body);
    const unsupportedMessages = whatsappMessageMapper.getUnsupportedMessages(req.body);
    const statusEvents = whatsappMessageMapper.getStatusEvents(req.body);
    const results = [];

    for (const statusEvent of statusEvents) {
      const delivery = await whatsappDeliveryService.updateDeliveryStatusFromWebhook(statusEvent);
      results.push({
        statusEvent: true,
        whatsappMessageId: statusEvent.whatsappMessageId,
        updated: Boolean(delivery),
      });
    }

    for (const message of textMessages) {
      results.push(await processMappedMessage(message, whatsappMessageService.processTextMessage));
    }

    for (const message of interactiveMessages) {
      results.push(await processMappedMessage(message, whatsappMessageService.processAction));
    }

    for (const message of unsupportedMessages) {
      results.push(await processMappedMessage(message, whatsappMessageService.processUnsupportedMessage));
    }

    res.status(200).json({ ok: true, results });
  } catch (error) {
    webhookHealth.lastWebhookStatus = 'Failed';
    safeWhatsAppWarning('WhatsApp webhook failed safely.');
    next(error);
  }
}

function getWebhookHealth() {
  return {
    status: webhookHealth.lastWebhookStatus,
    lastWebhookReceivedAt: webhookHealth.lastWebhookReceivedAt,
    duplicateCacheSize: processedMessageIds.length,
  };
}

function createRoutes() {
  const router = express.Router();
  router.get('/webhook', verifyWebhook);
  router.post('/webhook', receiveWebhook);
  return router;
}

module.exports = {
  createRoutes,
  processedMessageIds,
  getWebhookHealth,
  receiveWebhook,
  verifyWebhook,
  wasProcessed,
};
