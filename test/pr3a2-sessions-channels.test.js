const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { ROUTE_SECURITY, routeKey } = require('../src/shared/routeSecurity');
const { PERSONAL_DATA_BLOCK_CODE } = require('../src/shared/blockPersonalDataRoute');
const { crmAgentService } = require('../src/modules/crm-agent');
const crmAgentRepository = require('../src/modules/crm-agent/crm-agent.repository');
const taskService = require('../src/modules/tasks/task.service');
const communityService = require('../src/modules/community/community.service');
const documentService = require('../src/modules/documents/document.service');
const { assertHidden, callApi, cookieValue, listen, readBody, today, webIdFromCookie, withUsers } = require('./pr3a2-helpers');

test('job, housing, service, and money reads do not return another profile', async () => {
  await withUsers(async ({ ada, bo, api }) => {
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
      city: `${bo.fullName} city`,
    });
    const jobs = await api(ada, 'GET', `/api/jobs/matches?userId=${encodeURIComponent(bo.userId)}&channel=web`, undefined, { 'x-user-id': bo.userId });
    assert.equal(jobs.response.status, 200, JSON.stringify(jobs.body));
    assert.equal(JSON.stringify(jobs.body).includes(bo.fullName), false);
    assert.equal(JSON.stringify(jobs.body).includes(bo.userId), false);
    assert.equal(Object.prototype.hasOwnProperty.call(jobs.body, 'profile'), false);
    const housing = await api(ada, 'GET', '/api/housing/matches?channelUserId=web_1');
    assert.equal(housing.response.status, 200);
    assert.equal(JSON.stringify(housing.body).includes(bo.fullName), false);
    const services = await api(ada, 'GET', `/api/services/matches?userId=${encodeURIComponent(bo.userId)}`);
    assert.equal(services.response.status, 200);
    assert.equal(JSON.stringify(services.body).includes(`${bo.fullName} city`), false);
    const money = await api(ada, 'GET', `/api/money/defaults?userId=${encodeURIComponent(bo.userId)}`, undefined, { 'x-user-id': bo.userId });
    assert.equal(money.response.status, 200);
    assert.equal(money.body.amount, '919191');
    assert.equal(JSON.stringify(money.body).includes('828282'), false);
    const foreign = await api(ada, 'GET', '/api/community/relevant?channel=whatsapp&channelUserId=15550001111');
    assert.equal(foreign.response.status, 400);
    const relevant = await api(ada, 'GET', '/api/community/relevant');
    assert.equal(relevant.response.status, 200);
    assert.equal(JSON.stringify(relevant.body).includes(bo.userId), false);
  });
});

test('a community comment is owned by the signed profile', async () => {
  await withUsers(async ({ ada, bo, api }) => {
    const post = await communityService.createPost({
      title: 'Owned comment post',
      body: 'A post created for this ownership check.',
      category: 'Community',
      postType: 'Discussion',
      status: 'Published',
      language: 'English',
    });
    const comment = await api(ada, 'POST', `/api/community/${encodeURIComponent(post.postId)}/comments`, {
      body: `${ada.fullName} note`,
      userId: bo.userId,
      ownerUserId: bo.userId,
      userName: bo.fullName,
      postId: 'community_sample_rights_reminder',
    });
    assert.equal(comment.response.status, 201, JSON.stringify(comment.body));
    assert.equal(comment.body.comment.userId, ada.userId);
    assert.equal(comment.body.comment.userName, ada.fullName);
    assert.equal(comment.body.comment.postId, post.postId);
    const missing = await api(ada, 'POST', '/api/community/post_missing_3a2/comments', { body: 'nope' });
    assertHidden(assert, missing.response, missing.body, bo.fullName);
  });
});

test('a cross-site mutation and a forged or missing cookie cannot change a task', async () => {
  await withUsers(async ({ server, ada, api }) => {
    const task = await taskService.createTask(
      { title: `${ada.fullName} cookie task`, dueDate: today, category: 'Personal' },
      { ownerUserId: ada.userId }
    );
    const crossSite = await api(ada, 'PUT', `/api/tasks/${encodeURIComponent(task.taskId)}`, { title: 'Cross site rewrite' }, {
      origin: 'https://evil.example',
    });
    assert.equal(crossSite.response.status, 403);
    assert.equal(crossSite.body.error.code, 'CROSS_SITE_REQUEST_REJECTED');
    const noOrigin = await fetch(`${server.base}/api/tasks/${encodeURIComponent(task.taskId)}/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `gw_sid=${encodeURIComponent(ada.cookie)}` },
      body: '{}',
    });
    const noOriginBody = await readBody(noOrigin);
    assert.equal(noOrigin.status, 403);
    assert.equal(noOriginBody.error.code, 'CROSS_SITE_REQUEST_REJECTED');
    assert.equal((await taskService.getTaskById(task.taskId)).title, `${ada.fullName} cookie task`);
    const forged = `${ada.cookie.slice(0, -1)}${ada.cookie.endsWith('a') ? 'b' : 'a'}`;
    const forgedRead = await callApi(server.base, forged, 'GET', `/api/tasks/${encodeURIComponent(task.taskId)}`);
    assertHidden(assert, forgedRead.response, forgedRead.body, ada.fullName);
    const missingCookie = await fetch(`${server.base}/api/tasks/${encodeURIComponent(task.taskId)}`);
    assertHidden(assert, missingCookie, await readBody(missingCookie), ada.fullName);
  });
});

test('legacy profiles stay untouched and a new cookie does not claim them', async () => {
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
  const legacyTask = await taskService.createTask(
    { title: 'Legacy private task 3a2', dueDate: today, category: 'Personal' },
    { ownerUserId: legacy.userId }
  );
  await taskService.createTask(
    { title: 'Shared private task 3a2', dueDate: today, category: 'Personal' },
    { ownerUserId: shared.userId }
  );
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
    assert.equal(await crmAgentService.findUserByChannel('web', webIdFromCookie(cookie)), null);
    const byId = await callApi(server.base, cookie, 'GET', `/api/tasks/${encodeURIComponent(legacyTask.taskId)}`);
    assertHidden(assert, byId.response, byId.body, 'Legacy private task 3a2');
  } finally {
    await server.close();
  }
  assert.equal((await crmAgentRepository.findUserProfileRecordByChannel('web', legacyWebId)).profile.fullName, 'Legacy Timestamp Person 3a2');
  assert.equal((await crmAgentRepository.findUserProfileRecordByChannel('web', 'local-web-user')).profile.fullName, 'Legacy Shared Person 3a2');
  assert.equal((await taskService.getTaskById(legacyTask.taskId)).title, 'Legacy private task 3a2');
});

test('public catalogs stay open and a channel owner can still complete its own task', async () => {
  let documentReads = 0;
  const originalDocuments = documentService.getUserDocuments;
  documentService.getUserDocuments = async (...args) => {
    documentReads += 1;
    return originalDocuments.apply(documentService, args);
  };
  const server = listen();
  try {
    for (const urlPath of ['/api/jobs', '/api/housing', '/api/services', '/api/community', '/api/money/rate', '/api/money/compare?amount=100']) {
      const response = await fetch(`${server.base}${urlPath}`);
      assert.equal(response.status, 200, urlPath);
      await readBody(response);
    }
    const createdPost = await communityService.createPost({
      title: 'Public catalog post',
      body: 'A published post used to check that community reads stay open.',
      category: 'Community',
      postType: 'Discussion',
      status: 'Published',
      language: 'English',
    });
    const post = await fetch(`${server.base}/api/community/${encodeURIComponent(createdPost.postId)}`);
    assert.equal(post.status, 200);
    await readBody(post);
    assert.equal(documentReads, 0);
    const remaining = ROUTE_SECURITY.filter((entry) => entry.classification === 'blocked-until-PR3a-2').map((entry) => routeKey(entry.method, entry.path));
    assert.deepEqual(remaining, ['POST /api/community/comments/:commentId/flag']);

    const channelUser = await crmAgentService.findOrCreateUser({
      channel: 'telegram',
      channelUserId: `tg_${crypto.randomBytes(3).toString('hex')}`,
      fullName: 'Telegram Channel 3a2',
    });
    const channelTask = await taskService.createTask(
      { title: 'Telegram private task 3a2', dueDate: today, category: 'Personal' },
      { ownerUserId: channelUser.userId }
    );
    const started = await fetch(`${server.base}/api/chat/profile`);
    const cookie = cookieValue(started);
    await readBody(started);
    const saved = await fetch(`${server.base}/api/chat/profile`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', origin: server.base, cookie: `gw_sid=${encodeURIComponent(cookie)}` },
      body: JSON.stringify({ fullName: 'Web Not Telegram 3a2' }),
    });
    const profile = await readBody(saved);
    const denied = await callApi(server.base, cookie, 'GET', `/api/tasks/${encodeURIComponent(channelTask.taskId)}`);
    assertHidden(assert, denied.response, denied.body, 'Telegram private task 3a2');
    assert.equal(await taskService.completeTask(channelTask.taskId, { ownerUserId: profile.profile.userId }), null);
    assert.notEqual((await taskService.getTaskById(channelTask.taskId)).status, 'Completed');
    const completed = await taskService.completeTask(channelTask.taskId, { ownerUserId: channelUser.userId });
    assert.equal(completed.status, 'Completed');
    assert.equal(completed.userId, channelUser.userId);
  } finally {
    documentService.getUserDocuments = originalDocuments;
    await server.close();
  }
});

test('paused copy is only the comment-report message', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/public/chat.js'), 'utf8');
  assert.equal(source.includes('channelUserId'), false);
  assert.equal(source.includes("credentials: 'same-origin'"), true);
  assert.equal(source.includes('isCommentReportPaused(error) ? commentReportPausedCopy()'), true);
  assert.equal([...source.matchAll(/commentReportPausedCopy\(\)/g)].length, 2);
  for (const phrase of [
    'Reporting a comment is paused',
    'דיווח על תגובה מושהה',
    'الإبلاغ عن تعليق متوقف',
    'การรายงานความคิดเห็นปิดชั่วคราว',
    'අදහසක් වාර්තා කිරීම',
    'टिप्पणी की रिपोर्ट अभी रोकी',
    'Жалоба на комментарий пока на паузе',
    'Pansamantalang nakahinto ang pag-uulat ng komento',
  ]) {
    assert.equal(source.includes(phrase), true, phrase);
  }
  assert.equal(source.includes(PERSONAL_DATA_BLOCK_CODE), true);
});

const flagPaths = [
  '/api/community/comments/probe/flag',
  '/api/community/comments/probe/flag?userId=usr_x',
  '/api/community/Comments/probe/flag',
  '/api/community/comments/probe/flag/',
  '/api/community//comments/probe/flag',
  '/api/community/comments//flag',
  '/api/community/comments/flag',
  '/api/community/%63omments/probe/flag',
  '/api/community/comments/%70robe/flag',
];

for (const urlPath of flagPaths) {
  test(`comment flag stays blocked for ${urlPath}`, async () => {
    let flagCalls = 0;
    let commentReads = 0;
    const originalFlag = communityService.flagComment;
    const originalRead = communityService.getAllComments;
    communityService.flagComment = async (...args) => {
      flagCalls += 1;
      return originalFlag.apply(communityService, args);
    };
    communityService.getAllComments = async (...args) => {
      commentReads += 1;
      return originalRead.apply(communityService, args);
    };
    const server = listen();
    try {
      for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
        const response = await fetch(`${server.base}${urlPath}`, {
          method,
          headers: method === 'GET' || method === 'HEAD' || method === 'OPTIONS' ? {} : { 'content-type': 'application/json', origin: server.base },
          body: method === 'GET' || method === 'HEAD' || method === 'OPTIONS' ? undefined : JSON.stringify({ userId: 'usr_x', ownerUserId: 'usr_x' }),
        });
        const body = method === 'HEAD' ? null : await readBody(response);
        assert.equal(response.status, 403, `${method} ${urlPath} -> ${response.status}`);
        if (body && typeof body === 'object') {
          assert.equal(body.error.code, PERSONAL_DATA_BLOCK_CODE, `${method} ${urlPath}`);
          assert.equal(JSON.stringify(body).includes('usr_x'), false);
        }
      }
      assert.equal(flagCalls, 0);
      assert.equal(commentReads, 0);
    } finally {
      communityService.flagComment = originalFlag;
      communityService.getAllComments = originalRead;
      await server.close();
    }
  });
}
