const express = require('express');
const housingController = require('./housing.controller');

const router = express.Router();

router.get('/', housingController.getActiveHousingListings);
router.get('/matches', housingController.getMatchingHousing);

module.exports = router;
