const express = require('express');
const telegramController = require('./telegram.controller');
const { requireAdminKey } = require('../../shared/requireAdminKey');
const { limitLinkGenerate } = require('../../shared/rateLimit');
const { attachWebIdentity } = require('../../shared/webIdentity');
const { requireSameOrigin } = require('../../shared/requireSameOrigin');

const { requirePersonalConsent } = require('../../shared/requirePersonalConsent');

const router = express.Router();

router.post('/link-code', requireSameOrigin, limitLinkGenerate, attachWebIdentity, requirePersonalConsent, telegramController.createLinkCode);
router.post('/disconnect', requireSameOrigin, attachWebIdentity, telegramController.disconnect);
router.get('/link-history', requireAdminKey, telegramController.history);

module.exports = router;
