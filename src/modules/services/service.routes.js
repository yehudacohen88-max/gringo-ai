const express = require('express');
const serviceController = require('./service.controller');

const router = express.Router();

router.get('/', serviceController.getServices);
router.get('/matches', serviceController.getMatchingServices);
router.get('/:id', serviceController.getService);

module.exports = router;
