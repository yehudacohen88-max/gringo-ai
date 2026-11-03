const express = require('express');
const chatController = require('./chat.controller');
const { limitChat } = require('../../shared/rateLimit');
const { attachWebIdentity } = require('../../shared/webIdentity');
const { requireSameOrigin } = require('../../shared/requireSameOrigin');

const router = express.Router();

router.use(requireSameOrigin);
// Count the chat message before a missing cookie can mint a new gw_sid.
router.post('/message', limitChat, attachWebIdentity, chatController.sendMessage);
router.use(attachWebIdentity);
router.get('/onboarding-status', chatController.getOnboardingStatus);
router.get('/profile', chatController.getProfile);
router.get('/startup-summary', chatController.getStartupSummary);
router.put('/profile', chatController.updateProfile);

module.exports = router;
