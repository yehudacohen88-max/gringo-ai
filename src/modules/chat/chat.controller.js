const { coreAgentService } = require('../core-agent');

async function sendMessage(req, res, next) {
  try {
    const message = String(req.body.message || '').trim();

    if (!message) {
      res.status(400).json({
        error: {
          message: 'message is required.',
          details: [],
        },
      });
      return;
    }

    const result = await coreAgentService.processWebMessage({
      message,
      channel: req.body.channel || 'web',
      channelUserId: req.body.channelUserId || 'local-web-user',
    });

    res.status(200).json({
      reply: result.reply,
      category: result.category,
      status: result.status,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  sendMessage,
};
