const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const app = require('../src/app');
const { ROUTE_SECURITY } = require('../src/shared/routeSecurity');
const { COOKIE_NAME, openWebSession } = require('../src/shared/webIdentity');
const { env } = require('../src/config/env');
const crmAgentRepository = require('../src/modules/crm-agent/crm-agent.repository');
const documentService = require('../src/modules/documents/document.service');
const taskService = require('../src/modules/tasks/task.service');
const notificationService = require('../src/modules/notifications/notification.service');
const communityService = require('../src/modules/community/community.service');
const jobService = require('../src/modules/jobs/job.service');
const telegramMapper = require('../src/modules/telegram/telegram-message.mapper');
const lineMapper = require('../src/modules/line/line-message.mapper');
const whatsappMapper = require('../src/modules/whatsapp/whatsapp-message.mapper');
const { PERSONAL_DATA_BLOCK_CODE } = require('../src/shared/blockPersonalDataRoute');

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
  const cookies = response.headers.getSetCookie();
  const header = cookies.find((value) => value.startsWith(`${COOKIE_NAME}=`));
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

async function session(base, fullName) {
  const started = await fetch(`${base}/api/chat/profile`);
  const cookie = cookieValue(started);
  await readBody(started);
  const saved = await fetch(`${base}/api/chat/profile`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      cookie: `${COOKIE_NAME}=${encodeURIComponent(cookie)}`,
      origin: base,
    },
    body: JSON.stringify({ fullName }),
  });
  const body = await readBody(saved);
  assert.equal(saved.status, 200, JSON.stringify(body));
  const opened = openWebSession(cookie, [env.webSessionSecret, env.webSessionSecretPrevious].filter(Boolean));
  return { cookie, body: body.profile, webId: opened.webId };
}

function spy(object, method) {
  const original = object[method];
  let calls = 0;
  object[method] = async (...args) => {
    calls += 1;
    return original.apply(object, args);
  };
  return {
    get calls() {
      return calls;
    },
    restore() {
      object[method] = original;
    },
  };
}

test('web sessions A and B cannot read each other, and client channel ids are ignored', async () => {
  const phone = '15550001111';
  const whatsappName = 'WhatsApp Private Person';
  await crmAgentRepository.createUserProfile({
    userId: `usr_wa_${crypto.randomBytes(3).toString('hex')}`,
    channel: 'whatsapp',
    channelUserId: phone,
    fullName: whatsappName,
    whatsappPhone: phone,
  });

  const server = listen();
  try {
    const ada = await session(server.base, 'Ada Isolated');
    const bo = await session(server.base, 'Bo Isolated');
    assert.notEqual(ada.webId, bo.webId);

    const adaRead = await fetch(`${server.base}/api/chat/profile?channel=web&channelUserId=${encodeURIComponent(bo.webId)}`, {
      headers: { cookie: `${COOKIE_NAME}=${encodeURIComponent(ada.cookie)}` },
    });
    const adaBody = await readBody(adaRead);
    assert.equal(adaRead.status, 200);
    assert.equal(adaBody.profile.fullName, 'Ada Isolated');
    assert.equal(JSON.stringify(adaBody).includes('Bo Isolated'), false);
    assert.equal(JSON.stringify(adaBody).includes(phone), false);

    const foreign = await fetch(`${server.base}/api/chat/profile?channel=whatsapp&channelUserId=${encodeURIComponent(phone)}`, {
      headers: { cookie: `${COOKIE_NAME}=${encodeURIComponent(ada.cookie)}` },
    });
    const foreignBody = await readBody(foreign);
    assert.equal(foreign.status, 400);
    assert.equal(foreignBody.error.code, 'FOREIGN_CHANNEL_REJECTED');
    assert.equal(JSON.stringify(foreignBody).includes(whatsappName), false);
    assert.equal(JSON.stringify(foreignBody).includes(phone), false);

    const boRead = await fetch(`${server.base}/api/chat/profile`, {
      headers: { cookie: `${COOKIE_NAME}=${encodeURIComponent(bo.cookie)}` },
    });
    const boBody = await readBody(boRead);
    assert.equal(boBody.profile.fullName, 'Bo Isolated');
    assert.equal(JSON.stringify(boBody).includes('Ada Isolated'), false);
  } finally {
    await server.close();
  }
});

test('personal-data routes are blocked before data-store access', async () => {
  const watches = [
    spy(crmAgentRepository, 'findUserProfileRecordByChannel'),
    spy(documentService, 'getUserDocuments'),
    spy(taskService, 'getUserTasks'),
    spy(notificationService, 'getUserNotifications'),
    spy(communityService, 'addComment'),
    spy(communityService, 'flagComment'),
    spy(jobService, 'findMatchingJobs'),
  ];
  const server = listen();
  try {
    const blocked = ROUTE_SECURITY.filter((entry) => entry.classification === 'blocked-until-PR3a-2');
    assert.deepEqual(
      blocked.map((entry) => `${entry.method} ${entry.path}`),
      ['POST /api/community/comments/:commentId/flag']
    );
    for (const entry of blocked) {
      const path = entry.path.replace(/:([A-Za-z0-9_]+)/g, 'probe');
      const response = await fetch(`${server.base}${path}?channel=whatsapp&channelUserId=15550001111`, {
        method: entry.method,
        headers: entry.method === 'GET' ? {} : { 'content-type': 'application/json' },
        body: entry.method === 'GET' ? undefined : JSON.stringify({ channel: 'web', channelUserId: '15550001111', confirm: true }),
      });
      const body = await readBody(response);
      assert.equal(response.status, 403, `${entry.method} ${entry.path} -> ${response.status}`);
      assert.equal(body.error.code, PERSONAL_DATA_BLOCK_CODE, entry.path);
      assert.equal(JSON.stringify(body).includes('15550001111'), false, entry.path);
    }
    assert.deepEqual(watches.map((watch) => watch.calls), watches.map(() => 0));

    const jobs = await fetch(`${server.base}/api/jobs`);
    assert.equal(jobs.status, 200);
    await readBody(jobs);

    const contacts = await fetch(`${server.base}/api/contacts`);
    assert.equal(contacts.status === 401 || contacts.status === 403, true);
    const contactsBody = await readBody(contacts);
    assert.notEqual(contactsBody.error?.code, PERSONAL_DATA_BLOCK_CODE);

    const line = await fetch(`${server.base}/api/line/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const lineBody = await readBody(line);
    assert.notEqual(lineBody.error?.code, PERSONAL_DATA_BLOCK_CODE);
  } finally {
    watches.forEach((watch) => watch.restore());
    await server.close();
  }
});

test('Telegram, LINE, and WhatsApp identities come from the channel payload', () => {
  const telegram = telegramMapper.mapPrivateTextUpdate({
    update_id: 7,
    message: {
      message_id: 9,
      date: 1700000000,
      text: 'hello',
      chat: { id: 42, type: 'private' },
      from: { id: 4242, username: 'worker' },
    },
  });
  assert.equal(telegram.channel, 'telegram');
  assert.equal(telegram.channelUserId, '4242');

  const line = lineMapper.getTextMessages({
    events: [
      {
        type: 'message',
        timestamp: 1700000000000,
        replyToken: 'reply',
        source: { type: 'user', userId: 'Ulineuser' },
        message: { id: 'm1', type: 'text', text: 'hello' },
      },
    ],
  })[0];
  assert.equal(line.channel, 'line');
  assert.equal(line.channelUserId, 'Ulineuser');

  const whatsapp = whatsappMapper.getTextMessages({
    entry: [
      {
        changes: [
          {
            value: {
              contacts: [{ wa_id: '15551212', profile: { name: 'Ada' } }],
              messages: [{ from: '15551212', id: 'wamid', timestamp: '1700000000', type: 'text', text: { body: 'hello' } }],
            },
          },
        ],
      },
    ],
  })[0];
  assert.equal(whatsapp.channel, 'whatsapp');
  assert.equal(whatsapp.channelUserId, '15551212');
});
