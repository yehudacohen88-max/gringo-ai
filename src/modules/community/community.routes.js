const express = require('express');
const communityController = require('./community.controller');
const { blockPersonalDataRoute } = require('../../shared/blockPersonalDataRoute');

const router = express.Router();

router.get('/', communityController.getPublishedPosts);
router.get('/relevant', blockPersonalDataRoute, communityController.getRelevantPosts);
router.get('/:postId', communityController.getPost);
router.post('/:postId/comments', blockPersonalDataRoute, communityController.addComment);
router.post('/comments/:commentId/flag', blockPersonalDataRoute, communityController.flagComment);

module.exports = router;
