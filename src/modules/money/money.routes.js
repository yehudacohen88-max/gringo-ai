const express = require('express');
const moneyController = require('./money.controller');

const router = express.Router();

router.get('/defaults', moneyController.getProfileMoneyDefaults);
router.get('/rate', moneyController.getRate);
router.get('/compare', moneyController.compareTransfers);

module.exports = router;
