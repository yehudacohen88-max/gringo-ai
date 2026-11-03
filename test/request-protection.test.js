const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const http = require('http');
const path = require('path');
const { spawnSync } = require('node:child_process');

const app = require('../src/app');
const { env, parseTrustProxyHops } = require('../src/config/env');
const { coreAgentService } = require('../src/modules/core-agent');
const contactRepository = require('../src/modules/contacts/contact.repository');
const jobService = require('../src/modules/jobs/job.service');
const housingService = require('../src/modules/housing/housing.service');
const lineMessageMapper = require('../src/modules/line/line-message.mapper');
const whatsappMessageMapper = require('../src/modules/whatsapp/whatsapp-message.mapper');
const { redact } = require('../src/shared/logRedaction');
const {
  bucketCountForTests,
  consume,
  resetRateLimitsForTests,
  setBucketCapForTests,
  setRateLimitForTests,
  setSweepIntervalForTests,
} = require('../src/shared/rateLimit');
const { COPY } = require('../src/shared/userFacingCopy');
const { COOKIE_NAME } = require('../src/shared/webIdentity');

const root = path.join(__dirname, '..');
const LINE_SECRET = 'test-only-line-channel-secret';
const WHATSAPP_SECRET = 'test-only-whatsapp-app-secret';
const LEAK = [
  'OpenAI',
  'spreadsheet Users!A1',
  '/src/modules/ai-provider/openai.provider.js',
  '+66812345678',
  'sk-supersecretkey123456',
  'sk-live-abcdefghi1234567890',
  'gw_sid=v1.secretid.sig',
  'ada@example.com',
  'this is the private message text from the user',
].join(' ');

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

function rawRequest(port, { method = 'GET', path: requestPath = '/', headers = {}, body = '' } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: requestPath, headers }, (res) => {
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
        resolve({ status: res.statusCode, text, body: parsed, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function cookieFrom(result) {
  const raw = result.headers['set-cookie'];
  const header = Array.isArray(raw) ? raw.find((value) => String(value).startsWith(`${COOKIE_NAME}=`)) : raw;
  assert.ok(header);
  return decodeURIComponent(String(header).split(';')[0].slice(COOKIE_NAME.length + 1));
}

function lineSignature(raw) {
  return crypto.createHmac('sha256', LINE_SECRET).update(raw).digest('base64');
}

function whatsappSignature(raw) {
  return `sha256=${crypto.createHmac('sha256', WHATSAPP_SECRET).update(raw).digest('hex')}`;
}

function chatHeaders(server, extra = {}) {
  return {
    'content-type': 'application/json',
    origin: server.base,
    ...extra,
  };
}

async function withServer(fn) {
  const server = listen();
  try {
    await fn(server);
  } finally {
    await server.close();
  }
}

test.beforeEach(() => {
  resetRateLimitsForTests();
  env.trustProxyHops = 0;
});

test('redaction removes secrets, phone numbers, cookies, and message text', () => {
  const cleaned = redact(`fail ${LEAK}\n    at processWebMessage (/src/modules/core-agent/core-agent.service.js:10:1)`);
  assert.equal(cleaned.includes('+66812345678'), false);
  assert.equal(cleaned.includes('sk-super'), false);
  assert.equal(cleaned.includes('sk-live'), false);
  assert.equal(cleaned.includes('gw_sid=v1'), false);
  assert.equal(cleaned.includes('ada@example.com'), false);
  assert.equal(cleaned.includes('private message text'), false);
  assert.equal(cleaned.includes('core-agent.service.js'), true);
});

test('health responses omit X-Powered-By', async () => {
  await withServer(async (server) => {
    const health = await rawRequest(server.port, { path: '/health' });
    assert.equal(health.status, 200);
    assert.equal(health.headers['x-powered-by'], undefined);
    assert.equal(app.get('trust proxy'), false);
  });
});

test('invalid JSON stays a specific 400', async () => {
  await withServer(async (server) => {
    const invalid = await rawRequest(server.port, {
      method: 'POST',
      path: '/api/chat/message',
      headers: chatHeaders(server),
      body: '{"message":',
    });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.error.message, 'Invalid JSON request body.');
  });
});

test('a jobs 500 body and log hide provider and personal details', async () => {
  const original = jobService.getActiveJobs;
  jobService.getActiveJobs = async () => {
    throw new Error(LEAK);
  };
  const lines = [];
  const originalError = console.error;
  console.error = (...args) => {
    lines.push(args.map((item) => String(item)).join(' '));
  };
  try {
    await withServer(async (server) => {
      const jobs = await rawRequest(server.port, {
        path: '/api/jobs',
        headers: { 'accept-language': 'he' },
      });
      assert.equal(jobs.status, 500);
      assert.equal(jobs.body.error.code, 'INTERNAL_ERROR');
      assert.equal(jobs.body.error.message, COPY.internal.he);
      assert.deepEqual(jobs.body.error.details, []);
      assert.equal(jobs.text.includes('OpenAI'), false);
      assert.equal(jobs.text.includes('Users!A1'), false);
      assert.equal(jobs.text.includes('+66812345678'), false);
      assert.equal(jobs.text.includes('sk-'), false);
      assert.equal(jobs.headers['x-powered-by'], undefined);
    });
    const log = lines.join('\n');
    assert.equal(log.includes('+66812345678'), false);
    assert.equal(log.includes('sk-super'), false);
    assert.equal(log.includes('private message text'), false);
    assert.equal(log.includes('[http] GET /api/jobs'), true);
  } finally {
    console.error = originalError;
    jobService.getActiveJobs = original;
  }
});

test('a housing 500 body does not include the sheet path', async () => {
  const original = housingService.getActiveHousingListings;
  housingService.getActiveHousingListings = async () => {
    throw new Error('sheet range Housing!A1 exploded');
  };
  try {
    await withServer(async (server) => {
      const housing = await rawRequest(server.port, { path: '/api/housing' });
      assert.equal(housing.status, 500);
      assert.equal(housing.body.error.message, COPY.internal.en);
      assert.equal(housing.text.includes('Housing!A1'), false);
    });
  } finally {
    housingService.getActiveHousingListings = original;
  }
});

test('an admin 500 body does not include the thrown message', async () => {
  const original = contactRepository.findAllContacts;
  contactRepository.findAllContacts = async () => {
    throw new Error('boom-internal spreadsheet secret');
  };
  try {
    await withServer(async (server) => {
      const admin = await rawRequest(server.port, {
        path: '/api/contacts',
        headers: { 'x-admin-api-key': 'dev-admin-key' },
      });
      assert.equal(admin.status, 500);
      assert.equal(admin.body.error.code, 'INTERNAL_ERROR');
      assert.equal(admin.text.includes('boom-internal'), false);
    });
  } finally {
    contactRepository.findAllContacts = original;
  }
});

test('a chat 500 body is generic in the requested language', async () => {
  const original = coreAgentService.processWebMessage;
  coreAgentService.processWebMessage = async () => {
    throw new Error(LEAK);
  };
  try {
    await withServer(async (server) => {
      const chat = await rawRequest(server.port, {
        method: 'POST',
        path: '/api/chat/message',
        headers: chatHeaders(server, { 'accept-language': 'th' }),
        body: JSON.stringify({ message: 'hello' }),
      });
      assert.equal(chat.status, 500);
      assert.equal(chat.body.error.message, COPY.internal.th);
      assert.equal(chat.text.includes('sk-'), false);
      assert.equal(chat.text.includes('private message text'), false);
    });
  } finally {
    coreAgentService.processWebMessage = original;
  }
});

test('a LINE webhook 500 body hides the provider error', async () => {
  const original = lineMessageMapper.getTextMessages;
  const previous = { enabled: env.line.enabled, secret: env.line.channelSecret };
  env.line.enabled = true;
  env.line.channelSecret = LINE_SECRET;
  lineMessageMapper.getTextMessages = () => {
    throw new Error(LEAK);
  };
  try {
    await withServer(async (server) => {
      const raw = JSON.stringify({ events: [] });
      const line = await rawRequest(server.port, {
        method: 'POST',
        path: '/api/line/webhook',
        headers: { 'content-type': 'application/json', 'x-line-signature': lineSignature(raw) },
        body: raw,
      });
      assert.equal(line.status, 500);
      assert.equal(line.body.error.code, 'INTERNAL_ERROR');
      assert.equal(line.text.includes('OpenAI'), false);
      assert.equal(line.text.includes('+66812345678'), false);
    });
  } finally {
    lineMessageMapper.getTextMessages = original;
    env.line.enabled = previous.enabled;
    env.line.channelSecret = previous.secret;
  }
});

test('a WhatsApp webhook 500 body hides the provider error', async () => {
  const originals = {
    enabled: env.whatsapp.enabled,
    secret: env.whatsapp.appSecret,
    text: whatsappMessageMapper.getTextMessages,
    interactive: whatsappMessageMapper.getInteractiveMessages,
    unsupported: whatsappMessageMapper.getUnsupportedMessages,
    status: whatsappMessageMapper.getStatusEvents,
  };
  env.whatsapp.enabled = true;
  env.whatsapp.appSecret = WHATSAPP_SECRET;
  whatsappMessageMapper.getTextMessages = () => [];
  whatsappMessageMapper.getInteractiveMessages = () => [];
  whatsappMessageMapper.getUnsupportedMessages = () => [];
  whatsappMessageMapper.getStatusEvents = () => {
    throw new Error(LEAK);
  };
  try {
    await withServer(async (server) => {
      const raw = JSON.stringify({ entry: [] });
      const whatsapp = await rawRequest(server.port, {
        method: 'POST',
        path: '/api/whatsapp/webhook',
        headers: { 'content-type': 'application/json', 'x-hub-signature-256': whatsappSignature(raw) },
        body: raw,
      });
      assert.equal(whatsapp.status, 500);
      assert.equal(whatsapp.body.error.code, 'INTERNAL_ERROR');
      assert.equal(whatsapp.text.includes('sk-'), false);
      assert.equal(whatsapp.text.includes('private message text'), false);
    });
  } finally {
    env.whatsapp.enabled = originals.enabled;
    env.whatsapp.appSecret = originals.secret;
    whatsappMessageMapper.getTextMessages = originals.text;
    whatsappMessageMapper.getInteractiveMessages = originals.interactive;
    whatsappMessageMapper.getUnsupportedMessages = originals.unsupported;
    whatsappMessageMapper.getStatusEvents = originals.status;
  }
});

test('chat IP limit blocks a rotated cookie and a spoofed forwarding header', async () => {
  const original = coreAgentService.processWebMessage;
  coreAgentService.processWebMessage = async () => ({ reply: 'ok', category: 'general', status: 'completed', onboarding: {} });
  setRateLimitForTests('chat', { ipLimit: 2, sessionLimit: 20, windowMs: 60 * 1000 });
  try {
    await withServer(async (server) => {
      const headers = chatHeaders(server);
      const first = await rawRequest(server.port, {
        method: 'POST',
        path: '/api/chat/message',
        headers,
        body: JSON.stringify({ message: 'one' }),
      });
      const second = await rawRequest(server.port, {
        method: 'Post',
        path: '/API/CHAT/MESSAGE/',
        headers: { ...headers, 'x-forwarded-for': '203.0.113.10', cookie: 'gw_sid=v1.not-valid.sig' },
        body: JSON.stringify({ message: 'two' }),
      });
      const blocked = await rawRequest(server.port, {
        method: 'POST',
        path: '/api/chat/message',
        headers: { ...headers, 'accept-language': 'th-TH,th;q=0.9', 'x-forwarded-for': '198.51.100.20', cookie: 'gw_sid=v1.another.sig' },
        body: JSON.stringify({ message: 'three' }),
      });
      assert.equal(first.status, 200);
      assert.equal(second.status, 200);
      assert.equal(blocked.status, 429);
      assert.equal(blocked.body.error.code, 'RATE_LIMITED');
      assert.equal(blocked.body.error.message, COPY.rateLimited.th);
      assert.equal(Number(blocked.headers['retry-after']) >= 1, true);
      assert.equal(blocked.headers['x-powered-by'], undefined);
    });
  } finally {
    coreAgentService.processWebMessage = original;
  }
});

test('one session does not consume another session chat budget', async () => {
  const original = coreAgentService.processWebMessage;
  coreAgentService.processWebMessage = async () => ({ reply: 'ok', category: 'general', status: 'completed', onboarding: {} });
  setRateLimitForTests('chat', { ipLimit: 20, sessionLimit: 1, windowMs: 60 * 1000 });
  try {
    await withServer(async (server) => {
      const cookieA = cookieFrom(await rawRequest(server.port, { path: '/api/chat/profile' }));
      const cookieB = cookieFrom(await rawRequest(server.port, { path: '/api/chat/profile' }));
      const headers = chatHeaders(server);
      const first = await rawRequest(server.port, {
        method: 'POST',
        path: '/api/chat/message',
        headers: { ...headers, cookie: `${COOKIE_NAME}=${encodeURIComponent(cookieA)}`, 'accept-language': 'he' },
        body: JSON.stringify({ message: 'a' }),
      });
      const blocked = await rawRequest(server.port, {
        method: 'POST',
        path: '/api/chat/message',
        headers: { ...headers, cookie: `${COOKIE_NAME}=${encodeURIComponent(cookieA)}`, 'accept-language': 'he' },
        body: JSON.stringify({ message: 'a2' }),
      });
      const other = await rawRequest(server.port, {
        method: 'POST',
        path: '/api/chat/message',
        headers: { ...headers, cookie: `${COOKIE_NAME}=${encodeURIComponent(cookieB)}` },
        body: JSON.stringify({ message: 'b' }),
      });
      assert.equal(first.status, 200);
      assert.equal(blocked.status, 429);
      assert.equal(blocked.body.error.message, COPY.rateLimited.he);
      assert.equal(other.status, 200);
    });
  } finally {
    coreAgentService.processWebMessage = original;
  }
});

test('a configured hop count keeps two client addresses in separate chat buckets', async () => {
  const original = coreAgentService.processWebMessage;
  coreAgentService.processWebMessage = async () => ({ reply: 'ok', category: 'general', status: 'completed', onboarding: {} });
  env.trustProxyHops = 1;
  setRateLimitForTests('chat', { ipLimit: 1, sessionLimit: 20, windowMs: 60 * 1000 });
  try {
    await withServer(async (server) => {
      const headers = chatHeaders(server);
      const first = await rawRequest(server.port, {
        method: 'POST',
        path: '/api/chat/message',
        headers: { ...headers, 'x-forwarded-for': '203.0.113.10' },
        body: JSON.stringify({ message: 'a' }),
      });
      const again = await rawRequest(server.port, {
        method: 'POST',
        path: '/api/chat/message',
        headers: { ...headers, 'x-forwarded-for': '203.0.113.10' },
        body: JSON.stringify({ message: 'a2' }),
      });
      const other = await rawRequest(server.port, {
        method: 'POST',
        path: '/api/chat/message',
        headers: { ...headers, 'x-forwarded-for': '203.0.113.11' },
        body: JSON.stringify({ message: 'b' }),
      });
      assert.equal(first.status, 200);
      assert.equal(again.status, 429);
      assert.equal(other.status, 200);
      assert.equal(app.get('trust proxy'), false);
    });
  } finally {
    coreAgentService.processWebMessage = original;
    env.trustProxyHops = 0;
  }
});

test('public reads share a bucket across case, query, and catalog path', async () => {
  setRateLimitForTests('publicRead', { ipLimit: 1, sessionLimit: 1, windowMs: 60 * 1000 });
  await withServer(async (server) => {
    const missed = await rawRequest(server.port, { method: 'POST', path: '/api/jobs' });
    const first = await rawRequest(server.port, { path: '/api/services?category=clinic' });
    const blocked = await rawRequest(server.port, { method: 'Get', path: '/API/HOUSING/' });
    assert.equal(missed.status, 404);
    assert.equal(first.status, 200);
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error.message, COPY.rateLimited.en);
  });
});

test('jobs and money comparison share the public-read bucket', async () => {
  setRateLimitForTests('publicRead', { ipLimit: 2, sessionLimit: 2, windowMs: 60 * 1000 });
  await withServer(async (server) => {
    assert.equal((await rawRequest(server.port, { path: '/api/jobs' })).status, 200);
    assert.equal((await rawRequest(server.port, { path: '/api/money/compare?amount=100' })).status, 200);
    assert.equal((await rawRequest(server.port, { path: '/api/community' })).status, 429);
  });
});

test('fresh gw_sid minting is limited and a reused cookie is not a new mint', async () => {
  setRateLimitForTests('newSession', { ipLimit: 2, windowMs: 10 * 60 * 1000 });
  await withServer(async (server) => {
    const first = await rawRequest(server.port, { path: '/api/chat/profile' });
    const cookie = cookieFrom(first);
    const second = await rawRequest(server.port, {
      path: '/api/chat/profile',
      headers: { cookie: 'gw_sid=brand-new', 'x-forwarded-for': '203.0.113.50' },
    });
    const blocked = await rawRequest(server.port, {
      path: '/api/chat/profile',
      headers: { 'accept-language': 'th', 'x-forwarded-for': '198.51.100.50' },
    });
    const reused = await rawRequest(server.port, {
      path: '/api/chat/profile',
      headers: { cookie: `${COOKIE_NAME}=${encodeURIComponent(cookie)}` },
    });
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error.message, COPY.rateLimited.th);
    assert.equal(blocked.headers['set-cookie'], undefined);
    assert.equal(reused.status, 200);
  });
});

test('link-code generate shares one bucket across channel and case', async () => {
  setRateLimitForTests('linkGenerate', { ipLimit: 2, sessionLimit: 5, windowMs: 60 * 60 * 1000 });
  await withServer(async (server) => {
    const headers = chatHeaders(server);
    const first = await rawRequest(server.port, { method: 'POST', path: '/api/telegram/link-code', headers, body: '{}' });
    const second = await rawRequest(server.port, {
      method: 'POST',
      path: '/API/LINE/LINK-CODE',
      headers: { ...headers, cookie: 'gw_sid=v1.rotate.sig', 'x-forwarded-for': '203.0.113.77' },
      body: '{}',
    });
    const blocked = await rawRequest(server.port, {
      method: 'POST',
      path: '/api/telegram/link-code',
      headers: { ...headers, 'accept-language': 'ru', cookie: 'gw_sid=v1.again.sig' },
      body: '{}',
    });
    assert.equal(first.status === 429, false);
    assert.equal(second.status === 429, false);
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error.message, COPY.rateLimited.ru);
  });
});

test('a missing LINE signature is rejected before the handler', async () => {
  const original = lineMessageMapper.getTextMessages;
  const previous = { enabled: env.line.enabled, secret: env.line.channelSecret };
  let calls = 0;
  env.line.enabled = true;
  env.line.channelSecret = LINE_SECRET;
  lineMessageMapper.getTextMessages = () => {
    calls += 1;
    return [];
  };
  try {
    await withServer(async (server) => {
      const result = await rawRequest(server.port, {
        method: 'POST',
        path: '/api/line/webhook',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ events: [{ type: 'message' }] }),
      });
      assert.equal(result.status, 401);
      assert.equal(result.body.error.message, 'LINE webhook signature is invalid.');
      assert.equal(calls, 0);
    });
  } finally {
    lineMessageMapper.getTextMessages = original;
    env.line.enabled = previous.enabled;
    env.line.channelSecret = previous.secret;
  }
});

test('a bad LINE signature is rejected before the handler', async () => {
  const original = lineMessageMapper.getTextMessages;
  const previous = { enabled: env.line.enabled, secret: env.line.channelSecret };
  let calls = 0;
  env.line.enabled = true;
  env.line.channelSecret = LINE_SECRET;
  lineMessageMapper.getTextMessages = () => {
    calls += 1;
    return [];
  };
  try {
    await withServer(async (server) => {
      const raw = JSON.stringify({ events: [] });
      const result = await rawRequest(server.port, {
        method: 'POST',
        path: '/api/line/webhook',
        headers: { 'content-type': 'application/json', 'x-line-signature': 'not-a-signature' },
        body: raw,
      });
      assert.equal(result.status, 401);
      assert.equal(calls, 0);
    });
  } finally {
    lineMessageMapper.getTextMessages = original;
    env.line.enabled = previous.enabled;
    env.line.channelSecret = previous.secret;
  }
});

test('an unsigned LINE flood does not block a later signed event', async () => {
  const original = lineMessageMapper.getTextMessages;
  const previous = { enabled: env.line.enabled, secret: env.line.channelSecret };
  let calls = 0;
  env.line.enabled = true;
  env.line.channelSecret = LINE_SECRET;
  setRateLimitForTests('webhookUnsigned', { ipLimit: 1, windowMs: 60 * 1000 });
  setRateLimitForTests('webhookSigned', { ipLimit: 1, windowMs: 60 * 1000 });
  lineMessageMapper.getTextMessages = () => {
    calls += 1;
    return [];
  };
  try {
    await withServer(async (server) => {
      for (let index = 0; index < 5; index += 1) {
        const denied = await rawRequest(server.port, {
          method: 'POST',
          path: '/api/line/webhook',
          headers: { 'content-type': 'application/json', 'x-forwarded-for': `203.0.113.${index}` },
          body: '{}',
        });
        assert.equal(denied.status, 401);
      }
      const raw = JSON.stringify({ events: [] });
      const signed = await rawRequest(server.port, {
        method: 'POST',
        path: '/api/line/webhook',
        headers: { 'content-type': 'application/json', 'x-line-signature': lineSignature(raw) },
        body: raw,
      });
      assert.equal(signed.status, 200);
      assert.equal(calls, 1);
    });
  } finally {
    lineMessageMapper.getTextMessages = original;
    env.line.enabled = previous.enabled;
    env.line.channelSecret = previous.secret;
  }
});

test('a verified LINE event over the signed budget returns 429 and is not processed', async () => {
  const original = lineMessageMapper.getTextMessages;
  const previous = { enabled: env.line.enabled, secret: env.line.channelSecret };
  let calls = 0;
  env.line.enabled = true;
  env.line.channelSecret = LINE_SECRET;
  setRateLimitForTests('webhookSigned', { ipLimit: 1, windowMs: 60 * 1000 });
  lineMessageMapper.getTextMessages = () => {
    calls += 1;
    return [];
  };
  try {
    await withServer(async (server) => {
      const raw = JSON.stringify({ events: [] });
      const headers = { 'content-type': 'application/json', 'x-line-signature': lineSignature(raw) };
      const first = await rawRequest(server.port, { method: 'POST', path: '/api/line/webhook', headers, body: raw });
      const second = await rawRequest(server.port, { method: 'POST', path: '/API/LINE/WEBHOOK', headers, body: raw });
      assert.equal(first.status, 200);
      assert.equal(second.status, 429);
      assert.equal(second.body.error.code, 'RATE_LIMITED');
      assert.equal(Number(second.headers['retry-after']) >= 1, true);
      assert.equal(calls, 1);
    });
  } finally {
    lineMessageMapper.getTextMessages = original;
    env.line.enabled = previous.enabled;
    env.line.channelSecret = previous.secret;
  }
});

test('a missing WhatsApp signature is rejected before the handler', async () => {
  const original = whatsappMessageMapper.getTextMessages;
  const previous = { enabled: env.whatsapp.enabled, secret: env.whatsapp.appSecret };
  let calls = 0;
  env.whatsapp.enabled = true;
  env.whatsapp.appSecret = WHATSAPP_SECRET;
  whatsappMessageMapper.getTextMessages = () => {
    calls += 1;
    return [];
  };
  try {
    await withServer(async (server) => {
      const result = await rawRequest(server.port, {
        method: 'POST',
        path: '/api/whatsapp/webhook',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entry: [] }),
      });
      assert.equal(result.status, 401);
      assert.equal(result.body.error.message, 'WhatsApp webhook signature is invalid.');
      assert.equal(calls, 0);
    });
  } finally {
    whatsappMessageMapper.getTextMessages = original;
    env.whatsapp.enabled = previous.enabled;
    env.whatsapp.appSecret = previous.secret;
  }
});

test('an unsigned WhatsApp flood does not block a later signed event', async () => {
  const originals = {
    enabled: env.whatsapp.enabled,
    secret: env.whatsapp.appSecret,
    text: whatsappMessageMapper.getTextMessages,
    interactive: whatsappMessageMapper.getInteractiveMessages,
    unsupported: whatsappMessageMapper.getUnsupportedMessages,
    status: whatsappMessageMapper.getStatusEvents,
  };
  let calls = 0;
  env.whatsapp.enabled = true;
  env.whatsapp.appSecret = WHATSAPP_SECRET;
  setRateLimitForTests('webhookUnsigned', { ipLimit: 1, windowMs: 60 * 1000 });
  setRateLimitForTests('webhookSigned', { ipLimit: 1, windowMs: 60 * 1000 });
  whatsappMessageMapper.getTextMessages = () => {
    calls += 1;
    return [];
  };
  whatsappMessageMapper.getInteractiveMessages = () => [];
  whatsappMessageMapper.getUnsupportedMessages = () => [];
  whatsappMessageMapper.getStatusEvents = () => [];
  try {
    await withServer(async (server) => {
      for (let index = 0; index < 4; index += 1) {
        const denied = await rawRequest(server.port, {
          method: 'POST',
          path: '/api/whatsapp/webhook',
          headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=abcd' },
          body: '{}',
        });
        assert.equal(denied.status, 401);
      }
      const raw = JSON.stringify({ entry: [] });
      const signed = await rawRequest(server.port, {
        method: 'POST',
        path: '/api/whatsapp/webhook',
        headers: { 'content-type': 'application/json', 'x-hub-signature-256': whatsappSignature(raw) },
        body: raw,
      });
      assert.equal(signed.status, 200);
      assert.equal(calls, 1);
    });
  } finally {
    env.whatsapp.enabled = originals.enabled;
    env.whatsapp.appSecret = originals.secret;
    whatsappMessageMapper.getTextMessages = originals.text;
    whatsappMessageMapper.getInteractiveMessages = originals.interactive;
    whatsappMessageMapper.getUnsupportedMessages = originals.unsupported;
    whatsappMessageMapper.getStatusEvents = originals.status;
  }
});

test('a verified WhatsApp event over the signed budget returns 429 and is not processed', async () => {
  const originals = {
    enabled: env.whatsapp.enabled,
    secret: env.whatsapp.appSecret,
    text: whatsappMessageMapper.getTextMessages,
    interactive: whatsappMessageMapper.getInteractiveMessages,
    unsupported: whatsappMessageMapper.getUnsupportedMessages,
    status: whatsappMessageMapper.getStatusEvents,
  };
  let calls = 0;
  env.whatsapp.enabled = true;
  env.whatsapp.appSecret = WHATSAPP_SECRET;
  setRateLimitForTests('webhookSigned', { ipLimit: 1, windowMs: 60 * 1000 });
  whatsappMessageMapper.getTextMessages = () => {
    calls += 1;
    return [];
  };
  whatsappMessageMapper.getInteractiveMessages = () => [];
  whatsappMessageMapper.getUnsupportedMessages = () => [];
  whatsappMessageMapper.getStatusEvents = () => [];
  try {
    await withServer(async (server) => {
      const raw = JSON.stringify({ entry: [] });
      const headers = { 'content-type': 'application/json', 'x-hub-signature-256': whatsappSignature(raw) };
      const first = await rawRequest(server.port, { method: 'POST', path: '/api/whatsapp/webhook', headers, body: raw });
      const second = await rawRequest(server.port, { method: 'POST', path: '/api/whatsapp/webhook', headers, body: raw });
      assert.equal(first.status, 200);
      assert.equal(second.status, 429);
      assert.equal(second.body.error.code, 'RATE_LIMITED');
      assert.equal(calls, 1);
    });
  } finally {
    env.whatsapp.enabled = originals.enabled;
    env.whatsapp.appSecret = originals.secret;
    whatsappMessageMapper.getTextMessages = originals.text;
    whatsappMessageMapper.getInteractiveMessages = originals.interactive;
    whatsappMessageMapper.getUnsupportedMessages = originals.unsupported;
    whatsappMessageMapper.getStatusEvents = originals.status;
  }
});

test('a failed WhatsApp handshake does not spend the signed event budget', async () => {
  const originals = {
    enabled: env.whatsapp.enabled,
    secret: env.whatsapp.appSecret,
    token: env.whatsapp.verifyToken,
    text: whatsappMessageMapper.getTextMessages,
    interactive: whatsappMessageMapper.getInteractiveMessages,
    unsupported: whatsappMessageMapper.getUnsupportedMessages,
    status: whatsappMessageMapper.getStatusEvents,
  };
  let calls = 0;
  env.whatsapp.enabled = true;
  env.whatsapp.appSecret = WHATSAPP_SECRET;
  env.whatsapp.verifyToken = 'test-only-whatsapp-verify-token';
  setRateLimitForTests('webhookSigned', { ipLimit: 1, windowMs: 60 * 1000 });
  whatsappMessageMapper.getTextMessages = () => {
    calls += 1;
    return [];
  };
  whatsappMessageMapper.getInteractiveMessages = () => [];
  whatsappMessageMapper.getUnsupportedMessages = () => [];
  whatsappMessageMapper.getStatusEvents = () => [];
  try {
    await withServer(async (server) => {
      for (let index = 0; index < 3; index += 1) {
        const handshake = await rawRequest(server.port, {
          path: '/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=challenge-token',
        });
        assert.equal(handshake.status, 403);
        assert.equal(handshake.text.includes('challenge-token'), false);
      }
      const raw = JSON.stringify({ entry: [] });
      const signed = await rawRequest(server.port, {
        method: 'POST',
        path: '/api/whatsapp/webhook',
        headers: { 'content-type': 'application/json', 'x-hub-signature-256': whatsappSignature(raw) },
        body: raw,
      });
      assert.equal(signed.status, 200);
      assert.equal(calls, 1);
    });
  } finally {
    env.whatsapp.enabled = originals.enabled;
    env.whatsapp.appSecret = originals.secret;
    env.whatsapp.verifyToken = originals.token;
    whatsappMessageMapper.getTextMessages = originals.text;
    whatsappMessageMapper.getInteractiveMessages = originals.interactive;
    whatsappMessageMapper.getUnsupportedMessages = originals.unsupported;
    whatsappMessageMapper.getStatusEvents = originals.status;
  }
});

test('a spoofed X-Forwarded-For is ignored when TRUST_PROXY_HOPS is unset', async () => {
  setRateLimitForTests('publicRead', { ipLimit: 1, sessionLimit: 5, windowMs: 60 * 1000 });
  await withServer(async (server) => {
    const first = await rawRequest(server.port, {
      path: '/api/jobs',
      headers: { 'x-forwarded-for': '203.0.113.10' },
    });
    const second = await rawRequest(server.port, {
      path: '/api/jobs',
      headers: { 'x-forwarded-for': '198.51.100.20' },
    });
    assert.equal(first.status, 200);
    assert.equal(second.status, 429);
  });
});

test('TRUST_PROXY_HOPS=1 uses the address added by the nearest proxy', async () => {
  env.trustProxyHops = 1;
  setRateLimitForTests('publicRead', { ipLimit: 1, sessionLimit: 5, windowMs: 60 * 1000 });
  try {
    await withServer(async (server) => {
      const first = await rawRequest(server.port, {
        path: '/api/jobs',
        headers: { 'x-forwarded-for': '9.9.9.9, 203.0.113.8' },
      });
      const sameClient = await rawRequest(server.port, {
        path: '/api/jobs',
        headers: { 'x-forwarded-for': '203.0.113.8' },
      });
      const otherClient = await rawRequest(server.port, {
        path: '/api/jobs',
        headers: { 'x-forwarded-for': '203.0.113.9' },
      });
      assert.equal(first.status, 200);
      assert.equal(sameClient.status, 429);
      assert.equal(otherClient.status, 200);
    });
  } finally {
    env.trustProxyHops = 0;
  }
});

test('a malformed X-Forwarded-For falls back to the socket peer', async () => {
  env.trustProxyHops = 1;
  setRateLimitForTests('publicRead', { ipLimit: 1, sessionLimit: 5, windowMs: 60 * 1000 });
  try {
    await withServer(async (server) => {
      const malformed = await rawRequest(server.port, {
        path: '/api/jobs',
        headers: { 'x-forwarded-for': 'not-an-ip' },
      });
      const direct = await rawRequest(server.port, { path: '/api/jobs' });
      const real = await rawRequest(server.port, {
        path: '/api/jobs',
        headers: { 'x-forwarded-for': '203.0.113.40' },
      });
      assert.equal(malformed.status, 200);
      assert.equal(direct.status, 429);
      assert.equal(real.status, 200);
    });
  } finally {
    env.trustProxyHops = 0;
  }
});

test('a hop count longer than the forwarding chain falls back to the socket peer', async () => {
  env.trustProxyHops = 2;
  setRateLimitForTests('publicRead', { ipLimit: 1, sessionLimit: 5, windowMs: 60 * 1000 });
  try {
    await withServer(async (server) => {
      const shortChain = await rawRequest(server.port, {
        path: '/api/jobs',
        headers: { 'x-forwarded-for': '203.0.113.30' },
      });
      const noHeader = await rawRequest(server.port, { path: '/api/jobs' });
      assert.equal(shortChain.status, 200);
      assert.equal(noHeader.status, 429);
    });
  } finally {
    env.trustProxyHops = 0;
  }
});

test('TRUST_PROXY_HOPS rejects values that are not an integer from 0 to 5', () => {
  assert.equal(parseTrustProxyHops(''), 0);
  assert.equal(parseTrustProxyHops('0'), 0);
  assert.equal(parseTrustProxyHops('1'), 1);
  assert.equal(parseTrustProxyHops('5'), 5);
  for (const value of ['true', '-1', '1.5', '6', ' 2 ']) {
    if (value === ' 2 ') {
      assert.equal(parseTrustProxyHops(value), 2);
      continue;
    }
    assert.throws(() => parseTrustProxyHops(value), /TRUST_PROXY_HOPS/);
  }
});

test('production startup warns when TRUST_PROXY_HOPS is unset and refuses a bad value', () => {
  const adminKey = 'pilot-admin-key-0123456789abcdef';
  const sessionSecret = 'prod-session-value-0123456789abcdef';
  const baseEnv = {
    ...process.env,
    NODE_ENV: 'production',
    ADMIN_API_KEY: adminKey,
    WEB_SESSION_SECRET: sessionSecret,
    ALLOW_DEV_ADMIN_KEY: 'false',
  };
  delete baseEnv.TRUST_PROXY_HOPS;
  const warned = spawnSync(process.execPath, ['-e', "require('./src/config/env')"], {
    cwd: root,
    env: baseEnv,
    encoding: 'utf8',
  });
  assert.equal(warned.status, 0, warned.stderr);
  assert.match(`${warned.stdout}\n${warned.stderr}`, /TRUST_PROXY_HOPS is unset/);

  const refused = spawnSync(process.execPath, ['-e', "require('./src/config/env')"], {
    cwd: root,
    env: { ...baseEnv, TRUST_PROXY_HOPS: 'true' },
    encoding: 'utf8',
  });
  assert.notEqual(refused.status, 0);
  assert.match(`${refused.stdout}\n${refused.stderr}`, /TRUST_PROXY_HOPS/);
});

test('many unique addresses cannot grow the rate-limit map without bound', () => {
  setBucketCapForTests(32);
  setRateLimitForTests('publicRead', { ipLimit: 3, sessionLimit: 3, windowMs: 60 * 1000 });
  const now = Date.now();
  for (let index = 0; index < 200; index += 1) {
    consume('publicRead', `203.0.113.${index}`, `session-${index}`, now);
    assert.equal(bucketCountForTests() <= 32, true);
  }
  assert.equal(bucketCountForTests() <= 32, true);
});

test('expired rate-limit buckets are swept', () => {
  setSweepIntervalForTests(1);
  setRateLimitForTests('publicRead', { ipLimit: 5, sessionLimit: 0, windowMs: 1000 });
  consume('publicRead', '203.0.113.1', '', 0);
  consume('publicRead', '203.0.113.2', '', 0);
  assert.equal(bucketCountForTests(), 2);
  consume('publicRead', '203.0.113.3', '', 5000);
  assert.equal(bucketCountForTests(), 1);
});
