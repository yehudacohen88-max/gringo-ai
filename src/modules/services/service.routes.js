const express = require('express');
const serviceController = require('./service.controller');
const { blockPersonalDataRoute } = require('../../shared/blockPersonalDataRoute');

const router = express.Router();

router.get('/', serviceController.getServices);
router.get('/matches', blockPersonalDataRoute, serviceController.getMatchingServices);
router.get('/:id', serviceController.getService);

module.exports = router;
