const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('node:child_process');

const app = require('../src/app');
const { env } = require('../src/config/env');
const crmAgentRepository = require('../src/modules/crm-agent/crm-agent.repository');
const {
  COOKIE_NAME,
  MAX_AGE_SECONDS,
  createWebId,
  openWebSession,
  sealWebSession,
  serializeSessionCookie,
} = require('../src/shared/webIdentity');

const root = path.join(__dirname, '..');
const ADMIN_API_KEY = 'test-only-admin-key-0123456789abcdef';
const SESSION_SECRET = 'test-only-web-session-secret-0123456789abcdef';
const PREVIOUS_SECRET = 'previous-test-web-session-secret-abcdef';
const CURRENT_SECRET = 'current-test-web-session-secret-012345';

function runNode(args, envOverrides = {}, unsetKeys = []) {
  const childEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    ADMIN_API_KEY,
    WEB_SESSION_SECRET: SESSION_SECRET,
    ...envOverrides,
  };
  for (const key of unsetKeys) delete childEnv[key];
  return spawnSync(process.execPath, args, {
    cwd: root,
    env: childEnv,
    encoding: 'utf8',
    timeout: 20000,
  });
}

function combinedOutput(result) {
  return `${result.stdout || ''}\n${result.stderr || ''}`;
}

function listen() {
  const server = app.listen(0);
  const { port } = server.address();
  return {
    server,
    base: `http://127.0.0.1:${port}`,
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

function sessionCookie(response) {
  const cookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
  const header = cookies.find((value) => value.startsWith(`${COOKIE_NAME}=`));
  assert.ok(header, 'response should set the session cookie');
  return header;
}

function cookieValue(header) {
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

test('session cookie uses 256 random bits, HMAC, HttpOnly, SameSite=Lax, and a 180 day lifetime', () => {
  const webId = createWebId();
  assert.equal(Buffer.from(webId, 'base64url').length, 32);
  const token = sealWebSession(webId, CURRENT_SECRET);
  const opened = openWebSession(token, [CURRENT_SECRET]);
  assert.equal(opened.webId, webId);
  assert.equal(opened.rotated, false);

  const production = serializeSessionCookie(token, 'production');
  assert.match(production, /HttpOnly/);
  assert.match(production, /Secure/);
  assert.match(production, /SameSite=Lax/);
  assert.match(production, new RegExp(`Max-Age=${MAX_AGE_SECONDS}`));
  assert.match(production, /Path=\//);

  const development = serializeSessionCookie(token, 'test');
  assert.equal(development.includes('Secure'), false);
  assert.match(development, /HttpOnly/);
  assert.match(development, /SameSite=Lax/);
});

test('a previous session secret verifies a cookie and the current secret replaces it', () => {
  const webId = createWebId();
  const token = sealWebSession(webId, PREVIOUS_SECRET);
  const opened = openWebSession(token, [CURRENT_SECRET, PREVIOUS_SECRET]);
  assert.equal(opened.webId, webId);
  assert.equal(opened.rotated, true);
  const resealed = sealWebSession(webId, CURRENT_SECRET);
  assert.equal(openWebSession(resealed, [CURRENT_SECRET]).rotated, false);
  assert.equal(openWebSession(token, [CURRENT_SECRET]), null);
});

test('a one-character signature change does not open the original session', () => {
  const webId = createWebId();
  const token = sealWebSession(webId, CURRENT_SECRET);
  const flipped = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;
  assert.equal(openWebSession(flipped, [CURRENT_SECRET, PREVIOUS_SECRET]), null);
  assert.equal(openWebSession('v1.not-a-valid-id.sig', [CURRENT_SECRET]), null);
});

test('missing cookie is HttpOnly and SameSite=Lax, and a tampered cookie does not reveal the original profile', async () => {
  const server = listen();
  try {
    const first = await fetch(`${server.base}/api/chat/profile`);
    const firstHeader = sessionCookie(first);
    assert.match(firstHeader, /HttpOnly/);
    assert.match(firstHeader, /SameSite=Lax/);
    assert.equal(firstHeader.includes('Secure'), false);
    const firstBody = await readBody(first);
    const cookie = cookieValue(firstHeader);
    const opened = openWebSession(cookie, [env.webSessionSecret, env.webSessionSecretPrevious].filter(Boolean));
    assert.ok(opened);

    const saved = await fetch(`${server.base}/api/chat/profile`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        cookie: `${COOKIE_NAME}=${encodeURIComponent(cookie)}`,
        origin: server.base,
      },
      body: JSON.stringify({ fullName: 'Session Owner' }),
    });
    assert.equal(saved.status, 200);
    await readBody(saved);

    const flipped = `${cookie.slice(0, -1)}${cookie.endsWith('a') ? 'b' : 'a'}`;
    const tampered = await fetch(`${server.base}/api/chat/profile`, {
      headers: { cookie: `${COOKIE_NAME}=${encodeURIComponent(flipped)}` },
    });
    const tamperedHeader = sessionCookie(tampered);
    const tamperedBody = await readBody(tampered);
    assert.equal(tampered.status, 200);
    assert.equal(JSON.stringify(tamperedBody).includes('Session Owner'), false);
    assert.notEqual(cookieValue(tamperedHeader), cookie);
    assert.equal(firstBody.profile.fullName || '', '');
  } finally {
    await server.close();
  }
});

test('cross-site state changes are rejected and do not change the profile', async () => {
  const server = listen();
  try {
    const start = await fetch(`${server.base}/api/chat/profile`);
    const cookie = cookieValue(sessionCookie(start));
    await readBody(start);
    const named = await fetch(`${server.base}/api/chat/profile`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        cookie: `${COOKIE_NAME}=${encodeURIComponent(cookie)}`,
        origin: server.base,
      },
      body: JSON.stringify({ fullName: 'Same Origin' }),
    });
    assert.equal(named.status, 200);
    await readBody(named);

    const crossed = await fetch(`${server.base}/api/chat/profile`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        cookie: `${COOKIE_NAME}=${encodeURIComponent(cookie)}`,
        origin: 'https://evil.example',
      },
      body: JSON.stringify({ fullName: 'Cross Site' }),
    });
    const crossedBody = await readBody(crossed);
    assert.equal(crossed.status, 403);
    assert.equal(crossedBody.error.code, 'CROSS_SITE_REQUEST_REJECTED');

    const fetched = await fetch(`${server.base}/api/chat/profile`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        cookie: `${COOKIE_NAME}=${encodeURIComponent(cookie)}`,
        'sec-fetch-site': 'cross-site',
      },
      body: JSON.stringify({ fullName: 'Fetched Cross Site' }),
    });
    assert.equal(fetched.status, 403);
    await readBody(fetched);

    const form = await fetch(`${server.base}/api/chat/profile`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: `${COOKIE_NAME}=${encodeURIComponent(cookie)}`,
      },
      body: 'fullName=Form',
    });
    const formBody = await readBody(form);
    assert.equal(form.status, 403);
    assert.equal(formBody.error.code, 'CROSS_SITE_REQUEST_REJECTED');

    const sameOriginForm = await fetch(`${server.base}/api/chat/profile`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: `${COOKIE_NAME}=${encodeURIComponent(cookie)}`,
        origin: server.base,
      },
      body: 'fullName=Form',
    });
    assert.equal(sameOriginForm.status, 415);
    await readBody(sameOriginForm);

    const current = await fetch(`${server.base}/api/chat/profile`, {
      headers: { cookie: `${COOKIE_NAME}=${encodeURIComponent(cookie)}` },
    });
    const currentBody = await readBody(current);
    assert.equal(currentBody.profile.fullName, 'Same Origin');
  } finally {
    await server.close();
  }
});

test('legacy web profiles stay stored and cannot be claimed from the browser', async () => {
  const legacyName = 'Legacy Stored Person';
  await crmAgentRepository.createUserProfile({
    userId: `usr_legacy_${crypto.randomBytes(4).toString('hex')}`,
    channel: 'web',
    channelUserId: 'web_1700000000000',
    fullName: legacyName,
  });

  const server = listen();
  try {
    const response = await fetch(`${server.base}/api/chat/profile?channel=web&channelUserId=web_1700000000000`);
    const body = await readBody(response);
    assert.equal(response.status, 200);
    assert.equal(JSON.stringify(body).includes(legacyName), false);

    const claim = await fetch(`${server.base}/api/chat/claim-legacy`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channelUserId: 'web_1700000000000' }),
    });
    assert.equal(claim.status, 404);
    await readBody(claim);
  } finally {
    await server.close();
  }

  const legacy = await crmAgentRepository.findUserProfileRecordByChannel('web', 'web_1700000000000');
  assert.equal(legacy.profile.fullName, legacyName);
});

test('chat.js does not send a stored user id', () => {
  const source = fs.readFileSync(path.join(root, 'src/public/chat.js'), 'utf8');
  assert.equal(source.includes('channelUserId'), false);
  assert.equal(source.includes('gringoWebUserId'), false);
  assert.equal(source.includes('local-web-user'), false);
  assert.equal(source.includes("credentials: 'same-origin'"), true);
});

test('production refuses to start without a suitable WEB_SESSION_SECRET and does not print it', () => {
  const missing = runNode(
    ['-e', "require('./src/config/env'); process.stdout.write('config-loaded');"],
    { NODE_ENV: 'production' },
    ['WEB_SESSION_SECRET']
  );
  const missingOutput = combinedOutput(missing);
  assert.equal(missing.status, 1, missingOutput);
  assert.match(missingOutput, /Refusing to start: WEB_SESSION_SECRET is missing/);
  assert.equal(missingOutput.includes('config-loaded'), false);
  assert.equal(missingOutput.includes(ADMIN_API_KEY), false);
  assert.equal(missingOutput.includes(SESSION_SECRET), false);

  const shortSecret = 'short-session-secret';
  const short = runNode(
    ['-e', "require('./src/config/env'); process.stdout.write('config-loaded');"],
    { NODE_ENV: 'production', WEB_SESSION_SECRET: shortSecret }
  );
  const shortOutput = combinedOutput(short);
  assert.equal(short.status, 1, shortOutput);
  assert.match(shortOutput, /WEB_SESSION_SECRET is too short/);
  assert.equal(shortOutput.includes(shortSecret), false);

  const placeholder = 'change-me'.repeat(4);
  const weak = runNode(
    ['-e', "require('./src/config/env'); process.stdout.write('config-loaded');"],
    { NODE_ENV: 'production', WEB_SESSION_SECRET: placeholder }
  );
  const weakOutput = combinedOutput(weak);
  assert.equal(weak.status, 1, weakOutput);
  assert.match(weakOutput, /obvious placeholder|too little character variety/);
  assert.equal(weakOutput.includes(placeholder), false);
  assert.equal(weakOutput.includes('change-me'), false);

  const ready = runNode(
    ['-e', "require('./src/config/env'); process.stdout.write('config-loaded');"],
    { NODE_ENV: 'production', WEB_SESSION_SECRET: SESSION_SECRET }
  );
  const readyOutput = combinedOutput(ready);
  assert.equal(ready.status, 0, readyOutput);
  assert.match(readyOutput, /config-loaded/);
  assert.equal(readyOutput.includes(SESSION_SECRET), false);
});

test('local development without WEB_SESSION_SECRET warns and does not print the generated secret', () => {
  const result = runNode(
    ['-e', "require('./src/config/env'); process.stdout.write('config-loaded');"],
    { NODE_ENV: 'development', ALLOW_DEV_ADMIN_KEY: 'true' },
    ['WEB_SESSION_SECRET', 'ADMIN_API_KEY']
  );
  const output = combinedOutput(result);
  assert.equal(result.status, 0, output);
  assert.match(output, /WEB_SESSION_SECRET is unset/);
  assert.match(output, /config-loaded/);
  assert.equal(/[0-9a-f]{64}/i.test(output), false);
  assert.equal(output.includes(SESSION_SECRET), false);
});

test('webhook mode refuses to start without TELEGRAM_WEBHOOK_SECRET', () => {
  const result = runNode(
    ['-e', "require('./src/config/env'); process.stdout.write('config-loaded');"],
    { NODE_ENV: 'production', TELEGRAM_BOT_MODE: 'webhook' },
    ['TELEGRAM_WEBHOOK_SECRET']
  );
  const output = combinedOutput(result);
  assert.equal(result.status, 1, output);
  assert.match(output, /TELEGRAM_WEBHOOK_SECRET/);
  assert.equal(output.includes(SESSION_SECRET), false);
  assert.equal(output.includes(ADMIN_API_KEY), false);
});
