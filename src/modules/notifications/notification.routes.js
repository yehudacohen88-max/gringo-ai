const express = require('express');
const notificationController = require('./notification.controller');
const { attachWebIdentity } = require('../../shared/webIdentity');
const { requireSameOrigin } = require('../../shared/requireSameOrigin');

const { requirePersonalConsent } = require('../../shared/requirePersonalConsent');

const router = express.Router();

router.use(requireSameOrigin);
router.use(attachWebIdentity);
router.use(requirePersonalConsent);

router.get('/', notificationController.listNotifications);
router.get('/summary', notificationController.getSummary);
router.post('/:notificationId/read', notificationController.markAsRead);
router.post('/:notificationId/dismiss', notificationController.dismissNotification);
router.post('/:notificationId/complete', notificationController.completeNotification);
router.post('/:notificationId/remind', notificationController.remindNotification);

module.exports = router;
