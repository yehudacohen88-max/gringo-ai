const express = require('express');
const telegramController = require('./telegram.controller');
const { requireAdminKey } = require('../../shared/requireAdminKey');

const router = express.Router();

router.post('/link-code', telegramController.createLinkCode);
router.post('/disconnect', telegramController.disconnect);
router.get('/link-history', requireAdminKey, telegramController.history);

module.exports = router;
