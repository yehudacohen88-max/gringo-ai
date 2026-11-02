const { loadWebProfile, sameOwner, sendNotFound, stripClientIdentity } = require('../../shared/webPersonalData');
const notificationService = require('./notification.service');

async function ownedNotification(userId, notificationId) {
  if (!userId) return null;
  const notification = await notificationService.getNotificationById(notificationId);
  return sameOwner(notification, userId) ? notification : null;
}

async function listNotifications(req, res, next) {
  try {
    const { profile, userId } = await loadWebProfile(req);
    if (!userId) {
      res.status(200).json({ notifications: [], unreadCount: 0 });
      return;
    }
    await notificationService.createNotificationsFromExistingModules(userId, profile);
    const notifications = (await notificationService.getUserNotifications(userId, {
      unread: req.query.filter === 'Unread',
      type: req.query.type || '',
    })).filter((notification) => sameOwner(notification, userId));
    const unreadCount = notifications.filter((notification) => notification.status === 'New').length;
    res.status(200).json({ notifications, unreadCount });
  } catch (error) {
    next(error);
  }
}

async function getSummary(req, res, next) {
  try {
    const { profile, userId } = await loadWebProfile(req);
    if (!userId) {
      res.status(200).json({ unreadCount: 0, summary: [], notifications: [] });
      return;
    }
    await notificationService.createNotificationsFromExistingModules(userId, profile);
    const notifications = (await notificationService.getUserNotifications(userId, { unread: true })).filter((notification) =>
      sameOwner(notification, userId)
    );
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
    const { userId } = await loadWebProfile(req);
    const existing = await ownedNotification(userId, req.params.notificationId);
    if (!existing) {
      sendNotFound(res);
      return;
    }
    const notification = await notificationService.markAsRead(req.params.notificationId, { ownerUserId: userId });
    if (!sameOwner(notification, userId)) {
      sendNotFound(res);
      return;
    }
    res.status(200).json({ notification });
  } catch (error) {
    next(error);
  }
}

async function dismissNotification(req, res, next) {
  try {
    const { userId } = await loadWebProfile(req);
    const existing = await ownedNotification(userId, req.params.notificationId);
    if (!existing) {
      sendNotFound(res);
      return;
    }
    const notification = await notificationService.dismissNotification(req.params.notificationId, { ownerUserId: userId });
    if (!sameOwner(notification, userId)) {
      sendNotFound(res);
      return;
    }
    res.status(200).json({ notification });
  } catch (error) {
    next(error);
  }
}

async function completeNotification(req, res, next) {
  try {
    const { userId } = await loadWebProfile(req);
    const existing = await ownedNotification(userId, req.params.notificationId);
    if (!existing) {
      sendNotFound(res);
      return;
    }
    const notification = await notificationService.completeNotification(req.params.notificationId, { ownerUserId: userId });
    if (!sameOwner(notification, userId)) {
      sendNotFound(res);
      return;
    }
    res.status(200).json({ notification });
  } catch (error) {
    next(error);
  }
}

async function remindNotification(req, res, next) {
  try {
    const { userId } = await loadWebProfile(req);
    const existing = await ownedNotification(userId, req.params.notificationId);
    if (!existing) {
      sendNotFound(res);
      return;
    }
    const body = stripClientIdentity(req.body);
    const result = await notificationService.rescheduleNotification(req.params.notificationId, body.days, { ownerUserId: userId });
    if (!result || !sameOwner(result.current, userId) || !sameOwner(result.reminder, userId)) {
      sendNotFound(res);
      return;
    }
    res.status(201).json(result);
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
