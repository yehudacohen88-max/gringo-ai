const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = require('../src/app');
const { ROUTE_SECURITY, routeKey } = require('../src/shared/routeSecurity');
const { COOKIE_NAME } = require('../src/shared/webIdentity');
const { PERSONAL_DATA_BLOCK_CODE } = require('../src/shared/blockPersonalDataRoute');
const crmAgentRepository = require('../src/modules/crm-agent/crm-agent.repository');
const { crmAgentService } = require('../src/modules/crm-agent');
const { coreAgentService } = require('../src/modules/core-agent');
const documentService = require('../src/modules/documents/document.service');

const root = path.join(__dirname, '..');

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
    return { raw: text };
  }
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

test('cookie-authenticated state changes fail closed without a same-origin browser signal', async () => {
  const server = listen();
  try {
    const started = await fetch(`${server.base}/api/chat/profile`);
    const cookie = cookieValue(started);
    await readBody(started);
    const headers = {
      'content-type': 'application/json',
      cookie: `${COOKIE_NAME}=${encodeURIComponent(cookie)}`,
    };
    const named = await fetch(`${server.base}/api/chat/profile`, {
      method: 'PUT',
      headers: { ...headers, origin: server.base },
      body: JSON.stringify({ fullName: 'Kept Name' }),
    });
    assert.equal(named.status, 200);
    await readBody(named);

    const cases = [
      { name: 'no origin and no sec-fetch-site', extra: {} },
      { name: 'referer only', extra: { referer: `${server.base}/chat.html` } },
      { name: 'origin null', extra: { origin: 'null' } },
      { name: 'mismatched host', extra: { origin: 'https://evil.example' } },
      { name: 'http origin on https request', extra: { origin: server.base, 'x-forwarded-proto': 'https' } },
      { name: 'sec-fetch-site same-site', extra: { 'sec-fetch-site': 'same-site', origin: server.base } },
      { name: 'sec-fetch-site cross-site', extra: { 'sec-fetch-site': 'cross-site' } },
      { name: 'sec-fetch-site none', extra: { 'sec-fetch-site': 'none' } },
    ];

    for (const entry of cases) {
      for (const target of ['/api/chat/profile', '/api/telegram/link-code', '/api/line/disconnect']) {
        const response = await fetch(`${server.base}${target}`, {
          method: target.endsWith('/profile') ? 'PUT' : 'POST',
          headers: { ...headers, ...entry.extra },
          body: JSON.stringify({ fullName: 'Stolen', confirm: true, channelUserId: 'web_1700000000000' }),
        });
        const body = await readBody(response);
        assert.equal(response.status, 403, `${entry.name} ${target} -> ${response.status} ${JSON.stringify(body)}`);
        assert.equal(body.error.code, 'CROSS_SITE_REQUEST_REJECTED', entry.name);
        assert.equal(JSON.stringify(body).includes('Stolen'), false);
      }
    }

    const sameSiteFetch = await fetch(`${server.base}/api/chat/profile`, {
      method: 'PUT',
      headers: { ...headers, 'sec-fetch-site': 'same-origin' },
      body: JSON.stringify({ fullName: 'Fetch Site Same Origin' }),
    });
    assert.equal(sameSiteFetch.status, 200);
    await readBody(sameSiteFetch);

    const httpsOrigin = await fetch(`${server.base}/api/chat/profile`, {
      method: 'PUT',
      headers: {
        ...headers,
        origin: server.base.replace('http://', 'https://'),
        'x-forwarded-proto': 'https',
      },
      body: JSON.stringify({ fullName: 'Https Origin' }),
    });
    assert.equal(httpsOrigin.status, 200);
    await readBody(httpsOrigin);

    const current = await fetch(`${server.base}/api/chat/profile`, {
      headers: { cookie: headers.cookie },
    });
    const currentBody = await readBody(current);
    assert.equal(currentBody.profile.fullName, 'Https Origin');
    assert.equal(JSON.stringify(currentBody).includes('Stolen'), false);
  } finally {
    await server.close();
  }
});

test('a request with no valid cookie cannot read or change legacy web profiles', async () => {
  const legacyWebId = `web_${Date.now()}`;
  const legacy = await crmAgentRepository.createUserProfile({
    userId: `usr_legacy_${crypto.randomBytes(3).toString('hex')}`,
    channel: 'web',
    channelUserId: legacyWebId,
    fullName: 'Legacy Timestamp Person',
  });
  const shared = await crmAgentRepository.createUserProfile({
    userId: `usr_shared_${crypto.randomBytes(3).toString('hex')}`,
    channel: 'web',
    channelUserId: 'local-web-user',
    fullName: 'Legacy Shared Person',
  });
  const server = listen();
  try {
    const attempts = [
      ['GET', `/api/chat/profile?channelUserId=${encodeURIComponent(legacyWebId)}&userId=${legacy.userId}`, null, {}],
      ['GET', `/api/chat/onboarding-status?channelUserId=local-web-user`, null, { 'x-channel-user-id': legacyWebId, 'x-user-id': shared.userId }],
      ['GET', `/api/chat/startup-summary?telegramUserId=1&lineUserId=U1`, null, {}],
      ['PUT', '/api/chat/profile', { channelUserId: legacyWebId, userId: legacy.userId, fullName: 'Overwrite Legacy' }, {}],
      ['POST', '/api/chat/message', { channel: 'web', channelUserId: 'local-web-user', message: 'hello legacy' }, {}],
    ];
    for (const [method, path, payload, extraHeaders] of attempts) {
      const response = await fetch(`${server.base}${path}`, {
        method,
        headers: {
          ...(payload ? { 'content-type': 'application/json' } : {}),
          ...extraHeaders,
        },
        body: payload ? JSON.stringify(payload) : undefined,
      });
      const body = await readBody(response);
      const text = JSON.stringify(body);
      assert.equal(text.includes('Legacy Timestamp Person'), false, path);
      assert.equal(text.includes('Legacy Shared Person'), false, path);
      assert.equal(text.includes(legacy.userId), false, path);
    }

    const stillLegacy = await crmAgentRepository.findUserProfileRecordByChannel('web', legacyWebId);
    const stillShared = await crmAgentRepository.findUserProfileRecordByChannel('web', 'local-web-user');
    assert.equal(stillLegacy.profile.fullName, 'Legacy Timestamp Person');
    assert.equal(stillShared.profile.fullName, 'Legacy Shared Person');
  } finally {
    await server.close();
  }
});

test('blocked personal routes reject method and URL variants before repository access', async () => {
  const watches = [
    spy(crmAgentRepository, 'findUserProfileRecordByChannel'),
    spy(crmAgentRepository, 'createUserProfile'),
    spy(crmAgentRepository, 'updateUserProfile'),
    spy(documentService, 'getUserDocuments'),
  ];
  const server = listen();
  try {
    const paths = [
      '/api/documents',
      '/api/documents/',
      '/api/Documents',
      '/api//documents',
      '/api/%64ocuments',
      '/api/documents?channelUserId=web_1&userId=usr_x',
      '/api/tasks/probe',
      '/api/notifications/summary',
      '/api/jobs/matches',
      '/api/housing/matches/',
      '/api/services/matches',
      '/api/money/defaults',
      '/api/community/relevant',
      '/api/community/post/comments',
      '/api/community/comments/probe/flag',
    ];
    const methods = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
    for (const method of methods) {
      for (const path of paths) {
        const response = await fetch(`${server.base}${path}`, {
          method,
          headers: method === 'GET' || method === 'HEAD' || method === 'OPTIONS' ? {} : { 'content-type': 'application/json' },
          body: method === 'GET' || method === 'HEAD' || method === 'OPTIONS' ? undefined : JSON.stringify({ userId: 'usr_x' }),
        });
        const body = method === 'HEAD' ? null : await readBody(response);
        assert.equal(response.status, 403, `${method} ${path} -> ${response.status}`);
        if (body && typeof body === 'object') {
          assert.equal(body.error.code, PERSONAL_DATA_BLOCK_CODE, `${method} ${path}`);
          assert.equal(JSON.stringify(body).includes('usr_x'), false);
        }
      }
    }
    assert.deepEqual(watches.map((watch) => watch.calls), watches.map(() => 0));

    const jobs = await fetch(`${server.base}/api/jobs`);
    assert.equal(jobs.status, 200);
    await readBody(jobs);
    const malformed = await fetch(`${server.base}/api/documents/%`);
    assert.equal(malformed.status, 400);
    await readBody(malformed);
  } finally {
    watches.forEach((watch) => watch.restore());
    await server.close();
  }
});

test('route inventory has no unclassified route', () => {
  const registered = [];
  function mountPathFromLayer(layer) {
    if (!layer || layer.route) return '';
    const regexp = layer.regexp;
    if (!regexp || regexp.fast_slash) return '';
    const stripped = regexp.source.replace(/^\^/, '').replace(/\\\/\?\(\?=\\\/\|\$\)$/, '');
    return stripped.replace(/\\\//g, '/');
  }
  function joinRoutePath(prefix, routePath) {
    if (!prefix || prefix === '/') return routePath || '/';
    if (!routePath || routePath === '/') return prefix;
    return `${prefix}${routePath.startsWith('/') ? routePath : `/${routePath}`}`;
  }
  function walk(stack, prefix = '') {
    for (const layer of stack || []) {
      if (layer.route) {
        const routePath = joinRoutePath(prefix, layer.route.path);
        for (const method of Object.keys(layer.route.methods)) {
          if (layer.route.methods[method]) registered.push(routeKey(method.toUpperCase(), routePath));
        }
        continue;
      }
      if (layer.name === 'router' && layer.handle && Array.isArray(layer.handle.stack)) {
        walk(layer.handle.stack, joinRoutePath(prefix, mountPathFromLayer(layer)));
      }
    }
  }
  walk(app._router.stack);
  const classified = new Set(ROUTE_SECURITY.map((entry) => routeKey(entry.method, entry.path)));
  const missing = registered.filter((key) => !classified.has(key));
  assert.deepEqual(missing, []);
});

test('channel flows do not fall back to a shared web profile', async () => {
  await assert.rejects(
    () => coreAgentService.processWebMessage({ message: 'hello', channel: 'telegram' }),
    /channel user id is required/i
  );
  const telegram = await crmAgentService.findOrCreateUser({
    channel: 'telegram',
    channelUserId: 'tg-final-review',
    fullName: 'Telegram Flow',
  });
  const line = await crmAgentService.findOrCreateUser({
    channel: 'line',
    channelUserId: 'U-final-review',
    fullName: 'Line Flow',
  });
  const whatsapp = await crmAgentService.findOrCreateUser({
    channel: 'whatsapp',
    channelUserId: '15550009999',
    fullName: 'WhatsApp Flow',
  });
  assert.equal(telegram.channel, 'telegram');
  assert.equal(line.channel, 'line');
  assert.equal(whatsapp.channel, 'whatsapp');
  assert.notEqual(telegram.channelUserId, 'local-web-user');
  assert.notEqual(line.channelUserId, 'local-web-user');
  assert.notEqual(whatsapp.channelUserId, 'local-web-user');
  const shared = await crmAgentRepository.findUserProfileRecordByChannel('web', 'local-web-user');
  if (shared) assert.equal(shared.profile.fullName, 'Legacy Shared Person');
});

test('the web UI explains the paused panels in every supported language', () => {
  const source = fs.readFileSync(path.join(root, 'src/public/chat.js'), 'utf8');
  for (const code of ['en', 'he', 'ar', 'th', 'si', 'hi', 'ru', 'tl']) {
    assert.equal(source.includes(`${code}:`), true, code);
  }
  assert.match(source, /PERSONAL_DATA_TEMPORARILY_UNAVAILABLE/);
  assert.match(source, /unavailableCopy\(\)/);
  assert.equal(source.includes('Request failed.'), true);
  assert.equal(source.includes("credentials: 'same-origin'"), true);
  const paused = [
    'This part of Gringo is paused',
    'החלק הזה של גרינגו',
    'هذا الجزء من Gringo',
    'ส่วนนี้ของ Gringo',
    'Gringo හි මෙම කොටස',
    'Gringo का यह हिस्सा',
    'Этот раздел Gringo',
    'Pansamantalang nakahinto',
  ];
  for (const phrase of paused) assert.equal(source.includes(phrase), true, phrase);
});
