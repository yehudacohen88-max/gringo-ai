const express = require('express');
const chatController = require('./chat.controller');

const router = express.Router();

router.post('/message', chatController.sendMessage);

module.exports = router;
