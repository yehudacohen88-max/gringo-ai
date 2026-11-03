const express = require('express');
const jobController = require('./job.controller');
const { limitPublicRead } = require('../../shared/rateLimit');
const { attachWebIdentity } = require('../../shared/webIdentity');
const { requireSameOrigin } = require('../../shared/requireSameOrigin');

const router = express.Router();

router.get('/', limitPublicRead, jobController.getActiveJobs);
router.get('/matches', requireSameOrigin, attachWebIdentity, jobController.getMatchingJobs);

module.exports = router;
