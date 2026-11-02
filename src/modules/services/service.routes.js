const express = require('express');
const serviceController = require('./service.controller');
const { attachWebIdentity } = require('../../shared/webIdentity');
const { requireSameOrigin } = require('../../shared/requireSameOrigin');

const router = express.Router();

router.get('/', serviceController.getServices);
router.get('/matches', requireSameOrigin, attachWebIdentity, serviceController.getMatchingServices);
router.get('/:id', serviceController.getService);

module.exports = router;
