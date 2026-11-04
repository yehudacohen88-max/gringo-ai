const express = require('express');
const adminController = require('./admin.controller');
const { requireAdminKey } = require('../../shared/requireAdminKey');
const privacyController = require('../privacy/privacy.controller');

const router = express.Router();

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
router.get('/ai-usage', (req, res) => res.json({ success: true, data: require('../ai-provider/ai-budget.service').snapshot() }));
router.post('/privacy/retry-deletions', privacyController.postAdminRetryDeletions);

module.exports = router;
module.exports.requireAdminKey = requireAdminKey;
