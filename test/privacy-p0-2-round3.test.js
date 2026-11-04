// P0-2 review round 3: consent removal must not swallow Sheets errors, and a
// deletion_pending block that cannot be saved or read must fail closed.
process.env.GRINGO_PRIVACY_CONSENT_GATE = 'on';

const { describe, test, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const path = require('path');
const { execFileSync } = require('child_process');

const app = require('../src/app');
const { env } = require('../src/config/env');
const googleSheets = require('../src/config/googleSheets');
const { COOKIE_NAME } = require('../src/shared/webIdentity');
const { resetRateLimitsForTests } = require('../src/shared/rateLimit');
const privacyService = require('../src/modules/privacy/privacy.service');
const privacyStore = require('../src/modules/privacy/privacy-store');
const privacyNotice = require('../src/modules/privacy/privacy-notice');
const privacyGuard = require('../src/modules/privacy/privacy-guard');
const erasure = require('../src/modules/privacy/privacy-erasure.service');
const crmAgentRepository = require('../src/modules/crm-agent/crm-agent.repository');
const { handleChannelPrivacy } = require('../src/modules/privacy/privacy-channel');

const CONSENTS = env.googleSheets.sheets.privacyConsents;
const LANGS = ['en', 'he', 'th'];
const savedSheetsEnv = { ...env.googleSheets };
let server;
let base;
let sheet;

// In-memory Google Sheets with switchable failures.
function useFakeSheets() {
  sheet = { rows: { [CONSENTS]: [privacyStore.CONSENT_FIELDS] }, failRead: false, failPendingWrite: false, failBlankWrite: false };
  const writeGuard = (row) => {
    if (sheet.failPendingWrite && row.includes('deletion_pending')) throw new Error('quota');
    if (sheet.failBlankWrite && row.every((cell) => cell === '')) throw new Error('quota');
  };
  mock.method(googleSheets, 'readSheetRows', async (name) => {
    if (sheet.failRead && name === CONSENTS) throw new Error('sheets unavailable');
    return (sheet.rows[name] || []).map((row) => [...row]);
  });
  mock.method(googleSheets, 'ensureSheetWithHeader', async (name, header) => { if (!sheet.rows[name]) sheet.rows[name] = [header]; });
  mock.method(googleSheets, 'appendSheetRow', async (name, row) => { writeGuard(row); (sheet.rows[name] = sheet.rows[name] || []).push(row); });
  mock.method(googleSheets, 'updateSheetRow', async (name, rowNumber, row) => { writeGuard(row); sheet.rows[name][rowNumber - 1] = row; });
  // Profile lookups are not under test here: no profile rows exist.
  for (const name of Object.keys(crmAgentRepository).filter((n) => n.startsWith('findUserProfileRecord'))) {
    if (typeof crmAgentRepository[name] === 'function') mock.method(crmAgentRepository, name, async () => null);
  }
  mock.method(googleSheets, 'createGoogleSheetsClient', () => { throw new Error('no real Sheets in tests'); });
  Object.assign(env.googleSheets, { spreadsheetId: 'test-sheet', clientEmail: 'test@example.invalid', privateKey: 'test-key' });
}

// Erasure scan over one personal sheet holding the subject's row.
function fakePersonalSheet(value) {
  const sheets = { UserTasks: [['taskId', 'userId'], ['t1', value]] };
  erasure.setSheetsAdapterForTests({
    configured: () => true,
    sheetNames: () => Object.keys(sheets),
    readSheetRows: async (name) => sheets[name].map((row) => [...row]),
    updateSheetRow: async (name, rowNumber, row) => { sheets[name][rowNumber - 1] = row; },
  });
  return sheets;
}

function consentRow(key, status) {
  return [key, 'line', status, privacyNotice.PRIVACY_NOTICE_VERSION, '', '', new Date().toISOString()];
}

function lineId() {
  return `U${crypto.randomBytes(8).toString('hex')}`;
}

function bannedTexts(language) {
  return [
    privacyNotice.reply(language, 'deleteDone'),
    privacyNotice.reply(language, 'deletePartial'),
    privacyNotice.reply(language, 'deletePending'),
  ];
}

async function channelConfirm(id, language) {
  const asked = await handleChannelPrivacy('line', { channelUserId: id, messageText: 'delete my data', languageCode: language });
  const code = (asked.reply.match(/\b\d{6}\b/) || [])[0];
  assert.ok(code, 'confirmation code issued');
  return handleChannelPrivacy('line', { channelUserId: id, messageText: `delete my data ${code}`, languageCode: language });
}

describe('P0-2 review round 3', { concurrency: false }, () => {
  before(async () => {
    server = app.listen(0, '127.0.0.1');
    if (!server.listening) await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  });

  beforeEach(() => {
    resetRateLimitsForTests();
    privacyService.resetForTests();
    erasure.setSheetsAdapterForTests(null);
    mock.restoreAll();
    Object.assign(env.googleSheets, savedSheetsEnv);
    useFakeSheets();
  });

  after(() => {
    mock.restoreAll();
    erasure.setSheetsAdapterForTests(null);
    Object.assign(env.googleSheets, savedSheetsEnv);
  });

  describe('1: removeConsents', () => {
    test('a Sheets read error is thrown, not treated as "no consent rows"', async () => {
      const key = privacyStore.subjectKey('line', lineId());
      sheet.rows[CONSENTS].push(consentRow(key, 'accepted'));
      sheet.failRead = true;
      await assert.rejects(() => privacyStore.removeConsents([key]), /sheets unavailable/);
    });

    test('a failed blank write is counted as failed, not removed', async () => {
      const key = privacyStore.subjectKey('line', lineId());
      sheet.rows[CONSENTS].push(consentRow(key, 'accepted'));
      sheet.failBlankWrite = true;
      assert.deepEqual(await privacyStore.removeConsents([key]), { removed: 0, failed: 1 });
      sheet.failBlankWrite = false;
      assert.deepEqual(await privacyStore.removeConsents([key]), { removed: 1, failed: 0 });
    });

    for (const [name, setup] of [
      ['read failure', () => mock.method(privacyStore, 'removeConsents', async () => { throw new Error('sheets unavailable'); })],
      ['write failure', () => { sheet.failBlankWrite = true; }],
    ]) {
      test(`consent cleanup ${name} => deletion is partial, never complete; the user stays blocked`, async () => {
        const id = lineId();
        await privacyService.acceptConsent({ channel: 'line', channelUserId: id }, 'en');
        const personal = fakePersonalSheet(id);
        setup();
        const outcome = await privacyService.confirmDeletion({ channel: 'line', channelUserId: id }, privacyService.requestDeletion({ channel: 'line', channelUserId: id }).confirmationCode);
        assert.equal(outcome.status, 'partial');
        assert.equal(outcome.complete, false);
        assert.equal(outcome.deleted, false);
        assert.ok(outcome.failedSheets.includes(CONSENTS));
        assert.equal(personal.UserTasks[1].includes(id), false, 'the personal data itself was erased');
        assert.equal(await privacyService.allowsPersonalProcessing({ channel: 'line', channelUserId: id }), false);
      });
    }

    test('channel reply after a consent cleanup failure is the partial reply, not full success', async () => {
      for (const language of LANGS) {
        const id = lineId();
        await privacyService.acceptConsent({ channel: 'line', channelUserId: id }, language);
        fakePersonalSheet(id);
        sheet.failBlankWrite = true;
        const reply = await channelConfirm(id, language);
        sheet.failBlankWrite = false;
        assert.equal(reply.status, 'PRIVACY_DELETE_PARTIAL', language);
        assert.equal(reply.reply.includes(privacyNotice.reply(language, 'deleteDone')), false);
      }
    });
  });

  describe('2: deletion_pending must be durable before anything is deleted', () => {
    test('pending-save failure: nothing is deleted and no block or success is claimed (service)', async () => {
      const id = lineId();
      const identity = { channel: 'line', channelUserId: id };
      await privacyService.acceptConsent(identity, 'en');
      const personal = fakePersonalSheet(id);
      sheet.failPendingWrite = true;
      const outcome = await privacyService.confirmDeletion(identity, privacyService.requestDeletion(identity).confirmationCode);
      assert.equal(outcome.ok, false);
      assert.equal(outcome.status, 'not_started');
      assert.equal(outcome.code, 'DELETION_NOT_STARTED');
      assert.equal(outcome.deleted, false);
      assert.ok(personal.UserTasks[1].includes(id), 'no half-deleted user without a durable block');
    });

    test('pending-save failure: API answers 503 not_started with no block or success claim', async () => {
      const started = await fetch(`${base}/api/privacy/status`);
      const cookie = started.headers.getSetCookie().find((value) => value.startsWith(`${COOKIE_NAME}=`)).split(';')[0];
      await started.text();
      const headers = { 'content-type': 'application/json', cookie, origin: base };
      const post = async (p, payload) => {
        const response = await fetch(`${base}${p}`, { method: 'POST', headers, body: JSON.stringify(payload) });
        return { status: response.status, body: await response.json() };
      };
      assert.equal((await post('/api/privacy/consent', { accept: true, consentVersion: privacyNotice.PRIVACY_NOTICE_VERSION })).status, 200);
      fakePersonalSheet('nobody');
      sheet.failPendingWrite = true;
      for (const language of LANGS) {
        const requested = await post('/api/privacy/delete-request', {});
        const answer = await post('/api/privacy/delete', { confirm: true, confirmationCode: requested.body.confirmationCode, language });
        assert.equal(answer.status, 503);
        assert.equal(answer.body.status, 'not_started');
        assert.equal(answer.body.deleted, false);
        assert.equal(answer.body.complete, false);
        assert.equal(answer.body.error.code, 'DELETION_NOT_STARTED');
        assert.equal(answer.body.error.message, privacyNotice.reply(language, 'deleteNotStarted'));
        const text = JSON.stringify(answer.body);
        for (const banned of bannedTexts(language)) assert.equal(text.includes(banned), false);
      }
    });

    test('pending-save failure: channel reply is "not started" in en/he/th', async () => {
      for (const language of LANGS) {
        const id = lineId();
        await privacyService.acceptConsent({ channel: 'line', channelUserId: id }, language);
        fakePersonalSheet(id);
        sheet.failPendingWrite = true;
        const reply = await channelConfirm(id, language);
        sheet.failPendingWrite = false;
        assert.equal(reply.status, 'PRIVACY_DELETE_NOT_STARTED', language);
        assert.equal(reply.reply, privacyNotice.reply(language, 'deleteNotStarted'));
        for (const banned of bannedTexts(language)) assert.equal(reply.reply.includes(banned), false);
      }
    });

    test('pending-read failure fails closed: guard, channel and web refuse personal processing', async () => {
      const id = lineId();
      await privacyService.acceptConsent({ channel: 'line', channelUserId: id }, 'en');
      sheet.failRead = true;
      await assert.rejects(() => privacyService.allowsPersonalProcessing({ channel: 'line', channelUserId: id }));
      assert.equal(await privacyGuard.identityAllowed('line', id), false);
      for (const language of LANGS) {
        const reply = await handleChannelPrivacy('line', { channelUserId: id, messageText: 'hello', languageCode: language });
        assert.ok(reply, 'message is not passed on to normal processing');
        assert.equal(reply.status, 'PRIVACY_UNAVAILABLE');
        assert.equal(reply.reply, privacyNotice.reply(language, 'privacyUnavailable'));
        for (const banned of bannedTexts(language)) assert.equal(reply.reply.includes(banned), false);
      }
      const response = await fetch(`${base}/api/chat/profile`, { method: 'PUT', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify({ fullName: 'X' }) });
      await response.text();
      assert.notEqual(response.status, 200);
    });

    test('pending block is written before erasure starts', async () => {
      const id = lineId();
      const identity = { channel: 'line', channelUserId: id };
      await privacyService.acceptConsent(identity, 'en');
      const key = privacyStore.subjectKey('line', id);
      let statusDuringErase = '';
      erasure.setSheetsAdapterForTests({
        configured: () => true,
        sheetNames: () => ['UserTasks'],
        readSheetRows: async () => {
          const row = sheet.rows[CONSENTS].find((r) => r[0] === key);
          statusDuringErase = row ? row[2] : 'missing';
          return [['taskId', 'userId'], ['t1', id]];
        },
        updateSheetRow: async () => {},
      });
      const outcome = await privacyService.confirmDeletion(identity, privacyService.requestDeletion(identity).confirmationCode);
      assert.equal(statusDuringErase, 'deletion_pending');
      assert.equal(outcome.status, 'complete');
    });

    test('restart simulation: a fresh process reads the pending block from the sheet and refuses processing', () => {
      const id = lineId();
      const script = `
        const googleSheets = require(${JSON.stringify(path.join(__dirname, '../src/config/googleSheets'))});
        const { env } = require(${JSON.stringify(path.join(__dirname, '../src/config/env'))});
        Object.assign(env.googleSheets, { spreadsheetId: 's', clientEmail: 'c@example.invalid', privateKey: 'k' });
        const store = require(${JSON.stringify(path.join(__dirname, '../src/modules/privacy/privacy-store'))});
        const rows = [store.CONSENT_FIELDS, [store.subjectKey('line', ${JSON.stringify(id)}), 'line', 'deletion_pending', 'v', '', '', '']];
        const mode = process.argv[1];
        googleSheets.readSheetRows = async (name) => {
          if (mode === 'readFails') throw new Error('sheets unavailable');
          return name === env.googleSheets.sheets.privacyConsents ? rows.map((r) => [...r]) : [];
        };
        googleSheets.ensureSheetWithHeader = async () => {};
        googleSheets.appendSheetRow = async () => {};
        googleSheets.updateSheetRow = async () => {};
        const guard = require(${JSON.stringify(path.join(__dirname, '../src/modules/privacy/privacy-guard'))});
        const { handleChannelPrivacy } = require(${JSON.stringify(path.join(__dirname, '../src/modules/privacy/privacy-channel'))});
        (async () => {
          const allowed = await guard.identityAllowed('line', ${JSON.stringify(id)});
          const reply = await handleChannelPrivacy('line', { channelUserId: ${JSON.stringify(id)}, messageText: 'privacy', languageCode: 'en' });
          process.stdout.write(JSON.stringify({ allowed, status: reply && reply.status }));
        })();
      `;
      const run = (mode) => JSON.parse(execFileSync(process.execPath, ['--require', path.join(__dirname, '../scripts/configure-test-env.cjs'), '-e', script, mode], {
        env: { ...process.env, GRINGO_PRIVACY_CONSENT_GATE: 'off' },
      }).toString());
      const pending = run('readable');
      assert.equal(pending.allowed, false, 'pending block from the sheet survives restart, even with the gate off');
      assert.equal(pending.status, 'PRIVACY_NOTICE');
      const unreadable = run('readFails');
      assert.equal(unreadable.allowed, false, 'unreadable state fails closed after restart');
      assert.equal(unreadable.status, 'PRIVACY_UNAVAILABLE');
    });
  });
});
