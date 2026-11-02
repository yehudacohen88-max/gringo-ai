const { describe, test, before, after, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { spawnSync } = require('node:child_process');
const path = require('path');

const app = require('../src/app');
const { env } = require('../src/config/env');
const { coreAgentService } = require('../src/modules/core-agent');
const { communicationService } = require('../src/modules/communication');
const managerRepository = require('../src/modules/manager-agent/manager-agent.repository');
const whatsappClient = require('../src/modules/whatsapp/whatsapp-client.service');
const whatsappDeliveryService = require('../src/modules/whatsapp/whatsapp-delivery.service');
const whatsappMessageMapper = require('../src/modules/whatsapp/whatsapp-message.mapper');
const whatsappMessageService = require('../src/modules/whatsapp/whatsapp-message.service');
const { processedMessageIds } = require('../src/modules/whatsapp/whatsapp-webhook.service');

const root = path.join(__dirname, '..');
const APP_SECRET = 'test-only-whatsapp-app-secret';
const VERIFY_TOKEN = 'test-only-whatsapp-verify-token';
const ACCESS_TOKEN = 'test-only-whatsapp-access-token';
const PHONE_NUMBER_ID = 'test-only-phone-number-id';
const ADMIN_API_KEY = 'test-only-admin-key-0123456789abcdef';
const TEST_WEB_SESSION_SECRET = 'test-only-web-session-secret-0123456789abcdef';
const LOAD_CONFIG = "require('./src/config/env');process.stdout.write('config-loaded');";

let server;
let baseUrl;
let sequence = 0;
const whatsappSnapshot = {
  enabled: env.whatsapp.enabled,
  appSecret: env.whatsapp.appSecret,
  verifyToken: env.whatsapp.verifyToken,
  accessToken: env.whatsapp.accessToken,
  phoneNumberId: env.whatsapp.phoneNumberId,
};

function redact(text, secrets) {
  let safe = String(text);
  for (const secret of secrets) {
    if (secret) safe = safe.split(secret).join('[redacted]');
  }
  return safe;
}

function assertNoSecretMaterial(text, secrets) {
  const raw = String(text);
  for (const secret of secrets) {
    if (secret && raw.includes(secret)) {
      throw new Error('Output contained a secret value.');
    }
  }
}

function runConfig(envOverrides = {}, unsetKeys = []) {
  const childEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: 'test',
    ALLOW_DEV_ADMIN_KEY: 'true',
    ADMIN_API_KEY,
    WEB_SESSION_SECRET: TEST_WEB_SESSION_SECRET,
    WHATSAPP_ENABLED: 'false',
    WHATSAPP_APP_SECRET: '',
    WHATSAPP_VERIFY_TOKEN: '',
    ...envOverrides,
  };
  for (const key of unsetKeys) delete childEnv[key];
  return spawnSync(process.execPath, ['-e', LOAD_CONFIG], {
    cwd: root,
    env: childEnv,
    encoding: 'utf8',
    timeout: 20000,
  });
}

function nextId(prefix) {
  sequence += 1;
  return `${prefix}-${sequence}`;
}

function messagePayload(messageId) {
  const now = Math.floor(Date.now() / 1000);
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            value: {
              contacts: [{ profile: { name: 'Ada' }, wa_id: '15551230000' }],
              messages: [
                {
                  from: '15551230000',
                  id: messageId,
                  timestamp: String(now),
                  text: { body: 'hello from whatsapp' },
                  type: 'text',
                },
              ],
              statuses: [
                {
                  id: `status-${messageId}`,
                  status: 'delivered',
                  timestamp: String(now),
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function rawBody(messageId, spaced = false) {
  const payload = messagePayload(messageId);
  if (!spaced) return JSON.stringify(payload);
  return `{ "object" : ${JSON.stringify(payload.object)} , "entry" : ${JSON.stringify(payload.entry)} }`;
}

function signBody(raw, secret = APP_SECRET) {
  return `sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`;
}

function installSpies() {
  return {
    getTextMessages: mock.method(whatsappMessageMapper, 'getTextMessages'),
    getInteractiveMessages: mock.method(whatsappMessageMapper, 'getInteractiveMessages'),
    getUnsupportedMessages: mock.method(whatsappMessageMapper, 'getUnsupportedMessages'),
    getStatusEvents: mock.method(whatsappMessageMapper, 'getStatusEvents'),
    readConversationHistory: mock.method(managerRepository, 'readConversationHistory', async () => []),
    receiveMessage: mock.method(communicationService, 'receiveMessage'),
    processTextMessage: mock.method(whatsappMessageService, 'processTextMessage'),
    processAction: mock.method(whatsappMessageService, 'processAction'),
    processUnsupportedMessage: mock.method(whatsappMessageService, 'processUnsupportedMessage'),
    sendMessage: mock.method(communicationService, 'sendMessage'),
    sendInteractiveMessage: mock.method(communicationService, 'sendInteractiveMessage'),
    sendTextMessage: mock.method(whatsappClient, 'sendTextMessage', async () => ({ ok: true })),
    updateDeliveryStatus: mock.method(
      whatsappDeliveryService,
      'updateDeliveryStatusFromWebhook',
      async () => ({ id: 'delivery-test' })
    ),
    processWebMessage: mock.method(coreAgentService, 'processWebMessage', async () => ({
      reply: 'stub-reply',
      category: 'Other',
      status: 'FOUND',
    })),
  };
}

function assertZeroDownstream(spies) {
  for (const [name, spy] of Object.entries(spies)) {
    assert.equal(spy.mock.calls.length, 0, `${name} was called`);
  }
}

async function postWebhook(raw, { signature, includeSignature = true } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (includeSignature) {
    headers['x-hub-signature-256'] = signature === undefined ? signBody(raw) : signature;
  }
  const response = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
    method: 'POST',
    headers,
    body: raw,
  });
  const text = await response.text();
  return {
    status: response.status,
    text,
    contentType: response.headers.get('content-type') || '',
  };
}

describe('WhatsApp webhook source verification', { concurrency: false }, () => {
  before(async () => {
    server = app.listen(0, '127.0.0.1');
    if (!server.listening) {
      await new Promise((resolve) => server.once('listening', resolve));
    }
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (!server) return;
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  beforeEach(() => {
    processedMessageIds.length = 0;
    env.whatsapp.enabled = true;
    env.whatsapp.appSecret = APP_SECRET;
    env.whatsapp.verifyToken = VERIFY_TOKEN;
    env.whatsapp.accessToken = ACCESS_TOKEN;
    env.whatsapp.phoneNumberId = PHONE_NUMBER_ID;
  });

  afterEach(() => {
    env.whatsapp.enabled = whatsappSnapshot.enabled;
    env.whatsapp.appSecret = whatsappSnapshot.appSecret;
    env.whatsapp.verifyToken = whatsappSnapshot.verifyToken;
    env.whatsapp.accessToken = whatsappSnapshot.accessToken;
    env.whatsapp.phoneNumberId = whatsappSnapshot.phoneNumberId;
    mock.restoreAll();
  });

  test('valid signature over the raw body processes a message', async () => {
    const raw = rawBody(nextId('wamid'), true);
    const reparsed = JSON.stringify(JSON.parse(raw));
    assert.notEqual(raw, reparsed);
    const spies = installSpies();

    const result = await postWebhook(raw);
    const body = JSON.parse(result.text);

    assert.equal(result.status, 200, redact(result.text, [APP_SECRET, VERIFY_TOKEN]));
    assert.equal(body.ok, true);
    assert.equal(body.results.some((item) => item.processed === true), true);
    assert.equal(body.results.some((item) => item.statusEvent === true), true);
    assert.ok(spies.getTextMessages.mock.calls.length > 0);
    assert.ok(spies.readConversationHistory.mock.calls.length > 0);
    assert.ok(spies.receiveMessage.mock.calls.length > 0);
    assert.ok(spies.processTextMessage.mock.calls.length > 0);
    assert.ok(spies.processWebMessage.mock.calls.length > 0);
    assert.ok(spies.sendMessage.mock.calls.length > 0);
    assert.ok(spies.sendTextMessage.mock.calls.length > 0);
    assert.ok(spies.updateDeliveryStatus.mock.calls.length > 0);
    assertNoSecretMaterial(result.text, [APP_SECRET, VERIFY_TOKEN]);
  });

  test('missing X-Hub-Signature-256 is rejected before processing', async () => {
    const spies = installSpies();
    const result = await postWebhook(rawBody(nextId('wamid')), { includeSignature: false });

    assert.equal(result.status, 401);
    assert.match(result.text, /signature is invalid/);
    assertZeroDownstream(spies);
    assertNoSecretMaterial(result.text, [APP_SECRET, VERIFY_TOKEN]);
  });

  test('wrong signature is rejected before processing', async () => {
    const raw = rawBody(nextId('wamid'));
    const signature = signBody(raw);
    const hex = signature.slice('sha256='.length);
    const flipped = hex.endsWith('0') ? `${hex.slice(0, -1)}1` : `${hex.slice(0, -1)}0`;
    const spies = installSpies();
    const result = await postWebhook(raw, { signature: `sha256=${flipped}` });

    assert.equal(result.status, 401);
    assertZeroDownstream(spies);
    assertNoSecretMaterial(result.text, [APP_SECRET, VERIFY_TOKEN, signature]);
  });

  test('wrong signature prefix is rejected before processing', async () => {
    const raw = rawBody(nextId('wamid'));
    const hex = signBody(raw).slice('sha256='.length);
    const spies = installSpies();

    for (const signature of [`sha1=${hex}`, `SHA256=${hex}`, `sha256:${hex}`]) {
      const result = await postWebhook(rawBody(nextId('wamid')), { signature });
      assert.equal(result.status, 401, signature.slice(0, 6));
      assertNoSecretMaterial(result.text, [APP_SECRET, VERIFY_TOKEN]);
    }
    assertZeroDownstream(spies);
  });

  test('malformed signature hex is rejected before processing', async () => {
    const raw = rawBody(nextId('wamid'));
    const validHex = signBody(raw).slice('sha256='.length);
    const spies = installSpies();
    // A trailing space is not included: Node strips optional whitespace from
    // header values before Express sees them, so it is the same valid signature.
    const malformed = [
      'sha256=',
      'sha256=zzzz',
      `sha256=${validHex.slice(0, 62)}`,
      `sha256=${validHex}extra`,
      `sha256=${'ab'.repeat(16)}`,
      `sha256=${validHex.slice(0, 63)}${validHex.endsWith('a') ? 'b' : 'a'}`,
    ];

    for (const signature of malformed) {
      const result = await postWebhook(raw, { signature });
      assert.equal(result.status, 401);
      assert.equal(result.status === 500, false);
      assertNoSecretMaterial(result.text, [APP_SECRET, VERIFY_TOKEN]);
    }
    assertZeroDownstream(spies);
  });

  test('body modified after signing is rejected before processing', async () => {
    const raw = rawBody(nextId('wamid'));
    const signature = signBody(raw);
    const tampered = raw.replace('hello from whatsapp', 'tampered message text');
    assert.notEqual(raw, tampered);
    const spies = installSpies();
    const result = await postWebhook(tampered, { signature });

    assert.equal(result.status, 401);
    assertZeroDownstream(spies);
  });

  test('signature over re-serialized JSON is rejected when the raw body differs', async () => {
    const raw = rawBody(nextId('wamid'), true);
    const reparsed = JSON.stringify(JSON.parse(raw));
    assert.notEqual(raw, reparsed);
    const spies = installSpies();
    const result = await postWebhook(raw, { signature: signBody(reparsed) });

    assert.equal(result.status, 401);
    assertZeroDownstream(spies);
  });

  test('missing app secret fails closed before processing and does not log the secret', async () => {
    const warnings = [];
    mock.method(console, 'warn', (...args) => {
      warnings.push(args.map((part) => String(part)).join(' '));
    });
    const spies = installSpies();
    const raw = rawBody(nextId('wamid'));
    const signature = signBody(raw);

    env.whatsapp.appSecret = '';
    const missing = await postWebhook(raw, { signature });
    env.whatsapp.appSecret = '   ';
    const blank = await postWebhook(raw, { signature, includeSignature: false });

    assert.equal(missing.status, 503);
    assert.equal(blank.status, 503);
    assert.match(missing.text, /not configured/);
    assert.match(warnings.join('\n'), /app secret is not configured/);
    assertZeroDownstream(spies);
    assertNoSecretMaterial(`${missing.text}\n${blank.text}\n${warnings.join('\n')}`, [
      APP_SECRET,
      VERIFY_TOKEN,
      signature,
    ]);
  });

  test('valid signature on a disabled connector does not process messages', async () => {
    env.whatsapp.enabled = false;
    const spies = installSpies();
    const result = await postWebhook(rawBody(nextId('wamid')));
    const body = JSON.parse(result.text);

    assert.equal(result.status, 200);
    assert.equal(body.disabled, true);
    assertZeroDownstream(spies);
  });

  test('invalid signature is rejected when the connector is disabled', async () => {
    env.whatsapp.enabled = false;
    const spies = installSpies();
    const result = await postWebhook(rawBody(nextId('wamid')), { includeSignature: false });

    assert.equal(result.status, 401);
    assertZeroDownstream(spies);
  });

  test('verify handshake echoes the challenge as plain text', async () => {
    const challenge = 'challenge-plain-42';
    const spies = installSpies();
    const response = await fetch(
      `${baseUrl}/api/whatsapp/webhook?${new URLSearchParams({
        'hub.mode': 'subscribe',
        'hub.verify_token': VERIFY_TOKEN,
        'hub.challenge': challenge,
        'hub.leak': 'do-not-reflect-this',
      }).toString()}`
    );
    const text = await response.text();

    assert.equal(response.status, 200);
    assert.equal(text, challenge);
    assert.match(response.headers.get('content-type') || '', /^text\/plain/);
    assert.equal(text.includes('do-not-reflect-this'), false);
    assert.equal(text.includes(VERIFY_TOKEN), false);
    assertZeroDownstream(spies);
  });

  test('wrong verify token is rejected and not reflected', async () => {
    const challenge = 'challenge-not-reflected';
    const wrongToken = 'wrong-verify-token-value';
    const spies = installSpies();
    const response = await fetch(
      `${baseUrl}/api/whatsapp/webhook?${new URLSearchParams({
        'hub.mode': 'subscribe',
        'hub.verify_token': wrongToken,
        'hub.challenge': challenge,
      }).toString()}`
    );
    const text = await response.text();

    assert.equal(response.status, 403);
    assert.equal(text.includes(challenge), false);
    assert.equal(text.includes(wrongToken), false);
    assertZeroDownstream(spies);
  });

  test('missing verify token is rejected', async () => {
    const spies = installSpies();
    const response = await fetch(
      `${baseUrl}/api/whatsapp/webhook?${new URLSearchParams({
        'hub.mode': 'subscribe',
        'hub.challenge': 'challenge-missing-token',
      }).toString()}`
    );
    const text = await response.text();

    assert.equal(response.status, 403);
    assert.equal(text.includes('challenge-missing-token'), false);
    assertZeroDownstream(spies);
  });

  test('verify handshake rejects a different-length token', async () => {
    const spies = installSpies();
    const response = await fetch(
      `${baseUrl}/api/whatsapp/webhook?${new URLSearchParams({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'short',
        'hub.challenge': 'challenge-length',
      }).toString()}`
    );
    const text = await response.text();

    assert.equal(response.status, 403);
    assert.equal(text.includes('challenge-length'), false);
    assertZeroDownstream(spies);
  });

  test('verify handshake rejects a correct token when hub.mode is not subscribe', async () => {
    const spies = installSpies();
    const response = await fetch(
      `${baseUrl}/api/whatsapp/webhook?${new URLSearchParams({
        'hub.mode': 'unsubscribe',
        'hub.verify_token': VERIFY_TOKEN,
        'hub.challenge': 'challenge-wrong-mode',
      }).toString()}`
    );
    const text = await response.text();

    assert.equal(response.status, 403);
    assert.equal(text.includes('challenge-wrong-mode'), false);
    assert.equal(text.includes(VERIFY_TOKEN), false);
    assertZeroDownstream(spies);
  });

  test('missing configured verify token fails closed and does not log the token', async () => {
    const warnings = [];
    mock.method(console, 'warn', (...args) => {
      warnings.push(args.map((part) => String(part)).join(' '));
    });
    const attackerToken = 'attacker-supplied-verify-token';
    env.whatsapp.verifyToken = '';
    const spies = installSpies();
    const response = await fetch(
      `${baseUrl}/api/whatsapp/webhook?${new URLSearchParams({
        'hub.mode': 'subscribe',
        'hub.verify_token': attackerToken,
        'hub.challenge': 'challenge-unconfigured',
      }).toString()}`
    );
    const text = await response.text();

    assert.equal(response.status, 403);
    assert.match(warnings.join('\n'), /verify token is not configured/);
    assertZeroDownstream(spies);
    assertNoSecretMaterial(`${text}\n${warnings.join('\n')}`, [
      APP_SECRET,
      VERIFY_TOKEN,
      attackerToken,
      'challenge-unconfigured',
    ]);
  });

  test('other routes still parse JSON', async () => {
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).status, 'ok');

    const contacts = await fetch(`${baseUrl}/api/contacts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"name":"json-still-parsed"}',
    });
    const contactsText = await contacts.text();
    assert.equal(contacts.status === 401 || contacts.status === 403, true, contactsText);
    assert.equal(contacts.status === 400, false);
    JSON.parse(contactsText);
  });

  test('production startup warns and still starts when enabled WhatsApp secrets are missing', () => {
    const secret = 'test-only-startup-app-secret';
    const result = runConfig({
      NODE_ENV: 'production',
      WHATSAPP_ENABLED: 'true',
      WHATSAPP_APP_SECRET: secret,
      WHATSAPP_VERIFY_TOKEN: '   ',
    });
    const output = `${result.stdout || ''}\n${result.stderr || ''}`;

    assert.equal(result.status, 0, redact(output, [secret, ADMIN_API_KEY]));
    assert.match(result.stdout || '', /config-loaded/);
    assert.match(result.stderr || '', /WHATSAPP_ENABLED is true but WHATSAPP_APP_SECRET or WHATSAPP_VERIFY_TOKEN is missing/);
    assert.equal((result.stderr || '').includes('Refusing to start'), false);
    assertNoSecretMaterial(output, [secret, ADMIN_API_KEY, VERIFY_TOKEN, APP_SECRET]);
  });

  test('production startup stays quiet when WhatsApp is disabled or fully configured', () => {
    const disabled = runConfig({
      NODE_ENV: 'production',
      WHATSAPP_ENABLED: 'false',
    });
    const configured = runConfig({
      NODE_ENV: 'production',
      WHATSAPP_ENABLED: 'true',
      WHATSAPP_APP_SECRET: APP_SECRET,
      WHATSAPP_VERIFY_TOKEN: VERIFY_TOKEN,
    });

    for (const result of [disabled, configured]) {
      const output = `${result.stdout || ''}\n${result.stderr || ''}`;
      assert.equal(result.status, 0, redact(output, [APP_SECRET, VERIFY_TOKEN, ADMIN_API_KEY]));
      assert.match(result.stdout || '', /config-loaded/);
      assert.equal((result.stderr || '').includes('WHATSAPP_APP_SECRET or WHATSAPP_VERIFY_TOKEN'), false);
      assertNoSecretMaterial(output, [APP_SECRET, VERIFY_TOKEN, ADMIN_API_KEY]);
    }
  });

  test('development startup warns without printing secrets and test startup stays quiet', () => {
    const development = runConfig({
      NODE_ENV: 'development',
      WHATSAPP_ENABLED: 'true',
      WHATSAPP_APP_SECRET: '',
      WHATSAPP_VERIFY_TOKEN: '',
    });
    const tests = runConfig({
      NODE_ENV: 'test',
      WHATSAPP_ENABLED: 'true',
      WHATSAPP_APP_SECRET: '',
      WHATSAPP_VERIFY_TOKEN: '',
    });
    const unsetNodeEnv = runConfig(
      {
        WHATSAPP_ENABLED: 'true',
        WHATSAPP_APP_SECRET: '',
        WHATSAPP_VERIFY_TOKEN: '',
      },
      ['NODE_ENV']
    );

    const developmentOutput = `${development.stdout || ''}\n${development.stderr || ''}`;
    assert.equal(development.status, 0, redact(developmentOutput, [ADMIN_API_KEY]));
    assert.match(development.stderr || '', /WHATSAPP_APP_SECRET or WHATSAPP_VERIFY_TOKEN is missing/);
    assertNoSecretMaterial(developmentOutput, [ADMIN_API_KEY, APP_SECRET, VERIFY_TOKEN]);

    for (const result of [tests, unsetNodeEnv]) {
      const output = `${result.stdout || ''}\n${result.stderr || ''}`;
      assert.equal(result.status, 0, redact(output, [ADMIN_API_KEY]));
      assert.match(result.stdout || '', /config-loaded/);
      assert.equal((result.stderr || '').includes('WHATSAPP_APP_SECRET or WHATSAPP_VERIFY_TOKEN'), false);
      assertNoSecretMaterial(output, [ADMIN_API_KEY, APP_SECRET, VERIFY_TOKEN]);
    }
  });
});
