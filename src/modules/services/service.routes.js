const express = require('express');
const serviceController = require('./service.controller');
const { limitPublicRead } = require('../../shared/rateLimit');
const { attachWebIdentity } = require('../../shared/webIdentity');
const { requireSameOrigin } = require('../../shared/requireSameOrigin');

const router = express.Router();

router.get('/', limitPublicRead, serviceController.getServices);
router.get('/matches', requireSameOrigin, attachWebIdentity, serviceController.getMatchingServices);
router.get('/:id', limitPublicRead, serviceController.getService);

module.exports = router;
