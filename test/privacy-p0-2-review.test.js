// P0-2 review fixes: partial deletion, pending deletion state and retry,
// channel data summary vs full export, consent on every personal write path,
// and AI prompt minimization.
process.env.GRINGO_PRIVACY_CONSENT_GATE = 'on';
const TEST_ADMIN_API_KEY = 'test-only-admin-key-p02-0123456789abcdef';
process.env.ADMIN_API_KEY = TEST_ADMIN_API_KEY;

const { describe, test, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const app = require('../src/app');
const { env } = require('../src/config/env');
const googleSheets = require('../src/config/googleSheets');
const { COOKIE_NAME, openWebSession } = require('../src/shared/webIdentity');
const { resetRateLimitsForTests } = require('../src/shared/rateLimit');
const crmAgentRepository = require('../src/modules/crm-agent/crm-agent.repository');
const { crmAgentService } = require('../src/modules/crm-agent');
const { communicationService } = require('../src/modules/communication');
const privacyService = require('../src/modules/privacy/privacy.service');
const privacyStore = require('../src/modules/privacy/privacy-store');
const privacyNotice = require('../src/modules/privacy/privacy-notice');
const erasure = require('../src/modules/privacy/privacy-erasure.service');
const { handleChannelPrivacy } = require('../src/modules/privacy/privacy-channel');
const notificationService = require('../src/modules/notifications/notification.service');
const taskService = require('../src/modules/tasks/task.service');
const documentService = require('../src/modules/documents/document.service');
const communityService = require('../src/modules/community/community.service');
const telegramLinkService = require('../src/modules/telegram/telegram-link.service');
const lineLinkService = require('../src/modules/line/line-link.service');
const telegramDeliveryService = require('../src/modules/telegram/telegram-delivery.service');
const whatsappDeliveryService = require('../src/modules/whatsapp/whatsapp-delivery.service');
const lineDeliveryService = require('../src/modules/line/line-delivery.service');
const { buildUserPrompt, PROMPT_OMITTED_PROFILE_FIELDS } = require('../src/modules/ai-provider/gringo-prompt.service');

let server;
let base;

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
  const header = started.headers.getSetCookie().find((value) => value.startsWith(`${COOKIE_NAME}=`));
  const cookie = decodeURIComponent(header.split(';')[0].slice(COOKIE_NAME.length + 1));
  await body(started);
  const opened = openWebSession(cookie, [env.webSessionSecret, env.webSessionSecretPrevious].filter(Boolean));
  return { cookie, webId: opened.webId };
}

function headers(session) {
  return { 'content-type': 'application/json', cookie: `${COOKIE_NAME}=${encodeURIComponent(session.cookie)}`, origin: base };
}

async function call(method, path, session, payload) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: session ? headers(session) : { 'content-type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(payload || {}),
  });
  return { status: response.status, body: await body(response) };
}

async function consentedSession(fullName) {
  const session = await newSession();
  const accepted = await call('POST', '/api/privacy/consent', session, { accept: true, consentVersion: privacyNotice.PRIVACY_NOTICE_VERSION });
  assert.equal(accepted.status, 200);
  const saved = await call('PUT', '/api/chat/profile', session, { fullName, city: 'Haifa' });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  session.userId = saved.body.profile.userId;
  return session;
}

async function confirmDelete(session) {
  const requested = await call('POST', '/api/privacy/delete-request', session, {});
  return call('POST', '/api/privacy/delete', session, { confirm: true, confirmationCode: requested.body.confirmationCode });
}

// A fake Google Sheets backend for the erasure scan. failing holds the sheet
// names whose row writes fail.
function fakeSheets(rowsBySheet) {
  const sheets = rowsBySheet;
  const failing = new Set();
  erasure.setSheetsAdapterForTests({
    configured: () => true,
    sheetNames: () => Object.keys(sheets),
    readSheetRows: async (name) => sheets[name].map((row) => [...row]),
    updateSheetRow: async (name, rowNumber, row) => {
      if (failing.has(name)) throw new Error('quota');
      sheets[name][rowNumber - 1] = row;
    },
  });
  return { sheets, failing };
}

function sheetHas(sheets, value) {
  return Object.values(sheets).some((rows) => rows.slice(1).some((row) => row.includes(value)));
}

describe('P0-2 review fixes', { concurrency: false }, () => {
  before(async () => {
    server = app.listen(0, '127.0.0.1');
    if (!server.listening) await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    erasure.setSheetsAdapterForTests(null);
    mock.restoreAll();
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  });

  beforeEach(() => {
    resetRateLimitsForTests();
    privacyService.resetForTests();
    erasure.setSheetsAdapterForTests(null);
  });

  describe('1 + 2: partial deletion, pending state and retry', () => {
    test('web: a failed store gives 202 partial, never full success; the user stays blocked; retry finishes it', async () => {
      const ada = await consentedSession('Ada Partial');
      const bo = await consentedSession('Bo Untouched');
      const { sheets, failing } = fakeSheets({
        UserTasks: [['taskId', 'userId', 'title'], ['t1', ada.userId, 'Ada task'], ['t2', bo.userId, 'Bo task']],
        UserProfiles: [['userId', 'channel', 'channelUserId', 'fullName'], [ada.userId, 'web', ada.webId, 'Ada Partial'], [bo.userId, 'web', bo.webId, 'Bo Untouched']],
        UserNotifications: [['notificationId', 'userId'], ['n1', ada.userId]],
      });
      failing.add('UserTasks');

      const partial = await confirmDelete(ada);
      assert.equal(partial.status, 202);
      assert.equal(partial.body.status, 'partial');
      assert.equal(partial.body.complete, false);
      assert.equal(partial.body.deleted, false);
      assert.equal(partial.body.retryAvailable, true);
      assert.equal(partial.body.message, privacyNotice.REPLIES.en.deletePartial);
      assert.notEqual(partial.body.message, privacyNotice.REPLIES.en.deleteDone);
      assert.ok(sheetHas(sheets, 'Ada task'), 'failed sheet still holds the row');
      assert.equal(sheetHas(sheets, 'n1'), false, 'other sheets were erased');
      assert.ok(sheetHas(sheets, ada.webId), 'profile row is kept so the retry can find the rest');

      const status = await call('GET', '/api/privacy/status', ada);
      assert.equal(status.body.deletionPending, true);
      assert.equal(status.body.accepted, false);

      // Blocked even though consent existed before.
      assert.equal((await call('PUT', '/api/chat/profile', ada, { city: 'Eilat' })).status, 403);
      assert.equal((await call('POST', '/api/chat/message', ada, { message: 'hello' })).status, 403);
      assert.equal(await privacyService.allowsProcessingForUser(ada.userId), false);
      assert.equal(await notificationService.createNotification({ type: 'System', title: 'x', message: 'y' }, { ownerUserId: ada.userId }), null);
      // A new consent cannot reopen processing while the deletion is unfinished.
      await call('POST', '/api/privacy/consent', ada, { accept: true, consentVersion: privacyNotice.PRIVACY_NOTICE_VERSION });
      assert.equal((await call('GET', '/api/privacy/status', ada)).body.deletionPending, true);

      const audit = privacyStore.localAuditEntries().filter((entry) => entry.event === 'delete' && entry.outcome === 'partial');
      assert.equal(audit.length, 1);
      assert.match(audit[0].detail, /pending=UserTasks\|UserProfiles/);
      assert.equal(JSON.stringify(audit).includes(ada.userId), false);
      assert.equal(JSON.stringify(audit).includes('Ada'), false);

      // State survives a restart of the in-memory code store.
      privacyService.resetForTests();
      assert.equal((await call('GET', '/api/privacy/status', ada)).body.deletionPending, true);

      // Retry while the store still fails: still partial, still blocked.
      const stillPartial = await call('POST', '/api/privacy/delete-retry', ada, {});
      assert.equal(stillPartial.status, 202);
      assert.equal(stillPartial.body.status, 'partial');

      failing.clear();
      const done = await call('POST', '/api/privacy/delete-retry', ada, {});
      assert.equal(done.status, 200, JSON.stringify(done.body));
      assert.equal(done.body.status, 'complete');
      assert.equal(done.body.complete, true);
      assert.equal(sheetHas(sheets, ada.userId), false);
      assert.equal(sheetHas(sheets, ada.webId), false);
      assert.ok(sheetHas(sheets, 'Bo task') && sheetHas(sheets, bo.webId), 'B untouched');
      assert.ok(privacyStore.localAuditEntries().some((entry) => entry.event === 'delete_retry' && entry.outcome === 'ok'));

      const after = await call('GET', '/api/privacy/status', ada);
      assert.equal(after.body.deletionPending, false);
      assert.equal((await call('POST', '/api/privacy/delete-retry', ada, {})).status, 409, 'nothing left to retry');
      assert.equal((await call('POST', '/api/privacy/delete-retry', bo, {})).status, 409, 'another user cannot retry or see it');
    });

    test('retry is scoped to the verified identity; a cross-site retry is rejected', async () => {
      const ada = await consentedSession('Ada Scope');
      const { failing } = fakeSheets({ UserTasks: [['taskId', 'userId'], ['t1', ada.userId]], UserProfiles: [['userId', 'channel', 'channelUserId'], [ada.userId, 'web', ada.webId]] });
      failing.add('UserTasks');
      assert.equal((await confirmDelete(ada)).body.status, 'partial');
      const evil = await fetch(`${base}/api/privacy/delete-retry`, { method: 'POST', headers: { ...headers(ada), origin: 'https://evil.example' }, body: '{}' });
      assert.equal(evil.status, 403);
      const anonymous = await newSession();
      assert.equal((await call('POST', '/api/privacy/delete-retry', anonymous, {})).status, 409);
    });

    test('pending state is saved in the PrivacyConsents sheet, so it survives a restart', async () => {
      const saved = { ...env.googleSheets };
      const rows = { [env.googleSheets.sheets.privacyConsents]: [] };
      mock.method(googleSheets, 'readSheetRows', async (name) => (rows[name] || []).map((row) => [...row]));
      mock.method(googleSheets, 'ensureSheetWithHeader', async (name, header) => { rows[name] = [header]; });
      mock.method(googleSheets, 'appendSheetRow', async (name, row) => { rows[name].push(row); });
      mock.method(googleSheets, 'updateSheetRow', async (name, rowNumber, row) => { rows[name][rowNumber - 1] = row; });
      try {
        Object.assign(env.googleSheets, { spreadsheetId: 'test-sheet', clientEmail: 'test@example.invalid', privateKey: 'test-key' });
        const key = privacyStore.subjectKey('line', 'Upending');
        await privacyStore.saveConsent({ subjectKey: key, channel: 'line', status: 'deletion_pending', consentVersion: privacyNotice.PRIVACY_NOTICE_VERSION, language: '', acceptedAt: '', updatedAt: new Date().toISOString() });
        const sheetRows = rows[env.googleSheets.sheets.privacyConsents];
        assert.equal(sheetRows.length, 2);
        assert.equal(sheetRows[1].includes('Upending'), false, 'only the keyed hash is stored');
        privacyService.resetForTests();
        const status = await privacyService.getStatus({ channel: 'line', channelUserId: 'Upending' });
        assert.equal(status.deletionPending, true);
        assert.equal(await privacyService.allowsPersonalProcessing({ channel: 'line', channelUserId: 'Upending' }), false);
      } finally {
        Object.assign(env.googleSheets, saved);
        mock.restoreAll();
      }
    });

    test('LINE and WhatsApp: partial reply in th/he/en, any next message retries; full success only when complete', async () => {
      for (const [channel, language, text] of [['line', 'th', 'สวัสดี'], ['whatsapp', 'he', 'שלום'], ['line', 'en', 'hello']]) {
        const id = channel === 'line' ? `U${crypto.randomBytes(8).toString('hex')}` : `1555${crypto.randomInt(1000000, 9999999)}`;
        await handleChannelPrivacy(channel, { channelUserId: id, messageText: privacyNotice.NOTICES[language].accept, languageCode: language });
        const userId = `usr_${id}`;
        const profile = channel === 'line'
          ? { userId, channel, channelUserId: id, lineUserId: id, fullName: 'Channel Person' }
          : { userId, channel, channelUserId: id, whatsappPhone: id, fullName: 'Channel Person' };
        await crmAgentRepository.createUserProfile(profile);
        const { failing } = fakeSheets({ UserTasks: [['taskId', 'userId'], ['t1', userId]], UserProfiles: [['userId', 'channel', 'channelUserId'], [userId, channel, id]] });
        failing.add('UserTasks');
        const asked = await handleChannelPrivacy(channel, { channelUserId: id, messageText: 'delete my data', languageCode: language });
        const code = asked.reply.match(/(\d{6})/)[1];
        const partial = await handleChannelPrivacy(channel, { channelUserId: id, messageText: `delete my data ${code}`, languageCode: language });
        assert.equal(partial.status, 'PRIVACY_DELETE_PARTIAL');
        assert.ok(partial.reply.startsWith(privacyNotice.REPLIES[language].deletePartial), `${channel}/${language}`);
        assert.equal(partial.reply.includes(privacyNotice.REPLIES[language].deleteDone), false);

        const blocked = await handleChannelPrivacy(channel, { channelUserId: id, messageText: text, languageCode: language });
        assert.equal(blocked.status, 'PRIVACY_DELETE_PARTIAL', 'still pending: message is not processed');
        assert.equal(await handleChannelPrivacy(channel, { channelUserId: id, messageText: 'accept', languageCode: language }).then((r) => r.status), 'PRIVACY_DELETE_PARTIAL');

        failing.clear();
        const done = await handleChannelPrivacy(channel, { channelUserId: id, messageText: text, languageCode: language });
        assert.equal(done.status, 'PRIVACY_DELETED');
        assert.ok(done.reply.startsWith(privacyNotice.REPLIES[language].deleteDone));
        const next = await handleChannelPrivacy(channel, { channelUserId: id, messageText: text, languageCode: language });
        assert.equal(next.status, 'PRIVACY_CONSENT_REQUIRED', 'after deletion, a new consent is needed');
      }
    });

    test('admin retry finishes pending deletions and returns counts only', async () => {
      const id = `U${crypto.randomBytes(8).toString('hex')}`;
      await handleChannelPrivacy('line', { channelUserId: id, messageText: 'accept' });
      await crmAgentRepository.createUserProfile({ userId: `usr_${id}`, channel: 'line', channelUserId: id, lineUserId: id, fullName: 'Admin Retry' });
      const { sheets, failing } = fakeSheets({ UserTasks: [['taskId', 'userId'], ['t1', `usr_${id}`]] });
      failing.add('UserTasks');
      const code = (await handleChannelPrivacy('line', { channelUserId: id, messageText: 'delete my data' })).reply.match(/(\d{6})/)[1];
      assert.equal((await handleChannelPrivacy('line', { channelUserId: id, messageText: `delete my data ${code}` })).status, 'PRIVACY_DELETE_PARTIAL');
      failing.clear();
      const noKey = await fetch(`${base}/api/admin/privacy/retry-deletions`, { method: 'POST' });
      assert.equal(noKey.status, 401);
      const response = await fetch(`${base}/api/admin/privacy/retry-deletions`, { method: 'POST', headers: { 'x-admin-api-key': TEST_ADMIN_API_KEY } });
      const result = await body(response);
      assert.equal(response.status, 200);
      assert.ok(result.attempted >= 1);
      assert.ok(result.completed >= 1);
      assert.equal(JSON.stringify(result).includes(id), false);
      assert.equal(sheetHas(sheets, `usr_${id}`), false);
      assert.equal((await privacyService.getStatus({ channel: 'line', channelUserId: id })).deletionPending, false);
    });
  });

  describe('3: channel data summary vs full export', () => {
    test('messaging channels get a labelled summary with a pointer to the full export; web export is labelled full', async () => {
      for (const language of ['en', 'he', 'th']) {
        const id = `U${crypto.randomBytes(8).toString('hex')}`;
        await handleChannelPrivacy('line', { channelUserId: id, messageText: 'accept', languageCode: language });
        await crmAgentRepository.createUserProfile({ userId: `usr_${id}`, channel: 'line', channelUserId: id, lineUserId: id, fullName: 'Summary Person' });
        const summary = await handleChannelPrivacy('line', { channelUserId: id, messageText: 'my data', languageCode: language });
        assert.equal(summary.status, 'PRIVACY_DATA_SUMMARY');
        assert.ok(summary.reply.startsWith(privacyNotice.REPLIES[language].exportTitle));
        assert.ok(summary.reply.includes(privacyNotice.REPLIES[language].exportFullHint));
      }
      assert.match(privacyNotice.REPLIES.en.exportTitle, /not a full export/);
      assert.match(privacyNotice.REPLIES.he.exportTitle, /לא ייצוא מלא/);
      assert.match(privacyNotice.REPLIES.th.exportTitle, /ไม่ใช่การส่งออกข้อมูลทั้งหมด/);
      const session = await consentedSession('Full Export');
      const exported = await call('GET', '/api/privacy/export', session);
      assert.equal(exported.body.exportType, 'full_stored_records');
      assert.match(exported.body.scope, /not included/);
    });
  });

  describe('4: every personal write path needs consent', () => {
    async function withdrawnUser() {
      const session = await consentedSession('Withdrawn Writer');
      await call('POST', '/api/privacy/withdraw', session, {});
      return session;
    }

    test('web write routes return 403 without consent; reads stay open', async () => {
      const session = await withdrawnUser();
      const writes = [
        ['POST', '/api/tasks', { title: 'Task', category: 'Personal' }],
        ['PUT', '/api/tasks/t_any', { title: 'x' }],
        ['POST', '/api/tasks/t_any/remind', {}],
        ['POST', '/api/documents', { documentType: 'Passport', title: 'Passport' }],
        ['PUT', '/api/documents/d_any', { title: 'x' }],
        ['POST', '/api/notifications/n_any/read', {}],
        ['POST', '/api/notifications/n_any/remind', {}],
        ['POST', '/api/community/p_any/comments', { body: 'hi' }],
        ['POST', '/api/telegram/link-code', {}],
        ['PUT', '/api/chat/profile', { city: 'Eilat' }],
        ['POST', '/api/chat/message', { message: 'hi' }],
      ];
      for (const [method, path, payload] of writes) {
        const response = await call(method, path, session, payload);
        assert.equal(response.status, 403, `${method} ${path}`);
        assert.equal(response.body.error.code, 'CONSENT_REQUIRED', `${method} ${path}`);
      }
      for (const path of ['/api/tasks', '/api/documents', '/api/notifications', '/api/chat/profile', '/api/privacy/export']) {
        assert.equal((await call('GET', path, session)).status, 200, path);
      }
    });

    test('reads that used to save profile context do not write without consent', async () => {
      const session = await withdrawnUser();
      const before = (await crmAgentService.findUserByChannel('web', session.webId)).updatedAt;
      for (const path of ['/api/jobs/matches', '/api/housing/matches', '/api/services/matches', '/api/community/relevant', '/api/tasks', '/api/documents']) {
        await call('GET', path, session);
      }
      assert.equal((await crmAgentService.findUserByChannel('web', session.webId)).updatedAt, before);
    });

    test('service layer blocks direct calls: profile, conversation, task, document, comment, notification, link codes, admin fan-out', async () => {
      const session = await withdrawnUser();
      const userId = session.userId;
      assert.equal(await crmAgentService.saveConversation({ userId, channel: 'web', question: 'q', answer: 'a', category: 'Other', status: 'OK' }), null);
      assert.equal(crmAgentRepository.localRecordsForUser(userId).conversations.length, 0);
      const unchanged = await crmAgentService.updateUserProfile(userId, { city: 'Eilat' });
      assert.equal(unchanged.city, 'Haifa');
      await assert.rejects(crmAgentService.findOrCreateUser({ channel: 'telegram', channelUserId: '123456789' }), { code: 'CONSENT_REQUIRED' });
      await assert.rejects(taskService.createTask({ title: 'Task', category: 'Personal' }, { ownerUserId: userId }), { code: 'CONSENT_REQUIRED' });
      await assert.rejects(documentService.createDocument({ documentType: 'Passport', title: 'Passport' }, { ownerUserId: userId }), { code: 'CONSENT_REQUIRED' });
      await assert.rejects(communityService.addComment({ postId: 'p1', userId, body: 'hi' }), { code: 'CONSENT_REQUIRED' });
      await assert.rejects(telegramLinkService.createLinkCode(userId), { code: 'CONSENT_REQUIRED' });
      await assert.rejects(lineLinkService.createLinkCode(userId), { code: 'CONSENT_REQUIRED' });
      assert.equal(await notificationService.createNotification({ type: 'System', title: 't', message: 'm' }, { ownerUserId: userId }), null);
      const profile = (await crmAgentService.findUserByChannel('web', session.webId));
      assert.deepEqual(await taskService.createTasksForAudience([profile], { userId, title: 'Admin task', category: 'Personal' }), []);
      assert.deepEqual(await notificationService.createManualNotifications([profile], { type: 'System', title: 'Admin', message: 'm', target: { userId } }), []);
      assert.deepEqual(await taskService.processTaskReminders(userId, profile), []);
      // Raw channel id rows (legacy Telegram error path) are not written either.
      assert.equal(await crmAgentService.saveConversation({ userId: '987654321', channel: 'telegram', question: 'q', answer: 'a', category: 'Other', status: 'ERROR' }), null);
    });

    test('scheduled channel deliveries are refused at queue and at send time', async () => {
      const saved = { telegram: { ...env.telegram }, whatsapp: { ...env.whatsapp }, line: { ...env.line } };
      try {
        Object.assign(env.telegram, { enabled: true });
        Object.assign(env.whatsapp, { enabled: true });
        Object.assign(env.line, { enabled: true });
        const session = await withdrawnUser();
        const record = await crmAgentRepository.findUserProfileRecordByUserId(session.userId);
        await crmAgentRepository.updateUserProfile(record.rowNumber, { ...record.profile, telegramUserId: '5551', telegramChatId: '5551', whatsappPhone: '15550002222', lineUserId: 'Uabc123' });
        const notification = { notificationId: 'n_priv', userId: session.userId, type: 'Job Match', status: 'New', title: 't', message: 'm' };
        for (const service of [telegramDeliveryService, whatsappDeliveryService, lineDeliveryService]) {
          const result = await service.canDeliverNotification(notification);
          assert.equal(result.ok, false);
          assert.equal(result.reason, 'privacy_consent_missing');
        }
      } finally {
        Object.assign(env.telegram, saved.telegram);
        Object.assign(env.whatsapp, saved.whatsapp);
        Object.assign(env.line, saved.line);
      }
    });

    test('positive control: with consent the same service writes work', async () => {
      const session = await consentedSession('Allowed Writer');
      const task = await taskService.createTask({ title: 'Allowed task', category: 'Personal' }, { ownerUserId: session.userId });
      assert.ok(task && task.taskId);
      const saved = await crmAgentService.updateUserProfile(session.userId, { city: 'Eilat' });
      assert.equal(saved.city, 'Eilat');
    });
  });

  describe('5: AI prompt minimization', () => {
    test('names, employer, area, budgets, amounts and contact details are not sent; history is capped', () => {
      const prompt = buildUserPrompt({
        message: 'call me on +972 50-123-4567 or ada@example.com, I can pay 1500',
        userProfile: {
          fullName: 'Somsak Jaidee',
          currentEmployer: 'Kibbutz Alpha Farms',
          preferredHousingArea: 'Rehov Herzl 12',
          maximumHousingBudget: '3200',
          lastMoneyTransferAmount: '4321',
          whatsappPhone: '972501234567',
          lastQuestion: 'secret last question',
          city: 'Haifa',
          workSector: 'Agriculture',
          newUnlistedColumn: 'should not leak',
        },
        recentConversation: Array.from({ length: 6 }, (_, i) => ({ question: `old-q-${i} ${'x'.repeat(500)}`, answer: `a-${i}` })),
      });
      for (const value of ['Somsak', 'Kibbutz Alpha', 'Herzl', '3200', '4321', '972501234567', '50-123-4567', 'ada@example.com', 'secret last question', 'should not leak', 'old-q-0', 'old-q-2']) {
        assert.equal(prompt.includes(value), false, value);
      }
      for (const value of ['Haifa', 'Agriculture', '1500', '[number]', '[email]', 'old-q-5', 'old-q-3']) assert.ok(prompt.includes(value), value);
      assert.equal(prompt.includes('x'.repeat(301)), false, 'history turns are clipped');
      for (const field of ['fullName', 'currentEmployer', 'whatsappPhone']) assert.ok(PROMPT_OMITTED_PROFILE_FIELDS.includes(field));
    });
  });
});
