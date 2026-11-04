// P0-2 round 4: production must not start without durable, writable privacy
// storage, and the check must run before anything serves users.
const { describe, test, mock, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { env } = require('../src/config/env');
const store = require('../src/modules/privacy/privacy-store');
const guard = require('../src/modules/privacy/privacy-guard');
const { verifyPrivacyStorage, PrivacyStorageError } = require('../src/modules/privacy/privacy-storage-check');

const root = path.join(__dirname, '..');
const CONSENTS = env.googleSheets.sheets.privacyConsents;
const AUDIT = env.googleSheets.sheets.privacyAudit;
const savedSheetsEnv = { ...env.googleSheets };
const FAKE_KEY = '-----BEGIN PRIVATE KEY-----test-only-not-a-key-----END PRIVATE KEY-----';

function configure() {
  Object.assign(env.googleSheets, { spreadsheetId: 'test-sheet-id', clientEmail: 'svc@example.invalid', privateKey: FAKE_KEY });
}

function httpError(status, message = 'boom') {
  const error = new Error(message);
  error.code = status;
  return error;
}

// Fake Sheets: tabs maps name -> rows. failures is a queue of errors thrown
// by the next calls (any method).
function fakeSheets(tabs = {}, failures = []) {
  const calls = [];
  const next = () => { if (failures.length) throw failures.shift(); };
  return {
    calls,
    tabs,
    readSheetRows: async (name) => {
      calls.push(['read', name]);
      next();
      if (!tabs[name]) throw httpError(400, `Unable to parse range: ${name}!A:ZZ`);
      return tabs[name].map((row) => [...row]);
    },
    ensureSheetWithHeader: async (name, header) => {
      calls.push(['write', name]);
      next();
      tabs[name] = tabs[name] || [];
      tabs[name][0] = [...header];
    },
    invalidateReadCacheForSheet: () => {},
  };
}

afterEach(() => {
  Object.assign(env.googleSheets, savedSheetsEnv);
  mock.restoreAll();
});

describe('verifyPrivacyStorage', () => {
  test('no Sheets config: fails with the missing variable names only', async () => {
    Object.assign(env.googleSheets, { spreadsheetId: '', clientEmail: '', privateKey: '' });
    const sheets = fakeSheets();
    await assert.rejects(() => verifyPrivacyStorage({ sheets }), (error) => {
      assert.ok(error instanceof PrivacyStorageError);
      assert.equal(error.reason, 'config_missing');
      assert.match(error.message, /GOOGLE_SHEETS_SPREADSHEET_ID,GOOGLE_SHEETS_CLIENT_EMAIL,GOOGLE_SHEETS_PRIVATE_KEY/);
      return true;
    });
    assert.equal(sheets.calls.length, 0);
  });

  test('missing permission (403) fails at once, no retry, redacted message', async () => {
    configure();
    const sleeps = [];
    const sheets = fakeSheets({}, [httpError(403, 'The caller svc@example.invalid does not have permission')]);
    await assert.rejects(() => verifyPrivacyStorage({ sheets, sleep: async (ms) => sleeps.push(ms) }), (error) => {
      assert.equal(error.reason, 'not_accessible');
      assert.match(error.message, /HTTP 403/);
      assert.equal(error.message.includes('svc@example.invalid'), false, 'no account details in the log');
      return true;
    });
    assert.deepEqual(sleeps, []);
  });

  test('read works but write is denied (403) => fails', async () => {
    configure();
    const sheets = fakeSheets({ [CONSENTS]: [store.CONSENT_FIELDS] });
    sheets.ensureSheetWithHeader = async () => { throw httpError(403); };
    await assert.rejects(() => verifyPrivacyStorage({ sheets, sleep: async () => {} }), /not_accessible/);
  });

  test('transient errors are retried with backoff, then succeed', async () => {
    configure();
    const sleeps = [];
    const reset = new Error('socket'); reset.code = 'ECONNRESET';
    const sheets = fakeSheets({ [CONSENTS]: [store.CONSENT_FIELDS], [AUDIT]: [store.AUDIT_FIELDS] }, [httpError(503), reset]);
    const result = await verifyPrivacyStorage({ sheets, sleep: async (ms) => sleeps.push(ms) });
    assert.equal(result.ok, true);
    assert.deepEqual(sleeps, [500, 1000]);
  });

  test('persistent transient errors fail after a bounded number of attempts', async () => {
    configure();
    const sleeps = [];
    const sheets = fakeSheets({}, Array.from({ length: 10 }, () => httpError(429)));
    await assert.rejects(() => verifyPrivacyStorage({ sheets, sleep: async (ms) => sleeps.push(ms) }), (error) => {
      assert.equal(error.reason, 'unavailable_after_retries');
      assert.match(error.message, /4 attempts/);
      return true;
    });
    assert.deepEqual(sleeps, [500, 1000, 2000]);
  });

  test('healthy storage: tabs created if missing, header written and read back, no data rows added', async () => {
    configure();
    const sheets = fakeSheets({ [AUDIT]: [store.AUDIT_FIELDS, ['pa_1', 'export', 'k', 'web', 'ok', '', 'now']] });
    const result = await verifyPrivacyStorage({ sheets });
    assert.equal(result.ok, true);
    assert.deepEqual(sheets.tabs[CONSENTS], [store.CONSENT_FIELDS]);
    assert.equal(sheets.tabs[AUDIT].length, 2, 'existing audit rows untouched, nothing appended');
    assert.deepEqual(sheets.calls.filter(([kind]) => kind === 'write').map(([, name]) => name), [CONSENTS, AUDIT]);
  });

  test('an unexpected header is never overwritten', async () => {
    configure();
    const sheets = fakeSheets({ [CONSENTS]: [['something', 'else']] });
    await assert.rejects(() => verifyPrivacyStorage({ sheets }), /unexpected_header/);
    assert.equal(sheets.calls.some(([kind]) => kind === 'write'), false);
  });
});

describe('in-memory privacy store is refused in production', () => {
  for (const [label, vars] of [['NODE_ENV=production', { NODE_ENV: 'production' }], ['hosted runtime', { RENDER: 'true' }]]) {
    test(label, async () => {
      const saved = {};
      for (const key of Object.keys(vars)) { saved[key] = process.env[key]; process.env[key] = vars[key]; }
      try {
        Object.assign(env.googleSheets, { spreadsheetId: '', clientEmail: '', privateKey: '' });
        await assert.rejects(() => store.getConsent(store.subjectKey('line', 'Uprod')), (error) => error.code === 'PRIVACY_STORAGE_UNAVAILABLE');
        await assert.rejects(() => store.saveConsent({ subjectKey: 'k', status: 'accepted' }), (error) => error.code === 'PRIVACY_STORAGE_UNAVAILABLE');
        await assert.rejects(() => store.appendAudit({ event: 'x' }), (error) => error.code === 'PRIVACY_STORAGE_UNAVAILABLE');
        assert.equal(await guard.identityAllowed('line', 'Uprod'), false, 'fails closed');
      } finally {
        for (const key of Object.keys(vars)) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
      }
    });
  }

  test('local dev/test still uses the in-memory store', async () => {
    const key = store.subjectKey('line', 'Ulocal');
    await store.saveConsent({ subjectKey: key, status: 'accepted' });
    assert.equal((await store.getConsent(key)).status, 'accepted');
  });
});

describe('startup ordering', () => {
  const server = require('../src/server');
  const app = require('../src/app');
  const { crmAgentRepository } = require('../src/modules/crm-agent');

  test('failed check: no CRM init, no listen, no polling/schedulers', async () => {
    const order = [];
    mock.method(crmAgentRepository, 'initializeMvpCrmSheets', async () => { order.push('crm'); });
    mock.method(app, 'listen', () => { order.push('listen'); throw new Error('must not listen'); });
    await assert.rejects(() => server.startServer({
      production: true,
      verifyPrivacyStorage: async () => { order.push('verify'); throw new PrivacyStorageError('config_missing'); },
      startBackgroundWork: () => order.push('background'),
    }), PrivacyStorageError);
    assert.deepEqual(order, ['verify']);
  });

  test('healthy check: verify -> CRM init -> listen -> polling/webhook/scheduler work', async () => {
    const order = [];
    mock.method(crmAgentRepository, 'initializeMvpCrmSheets', async () => { order.push('crm'); });
    const realListen = app.listen.bind(app);
    mock.method(app, 'listen', (...args) => { order.push('listen'); return realListen(...args); });
    const started = await server.startServer({
      production: true,
      port: 0,
      verifyPrivacyStorage: async () => { order.push('verify'); return { ok: true }; },
      startBackgroundWork: () => order.push('background'),
    });
    try {
      assert.deepEqual(order, ['verify', 'crm', 'listen', 'background']);
    } finally {
      await new Promise((resolve) => started.close(resolve));
    }
  });

  test('outside production the check is skipped (local dev unchanged)', async () => {
    const order = [];
    mock.method(crmAgentRepository, 'initializeMvpCrmSheets', async () => { order.push('crm'); });
    const started = await server.startServer({
      production: false,
      port: 0,
      verifyPrivacyStorage: async () => { order.push('verify'); },
      startBackgroundWork: () => order.push('background'),
    });
    await new Promise((resolve) => started.close(resolve));
    assert.deepEqual(order, ['crm', 'background']);
  });
});

describe('real production process', () => {
  for (const [label, extra] of [['NODE_ENV=production', { NODE_ENV: 'production' }], ['hosted runtime marker', { NODE_ENV: 'test', RENDER: 'true' }]]) {
    test(`${label} without Sheets exits non-zero before listening`, () => {
      const result = spawnSync(process.execPath, ['src/server.js'], {
        cwd: root,
        encoding: 'utf8',
        timeout: 20000,
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          ADMIN_API_KEY: 'test-only-admin-key-0123456789abcdef',
          WEB_SESSION_SECRET: 'test-only-web-session-secret-0123456789abcdef',
          GOOGLE_SHEETS_SPREADSHEET_ID: '',
          GOOGLE_SHEETS_CLIENT_EMAIL: '',
          GOOGLE_SHEETS_PRIVATE_KEY: '',
          ...extra,
        },
      });
      const output = `${result.stdout}\n${result.stderr}`;
      assert.equal(result.status, 1, output);
      assert.match(output, /Refusing to start: Privacy storage check failed: config_missing/);
      assert.equal(output.includes('Gringo Community API is running'), false);
      assert.equal(output.includes('test-only-admin-key'), false);
    });
  }
});
