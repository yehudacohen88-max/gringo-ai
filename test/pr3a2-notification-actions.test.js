const test = require('node:test');
const assert = require('node:assert/strict');

const notificationService = require('../src/modules/notifications/notification.service');
const { assertHidden, withUsers } = require('./pr3a2-helpers');

const forged = { 'x-user-id': 'usr_forged', 'x-channel-user-id': 'web_forged' };

async function seed(ada, bo) {
  const own = await notificationService.createNotification(
    { type: 'System', title: `${ada.fullName} notice`, message: 'Ada only' },
    { ownerUserId: ada.userId }
  );
  const other = await notificationService.createNotification(
    { type: 'System', title: `${bo.fullName} notice`, message: 'Bo only' },
    { ownerUserId: bo.userId }
  );
  return { own, other };
}

test('notification list and summary stay on the signed profile', async () => {
  await withUsers(async ({ ada, bo, api }) => {
    const { own } = await seed(ada, bo);
    const list = await api(ada, 'GET', `/api/notifications?userId=${encodeURIComponent(bo.userId)}`, undefined, forged);
    assert.equal(list.response.status, 200);
    assert.equal(list.body.notifications.some((item) => item.notificationId === own.notificationId), true);
    assert.equal(JSON.stringify(list.body).includes(bo.fullName), false);
    const summary = await api(ada, 'GET', '/api/notifications/summary', undefined, forged);
    assert.equal(summary.response.status, 200);
    assert.equal(JSON.stringify(summary.body).includes(bo.fullName), false);
  });
});

test('notification mark-read does not change another user', async () => {
  await withUsers(async ({ ada, bo, api }) => {
    const { own, other } = await seed(ada, bo);
    const denied = await api(ada, 'POST', `/api/notifications/${encodeURIComponent(other.notificationId)}/read`, { userId: ada.userId, ownerUserId: ada.userId }, forged);
    assertHidden(assert, denied.response, denied.body, bo.fullName);
    assert.equal((await notificationService.getNotificationById(other.notificationId)).status, 'New');
    const allowed = await api(ada, 'POST', `/api/notifications/${encodeURIComponent(own.notificationId)}/read`, { userId: bo.userId });
    assert.equal(allowed.response.status, 200, JSON.stringify(allowed.body));
    assert.equal(allowed.body.notification.status, 'Read');
    assert.equal(allowed.body.notification.userId, ada.userId);
  });
});

test('notification dismiss does not change another user', async () => {
  await withUsers(async ({ ada, bo, api }) => {
    const { own, other } = await seed(ada, bo);
    const denied = await api(bo, 'POST', `/api/notifications/${encodeURIComponent(own.notificationId)}/dismiss`, { userId: bo.userId }, forged);
    assertHidden(assert, denied.response, denied.body, ada.fullName);
    assert.equal((await notificationService.getNotificationById(own.notificationId)).status, 'New');
    const allowed = await api(ada, 'POST', `/api/notifications/${encodeURIComponent(own.notificationId)}/dismiss`, { ownerUserId: bo.userId });
    assert.equal(allowed.response.status, 200, JSON.stringify(allowed.body));
    assert.equal(allowed.body.notification.status, 'Dismissed');
    assert.equal(allowed.body.notification.userId, ada.userId);
  });
});

test('notification complete does not change another user', async () => {
  await withUsers(async ({ ada, bo, api }) => {
    const { own, other } = await seed(ada, bo);
    const denied = await api(ada, 'POST', `/api/notifications/${encodeURIComponent(other.notificationId)}/complete`, { userId: ada.userId, ownerUserId: ada.userId }, forged);
    assertHidden(assert, denied.response, denied.body, bo.fullName);
    assert.equal((await notificationService.getNotificationById(other.notificationId)).status, 'New');
    const allowed = await api(ada, 'POST', `/api/notifications/${encodeURIComponent(own.notificationId)}/complete`, { userId: bo.userId });
    assert.equal(allowed.response.status, 200, JSON.stringify(allowed.body));
    assert.equal(allowed.body.notification.status, 'Completed');
    assert.equal(allowed.body.notification.userId, ada.userId);
  });
});

test('notification remind does not create a reminder for another user', async () => {
  await withUsers(async ({ ada, bo, api }) => {
    const { own, other } = await seed(ada, bo);
    const denied = await api(ada, 'POST', `/api/notifications/${encodeURIComponent(other.notificationId)}/remind`, { days: 3, userId: ada.userId, ownerUserId: ada.userId }, forged);
    assertHidden(assert, denied.response, denied.body, bo.fullName);
    assert.equal((await notificationService.getNotificationById(other.notificationId)).status, 'New');
    const allowed = await api(ada, 'POST', `/api/notifications/${encodeURIComponent(own.notificationId)}/remind`, { days: 2, userId: bo.userId });
    assert.equal(allowed.response.status, 201, JSON.stringify(allowed.body));
    assert.equal(allowed.body.current.userId, ada.userId);
    assert.equal(allowed.body.reminder.userId, ada.userId);
    assert.equal(allowed.body.reminder.title.startsWith('Reminder:'), true);
  });
});
