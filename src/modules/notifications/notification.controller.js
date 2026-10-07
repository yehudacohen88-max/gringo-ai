const { crmAgentService } = require('../crm-agent');
const notificationService = require('./notification.service');

async function getUser(req) {
  const user = await crmAgentService.findOrCreateUser({
    channel: req.query.channel || req.body.channel || 'web',
    channelUserId: req.query.channelUserId || req.body.channelUserId || 'local-web-user',
  });
  const profile = (await crmAgentService.getUserMemory(user.userId)) || user;
  return { user, profile };
}

async function listNotifications(req, res, next) {
  try {
    const { user, profile } = await getUser(req);
    await notificationService.createNotificationsFromExistingModules(user.userId, profile);
    const notifications = await notificationService.getUserNotifications(user.userId, {
      unread: req.query.filter === 'Unread',
      type: req.query.type || '',
    });
    const unreadCount = await notificationService.getUnreadCount(user.userId);
    res.status(200).json({ notifications, unreadCount });
  } catch (error) {
    next(error);
  }
}

async function getSummary(req, res, next) {
  try {
    const { user, profile } = await getUser(req);
    await notificationService.createNotificationsFromExistingModules(user.userId, profile);
    const notifications = await notificationService.getUserNotifications(user.userId, { unread: true });
    res.status(200).json({
      unreadCount: notifications.length,
      summary: notificationService.summarizeUnread(notifications),
      notifications: notifications.slice(0, 4),
    });
  } catch (error) {
    next(error);
  }
}

async function markAsRead(req, res, next) {
  try {
    res.status(200).json({ notification: await notificationService.markAsRead(req.params.notificationId) });
  } catch (error) {
    next(error);
  }
}

async function dismissNotification(req, res, next) {
  try {
    res.status(200).json({ notification: await notificationService.dismissNotification(req.params.notificationId) });
  } catch (error) {
    next(error);
  }
}

async function completeNotification(req, res, next) {
  try {
    res.status(200).json({ notification: await notificationService.completeNotification(req.params.notificationId) });
  } catch (error) {
    next(error);
  }
}

async function remindNotification(req, res, next) {
  try {
    res.status(201).json(await notificationService.rescheduleNotification(req.params.notificationId, req.body.days));
  } catch (error) {
    next(error);
  }
}

module.exports = {
  completeNotification,
  dismissNotification,
  getSummary,
  listNotifications,
  markAsRead,
  remindNotification,
};
