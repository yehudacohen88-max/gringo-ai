const test = require('node:test');
const assert = require('node:assert/strict');

const taskService = require('../src/modules/tasks/task.service');
const { assertHidden, today, withUsers } = require('./pr3a2-helpers');

const forged = {
  'x-user-id': 'usr_forged',
  'x-channel-user-id': 'web_forged',
  'x-owner-user-id': 'usr_forged',
};

async function seed(ada, bo) {
  const own = await taskService.createTask(
    { title: `${ada.fullName} task`, dueDate: today, category: 'Personal' },
    { ownerUserId: ada.userId }
  );
  const other = await taskService.createTask(
    { title: `${bo.fullName} task`, dueDate: today, category: 'Personal' },
    { ownerUserId: bo.userId }
  );
  return { own, other };
}

test('task create ignores client owner fields', async () => {
  await withUsers(async ({ ada, bo, api }) => {
    const created = await api(ada, 'POST', '/api/tasks', {
      title: `${ada.fullName} created`,
      dueDate: today,
      userId: bo.userId,
      ownerUserId: bo.userId,
      channel: 'web',
      channelUserId: 'web_forged',
      taskId: 'task_client_chosen',
    });
    assert.equal(created.response.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.task.userId, ada.userId);
    assert.notEqual(created.body.task.taskId, 'task_client_chosen');
    assert.equal(created.body.task.title, `${ada.fullName} created`);
  });
});

test('task read hides another user and a missing id the same way', async () => {
  await withUsers(async ({ ada, bo, api }) => {
    const { own, other } = await seed(ada, bo);
    const allowed = await api(ada, 'GET', `/api/tasks/${encodeURIComponent(own.taskId)}`, undefined, forged);
    assert.equal(allowed.response.status, 200);
    assert.equal(allowed.body.task.userId, ada.userId);
    const denied = await api(ada, 'GET', `/api/tasks/${encodeURIComponent(other.taskId)}?userId=${encodeURIComponent(bo.userId)}`, undefined, forged);
    const missing = await api(ada, 'GET', '/api/tasks/task_missing_read');
    assertHidden(assert, denied.response, denied.body, bo.fullName);
    assert.deepEqual(denied.body, missing.body);
  });
});

test('task list, schedule, alerts, and history stay on the signed profile', async () => {
  await withUsers(async ({ ada, bo, api }) => {
    await seed(ada, bo);
    const list = await api(ada, 'GET', `/api/tasks?userId=${encodeURIComponent(bo.userId)}&channelUserId=web_1&channel=web`, undefined, forged);
    assert.equal(list.response.status, 200);
    assert.equal(JSON.stringify(list.body).includes(ada.fullName), true);
    assert.equal(JSON.stringify(list.body).includes(bo.fullName), false);
    assert.equal(JSON.stringify(list.body).includes(bo.userId), false);
    const foreign = await api(ada, 'GET', '/api/tasks?channel=whatsapp&channelUserId=15550001111');
    assert.equal(foreign.response.status, 400);
    assert.equal(foreign.body.error.code, 'FOREIGN_CHANNEL_REJECTED');
    for (const path of ['/api/tasks/schedule?view=Today', '/api/tasks/alerts', '/api/tasks/history']) {
      const response = await api(ada, 'GET', path, undefined, forged);
      assert.equal(response.response.status, 200, path);
      assert.equal(JSON.stringify(response.body).includes(bo.fullName), false, path);
    }
  });
});

test('task update ignores forged owner fields', async () => {
  await withUsers(async ({ ada, bo, api }) => {
    const { own, other } = await seed(ada, bo);
    const denied = await api(ada, 'PUT', `/api/tasks/${encodeURIComponent(other.taskId)}`, {
      title: 'stolen',
      userId: ada.userId,
      ownerUserId: ada.userId,
      channel: 'web',
    }, forged);
    assertHidden(assert, denied.response, denied.body, bo.fullName);
    assert.equal((await taskService.getTaskById(other.taskId)).title, `${bo.fullName} task`);
    const allowed = await api(ada, 'PUT', `/api/tasks/${encodeURIComponent(own.taskId)}`, {
      title: `${ada.fullName} edited`,
      userId: bo.userId,
      ownerUserId: bo.userId,
    });
    assert.equal(allowed.response.status, 200, JSON.stringify(allowed.body));
    assert.equal(allowed.body.task.userId, ada.userId);
    assert.equal(allowed.body.task.title, `${ada.fullName} edited`);
  });
});

test('task remind does not change another user', async () => {
  await withUsers(async ({ ada, bo, api }) => {
    const { own, other } = await seed(ada, bo);
    const before = (await taskService.getTaskById(other.taskId)).reminderAt;
    const denied = await api(bo, 'POST', `/api/tasks/${encodeURIComponent(own.taskId)}/remind`, { option: 'tomorrow', userId: bo.userId, ownerUserId: bo.userId }, forged);
    assertHidden(assert, denied.response, denied.body, ada.fullName);
    const allowed = await api(ada, 'POST', `/api/tasks/${encodeURIComponent(own.taskId)}/remind`, { option: 'tomorrow', userId: bo.userId });
    assert.equal(allowed.response.status, 200, JSON.stringify(allowed.body));
    assert.equal(allowed.body.task.userId, ada.userId);
    assert.equal((await taskService.getTaskById(other.taskId)).reminderAt, before);
  });
});

test('task reschedule does not change another user', async () => {
  await withUsers(async ({ ada, bo, api }) => {
    const { own, other } = await seed(ada, bo);
    const denied = await api(ada, 'POST', `/api/tasks/${encodeURIComponent(other.taskId)}/reschedule`, { dueDate: '2099-01-01', userId: ada.userId, ownerUserId: ada.userId }, forged);
    assertHidden(assert, denied.response, denied.body, bo.fullName);
    assert.notEqual((await taskService.getTaskById(other.taskId)).dueDate, '2099-01-01');
    const allowed = await api(ada, 'POST', `/api/tasks/${encodeURIComponent(own.taskId)}/reschedule`, { dueDate: '2099-02-02', userId: bo.userId });
    assert.equal(allowed.response.status, 200, JSON.stringify(allowed.body));
    assert.equal(allowed.body.task.dueDate, '2099-02-02');
    assert.equal(allowed.body.task.userId, ada.userId);
  });
});

test('task progress does not change another user', async () => {
  await withUsers(async ({ ada, bo, api }) => {
    const { own, other } = await seed(ada, bo);
    const denied = await api(ada, 'POST', `/api/tasks/${encodeURIComponent(other.taskId)}/progress`, { userId: ada.userId, ownerUserId: ada.userId }, forged);
    assertHidden(assert, denied.response, denied.body, bo.fullName);
    assert.notEqual((await taskService.getTaskById(other.taskId)).status, 'In Progress');
    const allowed = await api(ada, 'POST', `/api/tasks/${encodeURIComponent(own.taskId)}/progress`, { userId: bo.userId });
    assert.equal(allowed.response.status, 200, JSON.stringify(allowed.body));
    assert.equal(allowed.body.task.userId, ada.userId);
  });
});

test('task complete does not change another user', async () => {
  await withUsers(async ({ ada, bo, api }) => {
    const { own, other } = await seed(ada, bo);
    const denied = await api(bo, 'POST', `/api/tasks/${encodeURIComponent(own.taskId)}/complete`, { userId: bo.userId, ownerUserId: bo.userId }, forged);
    assertHidden(assert, denied.response, denied.body, ada.fullName);
    assert.notEqual((await taskService.getTaskById(own.taskId)).status, 'Completed');
    const allowed = await api(ada, 'POST', `/api/tasks/${encodeURIComponent(own.taskId)}/complete`, { userId: bo.userId });
    assert.equal(allowed.response.status, 200, JSON.stringify(allowed.body));
    assert.equal(allowed.body.task.status, 'Completed');
    assert.equal(allowed.body.task.userId, ada.userId);
    assert.notEqual((await taskService.getTaskById(other.taskId)).status, 'Completed');
  });
});

test('task dismiss does not change another user', async () => {
  await withUsers(async ({ ada, bo, api }) => {
    const { own, other } = await seed(ada, bo);
    const denied = await api(ada, 'POST', `/api/tasks/${encodeURIComponent(other.taskId)}/dismiss`, { userId: ada.userId }, forged);
    assertHidden(assert, denied.response, denied.body, bo.fullName);
    assert.notEqual((await taskService.getTaskById(other.taskId)).status, 'Dismissed');
    const allowed = await api(ada, 'POST', `/api/tasks/${encodeURIComponent(own.taskId)}/dismiss`, { ownerUserId: bo.userId });
    assert.equal(allowed.response.status, 200, JSON.stringify(allowed.body));
    assert.equal(allowed.body.task.status, 'Dismissed');
    assert.equal(allowed.body.task.userId, ada.userId);
  });
});

test('task archive does not change another user', async () => {
  await withUsers(async ({ ada, bo, api }) => {
    const { own, other } = await seed(ada, bo);
    const denied = await api(ada, 'POST', `/api/tasks/${encodeURIComponent(other.taskId)}/archive`, { userId: ada.userId, ownerUserId: ada.userId }, forged);
    assertHidden(assert, denied.response, denied.body, bo.fullName);
    assert.notEqual((await taskService.getTaskById(other.taskId)).status, 'Archived');
    const allowed = await api(ada, 'POST', `/api/tasks/${encodeURIComponent(own.taskId)}/archive`, { userId: bo.userId });
    assert.equal(allowed.response.status, 200, JSON.stringify(allowed.body));
    assert.equal(allowed.body.task.status, 'Archived');
    assert.equal(allowed.body.task.userId, ada.userId);
  });
});

test('task history is withheld until the parent task is owned', async () => {
  await withUsers(async ({ ada, bo, api }) => {
    const { own, other } = await seed(ada, bo);
    const denied = await api(bo, 'GET', `/api/tasks/${encodeURIComponent(own.taskId)}/history`, undefined, forged);
    assertHidden(assert, denied.response, denied.body, ada.fullName);
    const allowed = await api(ada, 'GET', `/api/tasks/${encodeURIComponent(own.taskId)}/history`);
    assert.equal(allowed.response.status, 200);
    assert.equal(allowed.body.events.every((event) => event.userId === ada.userId), true);
    assert.equal(JSON.stringify(allowed.body).includes(other.taskId), false);
  });
});
