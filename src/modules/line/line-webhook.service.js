const crypto = require('crypto');
const express = require('express');
const { env } = require('../../config/env');
const managerRepository = require('../manager-agent/manager-agent.repository');
const { coreAgentService } = require('../core-agent');
const lineMessageMapper = require('./line-message.mapper');
const lineMessageService = require('./line-message.service');
const lineClient = require('./line-client.service');
const lineLinkService = require('./line-link.service');
const { communicationService } = require('../communication');
const { safeLineWarning } = require('./line-errors');

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
    return conversations.some((event) => String(event.question || '').includes(`[lineMessageId:${id};`));
  } catch (error) {
    return false;
  }
}

function verifySignature(req = {}) {
  const signature = cleanText(req.headers?.['x-line-signature']);
  const secret = env.line?.channelSecret || '';
  const body = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));

  if (!signature || !secret) return false;

  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64');
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return signatureBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
}

async function processMappedMessage(message = {}, handler) {
  if (wasProcessed(message.messageId) || (await wasPersistedMessageProcessed(message.messageId))) {
    rememberMessageId(message.messageId);
    return { duplicate: true, messageId: message.messageId };
  }
  rememberMessageId(message.messageId);

  const adaptedMessage = communicationService.receiveMessage('line', message);
  const result = await handler(adaptedMessage);
  try {
    const delivery = await lineMessageService.sendReply(
      {
        ...adaptedMessage,
        quickReplies: result.quickReplies || [],
      },
      result.reply
    );
    await lineMessageService.recordDeliveryStatus(
      adaptedMessage,
      result.user?.userId,
      result.reply,
      delivery?.status || result.status || 'LINE_DELIVERED',
      'delivered'
    );
  } catch (deliveryError) {
    await lineMessageService.recordDeliveryStatus(
      adaptedMessage,
      result.user?.userId,
      result.reply,
      'LINE_DELIVERY_FAILED',
      'failed'
    );
    safeLineWarning('LINE delivery failed for one reply.');
  }
  return { processed: true, messageId: message.messageId };
}

function requireAdmin(req, res) {
  const provided = cleanText(req.headers['x-admin-api-key'] || req.query.adminApiKey);
  if (!provided || provided !== env.adminApiKey) {
    res.status(401).json({ error: { message: 'Admin key is required.' } });
    return false;
  }
  return true;
}

async function getUserContext(req) {
  const onboardingStatus = await coreAgentService.getOnboardingStatus({
    channel: req.query.channel || req.body.channel || 'web',
    channelUserId: req.query.channelUserId || req.body.channelUserId || 'local-web-user',
  });
  return {
    user: onboardingStatus.user,
    profile: onboardingStatus.profile || {},
  };
}

async function createLinkCode(req, res, next) {
  try {
    const userContext = await getUserContext(req);
    const linkCode = await lineLinkService.createLinkCode(userContext.profile.userId);
    res.status(201).json({
      linkCode,
      instruction: `Open LINE and send: link ${linkCode.code}`,
    });
  } catch (error) {
    next(error);
  }
}

async function disconnect(req, res, next) {
  try {
    const userContext = await getUserContext(req);
    const profile = await lineLinkService.disconnectLine(userContext.profile.userId);
    res.status(200).json({ profile });
  } catch (error) {
    next(error);
  }
}

async function history(req, res, next) {
  try {
    const userContext = await getUserContext(req);
    res.status(200).json({ history: await lineLinkService.getLinkHistory(userContext.profile.userId) });
  } catch (error) {
    next(error);
  }
}

async function createDefaultRichMenu(req, res, next) {
  try {
    if (!requireAdmin(req, res)) return;
    if (env.line?.enabled !== true) {
      res.status(200).json({
        ok: true,
        disabled: true,
        richMenu: lineClient.buildDefaultRichMenu(),
      });
      return;
    }
    const created = await lineClient.createDefaultRichMenu();
    res.status(200).json({
      ok: true,
      result: created,
    });
  } catch (error) {
    safeLineWarning('Default LINE rich menu creation failed safely.');
    next(error);
  }
}

async function setDefaultRichMenu(req, res, next) {
  try {
    if (!requireAdmin(req, res)) return;
    const richMenuId = cleanText(req.body?.richMenuId);
    if (!richMenuId) {
      res.status(400).json({ error: { message: 'richMenuId is required.' } });
      return;
    }
    const result = await lineClient.setDefaultRichMenu(richMenuId);
    res.status(200).json({ ok: true, result });
  } catch (error) {
    safeLineWarning('Default LINE rich menu assignment failed safely.');
    next(error);
  }
}

async function receiveWebhook(req, res, next) {
  try {
    webhookHealth.lastWebhookReceivedAt = new Date().toISOString();
    webhookHealth.lastWebhookStatus = 'Received';

    if (env.line?.enabled !== true) {
      res.status(200).json({ ok: true, disabled: true });
      return;
    }

    if (!verifySignature(req)) {
      webhookHealth.lastWebhookStatus = 'Rejected';
      res.status(401).json({ error: { message: 'LINE webhook signature is invalid.' } });
      return;
    }

    const textMessages = lineMessageMapper.getTextMessages(req.body);
    const actionMessages = lineMessageMapper.extractPostbackEvents(req.body);
    const unsupportedMessages = lineMessageMapper.getUnsupportedMessages(req.body);
    const results = [];

    for (const message of textMessages) {
      results.push(await processMappedMessage(message, lineMessageService.processTextMessage));
    }

    for (const message of actionMessages) {
      results.push(await processMappedMessage(message, lineMessageService.processAction));
    }

    for (const message of unsupportedMessages) {
      results.push(await processMappedMessage(message, lineMessageService.processUnsupportedMessage));
    }

    res.status(200).json({ ok: true, results });
  } catch (error) {
    webhookHealth.lastWebhookStatus = 'Failed';
    safeLineWarning('LINE webhook failed safely.');
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
  router.post('/webhook', receiveWebhook);
  router.post('/link-code', createLinkCode);
  router.post('/disconnect', disconnect);
  router.get('/link-history', history);
  router.get('/rich-menu/default', (req, res) => {
    res.status(200).json({ ok: true, richMenu: lineClient.buildDefaultRichMenu() });
  });
  router.post('/rich-menu/default', createDefaultRichMenu);
  router.post('/rich-menu/default/set', setDefaultRichMenu);
  return router;
}

module.exports = {
  createRoutes,
  getWebhookHealth,
  createDefaultRichMenu,
  createLinkCode,
  disconnect,
  processedMessageIds,
  history,
  receiveWebhook,
  setDefaultRichMenu,
  verifySignature,
  wasProcessed,
};
