// P0-2: consent, withdrawal, access, deletion. The consent gate is off for
// legacy suites (scripts/configure-test-env.cjs) and turned on here.
process.env.GRINGO_PRIVACY_CONSENT_GATE = 'on';

const { describe, test, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const app = require('../src/app');
const { env } = require('../src/config/env');
const { COOKIE_NAME, openWebSession } = require('../src/shared/webIdentity');
const { resetRateLimitsForTests } = require('../src/shared/rateLimit');
const crmAgentRepository = require('../src/modules/crm-agent/crm-agent.repository');
const { crmAgentService } = require('../src/modules/crm-agent');
const { coreAgentService } = require('../src/modules/core-agent');
const { communicationService } = require('../src/modules/communication');
const { conversationMemoryService } = require('../src/modules/memory');
const privacyService = require('../src/modules/privacy/privacy.service');
const privacyStore = require('../src/modules/privacy/privacy-store');
const privacyNotice = require('../src/modules/privacy/privacy-notice');
const erasure = require('../src/modules/privacy/privacy-erasure.service');
const { handleChannelPrivacy, parsePrivacyCommand } = require('../src/modules/privacy/privacy-channel');
const telegramUpdateService = require('../src/modules/telegram/telegram-update.service');
const telegramMessageService = require('../src/modules/telegram/telegram-message.service');
const whatsappMessageService = require('../src/modules/whatsapp/whatsapp-message.service');
const { processedMessageIds } = require('../src/modules/whatsapp/whatsapp-webhook.service');
const managerRepository = require('../src/modules/manager-agent/manager-agent.repository');
const { buildUserPrompt } = require('../src/modules/ai-provider/gringo-prompt.service');

let server;
let base;

function cookieFrom(response) {
  const header = response.headers.getSetCookie().find((value) => value.startsWith(`${COOKIE_NAME}=`));
  assert.ok(header, 'gw_sid cookie expected');
  return decodeURIComponent(header.split(';')[0].slice(COOKIE_NAME.length + 1));
}

async function body(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch (error) {
    return text;
  }
}

async function newSession() {
  const started = await fetch(`${base}/api/privacy/status`);
  const cookie = cookieFrom(started);
  const status = await body(started);
  const opened = openWebSession(cookie, [env.webSessionSecret, env.webSessionSecretPrevious].filter(Boolean));
  return { cookie, webId: opened.webId, status };
}

function headers(session, extra = {}) {
  return {
    'content-type': 'application/json',
    cookie: `${COOKIE_NAME}=${encodeURIComponent(session.cookie)}`,
    origin: base,
    ...extra,
  };
}

async function post(path, session, payload, extraHeaders) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: headers(session, extraHeaders),
    body: JSON.stringify(payload || {}),
  });
  return { status: response.status, body: await body(response) };
}

async function put(path, session, payload) {
  const response = await fetch(`${base}${path}`, {
    method: 'PUT',
    headers: headers(session),
    body: JSON.stringify(payload || {}),
  });
  return { status: response.status, body: await body(response) };
}

async function get(path, session) {
  const response = await fetch(`${base}${path}`, {
    headers: session ? { cookie: `${COOKIE_NAME}=${encodeURIComponent(session.cookie)}` } : {},
  });
  return { status: response.status, body: await body(response) };
}

async function consentedSession(fullName) {
  const session = await newSession();
  const accepted = await post('/api/privacy/consent', session, { accept: true, consentVersion: privacyNotice.PRIVACY_NOTICE_VERSION });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  const saved = await put('/api/chat/profile', session, { fullName });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  session.userId = saved.body.profile.userId;
  return session;
}

async function deleteFor(session) {
  const requested = await post('/api/privacy/delete-request', session, {});
  assert.equal(requested.status, 200);
  return post('/api/privacy/delete', session, { confirm: true, confirmationCode: requested.body.confirmationCode });
}

describe('P0-2 privacy, consent and deletion', { concurrency: false }, () => {
  before(async () => {
    server = app.listen(0, '127.0.0.1');
    if (!server.listening) await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    mock.restoreAll();
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  });

  beforeEach(() => {
    resetRateLimitsForTests();
    privacyService.resetForTests();
  });

  test('privacy notice exists in he, en and th, is versioned, marked DRAFT, and states deletion limits', async () => {
    for (const lang of ['he', 'en', 'th']) {
      const response = await get(`/api/privacy/notice?lang=${lang}`);
      assert.equal(response.status, 200);
      const notice = response.body.notice;
      assert.equal(notice.language, lang);
      assert.equal(notice.version, privacyNotice.PRIVACY_NOTICE_VERSION);
      assert.equal(notice.status, 'DRAFT_PENDING_LEGAL_REVIEW');
      assert.ok(notice.summary.length >= 3);
      assert.ok(notice.rights.length >= 4);
      assert.match(notice.limits, /Telegram/);
      assert.match(notice.limits, /LINE/);
      assert.match(notice.limits, /WhatsApp/);
      assert.match(notice.limits, /OpenAI/);
      assert.match(notice.limits, /Google/);
      for (const key of Object.keys(privacyNotice.REPLIES.en)) assert.ok(privacyNotice.REPLIES[lang][key], `${lang}.${key}`);
    }
    assert.match(privacyNotice.NOTICES.th.summary[0], /[\u0e00-\u0e7f]/);
    assert.match(privacyNotice.NOTICES.he.summary[0], /[\u0590-\u05ff]/);
  });

  test('consent is required before a web profile or chat message is stored', async () => {
    const session = await newSession();
    assert.equal(session.status.needsConsent, true);
    const saved = await put('/api/chat/profile', session, { fullName: 'No Consent Person' });
    assert.equal(saved.status, 403);
    assert.equal(saved.body.error.code, 'CONSENT_REQUIRED');
    const chat = await post('/api/chat/message', session, { message: 'my name is No Consent Person' });
    assert.equal(chat.status, 403);
    assert.equal(chat.body.error.code, 'CONSENT_REQUIRED');
    assert.equal(await crmAgentService.findUserByChannel('web', session.webId), null);
    const catalog = await get('/api/jobs', session);
    assert.equal(catalog.status, 200, 'public catalogs stay open without consent');
  });

  test('accept needs the current notice version; decline keeps the gate closed', async () => {
    const session = await newSession();
    const stale = await post('/api/privacy/consent', session, { accept: true, consentVersion: 'old' });
    assert.equal(stale.status, 409);
    const missing = await post('/api/privacy/consent', session, {});
    assert.equal(missing.status, 400);
    const declined = await post('/api/privacy/consent', session, { accept: false });
    assert.equal(declined.status, 200);
    assert.equal(declined.body.status, 'declined');
    assert.equal((await put('/api/chat/profile', session, { fullName: 'Declined' })).status, 403);
    const accepted = await post('/api/privacy/consent', session, { accept: true, consentVersion: privacyNotice.PRIVACY_NOTICE_VERSION });
    assert.equal(accepted.body.accepted, true);
    assert.equal((await put('/api/chat/profile', session, { fullName: 'Now Accepted' })).status, 200);
  });

  test('withdraw stops further processing but the worker can still read and export own data', async () => {
    const session = await consentedSession('Withdraw Person');
    const withdrawn = await post('/api/privacy/withdraw', session, {});
    assert.equal(withdrawn.status, 200);
    assert.equal(withdrawn.body.status, 'withdrawn');
    assert.equal((await put('/api/chat/profile', session, { city: 'Haifa' })).status, 403);
    assert.equal((await post('/api/chat/message', session, { message: 'hello' })).status, 403);
    assert.equal(await privacyService.allowsProcessingForUser(session.userId), false);
    const profile = await get('/api/chat/profile', session);
    assert.equal(profile.body.profile.fullName, 'Withdraw Person');
    const exported = await get('/api/privacy/export', session);
    assert.equal(exported.status, 200);
    assert.equal(exported.body.local.profiles[0].fullName, 'Withdraw Person');
  });

  test('CSRF: cross-site or non-JSON consent, withdraw and delete requests are rejected', async () => {
    const session = await consentedSession('Csrf Target');
    for (const path of ['/api/privacy/consent', '/api/privacy/withdraw', '/api/privacy/delete-request', '/api/privacy/delete']) {
      const evil = await post(path, session, { accept: false, confirm: true }, { origin: 'https://evil.example' });
      assert.equal(evil.status, 403, path);
      const crossSite = await post(path, session, { accept: false, confirm: true }, { origin: undefined, 'sec-fetch-site': 'cross-site' });
      assert.equal(crossSite.status, 403, path);
      const response = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { cookie: `${COOKIE_NAME}=${encodeURIComponent(session.cookie)}`, origin: base, 'content-type': 'text/plain' },
        body: '{}',
      });
      assert.equal(response.status, 415, path);
    }
    const status = await get('/api/privacy/status', session);
    assert.equal(status.body.accepted, true);
    const profile = await get('/api/chat/profile', session);
    assert.equal(profile.body.profile.fullName, 'Csrf Target');
  });

  test('export returns only the signed-in worker data; client ids are ignored', async () => {
    const ada = await consentedSession('Ada Export');
    const bo = await consentedSession('Bo Export');
    const exported = await get(`/api/privacy/export?userId=${encodeURIComponent(bo.userId)}&channelUserId=${encodeURIComponent(bo.webId)}`, ada);
    assert.equal(exported.status, 200);
    const text = JSON.stringify(exported.body);
    assert.ok(text.includes('Ada Export'));
    assert.equal(text.includes('Bo Export'), false);
    assert.equal(text.includes(bo.userId), false);
    const foreign = await get('/api/privacy/export?channel=whatsapp&channelUserId=15550001111', ada);
    assert.equal(foreign.status, 400);
    assert.equal(foreign.body.error.code, 'FOREIGN_CHANNEL_REJECTED');
  });

  test('delete needs confirm and a bound one-time code; deletes own data only; repeat is idempotent', async () => {
    const ada = await consentedSession('Ada Delete');
    const bo = await consentedSession('Bo Keep');
    await crmAgentService.saveConversation({ userId: ada.userId, channel: 'web', question: 'Ada private question', answer: 'a', category: 'Other', status: 'OK' });
    await crmAgentService.saveConversation({ userId: bo.userId, channel: 'web', question: 'Bo private question', answer: 'b', category: 'Other', status: 'OK' });
    conversationMemoryService.addMessage(`web:${ada.webId}`, { role: 'user', content: 'Ada memory' });

    const boCode = (await post('/api/privacy/delete-request', bo, {})).body.confirmationCode;
    const adaCode = (await post('/api/privacy/delete-request', ada, {})).body.confirmationCode;
    assert.match(adaCode, /^\d{6}$/);

    const noConfirm = await post('/api/privacy/delete', ada, { confirmationCode: adaCode });
    assert.equal(noConfirm.status, 409);
    if (boCode !== adaCode) {
      const crossCode = await post('/api/privacy/delete', ada, { confirm: true, confirmationCode: boCode });
      assert.equal(crossCode.status, 400, 'a code issued to B does not work for A');
    }
    const forgedTarget = await post('/api/privacy/delete', ada, { confirm: true, confirmationCode: adaCode, userId: bo.userId, channelUserId: bo.webId });
    assert.equal(forgedTarget.status, 200);
    assert.equal(forgedTarget.body.deleted, true);
    assert.match(forgedTarget.body.notDeleted, /OpenAI/);

    assert.equal(await crmAgentService.findUserByChannel('web', ada.webId), null);
    assert.deepEqual(crmAgentRepository.localRecordsForUser(ada.userId).conversations, []);
    assert.deepEqual(conversationMemoryService.getRecentMessages(`web:${ada.webId}`), []);
    const boProfile = await crmAgentService.findUserByChannel('web', bo.webId);
    assert.equal(boProfile.fullName, 'Bo Keep');
    assert.equal(crmAgentRepository.localRecordsForUser(bo.userId).conversations.length, 1);

    const replay = await post('/api/privacy/delete', ada, { confirm: true, confirmationCode: adaCode });
    assert.equal(replay.status, 400, 'a used code cannot be replayed');
    const again = await deleteFor(ada);
    assert.equal(again.status, 200);
    assert.equal(await crmAgentService.findUserByChannel('web', ada.webId), null);
    assert.equal((await crmAgentService.findUserByChannel('web', bo.webId)).fullName, 'Bo Keep');
    const status = await get('/api/privacy/status', ada);
    assert.equal(status.body.needsConsent, true, 'consent record is removed with the data');
  });

  test('wrong codes are limited to five attempts', async () => {
    const session = await consentedSession('Brute Force');
    const code = (await post('/api/privacy/delete-request', session, {})).body.confirmationCode;
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i += 1) {
      assert.equal((await post('/api/privacy/delete', session, { confirm: true, confirmationCode: wrong })).status, 400);
    }
    assert.equal((await post('/api/privacy/delete', session, { confirm: true, confirmationCode: code })).status, 400);
    assert.ok(await crmAgentService.findUserByChannel('web', session.webId));
  });

  test('audit log and console output contain no names, raw ids or message text', async () => {
    const lines = [];
    const restore = ['log', 'warn', 'error', 'info'].map((level) => {
      const original = console[level];
      console[level] = (...args) => lines.push(args.join(' '));
      return () => { console[level] = original; };
    });
    let session;
    try {
      session = await consentedSession('Audit Secret Name');
      await post('/api/privacy/withdraw', session, {});
      await get('/api/privacy/export', session);
      await deleteFor(session);
    } finally {
      restore.forEach((fn) => fn());
    }
    const audit = JSON.stringify(privacyStore.localAuditEntries());
    for (const text of [audit, lines.join('\n')]) {
      assert.equal(text.includes('Audit Secret Name'), false);
      assert.equal(text.includes(session.webId), false);
      assert.equal(text.includes(session.userId), false);
    }
    assert.ok(privacyStore.localAuditEntries().some((entry) => entry.event === 'delete'));
    assert.ok(privacyStore.localAuditEntries().some((entry) => entry.event === 'consent_withdrawn'));
  });

  test('the consent gate cannot be turned off in production or hosted runtimes', () => {
    const saved = { NODE_ENV: process.env.NODE_ENV, flag: process.env.GRINGO_PRIVACY_CONSENT_GATE, render: process.env.RENDER };
    try {
      process.env.GRINGO_PRIVACY_CONSENT_GATE = 'off';
      assert.equal(privacyService.consentGateEnabled(), false);
      process.env.NODE_ENV = 'production';
      assert.equal(privacyService.consentGateEnabled(), true);
      process.env.NODE_ENV = 'test';
      process.env.RENDER = 'true';
      assert.equal(privacyService.consentGateEnabled(), true);
    } finally {
      process.env.NODE_ENV = saved.NODE_ENV;
      process.env.GRINGO_PRIVACY_CONSENT_GATE = saved.flag;
      if (saved.render === undefined) delete process.env.RENDER;
      else process.env.RENDER = saved.render;
    }
  });

  test('channel ids, phone numbers and internal ids are not sent to the AI provider', () => {
    const prompt = buildUserPrompt({
      message: 'hi',
      userProfile: { userId: 'usr_x', fullName: 'Somsak', city: 'Haifa', whatsappPhone: '972500000000', telegramChatId: '998877', lineUserId: 'Uabc', channelUserId: 'web-secret-id' },
    });
    assert.ok(prompt.includes('Haifa'));
    for (const value of ['usr_x', '972500000000', '998877', 'Uabc', 'web-secret-id']) assert.equal(prompt.includes(value), false, value);
  });

  test('channel privacy commands parse in he, en and th; Thai decline is not read as accept', () => {
    assert.deepEqual(parsePrivacyCommand('ไม่ยอมรับ'), { command: 'decline' });
    assert.deepEqual(parsePrivacyCommand('ยอมรับ'), { command: 'accept' });
    assert.deepEqual(parsePrivacyCommand('מסכים'), { command: 'accept' });
    assert.deepEqual(parsePrivacyCommand('לא מסכים'), { command: 'decline' });
    assert.deepEqual(parsePrivacyCommand('/privacy'), { command: 'privacy' });
    assert.deepEqual(parsePrivacyCommand('ลบข้อมูล 123456'), { command: 'deleteConfirm', code: '123456' });
    assert.deepEqual(parsePrivacyCommand('מחק את המידע שלי'), { command: 'delete' });
    assert.deepEqual(parsePrivacyCommand('ถอนความยินยอม'), { command: 'withdraw' });
    assert.deepEqual(parsePrivacyCommand('המידע שלי'), { command: 'export' });
    assert.equal(parsePrivacyCommand('hello'), null);
  });

  test('LINE: no consent means notice and no profile; accept, export, delete own only', async () => {
    const lineA = `U${crypto.randomBytes(8).toString('hex')}`;
    const lineB = `U${crypto.randomBytes(8).toString('hex')}`;
    const blocked = await handleChannelPrivacy('line', { channelUserId: lineA, messageText: 'สวัสดี' });
    assert.equal(blocked.status, 'PRIVACY_CONSENT_REQUIRED');
    assert.match(blocked.reply, /[\u0e00-\u0e7f]/);
    assert.equal(await crmAgentService.findUserByChannel('line', lineA), null);

    for (const id of [lineA, lineB]) {
      const ok = await handleChannelPrivacy('line', { channelUserId: id, messageText: 'ยอมรับ' });
      assert.equal(ok.status, 'PRIVACY_CONSENT_ACCEPTED');
      assert.equal(await handleChannelPrivacy('line', { channelUserId: id, messageText: 'hello' }), null);
      await crmAgentRepository.createUserProfile({ userId: `usr_${id}`, channel: 'line', channelUserId: id, lineUserId: id, fullName: `Name ${id}` });
    }
    const exported = await handleChannelPrivacy('line', { channelUserId: lineA, messageText: 'my data' });
    assert.ok(exported.reply.includes(`Name ${lineA}`));
    assert.equal(exported.reply.includes(lineB), false);

    const asked = await handleChannelPrivacy('line', { channelUserId: lineA, messageText: 'delete my data' });
    assert.equal(asked.status, 'PRIVACY_DELETE_CONFIRMATION_REQUIRED');
    const code = asked.reply.match(/(\d{6})/)[1];
    const crossed = await handleChannelPrivacy('line', { channelUserId: lineB, messageText: `delete my data ${code}` });
    assert.equal(crossed.status, 'PRIVACY_DELETE_REJECTED');
    const done = await handleChannelPrivacy('line', { channelUserId: lineA, messageText: `delete my data ${code}` });
    assert.equal(done.status, 'PRIVACY_DELETED');
    assert.match(done.reply, /OpenAI/);
    assert.equal(await crmAgentRepository.findUserProfileRecordByLineUserId(lineA), null);
    assert.ok(await crmAgentRepository.findUserProfileRecordByLineUserId(lineB));
    const afterDelete = await handleChannelPrivacy('line', { channelUserId: lineA, messageText: 'hello' });
    assert.equal(afterDelete.status, 'PRIVACY_CONSENT_REQUIRED');
  });

  test('Telegram: unconsented text and callbacks get the notice; nothing is stored; withdraw stops processing', async () => {
    const sent = [];
    const interactive = mock.method(communicationService, 'sendInteractiveMessage', async (payload) => { sent.push(payload); return { ok: true }; });
    const plain = mock.method(communicationService, 'sendMessage', async (payload) => { sent.push(payload); return { ok: true }; });
    const handler = mock.method(telegramMessageService, 'processTelegramMessage', async () => ({ reply: 'core', status: 'OK', user: { userId: 'usr_tg' } }));
    const record = mock.method(telegramMessageService, 'recordDeliveryStatus', async () => null);
    const callbackHandler = mock.method(telegramMessageService, 'processCallback', async () => ({}));
    try {
      const tgId = String(700000000 + crypto.randomInt(1000000));
      let updateId = Date.now() * 10;
      const update = (text) => ({ update_id: (updateId += 1), message: { message_id: 1, date: Math.floor(Date.now() / 1000), text, chat: { id: tgId, type: 'private' }, from: { id: tgId, language_code: 'th' } } });

      await telegramUpdateService.processUpdate(update('สวัสดี'));
      assert.equal(handler.mock.calls.length, 0);
      assert.equal(record.mock.calls.length, 0);
      assert.match(sent.at(-1).text, /Gringo/);
      assert.equal(await crmAgentService.findUserByChannel('telegram', tgId), null);

      await telegramUpdateService.processUpdate({ update_id: (updateId += 1), callback_query: { id: 'cb1', data: 'x', from: { id: tgId }, message: { message_id: 2, chat: { id: tgId, type: 'private' } } } });
      assert.equal(callbackHandler.mock.calls.length, 0);

      await telegramUpdateService.processUpdate(update('ยอมรับ'));
      await telegramUpdateService.processUpdate(update('hello'));
      assert.equal(handler.mock.calls.length, 1);
      assert.equal(record.mock.calls.length, 1);

      await telegramUpdateService.processUpdate(update('ถอนความยินยอม'));
      await telegramUpdateService.processUpdate(update('hello again'));
      assert.equal(handler.mock.calls.length, 1, 'withdrawn consent stops processing');
    } finally {
      interactive.mock.restore();
      plain.mock.restore();
      handler.mock.restore();
      record.mock.restore();
      callbackHandler.mock.restore();
    }
  });

  test('Telegram: partial deletion reply is sent and nothing reaches the message handler while pending', async () => {
    const sent = [];
    mock.method(communicationService, 'sendMessage', async (payload) => { sent.push(payload); return { ok: true }; });
    mock.method(communicationService, 'sendInteractiveMessage', async (payload) => { sent.push(payload); return { ok: true }; });
    const handler = mock.method(telegramMessageService, 'processTelegramMessage', async () => ({ reply: 'core', status: 'OK', user: { userId: 'x' } }));
    mock.method(telegramMessageService, 'recordDeliveryStatus', async () => null);
    try {
      const tgId = String(800000000 + crypto.randomInt(1000000));
      let updateId = Date.now() * 10 + 5000;
      const update = (text) => ({ update_id: (updateId += 1), message: { message_id: 1, date: Math.floor(Date.now() / 1000), text, chat: { id: tgId, type: 'private' }, from: { id: tgId, language_code: 'en' } } });
      await telegramUpdateService.processUpdate(update('accept'));
      await crmAgentRepository.createUserProfile({ userId: `usr_tg_${tgId}`, channel: 'telegram', channelUserId: tgId, telegramUserId: tgId, telegramChatId: tgId });
      const { failing } = { failing: new Set(['UserTasks']) };
      const tgSheets = { UserTasks: [['taskId', 'userId'], ['t1', `usr_tg_${tgId}`]] };
      erasure.setSheetsAdapterForTests({
        configured: () => true,
        sheetNames: () => Object.keys(tgSheets),
        readSheetRows: async (name) => tgSheets[name].map((row) => [...row]),
        updateSheetRow: async (name) => { if (failing.has(name)) throw new Error('quota'); },
      });
      await telegramUpdateService.processUpdate(update('delete my data'));
      const code = sent.at(-1).text.match(/(\d{6})/)[1];
      await telegramUpdateService.processUpdate(update(`delete my data ${code}`));
      assert.ok(sent.at(-1).text.startsWith(privacyNotice.REPLIES.en.deletePartial));
      await telegramUpdateService.processUpdate(update('hello'));
      assert.equal(handler.mock.calls.length, 0);
      assert.ok(sent.at(-1).text.startsWith(privacyNotice.REPLIES.en.deletePartial));
    } finally {
      erasure.setSheetsAdapterForTests(null);
      mock.restoreAll();
    }
  });

  test('WhatsApp: unsigned forged delete is rejected; signed unconsented message is not processed or stored', async () => {
    const APP_SECRET = 'test-only-whatsapp-app-secret';
    const snapshot = { ...env.whatsapp };
    Object.assign(env.whatsapp, { enabled: true, appSecret: APP_SECRET, verifyToken: 'v', accessToken: 'a', phoneNumberId: 'p' });
    processedMessageIds.length = 0;
    const sent = [];
    const send = mock.method(communicationService, 'sendMessage', async (payload) => { sent.push(payload); return { ok: true }; });
    const history = mock.method(managerRepository, 'readConversationHistory', async () => []);
    const handler = mock.method(whatsappMessageService, 'processTextMessage', async () => ({ reply: 'core', user: { userId: 'u' } }));
    const record = mock.method(whatsappMessageService, 'recordDeliveryStatus', async () => null);
    const phone = '15559870000';
    await crmAgentRepository.createUserProfile({ userId: 'usr_wa_victim', channel: 'whatsapp', channelUserId: phone, whatsappPhone: phone, fullName: 'WhatsApp Victim' });
    const payload = (text, id) => JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ value: { contacts: [{ wa_id: phone }], messages: [{ from: phone, id, timestamp: String(Math.floor(Date.now() / 1000)), text: { body: text }, type: 'text' }] } }] }],
    });
    try {
      const forged = await fetch(`${base}/api/whatsapp/webhook`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload('delete my data 123456', 'wamid.f1') });
      assert.equal(forged.status, 401);
      assert.ok(await crmAgentRepository.findUserProfileRecordByChannel('whatsapp', phone), 'forged request deleted nothing');

      const raw = payload('hello', `wamid.${crypto.randomBytes(4).toString('hex')}`);
      const signature = `sha256=${crypto.createHmac('sha256', APP_SECRET).update(raw).digest('hex')}`;
      const signed = await fetch(`${base}/api/whatsapp/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature }, body: raw });
      assert.equal(signed.status, 200);
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.equal(handler.mock.calls.length, 0, 'legacy profile without consent is not processed');
      assert.equal(record.mock.calls.length, 0, 'no conversation row is saved without consent');
      assert.ok(sent.some((item) => /Gringo/.test(item.text)));
    } finally {
      Object.assign(env.whatsapp, snapshot);
      send.mock.restore();
      history.mock.restore();
      handler.mock.restore();
      record.mock.restore();
    }
  });
});

describe('P0-2 Google Sheets erasure covers every mapped store', { concurrency: false }, () => {
  const A = { userId: 'usr_A', webId: 'webA', tg: '111', chat: '111', line: 'UA', phone: '972500000001' };
  const B = { userId: 'usr_B', webId: 'webB', tg: '222', chat: '222', line: 'UB', phone: '972500000002' };
  let sheets;

  function fakeSheets() {
    const row = (p, extra = []) => extra;
    return {
      UserProfiles: [['userId', 'channel', 'channelUserId', 'fullName', 'telegramUserId', 'telegramChatId', 'lineUserId', 'whatsappPhone'],
        [A.userId, 'web', A.webId, 'Ada', A.tg, A.chat, A.line, A.phone], [B.userId, 'web', B.webId, 'Bo', B.tg, B.chat, B.line, B.phone]],
      ConversationHistory: [['conversationId', 'userId', 'channel', 'question'], ['c1', A.userId, 'web', 'Ada q'], ['c2', B.userId, 'web', 'Bo q'], ['c3', A.tg, 'telegram', 'legacy raw id row']],
      UserTasks: [['taskId', 'userId', 'title'], ['t1', A.userId, 'Ada task'], ['t2', B.userId, 'Bo task']],
      UserTaskHistory: [['eventId', 'taskId', 'userId'], ['e1', 't1', A.userId], ['e2', 't2', B.userId]],
      UserDocuments: [['documentId', 'userId', 'fileName'], ['d1', A.userId, 'ada-passport.pdf'], ['d2', B.userId, 'bo.pdf']],
      UserDocumentHistory: [['historyId', 'documentId', 'userId'], ['h1', 'd1', A.userId]],
      UserNotifications: [['notificationId', 'userId', 'title'], ['n1', A.userId, 'Ada n'], ['n2', B.userId, 'Bo n']],
      UserSubmittedTransferQuotes: [['storedQuoteId', 'userId', 'sendAmount'], ['q1', A.userId, '100'], ['q2', B.userId, '200']],
      CommunityComments: [['commentId', 'postId', 'userId', 'userName', 'body'], ['cc1', 'p1', A.userId, 'Ada', 'hi'], ['cc2', 'p1', B.userId, 'Bo', 'yo']],
      HumanFollowUps: [['followUpId', 'userId', 'question'], ['f1', A.userId, 'Ada help']],
      AdminNotes: [['noteId', 'userId', 'note'], ['an1', A.userId, 'about Ada']],
      TelegramLinkCodes: [['linkCodeId', 'userId', 'codeHash', 'telegramUserId'], ['l1', A.userId, 'h', A.tg]],
      TelegramLinkHistory: [['historyId', 'userId', 'telegramUserId'], ['lh1', '', A.tg], ['lh2', '', B.tg]],
      TelegramDeliveries: [['deliveryId', 'userId', 'telegramChatId', 'text'], ['td1', '', A.chat, 'to Ada'], ['td2', '', B.chat, 'to Bo']],
      ChannelLinkCodes: [['linkCodeId', 'userId', 'channel', 'channelUserId'], ['cl1', '', 'line', A.line], ['cl2', '', 'line', B.line]],
      ChannelLinkHistory: [['historyId', 'userId', 'channel', 'channelUserId'], ['ch1', '', 'line', A.line]],
      LineDeliveries: [['deliveryId', 'userId', 'lineUserId'], ['ld1', '', A.line], ['ld2', '', B.line]],
      LineDeliveryHistory: [['historyId', 'deliveryId', 'userId'], ['ldh1', 'ld1', A.userId]],
      WhatsAppDeliveries: [['deliveryId', 'userId', 'whatsappPhone'], ['wd1', '', A.phone], ['wd2', '', B.phone]],
      WhatsAppDeliveryHistory: [['historyId', 'deliveryId', 'userId'], ['wdh1', 'wd1', A.userId]],
      Jobs: [['jobId', 'title', 'employerName'], ['j1', 'Farm work', 'Employer']],
    };
  }

  beforeEach(() => {
    sheets = fakeSheets();
    erasure.setSheetsAdapterForTests({
      configured: () => true,
      sheetNames: () => Object.keys(sheets),
      readSheetRows: async (name) => sheets[name].map((r) => [...r]),
      updateSheetRow: async (name, rowNumber, row) => { sheets[name][rowNumber - 1] = row; },
    });
  });

  after(() => erasure.setSheetsAdapterForTests(null));

  function remaining(person) {
    const values = [person.userId, person.tg, person.line, person.phone, person.webId];
    return Object.entries(sheets).flatMap(([name, rows]) => rows.slice(1).filter((r) => r.some((cell) => values.includes(cell))).map(() => name));
  }

  test('erasing A blanks every A row in every personal sheet and leaves B and catalogs intact', async () => {
    const subject = erasure.buildSubject({ userId: A.userId, channel: 'web', channelUserId: A.webId, telegramUserId: A.tg, telegramChatId: A.chat, lineUserId: A.line, whatsappPhone: A.phone }, { channel: 'web', channelUserId: A.webId });
    const before = remaining(B).length;
    const result = await erasure.eraseSubject(subject);
    assert.deepEqual(result.failedSheets, []);
    assert.deepEqual(remaining(A), [], 'no A row left anywhere');
    assert.equal(remaining(B).length, before, 'B rows untouched');
    assert.equal(sheets.Jobs[1][1], 'Farm work');
    assert.equal(JSON.stringify(sheets).includes('ada-passport.pdf'), false);
    assert.equal(JSON.stringify(sheets).includes('legacy raw id row'), false);
    const again = await erasure.eraseSubject(subject);
    assert.equal(Object.values(again.sheets).reduce((s, n) => s + n, 0), 0, 'repeat erase is a no-op');
  });

  test('export of A contains A rows only', async () => {
    const subject = erasure.buildSubject({ userId: A.userId, channel: 'web', channelUserId: A.webId, telegramUserId: A.tg, lineUserId: A.line, whatsappPhone: A.phone });
    const data = await erasure.exportSubject(subject);
    const text = JSON.stringify(data.sheets);
    assert.ok(text.includes('Ada task'));
    for (const value of ['Bo', B.userId, B.tg, B.line, B.phone]) assert.equal(text.includes(`"${value}"`), false, value);
  });

  test('a read failure is reported as incomplete, never as complete deletion', async () => {
    erasure.setSheetsAdapterForTests({
      configured: () => true,
      sheetNames: () => ['UserTasks', 'Broken'],
      readSheetRows: async (name) => { if (name === 'Broken') throw new Error('down'); return sheets[name]; },
      updateSheetRow: async (name, rowNumber, row) => { sheets[name][rowNumber - 1] = row; },
    });
    const result = await erasure.eraseSubject(erasure.buildSubject({ userId: A.userId }));
    assert.deepEqual(result.failedSheets, ['Broken']);
  });
});
