const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const http = require('http');

const app = require('../src/app');
const { env } = require('../src/config/env');
const { coreAgentService } = require('../src/modules/core-agent');
const contactRepository = require('../src/modules/contacts/contact.repository');
const jobService = require('../src/modules/jobs/job.service');
const housingService = require('../src/modules/housing/housing.service');
const lineMessageMapper = require('../src/modules/line/line-message.mapper');
const whatsappMessageMapper = require('../src/modules/whatsapp/whatsapp-message.mapper');
const { redact } = require('../src/shared/logRedaction');
const { resetRateLimitsForTests, setRateLimitForTests } = require('../src/shared/rateLimit');
const { COPY } = require('../src/shared/userFacingCopy');
const { COOKIE_NAME } = require('../src/shared/webIdentity');

const LEAK = [
  'OpenAI',
  'spreadsheet',
  'Users!A1',
  '/src/modules/ai-provider/openai.provider.js',
  '+66812345678',
  'sk-supersecretkey123456',
  'sk-live-abcdefghi1234567890',
  'gw_sid=v1.secretid.sig',
  'ada@example.com',
  'this is the private message text from the user',
  'at processWebMessage',
].join(' ');

const LEAK_ERROR = `provider failed ${LEAK}`;

function listen() {
  const server = app.listen(0);
  const { port } = server.address();
  return {
    port,
    base: `http://127.0.0.1:${port}`,
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

function rawRequest(port, { method = 'GET', path = '/', headers = {}, body = '' } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let parsed = null;
        try {
          parsed = text ? JSON.parse(text) : null;
        } catch (error) {
          parsed = text;
        }
        resolve({
          status: res.statusCode,
          text,
          body: parsed,
          headers: res.headers,
        });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function assertNoLeak(text) {
  const body = String(text);
  for (const fragment of [
    'OpenAI',
    'spreadsheet',
    'Users!A1',
    '/src/modules',
    'openai.provider',
    '+66812345678',
    '66812345678',
    'sk-super',
    'sk-live',
    'gw_sid=',
    'secretid',
    'ada@example.com',
    'private message text',
    'processWebMessage',
    'boom-internal',
  ]) {
    assert.equal(body.includes(fragment), false, `response leaked ${fragment}`);
  }
}

function assertGeneric500(result, language = 'en') {
  assert.equal(result.status, 500);
  assert.equal(result.body.error.code, 'INTERNAL_ERROR');
  assert.equal(result.body.error.message, COPY.internal[language]);
  assert.deepEqual(result.body.error.details, []);
  assert.equal(result.headers['x-powered-by'], undefined);
  assertNoLeak(result.text);
}

function cookieFrom(result) {
  const raw = result.headers['set-cookie'];
  const header = Array.isArray(raw) ? raw.find((value) => value.startsWith(`${COOKIE_NAME}=`)) : raw;
  assert.ok(header, 'expected a session cookie');
  return decodeURIComponent(String(header).split(';')[0].slice(COOKIE_NAME.length + 1));
}

function captureConsole(fn) {
  const lines = [];
  const original = console.error;
  console.error = (...args) => {
    lines.push(args.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join(' '));
  };
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      console.error = original;
    })
    .then(() => lines.join('\n'));
}

test.beforeEach(() => {
  resetRateLimitsForTests();
});

test('redaction removes secrets, phones, cookies, and message text', () => {
  const cleaned = redact(`fail ${LEAK_ERROR}\nError: ${LEAK_ERROR}\n    at processWebMessage (/src/modules/core-agent/core-agent.service.js:10:1)`);
  assert.equal(cleaned.includes('+66812345678'), false);
  assert.equal(cleaned.includes('sk-super'), false);
  assert.equal(cleaned.includes('sk-live'), false);
  assert.equal(cleaned.includes('gw_sid=v1'), false);
  assert.equal(cleaned.includes('ada@example.com'), false);
  assert.equal(cleaned.includes('private message text'), false);
  assert.equal(cleaned.includes('[redacted]'), true);
  assert.equal(cleaned.includes('core-agent.service.js'), true);
});

test('X-Powered-By is absent and unexpected 500s stay generic', async () => {
  const server = listen();
  const originals = {
    jobs: jobService.getActiveJobs,
    housing: housingService.getActiveHousingListings,
    contacts: contactRepository.findAllContacts,
    chat: coreAgentService.processWebMessage,
    lineText: lineMessageMapper.getTextMessages,
    lineEvents: lineMessageMapper.extractPostbackEvents,
    lineUnsupported: lineMessageMapper.getUnsupportedMessages,
    whatsappStatus: whatsappMessageMapper.getStatusEvents,
    lineEnabled: env.line.enabled,
    lineSecret: env.line.channelSecret,
    whatsappEnabled: env.whatsapp.enabled,
    whatsappSecret: env.whatsapp.appSecret,
  };
  const lineSecret = 'test-only-line-channel-secret';
  const whatsappSecret = 'test-only-whatsapp-app-secret';
  try {
    const health = await rawRequest(server.port, { path: '/health' });
    assert.equal(health.status, 200);
    assert.equal(health.headers['x-powered-by'], undefined);

    const invalidJson = await rawRequest(server.port, {
      method: 'POST',
      path: '/api/chat/message',
      headers: {
        'content-type': 'application/json',
        origin: server.base,
      },
      body: '{"message":',
    });
    assert.equal(invalidJson.status, 400);
    assert.equal(invalidJson.body.error.message, 'Invalid JSON request body.');
    assert.equal(invalidJson.headers['x-powered-by'], undefined);

    jobService.getActiveJobs = async () => {
      throw new Error(LEAK_ERROR);
    };
    const jobsLog = await captureConsole(async () => {
      const jobs = await rawRequest(server.port, {
        path: '/api/jobs',
        headers: { 'accept-language': 'he' },
      });
      assertGeneric500(jobs, 'he');
    });
    assert.equal(jobsLog.includes('+66812345678'), false);
    assert.equal(jobsLog.includes('sk-super'), false);
    assert.equal(jobsLog.includes('sk-live'), false);
    assert.equal(jobsLog.includes('private message text'), false);
    assert.equal(jobsLog.includes('ada@example.com'), false);
    assert.equal(jobsLog.includes('[http] GET /api/jobs'), true);

    housingService.getActiveHousingListings = async () => {
      throw new Error('sheet range Housing!A1 exploded');
    };
    const housing = await rawRequest(server.port, { path: '/api/housing' });
    assertGeneric500(housing);
    assert.equal(housing.text.includes('Housing!A1'), false);

    contactRepository.findAllContacts = async () => {
      throw new Error('boom-internal spreadsheet secret');
    };
    const admin = await rawRequest(server.port, {
      path: '/api/contacts',
      headers: { 'x-admin-api-key': 'dev-admin-key' },
    });
    assertGeneric500(admin);
    assert.equal(admin.text.includes('boom-internal'), false);

    coreAgentService.processWebMessage = async () => {
      throw new Error(LEAK_ERROR);
    };
    const chat = await rawRequest(server.port, {
      method: 'POST',
      path: '/api/chat/message',
      headers: {
        'content-type': 'application/json',
        origin: server.base,
        'accept-language': 'th',
      },
      body: JSON.stringify({ message: 'hello' }),
    });
    assertGeneric500(chat, 'th');

    env.line.enabled = true;
    env.line.channelSecret = lineSecret;
    lineMessageMapper.getTextMessages = () => {
      throw new Error(LEAK_ERROR);
    };
    lineMessageMapper.extractPostbackEvents = () => [];
    lineMessageMapper.getUnsupportedMessages = () => [];
    const lineRaw = JSON.stringify({ events: [] });
    const lineSignature = crypto.createHmac('sha256', lineSecret).update(lineRaw).digest('base64');
    const line = await rawRequest(server.port, {
      method: 'POST',
      path: '/api/line/webhook',
      headers: {
        'content-type': 'application/json',
        'x-line-signature': lineSignature,
      },
      body: lineRaw,
    });
    assertGeneric500(line);

    env.whatsapp.enabled = true;
    env.whatsapp.appSecret = whatsappSecret;
    whatsappMessageMapper.getStatusEvents = () => {
      throw new Error(LEAK_ERROR);
    };
    const whatsappRaw = JSON.stringify({ entry: [] });
    const whatsappSignature = `sha256=${crypto.createHmac('sha256', whatsappSecret).update(whatsappRaw).digest('hex')}`;
    const whatsapp = await rawRequest(server.port, {
      method: 'POST',
      path: '/api/whatsapp/webhook',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': whatsappSignature,
      },
      body: whatsappRaw,
    });
    assertGeneric500(whatsapp);
  } finally {
    jobService.getActiveJobs = originals.jobs;
    housingService.getActiveHousingListings = originals.housing;
    contactRepository.findAllContacts = originals.contacts;
    coreAgentService.processWebMessage = originals.chat;
    lineMessageMapper.getTextMessages = originals.lineText;
    lineMessageMapper.extractPostbackEvents = originals.lineEvents;
    lineMessageMapper.getUnsupportedMessages = originals.lineUnsupported;
    whatsappMessageMapper.getStatusEvents = originals.whatsappStatus;
    env.line.enabled = originals.lineEnabled;
    env.line.channelSecret = originals.lineSecret;
    env.whatsapp.enabled = originals.whatsappEnabled;
    env.whatsapp.appSecret = originals.whatsappSecret;
    await server.close();
  }
});

test('chat limits apply per IP and per session, including new cookies and a spoofed forwarding header', async () => {
  const server = listen();
  const original = coreAgentService.processWebMessage;
  coreAgentService.processWebMessage = async () => ({
    reply: 'ok',
    category: 'general',
    status: 'completed',
    onboarding: { complete: false },
  });
  try {
    setRateLimitForTests('chat', { ipLimit: 2, sessionLimit: 2, windowMs: 60 * 1000 });
    const headers = {
      'content-type': 'application/json',
      origin: server.base,
    };
    const first = await rawRequest(server.port, {
      method: 'POST',
      path: '/api/chat/message',
      headers,
      body: JSON.stringify({ message: 'one' }),
    });
    assert.equal(first.status, 200);
    const second = await rawRequest(server.port, {
      method: 'Post',
      path: '/API/CHAT/MESSAGE/',
      headers: { ...headers, 'x-forwarded-for': '203.0.113.10', cookie: 'gw_sid=v1.not-valid.sig' },
      body: JSON.stringify({ message: 'two' }),
    });
    assert.equal(second.status, 200);
    const blocked = await rawRequest(server.port, {
      method: 'POST',
      path: '/api/chat/message',
      headers: {
        ...headers,
        'accept-language': 'th-TH,th;q=0.9',
        'x-forwarded-for': '198.51.100.20',
        cookie: 'gw_sid=v1.another-fresh.sig',
      },
      body: JSON.stringify({ message: 'three' }),
    });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error.code, 'RATE_LIMITED');
    assert.equal(blocked.body.error.message, COPY.rateLimited.th);
    assert.match(blocked.body.error.message, /[\u0e00-\u0e7f]/);
    assert.equal(blocked.headers['retry-after'] >= '1', true);
    assert.equal(blocked.headers['x-powered-by'], undefined);

    resetRateLimitsForTests();
    setRateLimitForTests('chat', { ipLimit: 20, sessionLimit: 2, windowMs: 60 * 1000 });
    const sessionA = await rawRequest(server.port, { path: '/api/chat/profile' });
    const cookieA = cookieFrom(sessionA);
    const sessionB = await rawRequest(server.port, { path: '/api/chat/profile' });
    const cookieB = cookieFrom(sessionB);
    assert.notEqual(cookieA, cookieB);
    for (let index = 0; index < 2; index += 1) {
      const allowed = await rawRequest(server.port, {
        method: 'POST',
        path: '/api/chat/message',
        headers: { ...headers, cookie: `${COOKIE_NAME}=${encodeURIComponent(cookieA)}`, 'accept-language': 'he' },
        body: JSON.stringify({ message: `a${index}` }),
      });
      assert.equal(allowed.status, 200);
    }
    const sessionBlocked = await rawRequest(server.port, {
      method: 'POST',
      path: '/api/chat/message',
      headers: { ...headers, cookie: `${COOKIE_NAME}=${encodeURIComponent(cookieA)}`, 'accept-language': 'he' },
      body: JSON.stringify({ message: 'a-blocked' }),
    });
    assert.equal(sessionBlocked.status, 429);
    assert.equal(sessionBlocked.body.error.message, COPY.rateLimited.he);
    const otherSession = await rawRequest(server.port, {
      method: 'POST',
      path: '/api/chat/message',
      headers: { ...headers, cookie: `${COOKIE_NAME}=${encodeURIComponent(cookieB)}` },
      body: JSON.stringify({ message: 'b0' }),
    });
    assert.equal(otherSession.status, 200);

    const empty = await rawRequest(server.port, {
      method: 'POST',
      path: '/api/chat/message',
      headers,
      body: JSON.stringify({ message: '   ' }),
    });
    assert.equal(empty.status, 400);
    assert.equal(empty.body.error.message, 'message is required.');
  } finally {
    coreAgentService.processWebMessage = original;
    await server.close();
  }
});

test('public catalog and search limits ignore case, query, method, and X-Forwarded-For', async () => {
  const server = listen();
  try {
    setRateLimitForTests('publicRead', { ipLimit: 1, sessionLimit: 1, windowMs: 60 * 1000 });
    const missed = await rawRequest(server.port, { method: 'POST', path: '/api/jobs' });
    assert.equal(missed.status, 404);
    const first = await rawRequest(server.port, {
      path: '/api/services?category=clinic',
      headers: { 'x-forwarded-for': '203.0.113.8' },
    });
    assert.equal(first.status, 200);
    const blocked = await rawRequest(server.port, {
      method: 'Get',
      path: '/API/HOUSING/',
      headers: { 'x-forwarded-for': '198.51.100.8', 'accept-language': 'en' },
    });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error.code, 'RATE_LIMITED');
    assert.equal(blocked.body.error.message, COPY.rateLimited.en);
    assert.equal(blocked.headers['retry-after'] >= '1', true);

    resetRateLimitsForTests();
    setRateLimitForTests('publicRead', { ipLimit: 2, sessionLimit: 2, windowMs: 60 * 1000 });
    const jobs = await rawRequest(server.port, { path: '/api/jobs' });
    assert.equal(jobs.status, 200);
    const money = await rawRequest(server.port, { path: '/api/money/compare?amount=100' });
    assert.equal(money.status, 200);
    const community = await rawRequest(server.port, { path: '/api/community' });
    assert.equal(community.status, 429);
  } finally {
    await server.close();
  }
});

test('new gw_sid creation is limited per IP and a fresh cookie does not reset it', async () => {
  const server = listen();
  try {
    setRateLimitForTests('newSession', { ipLimit: 2, windowMs: 10 * 60 * 1000 });
    const first = await rawRequest(server.port, {
      path: '/api/chat/profile',
      headers: { 'x-forwarded-for': '203.0.113.50' },
    });
    assert.equal(first.status, 200);
    const cookie = cookieFrom(first);
    const second = await rawRequest(server.port, {
      path: '/api/chat/profile',
      headers: { 'x-forwarded-for': '198.51.100.50', cookie: 'gw_sid=brand-new' },
    });
    assert.equal(second.status, 200);
    const blocked = await rawRequest(server.port, {
      path: '/api/chat/profile',
      headers: { 'x-forwarded-for': '192.0.2.50', 'accept-language': 'th' },
    });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error.message, COPY.rateLimited.th);
    assert.equal(blocked.headers['set-cookie'], undefined);
    const reused = await rawRequest(server.port, {
      path: '/api/chat/profile',
      headers: { cookie: `${COOKIE_NAME}=${encodeURIComponent(cookie)}` },
    });
    assert.equal(reused.status, 200);
  } finally {
    await server.close();
  }
});

test('link-code generate is limited per IP across channel, case, and a new cookie', async () => {
  const server = listen();
  try {
    setRateLimitForTests('linkGenerate', { ipLimit: 2, sessionLimit: 5, windowMs: 60 * 60 * 1000 });
    const headers = { 'content-type': 'application/json', origin: server.base };
    const first = await rawRequest(server.port, {
      method: 'POST',
      path: '/api/telegram/link-code',
      headers,
      body: '{}',
    });
    assert.equal(first.status === 429, false);
    const second = await rawRequest(server.port, {
      method: 'POST',
      path: '/API/LINE/LINK-CODE',
      headers: { ...headers, 'x-forwarded-for': '203.0.113.77', cookie: 'gw_sid=v1.rotate.sig' },
      body: '{}',
    });
    assert.equal(second.status === 429, false);
    const blocked = await rawRequest(server.port, {
      method: 'POST',
      path: '/api/telegram/link-code',
      headers: { ...headers, 'accept-language': 'ru', 'x-forwarded-for': '198.51.100.77', cookie: 'gw_sid=v1.rotate-again.sig' },
      body: '{}',
    });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error.message, COPY.rateLimited.ru);
    const ignored = await rawRequest(server.port, { method: 'GET', path: '/api/telegram/link-code' });
    assert.equal(ignored.status, 404);
  } finally {
    await server.close();
  }
});

test('webhook floods return HTTP 200 and do not run the handler', async () => {
  const server = listen();
  const originals = {
    lineEnabled: env.line.enabled,
    lineSecret: env.line.channelSecret,
    lineText: lineMessageMapper.getTextMessages,
    whatsappEnabled: env.whatsapp.enabled,
    whatsappSecret: env.whatsapp.appSecret,
    whatsappStatus: whatsappMessageMapper.getStatusEvents,
    whatsappText: whatsappMessageMapper.getTextMessages,
    whatsappInteractive: whatsappMessageMapper.getInteractiveMessages,
    whatsappUnsupported: whatsappMessageMapper.getUnsupportedMessages,
  };
  let lineCalls = 0;
  let whatsappCalls = 0;
  try {
    setRateLimitForTests('webhook', { ipLimit: 1, windowMs: 60 * 1000 });
    env.line.enabled = true;
    env.line.channelSecret = 'test-only-line-channel-secret';
    lineMessageMapper.getTextMessages = () => {
      lineCalls += 1;
      return [];
    };
    const lineRaw = JSON.stringify({ events: [{ type: 'message' }] });
    const lineSignature = crypto.createHmac('sha256', env.line.channelSecret).update(lineRaw).digest('base64');
    const lineAllowed = await rawRequest(server.port, {
      method: 'POST',
      path: '/api/line/webhook',
      headers: {
        'content-type': 'application/json',
        'x-line-signature': lineSignature,
        'x-forwarded-for': '203.0.113.9',
      },
      body: lineRaw,
    });
    assert.equal(lineAllowed.status, 200);
    assert.equal(lineCalls, 1);
    const lineBlocked = await rawRequest(server.port, {
      method: 'POST',
      path: '/API/LINE/WEBHOOK',
      headers: {
        'content-type': 'application/json',
        'x-line-signature': lineSignature,
        'x-forwarded-for': '198.51.100.9',
      },
      body: lineRaw,
    });
    assert.equal(lineBlocked.status, 200);
    assert.deepEqual(lineBlocked.body, { ok: true });
    assert.equal(lineBlocked.headers['retry-after'], undefined);
    assert.equal(lineCalls, 1);

    resetRateLimitsForTests();
    setRateLimitForTests('webhook', { ipLimit: 1, windowMs: 60 * 1000 });
    env.whatsapp.enabled = true;
    env.whatsapp.appSecret = 'test-only-whatsapp-app-secret';
    whatsappMessageMapper.getTextMessages = () => [];
    whatsappMessageMapper.getInteractiveMessages = () => [];
    whatsappMessageMapper.getUnsupportedMessages = () => [];
    whatsappMessageMapper.getStatusEvents = () => {
      whatsappCalls += 1;
      return [];
    };
    const whatsappRaw = JSON.stringify({ entry: [] });
    const whatsappSignature = `sha256=${crypto.createHmac('sha256', env.whatsapp.appSecret).update(whatsappRaw).digest('hex')}`;
    const whatsappAllowed = await rawRequest(server.port, {
      method: 'POST',
      path: '/api/whatsapp/webhook',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': whatsappSignature,
      },
      body: whatsappRaw,
    });
    assert.equal(whatsappAllowed.status, 200);
    assert.equal(whatsappCalls, 1);
    const callsAfterAllowed = whatsappCalls;
    const whatsappBlocked = await rawRequest(server.port, {
      method: 'POST',
      path: '/api/whatsapp/webhook',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': 'sha256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'x-forwarded-for': '203.0.113.44',
      },
      body: whatsappRaw,
    });
    assert.equal(whatsappBlocked.status, 200);
    assert.deepEqual(whatsappBlocked.body, { ok: true });
    assert.equal(whatsappCalls, callsAfterAllowed);

    const verifyBlocked = await rawRequest(server.port, {
      path: '/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=challenge-token',
    });
    assert.equal(verifyBlocked.status, 200);
    assert.equal(String(verifyBlocked.text).includes('challenge-token'), false);
  } finally {
    env.line.enabled = originals.lineEnabled;
    env.line.channelSecret = originals.lineSecret;
    lineMessageMapper.getTextMessages = originals.lineText;
    env.whatsapp.enabled = originals.whatsappEnabled;
    env.whatsapp.appSecret = originals.whatsappSecret;
    whatsappMessageMapper.getStatusEvents = originals.whatsappStatus;
    whatsappMessageMapper.getTextMessages = originals.whatsappText;
    whatsappMessageMapper.getInteractiveMessages = originals.whatsappInteractive;
    whatsappMessageMapper.getUnsupportedMessages = originals.whatsappUnsupported;
    await server.close();
  }
});
