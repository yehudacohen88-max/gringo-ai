const { handleChannelPrivacy } = require('../privacy/privacy-channel');
const crypto = require('crypto');
const express = require('express');
const { env } = require('../../config/env');
const whatsappDeliveryService = require('./whatsapp-delivery.service');
const whatsappMessageMapper = require('./whatsapp-message.mapper');
const whatsappMessageService = require('./whatsapp-message.service');
const { communicationService } = require('../communication');
const managerRepository = require('../manager-agent/manager-agent.repository');
const { limitSignedWebhook, noteUnsignedWebhook } = require('../../shared/rateLimit');
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

function configuredSecret(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function queryString(req, name) {
  const value = req.query ? req.query[name] : undefined;
  if (typeof value !== 'string') return '';
  return value.trim();
}

function timingSafeEqual(left, right) {
  if (!Buffer.isBuffer(left) || !Buffer.isBuffer(right) || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function timingSafeTokenEqual(provided, expected) {
  const providedDigest = crypto.createHash('sha256').update(provided, 'utf8').digest();
  const expectedDigest = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}

// Meta's handshake. The challenge is echoed as text only after hub.mode is
// subscribe and the verify token matches. Nothing else from the query is returned.
function verifyWebhook(req, res) {
  const mode = queryString(req, 'hub.mode');
  const token = queryString(req, 'hub.verify_token');
  const challenge = queryString(req, 'hub.challenge');
  const expected = configuredSecret(env.whatsapp && env.whatsapp.verifyToken);

  if (!expected) {
    noteUnsignedWebhook(req);
    safeWhatsAppWarning('WhatsApp verify token is not configured. Rejecting the webhook handshake.');
    res.status(403).json({ error: { message: 'WhatsApp webhook verification failed.' } });
    return;
  }

  if (mode === 'subscribe' && token && timingSafeTokenEqual(token, expected)) {
    res.status(200).type('text/plain').send(challenge);
    return;
  }

  noteUnsignedWebhook(req);
  res.status(403).json({ error: { message: 'WhatsApp webhook verification failed.' } });
}

// X-Hub-Signature-256: sha256=<hex> is HMAC-SHA256 over req.rawBody, not a
// re-serialized JSON object. 401 means the signature is missing or invalid.
// 503 means WHATSAPP_APP_SECRET is not configured (fail closed).
function verifyHubSignature(req) {
  const secret = configuredSecret(env.whatsapp && env.whatsapp.appSecret);
  if (!secret) return { ok: false, status: 503 };

  const header = req.headers && req.headers['x-hub-signature-256'];
  if (typeof header !== 'string') return { ok: false, status: 401 };

  const match = /^sha256=([0-9a-fA-F]{64})$/.exec(header);
  if (!match) return { ok: false, status: 401 };

  if (!Buffer.isBuffer(req.rawBody)) return { ok: false, status: 401 };

  const provided = Buffer.from(match[1], 'hex');
  const expected = crypto.createHmac('sha256', secret).update(req.rawBody).digest();
  if (!timingSafeEqual(provided, expected)) return { ok: false, status: 401 };
  return { ok: true };
}

async function processMappedMessage(message = {}, handler) {
  if (wasProcessed(message.messageId) || (await wasPersistedMessageProcessed(message.messageId))) {
    rememberMessageId(message.messageId);
    return { duplicate: true, messageId: message.messageId };
  }
  rememberMessageId(message.messageId);

  const adaptedMessage = communicationService.receiveMessage('whatsapp', message);
  // Consent and privacy commands run first. Without consent nothing personal is stored.
  const privacyResult = await handleChannelPrivacy('whatsapp', adaptedMessage);
  const result = privacyResult || (await handler(adaptedMessage));
  try {
    const delivery = await whatsappMessageService.sendReply(adaptedMessage, result.reply, {
      buttons: result.buttons,
      listRows: result.listRows,
    });
    if (!result.privacy) await whatsappMessageService.recordDeliveryStatus(
      adaptedMessage,
      result.user?.userId,
      result.reply,
      delivery?.status || result.status || 'WHATSAPP_DELIVERED',
      delivery?.skipped ? 'template_required' : 'delivered'
    );
  } catch (deliveryError) {
    if (!result.privacy) await whatsappMessageService.recordDeliveryStatus(
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
    const verdict = verifyHubSignature(req);
    if (!verdict.ok) {
      noteUnsignedWebhook(req);
      webhookHealth.lastWebhookStatus = 'Rejected';
      if (verdict.status === 503) {
        safeWhatsAppWarning('WhatsApp app secret is not configured. Rejecting the webhook before processing.');
        res.status(503).json({ error: { message: 'WhatsApp webhook is not configured.' } });
        return;
      }
      res.status(401).json({ error: { message: 'WhatsApp webhook signature is invalid.' } });
      return;
    }

    webhookHealth.lastWebhookReceivedAt = new Date().toISOString();
    webhookHealth.lastWebhookStatus = 'Received';
    if (env.whatsapp?.enabled !== true) {
      res.status(200).json({ ok: true, disabled: true });
      return;
    }

    if (!limitSignedWebhook(req, res)) return;

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
