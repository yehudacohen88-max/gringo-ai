const express = require('express');
const communityController = require('./community.controller');
const { blockPersonalDataRoute } = require('../../shared/blockPersonalDataRoute');
const { attachWebIdentity } = require('../../shared/webIdentity');
const { requireSameOrigin } = require('../../shared/requireSameOrigin');

const router = express.Router();

router.get('/', communityController.getPublishedPosts);
router.get('/relevant', requireSameOrigin, attachWebIdentity, communityController.getRelevantPosts);
router.post('/comments/:commentId/flag', blockPersonalDataRoute, communityController.flagComment);
router.get('/:postId', communityController.getPost);
router.post('/:postId/comments', requireSameOrigin, attachWebIdentity, communityController.addComment);

module.exports = router;
