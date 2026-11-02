const express = require('express');
const notificationController = require('./notification.controller');
const { blockPersonalDataRoute } = require('../../shared/blockPersonalDataRoute');

const router = express.Router();

router.use(blockPersonalDataRoute);

router.get('/', notificationController.listNotifications);
router.get('/summary', notificationController.getSummary);
router.post('/:notificationId/read', notificationController.markAsRead);
router.post('/:notificationId/dismiss', notificationController.dismissNotification);
router.post('/:notificationId/complete', notificationController.completeNotification);
router.post('/:notificationId/remind', notificationController.remindNotification);

module.exports = router;
