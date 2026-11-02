const express = require('express');
const moneyController = require('./money.controller');
const { blockPersonalDataRoute } = require('../../shared/blockPersonalDataRoute');

const router = express.Router();

router.get('/defaults', blockPersonalDataRoute, moneyController.getProfileMoneyDefaults);
router.get('/rate', moneyController.getRate);
router.get('/compare', moneyController.compareTransfers);

module.exports = router;
