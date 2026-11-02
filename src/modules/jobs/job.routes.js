const express = require('express');
const jobController = require('./job.controller');
const { attachWebIdentity } = require('../../shared/webIdentity');
const { requireSameOrigin } = require('../../shared/requireSameOrigin');

const router = express.Router();

router.get('/', jobController.getActiveJobs);
router.get('/matches', requireSameOrigin, attachWebIdentity, jobController.getMatchingJobs);

module.exports = router;
