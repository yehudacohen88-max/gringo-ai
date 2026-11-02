const express = require('express');
const moneyController = require('./money.controller');
const { attachWebIdentity } = require('../../shared/webIdentity');
const { requireSameOrigin } = require('../../shared/requireSameOrigin');

const router = express.Router();

router.get('/defaults', requireSameOrigin, attachWebIdentity, moneyController.getProfileMoneyDefaults);
router.get('/rate', moneyController.getRate);
router.get('/compare', moneyController.compareTransfers);

module.exports = router;
