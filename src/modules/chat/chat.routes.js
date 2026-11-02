const express = require('express');
const chatController = require('./chat.controller');
const { attachWebIdentity } = require('../../shared/webIdentity');
const { requireSameOrigin } = require('../../shared/requireSameOrigin');

const router = express.Router();

router.use(requireSameOrigin);
router.use(attachWebIdentity);
router.get('/onboarding-status', chatController.getOnboardingStatus);
router.get('/profile', chatController.getProfile);
router.get('/startup-summary', chatController.getStartupSummary);
router.put('/profile', chatController.updateProfile);
router.post('/message', chatController.sendMessage);

module.exports = router;
