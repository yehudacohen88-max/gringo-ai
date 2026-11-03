const express = require('express');
const housingController = require('./housing.controller');
const { limitPublicRead } = require('../../shared/rateLimit');
const { attachWebIdentity } = require('../../shared/webIdentity');
const { requireSameOrigin } = require('../../shared/requireSameOrigin');

const router = express.Router();

router.get('/', limitPublicRead, housingController.getActiveHousingListings);
router.get('/matches', requireSameOrigin, attachWebIdentity, housingController.getMatchingHousing);

module.exports = router;
