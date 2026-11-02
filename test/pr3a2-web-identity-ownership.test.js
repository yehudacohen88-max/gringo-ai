const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = require('../src/app');
const { ROUTE_SECURITY, routeKey } = require('../src/shared/routeSecurity');
const { COOKIE_NAME, openWebSession } = require('../src/shared/webIdentity');
const { env } = require('../src/config/env');
const { PERSONAL_DATA_BLOCK_CODE } = require('../src/shared/blockPersonalDataRoute');
const { crmAgentService } = require('../src/modules/crm-agent');
const crmAgentRepository = require('../src/modules/crm-agent/crm-agent.repository');
const taskService = require('../src/modules/tasks/task.service');
const documentService = require('../src/modules/documents/document.service');
const notificationService = require('../src/modules/notifications/notification.service');
const communityService = require('../src/modules/community/community.service');

const NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'Not found.', details: [] } };
const today = new Date().toISOString().slice(0, 10);

function listen() {
  const server = app.listen(0);
  const { port } = server.address();
  return {
    base: `http://127.0.0.1:${port}`,
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

function cookieValue(response) {
  const header = response.headers.getSetCookie().find((value) => value.startsWith(`${COOKIE_NAME}=`));
  assert.ok(header);
  return decodeURIComponent(header.split(';')[0].slice(COOKIE_NAME.length + 1));
}

async function readBody(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch (error) {
    return text;
  }
}

function cookieHeader(cookie) {
  return { cookie: `${COOKIE_NAME}=${encodeURIComponent(cookie)}` };
}

async function session(base, fullName) {
  const started = await fetch(`${base}/api/chat/profile`);
  const cookie = cookieValue(started);
  await readBody(started);
  const saved = await fetch(`${base}/api/chat/profile`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      origin: base,
      ...cookieHeader(cookie),
    },
    body: JSON.stringify({ fullName, preferredCurrency: 'THB', country: 'Thailand' }),
  });
  const body = await readBody(saved);
  assert.equal(saved.status, 200, JSON.stringify(body));
  return { cookie, userId: body.profile.userId, fullName: body.profile.fullName };
}

async function api(base, cookie, method, urlPath, payload, extraHeaders = {}) {
  const response = await fetch(`${base}${urlPath}`, {
    method,
    headers: {
      ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
      ...(method === 'GET' || method === 'HEAD' ? {} : { origin: base }),
      ...cookieHeader(cookie),
      ...extraHeaders,
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const body = await readBody(response);
  return { response, body };
}

function assertHidden(response, body, secret) {
  assert.equal(response.status, 404, JSON.stringify(body));
  assert.deepEqual(body, NOT_FOUND);
  assert.equal(JSON.stringify(body).includes(secret), false);
}

test('signed web sessions own their records and cannot see or change someone else', async () => {
  const server = listen();
  try {
    const ada = await session(server.base, 'Ada Private 3a2');
    const bo = await session(server.base, 'Bo Private 3a2');
    assert.notEqual(ada.userId, bo.userId);

    await crmAgentService.updateUserProfile(ada.userId, {
      lookingForJob: 'Yes',
      activeGoals: 'Find Job',
      lookingForHousing: 'Yes',
      lastMoneyTransferAmount: '919191',
      preferredCurrency: 'THB',
    });
    await crmAgentService.updateUserProfile(bo.userId, {
      lookingForJob: 'Yes',
      activeGoals: 'Find Job',
      lookingForHousing: 'Yes',
      lastMoneyTransferAmount: '828282',
      preferredCurrency: 'USD',
      city: 'Bo Private City 3a2',
    });

    const created = await api(server.base, ada.cookie, 'POST', '/api/tasks', {
      title: 'Ada private task 3a2',
      dueDate: today,
      userId: bo.userId,
      channelUserId: 'web_1700000099999',
      channel: 'web',
      taskId: 'task_client_chosen',
    });
    assert.equal(created.response.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.task.userId, ada.userId);
    assert.equal(created.body.task.title, 'Ada private task 3a2');
    assert.notEqual(created.body.task.taskId, 'task_client_chosen');
    const taskId = created.body.task.taskId;

    const boTask = await taskService.createTask({
      userId: bo.userId,
      title: 'Bo private task 3a2',
      dueDate: today,
      category: 'Personal',
    });

    const adaList = await api(server.base, ada.cookie, 'GET', `/api/tasks?userId=${encodeURIComponent(bo.userId)}&channelUserId=web_1&channel=web`, undefined, {
      'x-user-id': bo.userId,
      'x-channel-user-id': 'web_1700000099999',
    });
    assert.equal(adaList.response.status, 200);
    assert.equal(adaList.body.tasks.some((task) => task.taskId === taskId), true);
    assert.equal(JSON.stringify(adaList.body).includes('Bo private task 3a2'), false);
    assert.equal(JSON.stringify(adaList.body).includes(bo.userId), false);

    const foreignChannel = await api(server.base, ada.cookie, 'GET', '/api/tasks?channel=whatsapp&channelUserId=15550001111');
    assert.equal(foreignChannel.response.status, 400);
    assert.equal(foreignChannel.body.error.code, 'FOREIGN_CHANNEL_REJECTED');
    assert.equal(JSON.stringify(foreignChannel.body).includes('Bo private task 3a2'), false);
    assert.equal(JSON.stringify(foreignChannel.body).includes('Ada private task 3a2'), false);

    const missing = await api(server.base, ada.cookie, 'GET', '/api/tasks/task_missing_3a2');
    const stolen = await api(server.base, ada.cookie, 'GET', `/api/tasks/${encodeURIComponent(boTask.taskId)}`);
    assertHidden(missing.response, missing.body, 'Bo private task 3a2');
    assertHidden(stolen.response, stolen.body, 'Bo private task 3a2');
    assert.deepEqual(missing.body, stolen.body);

    const boRead = await api(server.base, bo.cookie, 'GET', `/api/tasks/${encodeURIComponent(taskId)}`);
    assertHidden(boRead.response, boRead.body, 'Ada private task 3a2');

    const boHistory = await api(server.base, bo.cookie, 'GET', `/api/tasks/${encodeURIComponent(taskId)}/history`);
    assertHidden(boHistory.response, boHistory.body, 'Ada private task 3a2');
    const adaHistory = await api(server.base, ada.cookie, 'GET', `/api/tasks/${encodeURIComponent(taskId)}/history`);
    assert.equal(adaHistory.response.status, 200);
    assert.equal(adaHistory.body.events.some((event) => event.userId === ada.userId), true);
    assert.equal(adaHistory.body.events.some((event) => event.userId === bo.userId), false);

    const boUpdate = await api(server.base, bo.cookie, 'PUT', `/api/tasks/${encodeURIComponent(taskId)}`, {
      title: 'Bo rewrote Ada',
      userId: bo.userId,
    });
    assertHidden(boUpdate.response, boUpdate.body, 'Ada private task 3a2');
    assert.equal((await taskService.getTaskById(taskId)).title, 'Ada private task 3a2');

    const adaUpdate = await api(server.base, ada.cookie, 'PUT', `/api/tasks/${encodeURIComponent(taskId)}`, {
      title: 'Ada private task edited 3a2',
      userId: bo.userId,
    });
    assert.equal(adaUpdate.response.status, 200, JSON.stringify(adaUpdate.body));
    assert.equal(adaUpdate.body.task.userId, ada.userId);
    assert.equal(adaUpdate.body.task.title, 'Ada private task edited 3a2');

    for (const action of ['progress', 'complete', 'remind', 'reschedule']) {
      const denied = await api(
        server.base,
        ada.cookie,
        'POST',
        action === 'remind'
          ? `/api/tasks/${encodeURIComponent(boTask.taskId)}/remind`
          : action === 'reschedule'
            ? `/api/tasks/${encodeURIComponent(boTask.taskId)}/reschedule`
            : `/api/tasks/${encodeURIComponent(boTask.taskId)}/${action}`,
        action === 'reschedule' ? { dueDate: '2099-01-01', userId: ada.userId } : { option: 'tomorrow', userId: ada.userId }
      );
      assertHidden(denied.response, denied.body, 'Bo private task 3a2');
    }
    const boAfter = await taskService.getTaskById(boTask.taskId);
    assert.equal(boAfter.status === 'Completed' || boAfter.status === 'In Progress', false);
    assert.notEqual(boAfter.dueDate, '2099-01-01');

    const schedule = await api(server.base, ada.cookie, 'GET', '/api/tasks/schedule?view=Today');
    assert.equal(schedule.response.status, 200);
    assert.equal(JSON.stringify(schedule.body).includes('Bo private task 3a2'), false);
    const alerts = await api(server.base, ada.cookie, 'GET', '/api/tasks/alerts');
    assert.equal(alerts.response.status, 200);
    assert.equal(JSON.stringify(alerts.body).includes('Bo private task 3a2'), false);
    const userHistory = await api(server.base, ada.cookie, 'GET', '/api/tasks/history');
    assert.equal(userHistory.response.status, 200);
    assert.equal(JSON.stringify(userHistory.body).includes(bo.userId), false);

    const adaDoc = await api(server.base, ada.cookie, 'POST', '/api/documents', {
      documentType: 'Passport',
      documentNumber: 'ADA999888',
      expiryDate: '2099-05-01',
      notes: 'Ada private document 3a2',
      userId: bo.userId,
      documentId: 'doc_client_chosen',
    });
    assert.equal(adaDoc.response.status, 201, JSON.stringify(adaDoc.body));
    assert.equal(adaDoc.body.document.userId, ada.userId);
    assert.notEqual(adaDoc.body.document.documentId, 'doc_client_chosen');
    assert.equal(JSON.stringify(adaDoc.body).includes('ADA999888'), false);
    const documentId = adaDoc.body.document.documentId;

    const boDoc = await documentService.createDocument({
      userId: bo.userId,
      documentType: 'Visa',
      documentNumber: 'BO111222',
      expiryDate: '2099-06-01',
      notes: 'Bo private document 3a2',
    });
    const docList = await api(server.base, ada.cookie, 'GET', `/api/documents?userId=${encodeURIComponent(bo.userId)}`, undefined, {
      'x-user-id': bo.userId,
    });
    assert.equal(docList.response.status, 200);
    assert.equal(JSON.stringify(docList.body).includes('Ada private document 3a2'), true);
    assert.equal(JSON.stringify(docList.body).includes('Bo private document 3a2'), false);
    assert.equal(JSON.stringify(docList.body).includes('BO111222'), false);

    for (const [method, urlPath, payload] of [
      ['PUT', `/api/documents/${encodeURIComponent(boDoc.documentId)}`, { notes: 'stolen', userId: ada.userId }],
      ['POST', `/api/documents/${encodeURIComponent(boDoc.documentId)}/renew`, { newExpiryDate: '2099-12-01' }],
      ['POST', `/api/documents/${encodeURIComponent(boDoc.documentId)}/archive`, {}],
      ['GET', `/api/documents/${encodeURIComponent(boDoc.documentId)}/history`, undefined],
    ]) {
      const denied = await api(server.base, ada.cookie, method, urlPath, payload);
      assertHidden(denied.response, denied.body, 'Bo private document 3a2');
    }
    assert.equal((await documentService.getDocumentById(boDoc.documentId)).notes, 'Bo private document 3a2');
    assert.notEqual((await documentService.getDocumentById(boDoc.documentId)).status, 'Archived');
    const editedDoc = await api(server.base, ada.cookie, 'PUT', `/api/documents/${encodeURIComponent(documentId)}`, {
      notes: 'Ada private document edited 3a2',
      userId: bo.userId,
    });
    assert.equal(editedDoc.response.status, 200, JSON.stringify(editedDoc.body));
    assert.equal(editedDoc.body.document.userId, ada.userId);
    assert.equal(editedDoc.body.document.notes, 'Ada private document edited 3a2');
    const renewed = await api(server.base, ada.cookie, 'POST', `/api/documents/${encodeURIComponent(documentId)}/renew`, {
      newExpiryDate: '2099-08-01',
      userId: bo.userId,
    });
    assert.equal(renewed.response.status, 200, JSON.stringify(renewed.body));
    assert.equal(renewed.body.document.expiryDate, '2099-08-01');
    assert.equal(renewed.body.document.userId, ada.userId);
    const archived = await api(server.base, ada.cookie, 'POST', `/api/documents/${encodeURIComponent(documentId)}/archive`, { userId: bo.userId });
    assert.equal(archived.response.status, 200, JSON.stringify(archived.body));
    assert.equal(archived.body.document.status, 'Archived');
    assert.equal(archived.body.document.userId, ada.userId);

    const docHistory = await api(server.base, ada.cookie, 'GET', `/api/documents/${encodeURIComponent(documentId)}/history`);
    assert.equal(docHistory.response.status, 200);
    assert.equal(docHistory.body.history.every((event) => event.userId === ada.userId), true);
    const allDocHistory = await api(server.base, ada.cookie, 'GET', '/api/documents/history');
    assert.equal(JSON.stringify(allDocHistory.body).includes(bo.userId), false);
    const docAlerts = await api(server.base, ada.cookie, 'GET', '/api/documents/alerts');
    assert.equal(docAlerts.response.status, 200);
    assert.equal(JSON.stringify(docAlerts.body).includes('Bo private document 3a2'), false);

    const adaNotice = await notificationService.createNotification({
      userId: ada.userId,
      type: 'System',
      title: 'Ada private notice 3a2',
      message: 'Ada only',
    });
    const boNotice = await notificationService.createNotification({
      userId: bo.userId,
      type: 'System',
      title: 'Bo private notice 3a2',
      message: 'Bo only',
    });
    const notices = await api(server.base, ada.cookie, 'GET', `/api/notifications?userId=${encodeURIComponent(bo.userId)}`, undefined, {
      'x-user-id': bo.userId,
    });
    assert.equal(notices.response.status, 200);
    assert.equal(notices.body.notifications.some((item) => item.notificationId === adaNotice.notificationId), true);
    assert.equal(JSON.stringify(notices.body).includes('Bo private notice 3a2'), false);
    const summary = await api(server.base, ada.cookie, 'GET', '/api/notifications/summary');
    assert.equal(summary.response.status, 200);
    assert.equal(JSON.stringify(summary.body).includes('Bo private notice 3a2'), false);

    for (const action of ['read', 'dismiss', 'complete', 'remind']) {
      const denied = await api(
        server.base,
        ada.cookie,
        'POST',
        `/api/notifications/${encodeURIComponent(boNotice.notificationId)}/${action}`,
        { days: 3, userId: ada.userId }
      );
      assertHidden(denied.response, denied.body, 'Bo private notice 3a2');
    }
    assert.equal((await notificationService.getNotificationById(boNotice.notificationId)).status, 'New');
    const adaRead = await api(server.base, ada.cookie, 'POST', `/api/notifications/${encodeURIComponent(adaNotice.notificationId)}/read`, {});
    assert.equal(adaRead.response.status, 200, JSON.stringify(adaRead.body));
    assert.equal(adaRead.body.notification.userId, ada.userId);
    assert.equal(adaRead.body.notification.status, 'Read');
    const adaLater = await notificationService.createNotification({
      userId: ada.userId,
      type: 'System',
      title: 'Ada reminder notice 3a2',
      message: 'Ada reminder',
    });
    const dismissed = await api(server.base, ada.cookie, 'POST', `/api/notifications/${encodeURIComponent(adaLater.notificationId)}/dismiss`, {});
    assert.equal(dismissed.response.status, 200, JSON.stringify(dismissed.body));
    assert.equal(dismissed.body.notification.status, 'Dismissed');
    const adaDone = await notificationService.createNotification({
      userId: ada.userId,
      type: 'System',
      title: 'Ada complete notice 3a2',
      message: 'Ada complete',
    });
    const completedNotice = await api(server.base, ada.cookie, 'POST', `/api/notifications/${encodeURIComponent(adaDone.notificationId)}/complete`, {});
    assert.equal(completedNotice.response.status, 200);
    assert.equal(completedNotice.body.notification.userId, ada.userId);
    const adaRemind = await notificationService.createNotification({
      userId: ada.userId,
      type: 'System',
      title: 'Ada snooze notice 3a2',
      message: 'Ada snooze',
    });
    const reminded = await api(server.base, ada.cookie, 'POST', `/api/notifications/${encodeURIComponent(adaRemind.notificationId)}/remind`, {
      days: 2,
      userId: bo.userId,
    });
    assert.equal(reminded.response.status, 201, JSON.stringify(reminded.body));
    assert.equal(reminded.body.reminder.userId, ada.userId);
    assert.equal(reminded.body.current.userId, ada.userId);

    const jobs = await api(server.base, ada.cookie, 'GET', `/api/jobs/matches?userId=${encodeURIComponent(bo.userId)}&channel=web`, undefined, {
      'x-user-id': bo.userId,
    });
    assert.equal(jobs.response.status, 200, JSON.stringify(jobs.body));
    assert.equal(JSON.stringify(jobs.body).includes('Bo Private 3a2'), false);
    assert.equal(JSON.stringify(jobs.body).includes(bo.userId), false);
    assert.equal(Object.prototype.hasOwnProperty.call(jobs.body, 'profile'), false);
    const housing = await api(server.base, ada.cookie, 'GET', '/api/housing/matches?channelUserId=web_1');
    assert.equal(housing.response.status, 200);
    assert.equal(JSON.stringify(housing.body).includes('Bo Private 3a2'), false);
    const services = await api(server.base, ada.cookie, 'GET', '/api/services/matches?userId=' + encodeURIComponent(bo.userId));
    assert.equal(services.response.status, 200);
    assert.equal(JSON.stringify(services.body).includes('Bo Private City 3a2'), false);
    assert.equal(JSON.stringify(services.body).includes(bo.userId), false);
    const money = await api(server.base, ada.cookie, 'GET', '/api/money/defaults?userId=' + encodeURIComponent(bo.userId), undefined, {
      'x-user-id': bo.userId,
    });
    assert.equal(money.response.status, 200);
    assert.equal(money.body.amount, '919191');
    assert.equal(JSON.stringify(money.body).includes('828282'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(money.body, 'profile'), false);
    const relevant = await api(server.base, ada.cookie, 'GET', '/api/community/relevant?channel=whatsapp&channelUserId=15550001111');
    assert.equal(relevant.response.status, 400);
    assert.equal(JSON.stringify(relevant.body).includes('Bo Private 3a2'), false);

    const relevantOk = await api(server.base, ada.cookie, 'GET', '/api/community/relevant');
    assert.equal(relevantOk.response.status, 200);
    assert.equal(JSON.stringify(relevantOk.body).includes(bo.userId), false);

    const comment = await api(server.base, ada.cookie, 'POST', '/api/community/community_sample_construction_tel_aviv/comments', {
      body: 'Ada community note 3a2',
      userId: bo.userId,
      userName: 'Bo Private 3a2',
      postId: 'community_sample_rights_reminder',
    });
    assert.equal(comment.response.status, 201, JSON.stringify(comment.body));
    assert.equal(comment.body.comment.userId, ada.userId);
    assert.equal(comment.body.comment.userName, 'Ada Private 3a2');
    assert.equal(comment.body.comment.postId, 'community_sample_construction_tel_aviv');
    const missingPost = await api(server.base, ada.cookie, 'POST', '/api/community/post_missing_3a2/comments', { body: 'nope' });
    assertHidden(missingPost.response, missingPost.body, 'Bo Private 3a2');

    const boComment = await communityService.addComment({
      postId: 'community_sample_rights_reminder',
      userId: bo.userId,
      userName: 'Bo Private 3a2',
      body: 'Bo community note 3a2',
    });
    const flag = await api(server.base, ada.cookie, 'POST', `/api/community/comments/${encodeURIComponent(boComment.commentId)}/flag`, {
      userId: ada.userId,
    });
    assert.equal(flag.response.status, 403);
    assert.equal(flag.body.error.code, PERSONAL_DATA_BLOCK_CODE);
    assert.equal(JSON.stringify(flag.body).includes('Bo community note 3a2'), false);
    const still = (await communityService.getAllComments()).find((item) => item.commentId === boComment.commentId);
    assert.equal(still.status === 'Flagged', false);

    const crossSite = await api(server.base, ada.cookie, 'PUT', `/api/tasks/${encodeURIComponent(taskId)}`, { title: 'Cross site rewrite' }, {
      origin: 'https://evil.example',
    });
    assert.equal(crossSite.response.status, 403);
    assert.equal(crossSite.body.error.code, 'CROSS_SITE_REQUEST_REJECTED');
    assert.equal((await taskService.getTaskById(taskId)).title, 'Ada private task edited 3a2');
    const remindedTask = await api(server.base, ada.cookie, 'POST', `/api/tasks/${encodeURIComponent(taskId)}/remind`, { option: 'tomorrow' });
    assert.equal(remindedTask.response.status, 200, JSON.stringify(remindedTask.body));
    assert.equal(remindedTask.body.task.userId, ada.userId);
    const rescheduled = await api(server.base, ada.cookie, 'POST', `/api/tasks/${encodeURIComponent(taskId)}/reschedule`, {
      dueDate: '2099-02-02',
      userId: bo.userId,
    });
    assert.equal(rescheduled.response.status, 200, JSON.stringify(rescheduled.body));
    assert.equal(rescheduled.body.task.dueDate, '2099-02-02');
    assert.equal(rescheduled.body.task.userId, ada.userId);
    const progressed = await api(server.base, ada.cookie, 'POST', `/api/tasks/${encodeURIComponent(taskId)}/progress`, {});
    assert.equal(progressed.response.status, 200, JSON.stringify(progressed.body));
    assert.equal(progressed.body.task.userId, ada.userId);
    const completedTask = await api(server.base, ada.cookie, 'POST', `/api/tasks/${encodeURIComponent(taskId)}/complete`, { userId: bo.userId });
    assert.equal(completedTask.response.status, 200, JSON.stringify(completedTask.body));
    assert.equal(completedTask.body.task.status, 'Completed');
    assert.equal(completedTask.body.task.userId, ada.userId);

    const noOrigin = await fetch(`${server.base}/api/tasks/${encodeURIComponent(taskId)}/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...cookieHeader(ada.cookie) },
      body: '{}',
    });
    const noOriginBody = await readBody(noOrigin);
    assert.equal(noOrigin.status, 403);
    assert.equal(noOriginBody.error.code, 'CROSS_SITE_REQUEST_REJECTED');

    const forged = `${ada.cookie.slice(0, -1)}${ada.cookie.endsWith('a') ? 'b' : 'a'}`;
    const forgedRead = await api(server.base, forged, 'GET', `/api/tasks/${encodeURIComponent(taskId)}`);
    assertHidden(forgedRead.response, forgedRead.body, 'Ada private task edited 3a2');
    const missingCookie = await fetch(`${server.base}/api/tasks/${encodeURIComponent(taskId)}`);
    const missingCookieBody = await readBody(missingCookie);
    assertHidden(missingCookie, missingCookieBody, 'Ada private task edited 3a2');
    assert.ok(missingCookie.headers.getSetCookie().some((value) => value.startsWith(`${COOKIE_NAME}=`)));
  } finally {
    await server.close();
  }
});

test('legacy profiles stay untouched and a new cookie does not create or claim a row', async () => {
  const legacyWebId = `web_${crypto.randomBytes(4).toString('hex')}`;
  const legacy = await crmAgentRepository.createUserProfile({
    userId: `usr_legacy_${crypto.randomBytes(3).toString('hex')}`,
    channel: 'web',
    channelUserId: legacyWebId,
    fullName: 'Legacy Timestamp Person 3a2',
  });
  const shared = await crmAgentRepository.createUserProfile({
    userId: `usr_shared_${crypto.randomBytes(3).toString('hex')}`,
    channel: 'web',
    channelUserId: 'local-web-user',
    fullName: 'Legacy Shared Person 3a2',
  });
  const legacyTask = await taskService.createTask({
    userId: legacy.userId,
    title: 'Legacy private task 3a2',
    dueDate: today,
    category: 'Personal',
  });
  await taskService.createTask({
    userId: shared.userId,
    title: 'Shared private task 3a2',
    dueDate: today,
    category: 'Personal',
  });

  const server = listen();
  try {
    const started = await fetch(`${server.base}/api/tasks?channelUserId=${encodeURIComponent(legacyWebId)}&userId=${encodeURIComponent(legacy.userId)}`, {
      headers: { 'x-user-id': legacy.userId, 'x-channel-user-id': 'local-web-user' },
    });
    const cookie = cookieValue(started);
    const body = await readBody(started);
    assert.equal(started.status, 200);
    assert.deepEqual(body.tasks, []);
    assert.equal(JSON.stringify(body).includes('Legacy private task 3a2'), false);
    assert.equal(JSON.stringify(body).includes('Shared private task 3a2'), false);
    const opened = openWebSession(cookie, [env.webSessionSecret, env.webSessionSecretPrevious].filter(Boolean));
    assert.equal(await crmAgentService.findUserByChannel('web', opened.webId), null);

    const byId = await api(server.base, cookie, 'GET', `/api/tasks/${encodeURIComponent(legacyTask.taskId)}`);
    assertHidden(byId.response, byId.body, 'Legacy private task 3a2');
  } finally {
    await server.close();
  }

  const stillLegacy = await crmAgentRepository.findUserProfileRecordByChannel('web', legacyWebId);
  const stillShared = await crmAgentRepository.findUserProfileRecordByChannel('web', 'local-web-user');
  assert.equal(stillLegacy.profile.fullName, 'Legacy Timestamp Person 3a2');
  assert.equal(stillShared.profile.fullName, 'Legacy Shared Person 3a2');
  assert.equal((await taskService.getTaskById(legacyTask.taskId)).title, 'Legacy private task 3a2');
});

test('public catalogs stay open, blocked variants do not touch stores, and channel owners still pass', async () => {
  let documentReads = 0;
  let flagCalls = 0;
  const originalDocuments = documentService.getUserDocuments;
  const originalFlag = communityService.flagComment;
  documentService.getUserDocuments = async (...args) => {
    documentReads += 1;
    return originalDocuments.apply(documentService, args);
  };
  communityService.flagComment = async (...args) => {
    flagCalls += 1;
    return originalFlag.apply(communityService, args);
  };

  const server = listen();
  try {
    for (const urlPath of ['/api/jobs', '/api/housing', '/api/services', '/api/community', '/api/money/rate', '/api/money/compare?amount=100']) {
      const response = await fetch(`${server.base}${urlPath}`);
      assert.equal(response.status, 200, urlPath);
      await readBody(response);
    }
    const post = await fetch(`${server.base}/api/community/community_sample_rights_reminder`);
    assert.equal(post.status, 200);
    await readBody(post);

    const blocked = [
      ['GET', '/api/documents/'],
      ['POST', '/api/Documents'],
      ['GET', '/api//tasks'],
      ['GET', '/api/%64ocuments'],
      ['PATCH', '/api/documents'],
      ['DELETE', '/api/tasks/probe'],
      ['HEAD', '/api/notifications/summary'],
      ['PUT', '/api/money/defaults'],
      ['POST', '/api/community/comments/probe/flag'],
    ];
    for (const [method, urlPath] of blocked) {
      const response = await fetch(`${server.base}${urlPath}`, {
        method,
        headers: method === 'GET' || method === 'HEAD' ? {} : { 'content-type': 'application/json', origin: server.base },
        body: method === 'GET' || method === 'HEAD' ? undefined : JSON.stringify({ userId: 'usr_x' }),
      });
      const body = method === 'HEAD' ? null : await readBody(response);
      assert.equal(response.status, 403, `${method} ${urlPath} -> ${response.status}`);
      if (body && typeof body === 'object') {
        assert.equal(body.error.code, PERSONAL_DATA_BLOCK_CODE);
        assert.equal(JSON.stringify(body).includes('usr_x'), false);
      }
    }
    assert.equal(documentReads, 0);
    assert.equal(flagCalls, 0);

    const remaining = ROUTE_SECURITY.filter((entry) => entry.classification === 'blocked-until-PR3a-2').map((entry) => routeKey(entry.method, entry.path));
    assert.deepEqual(remaining, ['POST /api/community/comments/:commentId/flag']);

    const channelUser = await crmAgentService.findOrCreateUser({
      channel: 'telegram',
      channelUserId: `tg_${crypto.randomBytes(3).toString('hex')}`,
      fullName: 'Telegram Channel 3a2',
    });
    const channelTask = await taskService.createTask({
      userId: channelUser.userId,
      title: 'Telegram private task 3a2',
      dueDate: today,
      category: 'Personal',
    });
    const web = await session(server.base, 'Web Not Telegram 3a2');
    const denied = await api(server.base, web.cookie, 'GET', `/api/tasks/${encodeURIComponent(channelTask.taskId)}`);
    assertHidden(denied.response, denied.body, 'Telegram private task 3a2');
    const refused = await taskService.completeTask(channelTask.taskId, { ownerUserId: web.userId });
    assert.equal(refused, null);
    assert.notEqual((await taskService.getTaskById(channelTask.taskId)).status, 'Completed');
    const completed = await taskService.completeTask(channelTask.taskId, { ownerUserId: channelUser.userId });
    assert.equal(completed.status, 'Completed');
    assert.equal(completed.userId, channelUser.userId);

    const source = fs.readFileSync(path.join(__dirname, '../src/public/chat.js'), 'utf8');
    assert.equal(source.includes('channelUserId'), false);
    assert.equal(source.includes("credentials: 'same-origin'"), true);
  } finally {
    documentService.getUserDocuments = originalDocuments;
    communityService.flagComment = originalFlag;
    await server.close();
  }
});
