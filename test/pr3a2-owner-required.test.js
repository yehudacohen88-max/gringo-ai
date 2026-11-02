const test = require('node:test');
const assert = require('node:assert/strict');

const taskService = require('../src/modules/tasks/task.service');
const taskRepository = require('../src/modules/tasks/task.repository');
const documentService = require('../src/modules/documents/document.service');
const notificationService = require('../src/modules/notifications/notification.service');
const adminService = require('../src/modules/admin/admin.service');
const { today } = require('./pr3a2-helpers');

const calls = [
  ['task update', () => taskService.updateTask('task_x', { title: 'n' })],
  ['task progress', () => taskService.markTaskInProgress('task_x')],
  ['task complete', () => taskService.completeTask('task_x')],
  ['task dismiss', () => taskService.dismissTask('task_x')],
  ['task archive', () => taskService.archiveTask('task_x')],
  ['task remind', () => taskService.remindTaskLater('task_x', 'tomorrow')],
  ['task reschedule', () => taskService.rescheduleTask('task_x', { dueDate: '2099-01-01' })],
  ['task create', () => taskService.createTask({ title: 'n', userId: 'usr_body' })],
  ['document update', () => documentService.updateDocument('doc_x', { notes: 'n' })],
  ['document renew', () => documentService.renewDocument('doc_x', '2099-01-01')],
  ['document archive', () => documentService.archiveDocument('doc_x')],
  ['document create', () => documentService.createDocument({ documentType: 'Passport', userId: 'usr_body' })],
  ['notification read', () => notificationService.markAsRead('notif_x')],
  ['notification dismiss', () => notificationService.dismissNotification('notif_x')],
  ['notification complete', () => notificationService.completeNotification('notif_x')],
  ['notification remind', () => notificationService.rescheduleNotification('notif_x', 1)],
  ['notification cancel', () => notificationService.cancelScheduledNotification('notif_x')],
  ['notification create', () => notificationService.createNotification({ userId: 'usr_body', title: 't', message: 'm' })],
];

for (const [name, call] of calls) {
  test(`${name} throws when ownerUserId is missing`, async () => {
    await assert.rejects(call, { code: 'OWNER_REQUIRED' });
  });
}

test('blank ownerUserId is rejected on every mutation', async () => {
  const blank = { ownerUserId: '  ' };
  await assert.rejects(() => taskService.updateTask('task_x', { title: 'n' }, blank), { code: 'OWNER_REQUIRED' });
  await assert.rejects(() => taskService.createTask({ title: 'n', userId: 'usr_body' }, blank), { code: 'OWNER_REQUIRED' });
  await assert.rejects(() => documentService.updateDocument('doc_x', { notes: 'n' }, blank), { code: 'OWNER_REQUIRED' });
  await assert.rejects(() => documentService.createDocument({ documentType: 'Passport' }, blank), { code: 'OWNER_REQUIRED' });
  await assert.rejects(() => notificationService.markAsRead('notif_x', blank), { code: 'OWNER_REQUIRED' });
  await assert.rejects(() => notificationService.createNotification({ title: 't', message: 'm', userId: 'usr_body' }, blank), {
    code: 'OWNER_REQUIRED',
  });
});

test('an update payload cannot replace task, document, or notification ownership', async () => {
  const task = await taskService.createTask({ title: 'Owned task', category: 'Personal' }, { ownerUserId: 'usr_owner_a' });
  const updated = await taskService.updateTask(
    task.taskId,
    { title: 'Renamed', userId: 'usr_owner_b', ownerUserId: 'usr_owner_b', channel: 'whatsapp', channelUserId: '1555' },
    { ownerUserId: 'usr_owner_a' }
  );
  assert.equal(updated.userId, 'usr_owner_a');
  assert.equal(updated.title, 'Renamed');
  assert.equal((await taskService.getTaskById(task.taskId)).userId, 'usr_owner_a');

  const document = await documentService.createDocument(
    { documentType: 'Passport', notes: 'Owned doc', expiryDate: '2099-01-01' },
    { ownerUserId: 'usr_owner_a' }
  );
  const edited = await documentService.updateDocument(
    document.documentId,
    { notes: 'Edited doc', userId: 'usr_owner_b', ownerUserId: 'usr_owner_b' },
    { ownerUserId: 'usr_owner_a' }
  );
  assert.equal(edited.userId, 'usr_owner_a');
  assert.equal(edited.notes, 'Edited doc');

  const notice = await notificationService.createNotification(
    { title: 'Owned notice', message: 'body', userId: 'usr_owner_b' },
    { ownerUserId: 'usr_owner_a' }
  );
  assert.equal(notice.userId, 'usr_owner_a');
  const read = await notificationService.markAsRead(notice.notificationId, { ownerUserId: 'usr_owner_a' });
  assert.equal(read.userId, 'usr_owner_a');
  const foreign = await notificationService.markAsRead(notice.notificationId, { ownerUserId: 'usr_owner_b' });
  assert.equal(foreign, null);
  assert.equal((await notificationService.getNotificationById(notice.notificationId)).status, 'Read');
});

test('admin task and document edits pass the row owner and ignore a client userId', async () => {
  const task = await taskService.createTask(
    { title: 'Admin task', dueDate: today, category: 'Personal' },
    { ownerUserId: 'usr_admin_target' }
  );
  const edited = await adminService.updateTaskFromAdmin(task.taskId, { title: 'Admin renamed', userId: 'usr_other' });
  assert.equal(edited.title, 'Admin renamed');
  assert.equal(edited.userId, 'usr_admin_target');

  const document = await documentService.createDocument(
    { documentType: 'Visa', expiryDate: '2099-03-01', notes: 'Admin doc' },
    { ownerUserId: 'usr_admin_target' }
  );
  const saved = await adminService.updateDocumentFromAdmin(document.documentId, {
    adminNote: 'Checked',
    userId: 'usr_other',
  });
  assert.equal(saved.userId, 'usr_admin_target');
  assert.equal(saved.notes, 'Checked');
});

test('overlapping task writes keep the verified owner', async () => {
  const task = await taskService.createTask({ title: 'Locked task', category: 'Personal' }, { ownerUserId: 'usr_lock_a' });
  const original = taskRepository.updateTask;
  let started = 0;
  let releaseFirst;
  taskRepository.updateTask = async (...args) => {
    started += 1;
    if (started === 1) {
      await new Promise((resolve) => {
        releaseFirst = resolve;
      });
    }
    return original.apply(taskRepository, args);
  };
  try {
    const first = taskService.updateTask(task.taskId, { title: 'Owner write', userId: 'usr_lock_b' }, { ownerUserId: 'usr_lock_a' });
    for (let i = 0; i < 50 && started < 1; i += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal(started, 1);
    const second = taskService.updateTask(task.taskId, { title: 'Stolen', userId: 'usr_lock_b' }, { ownerUserId: 'usr_lock_b' });
    releaseFirst();
    const [saved, denied] = await Promise.all([first, second]);
    assert.equal(saved.title, 'Owner write');
    assert.equal(saved.userId, 'usr_lock_a');
    assert.equal(denied, null);
    const stored = await taskService.getTaskById(task.taskId);
    assert.equal(stored.title, 'Owner write');
    assert.equal(stored.userId, 'usr_lock_a');
  } finally {
    taskRepository.updateTask = original;
  }
});
