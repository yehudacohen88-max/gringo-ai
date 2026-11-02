const { describe, test, before, after, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const app = require('../src/app');
const { env } = require('../src/config/env');
const { coreAgentService } = require('../src/modules/core-agent');
const { communicationService } = require('../src/modules/communication');
const managerRepository = require('../src/modules/manager-agent/manager-agent.repository');
const lineClient = require('../src/modules/line/line-client.service');
const lineMessageMapper = require('../src/modules/line/line-message.mapper');
const lineMessageService = require('../src/modules/line/line-message.service');
const { processedMessageIds } = require('../src/modules/line/line-webhook.service');

const LINE_SECRET = 'test-only-line-channel-secret';
const LINE_ACCESS_TOKEN = 'test-only-line-access-token';

let server;
let baseUrl;
let sequence = 0;
const lineSnapshot = {
  enabled: env.line.enabled,
  channelSecret: env.line.channelSecret,
  channelAccessToken: env.line.channelAccessToken,
};

function nextId() {
  sequence += 1;
  return `line-msg-${sequence}`;
}

function rawBody(messageId, spaced = false) {
  const payload = {
    events: [
      {
        type: 'message',
        timestamp: Date.now(),
        webhookEventId: `evt-${messageId}`,
        replyToken: 'reply-token-test',
        source: { type: 'user', userId: 'Ulineuser123' },
        message: { id: messageId, type: 'text', text: 'hello from line' },
      },
    ],
  };
  if (!spaced) return JSON.stringify(payload);
  return `{ "events" : ${JSON.stringify(payload.events)} }`;
}

function signBody(raw, secret = LINE_SECRET) {
  return crypto.createHmac('sha256', secret).update(raw).digest('base64');
}

function installSpies() {
  return {
    getTextMessages: mock.method(lineMessageMapper, 'getTextMessages'),
    extractPostbackEvents: mock.method(lineMessageMapper, 'extractPostbackEvents'),
    getUnsupportedMessages: mock.method(lineMessageMapper, 'getUnsupportedMessages'),
    readConversationHistory: mock.method(managerRepository, 'readConversationHistory', async () => []),
    receiveMessage: mock.method(communicationService, 'receiveMessage'),
    processTextMessage: mock.method(lineMessageService, 'processTextMessage'),
    processAction: mock.method(lineMessageService, 'processAction'),
    processUnsupportedMessage: mock.method(lineMessageService, 'processUnsupportedMessage'),
    sendInteractiveMessage: mock.method(communicationService, 'sendInteractiveMessage'),
    sendTextMessage: mock.method(lineClient, 'sendTextMessage', async () => ({ ok: true })),
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
    headers['x-line-signature'] = signature === undefined ? signBody(raw) : signature;
  }
  const response = await fetch(`${baseUrl}/api/line/webhook`, {
    method: 'POST',
    headers,
    body: raw,
  });
  const text = await response.text();
  return { status: response.status, text };
}

describe('LINE webhook signature regression', { concurrency: false }, () => {
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
    env.line.enabled = true;
    env.line.channelSecret = LINE_SECRET;
    env.line.channelAccessToken = LINE_ACCESS_TOKEN;
  });

  afterEach(() => {
    env.line.enabled = lineSnapshot.enabled;
    env.line.channelSecret = lineSnapshot.channelSecret;
    env.line.channelAccessToken = lineSnapshot.channelAccessToken;
    mock.restoreAll();
  });

  test('valid X-Line-Signature passes and processes the message', async () => {
    const spies = installSpies();
    const result = await postWebhook(rawBody(nextId()));
    const body = JSON.parse(result.text);

    assert.equal(result.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.results.some((item) => item.processed === true), true);
    assert.ok(spies.getTextMessages.mock.calls.length > 0);
    assert.ok(spies.readConversationHistory.mock.calls.length > 0);
    assert.ok(spies.receiveMessage.mock.calls.length > 0);
    assert.ok(spies.processTextMessage.mock.calls.length > 0);
    assert.ok(spies.processWebMessage.mock.calls.length > 0);
    assert.ok(spies.sendInteractiveMessage.mock.calls.length > 0);
    assert.ok(spies.sendTextMessage.mock.calls.length > 0);
    assert.equal(result.text.includes(LINE_SECRET), false);
  });

  test('missing X-Line-Signature is rejected before processing', async () => {
    const spies = installSpies();
    const result = await postWebhook(rawBody(nextId()), { includeSignature: false });

    assert.equal(result.status, 401);
    assert.match(result.text, /signature is invalid/);
    assertZeroDownstream(spies);
  });

  test('invalid X-Line-Signature is rejected before processing', async () => {
    const raw = rawBody(nextId());
    const signature = signBody(raw);
    const flipped = signature.startsWith('A') ? `B${signature.slice(1)}` : `A${signature.slice(1)}`;
    const spies = installSpies();
    const result = await postWebhook(raw, { signature: flipped });

    assert.equal(result.status, 401);
    assertZeroDownstream(spies);
    assert.equal(result.text.includes(LINE_SECRET), false);
  });

  test('tampered LINE body is rejected before processing', async () => {
    const raw = rawBody(nextId());
    const signature = signBody(raw);
    const tampered = raw.replace('hello from line', 'tampered line text');
    assert.notEqual(raw, tampered);
    const spies = installSpies();
    const result = await postWebhook(tampered, { signature });

    assert.equal(result.status, 401);
    assertZeroDownstream(spies);
  });

  test('LINE signature is checked against the raw body bytes', async () => {
    const raw = rawBody(nextId(), true);
    const reparsed = JSON.stringify(JSON.parse(raw));
    assert.notEqual(raw, reparsed);

    const accepted = installSpies();
    const valid = await postWebhook(raw, { signature: signBody(raw) });
    assert.equal(valid.status, 200, valid.text);
    assert.ok(accepted.processWebMessage.mock.calls.length > 0);
    mock.restoreAll();

    processedMessageIds.length = 0;
    const second = rawBody(nextId(), true);
    const secondReparsed = JSON.stringify(JSON.parse(second));
    assert.notEqual(second, secondReparsed);
    const rejected = installSpies();
    const invalid = await postWebhook(second, { signature: signBody(secondReparsed) });
    assert.equal(invalid.status, 401);
    assertZeroDownstream(rejected);
  });

  test('enabled LINE webhook rejects a missing channel secret before processing', async () => {
    env.line.channelSecret = '';
    const spies = installSpies();
    const raw = rawBody(nextId());
    const result = await postWebhook(raw, { signature: signBody(raw, 'some-other-secret') });

    assert.equal(result.status, 401);
    assertZeroDownstream(spies);
    assert.equal(result.text.includes(LINE_SECRET), false);
  });

  test('disabled LINE webhook still acknowledges without processing', async () => {
    env.line.enabled = false;
    const spies = installSpies();
    const result = await postWebhook(rawBody(nextId()), { includeSignature: false });
    const body = JSON.parse(result.text);

    assert.equal(result.status, 200);
    assert.equal(body.disabled, true);
    assertZeroDownstream(spies);
  });
});
