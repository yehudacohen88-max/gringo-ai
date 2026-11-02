const express = require('express');
const housingController = require('./housing.controller');
const { blockPersonalDataRoute } = require('../../shared/blockPersonalDataRoute');

const router = express.Router();

router.get('/', housingController.getActiveHousingListings);
router.get('/matches', blockPersonalDataRoute, housingController.getMatchingHousing);

module.exports = router;
