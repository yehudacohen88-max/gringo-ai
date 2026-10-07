const express = require('express');
const telegramController = require('./telegram.controller');

const router = express.Router();

router.post('/link-code', telegramController.createLinkCode);
router.post('/disconnect', telegramController.disconnect);
router.get('/link-history', telegramController.history);

module.exports = router;
