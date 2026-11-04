const express = require('express');
const communityController = require('./community.controller');
const { blockPersonalDataRoute } = require('../../shared/blockPersonalDataRoute');
const { limitPublicRead } = require('../../shared/rateLimit');
const { attachWebIdentity } = require('../../shared/webIdentity');
const { requireSameOrigin } = require('../../shared/requireSameOrigin');

const { requirePersonalConsent } = require('../../shared/requirePersonalConsent');

const router = express.Router();

router.get('/', limitPublicRead, communityController.getPublishedPosts);
router.get('/relevant', requireSameOrigin, attachWebIdentity, communityController.getRelevantPosts);
router.post('/comments/:commentId/flag', blockPersonalDataRoute, communityController.flagComment);
router.get('/:postId', limitPublicRead, communityController.getPost);
router.post('/:postId/comments', requireSameOrigin, attachWebIdentity, requirePersonalConsent, communityController.addComment);

module.exports = router;
