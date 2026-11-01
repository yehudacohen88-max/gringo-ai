const express = require('express');
const { createHash, timingSafeEqual } = require('crypto');
const { env, DEV_ADMIN_API_KEY } = require('../../config/env');
const adminController = require('./admin.controller');

const router = express.Router();
const ADMIN_API_KEY_HEADER = 'x-admin-api-key';

function readHeaderValue(req, name) {
  if (typeof req.get === 'function') {
    const value = req.get(name);
    return typeof value === 'string' ? value : '';
  }

  const headers = req.headers || {};
  const raw = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(raw)) return typeof raw[0] === 'string' ? raw[0] : '';
  return typeof raw === 'string' ? raw : '';
}

function objectCarriesAdminKey(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.keys(value).some((key) => {
    const normalized = key.toLowerCase();
    return normalized === 'adminapikey' || normalized === ADMIN_API_KEY_HEADER;
  });
}

function urlCarriesAdminKey(req) {
  const url = typeof req.originalUrl === 'string' ? req.originalUrl : typeof req.url === 'string' ? req.url : '';
  return /[?&](?:adminApiKey|x-admin-api-key)=/i.test(url);
}

function carriesAdminKeyOutsideHeader(req) {
  return objectCarriesAdminKey(req.query) || objectCarriesAdminKey(req.params) || objectCarriesAdminKey(req.body) || urlCarriesAdminKey(req);
}

function keysMatch(provided, expected) {
  const left = typeof provided === 'string' ? provided.trim() : '';
  const right = typeof expected === 'string' ? expected.trim() : '';
  if (left.length === 0 || right.length === 0) return false;

  const leftHash = createHash('sha256').update(left, 'utf8').digest();
  const rightHash = createHash('sha256').update(right, 'utf8').digest();
  return timingSafeEqual(leftHash, rightHash);
}

function isLoopbackAddress(address) {
  if (typeof address !== 'string') return false;
  const normalized = address.trim().toLowerCase();
  return normalized === '127.0.0.1' || normalized === '::1' || normalized === '::ffff:127.0.0.1';
}

function remoteAddress(req) {
  if (req.socket && typeof req.socket.remoteAddress === 'string') return req.socket.remoteAddress;
  if (req.connection && typeof req.connection.remoteAddress === 'string') return req.connection.remoteAddress;
  return '';
}

function requireAdminKey(req, res, next) {
  const headerOk = keysMatch(readHeaderValue(req, ADMIN_API_KEY_HEADER), env.adminApiKey);
  const devDefaultFromRemoteClient = env.adminApiKey === DEV_ADMIN_API_KEY && !isLoopbackAddress(remoteAddress(req));
  if (carriesAdminKeyOutsideHeader(req) || !headerOk || devDefaultFromRemoteClient) {
    res.status(401).json({ error: { message: 'Admin API key is required.' } });
    return;
  }
  next();
}

router.use(requireAdminKey);

router.get('/dashboard', adminController.getDashboard);
router.get('/translation', adminController.getTranslationOverview);
router.put('/translation/settings', adminController.updateTranslationSettings);
router.post('/reports/daily', adminController.generateDailyReport);
router.post('/reports/weekly', adminController.generateWeeklyReport);
router.post('/reports/:reportId/notes', adminController.saveAdminNote);
router.post('/follow-ups/:followUpId/answer', adminController.saveHumanAnswer);
router.post('/follow-ups/:followUpId/knowledge-draft', adminController.createKnowledgeDraftFromFollowUp);
router.post('/follow-ups/:followUpId/content-draft', adminController.createContentDraftFromQuestion);
router.post('/missing-knowledge/:eventId', adminController.updateMissingKnowledge);
router.put('/content-drafts/:draftId', adminController.updateContentDraft);
router.post('/content-drafts/:draftId/publish', adminController.publishContentDraft);
router.post('/comments/:commentId/moderate', adminController.moderateComment);
router.put('/recommendations/:recommendationId', adminController.updateRecommendation);
router.put('/documents/:documentId', adminController.updateDocument);
router.post('/notifications', adminController.createManualNotification);
router.post('/notifications/:notificationId/cancel', adminController.cancelScheduledNotification);
router.post('/whatsapp/notifications', adminController.createWhatsAppManualNotification);
router.post('/whatsapp/deliveries/:deliveryId/retry', adminController.retryWhatsAppDelivery);
router.post('/whatsapp/deliveries/:deliveryId/cancel', adminController.cancelWhatsAppDelivery);
router.get('/whatsapp/deliveries/:deliveryId/failure', adminController.getWhatsAppFailureReason);
router.post('/tasks', adminController.assignTask);
router.put('/tasks/:taskId', adminController.updateTask);

module.exports = router;
module.exports.requireAdminKey = requireAdminKey;
