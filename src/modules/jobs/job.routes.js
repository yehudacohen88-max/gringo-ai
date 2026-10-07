const express = require('express');
const jobController = require('./job.controller');

const router = express.Router();

router.get('/', jobController.getActiveJobs);
router.get('/matches', jobController.getMatchingJobs);

module.exports = router;
