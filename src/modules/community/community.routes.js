const express = require('express');
const communityController = require('./community.controller');

const router = express.Router();

router.get('/', communityController.getPublishedPosts);
router.get('/relevant', communityController.getRelevantPosts);
router.get('/:postId', communityController.getPost);
router.post('/:postId/comments', communityController.addComment);
router.post('/comments/:commentId/flag', communityController.flagComment);

module.exports = router;
