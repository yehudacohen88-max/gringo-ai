const express = require('express');
const jobController = require('./job.controller');
const { blockPersonalDataRoute } = require('../../shared/blockPersonalDataRoute');

const router = express.Router();

router.get('/', jobController.getActiveJobs);
router.get('/matches', blockPersonalDataRoute, jobController.getMatchingJobs);

module.exports = router;
