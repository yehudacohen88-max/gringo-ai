const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const DEV_ADMIN_API_KEY = 'dev-admin-key';
const TEST_ADMIN_API_KEY = 'test-only-admin-key-0123456789abcdef';
const WRONG_ADMIN_API_KEY = 'wrong-admin-key-fedcba9876543210ffff';
const SHORT_WRONG_ADMIN_API_KEY = 'nope';
const TEST_WEB_SESSION_SECRET = 'test-only-web-session-secret-0123456789abcdef';

process.env.ADMIN_API_KEY = TEST_ADMIN_API_KEY;

function keyOfLength(length) {
  const prefix = 'test-admin-key-';
  assert.equal(length >= prefix.length, true);
  return prefix + 'x'.repeat(length - prefix.length);
}

function runNode(args, envOverrides = {}, unsetKeys = []) {
  const childEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: 'test',
    WEB_SESSION_SECRET: TEST_WEB_SESSION_SECRET,
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

function assertNoKeyMaterial(output, secrets) {
  for (const secret of secrets) {
    assert.equal(output.includes(secret), false);
  }
}

function assertProductionStartupRefused(envOverrides, unsetKeys, expectedReason, secrets) {
  const result = runNode(['src/server.js'], { NODE_ENV: 'production', ...envOverrides }, unsetKeys);
  const output = combinedOutput(result);

  assert.equal(result.error ?? null, null);
  assert.equal(result.status, 1, output);
  assert.match(output, /Refusing to start:/);
  assert.match(output, expectedReason);
  assert.equal(output.includes('Gringo Community API is running'), false);
  assertNoKeyMaterial(output, secrets);
}

test('production server refuses to start when ADMIN_API_KEY is missing', () => {
  assertProductionStartupRefused({}, ['ADMIN_API_KEY'], /ADMIN_API_KEY is missing/, [
    DEV_ADMIN_API_KEY,
    TEST_ADMIN_API_KEY,
  ]);
  assertProductionStartupRefused({ ADMIN_API_KEY: '   ' }, [], /ADMIN_API_KEY is missing/, [
    DEV_ADMIN_API_KEY,
    TEST_ADMIN_API_KEY,
  ]);
});

test('production server refuses to start when ADMIN_API_KEY is shorter than 32 characters', () => {
  const weakKey = keyOfLength(31);
  assertProductionStartupRefused({ ADMIN_API_KEY: weakKey }, [], /ADMIN_API_KEY is too short/, [
    weakKey,
    DEV_ADMIN_API_KEY,
    TEST_ADMIN_API_KEY,
  ]);
  assertProductionStartupRefused({ ADMIN_API_KEY: 'short-test-key' }, [], /ADMIN_API_KEY is too short/, [
    'short-test-key',
    DEV_ADMIN_API_KEY,
  ]);
});

test('production server refuses to start when ADMIN_API_KEY is the development default', () => {
  assertProductionStartupRefused({ ADMIN_API_KEY: DEV_ADMIN_API_KEY }, [], /development default/, [
    DEV_ADMIN_API_KEY,
    TEST_ADMIN_API_KEY,
  ]);
  assertProductionStartupRefused({ ADMIN_API_KEY: `  ${DEV_ADMIN_API_KEY}  ` }, [], /development default/, [
    DEV_ADMIN_API_KEY,
    TEST_ADMIN_API_KEY,
  ]);
});

test('production server rejects obvious placeholders and low-diversity keys without logging them', () => {
  const repeatedCharacter = 'a'.repeat(32);
  const lowVariety = 'abc'.repeat(11);
  const placeholder = 'change-me'.repeat(4);
  assertProductionStartupRefused({ ADMIN_API_KEY: repeatedCharacter }, [], /too little character variety/, [
    repeatedCharacter,
    DEV_ADMIN_API_KEY,
  ]);
  assertProductionStartupRefused({ ADMIN_API_KEY: lowVariety }, [], /too little character variety/, [
    lowVariety,
    'change-me',
    DEV_ADMIN_API_KEY,
  ]);
  assertProductionStartupRefused({ ADMIN_API_KEY: placeholder }, [], /obvious placeholder/, [
    placeholder,
    'change-me',
    DEV_ADMIN_API_KEY,
  ]);
});

test('production accepts a long key with four distinct characters and does not treat that as randomness proof', () => {
  const diverseEnough = 'abcd'.repeat(8);
  const result = runNode(
    ['-e', "require('./src/config/env'); process.stdout.write('config-loaded');"],
    { NODE_ENV: 'production', ADMIN_API_KEY: diverseEnough }
  );
  const output = combinedOutput(result);

  assert.equal(result.error ?? null, null);
  assert.equal(result.status, 0, output);
  assert.match(output, /config-loaded/);
  assertNoKeyMaterial(output, [diverseEnough, DEV_ADMIN_API_KEY]);
});

test('production still rejects the development default when the local opt-in is set', () => {
  assertProductionStartupRefused(
    { ADMIN_API_KEY: DEV_ADMIN_API_KEY, ALLOW_DEV_ADMIN_KEY: 'true' },
    [],
    /development default/,
    [DEV_ADMIN_API_KEY, TEST_ADMIN_API_KEY]
  );
});

test('production with a hosting marker still loads a strong admin key', () => {
  const result = runNode(
    ['-e', "require('./src/config/env'); process.stdout.write('config-loaded');"],
    { NODE_ENV: 'production', ADMIN_API_KEY: TEST_ADMIN_API_KEY, VERCEL: '1', RENDER: 'true' }
  );
  const output = combinedOutput(result);

  assert.equal(result.error ?? null, null);
  assert.equal(result.status, 0, output);
  assert.match(output, /config-loaded/);
  assertNoKeyMaterial(output, [TEST_ADMIN_API_KEY, DEV_ADMIN_API_KEY]);
});

test('production config loads when ADMIN_API_KEY is a strong unique secret', () => {
  const strongKey = keyOfLength(32);
  for (const adminApiKey of [strongKey, TEST_ADMIN_API_KEY]) {
    const result = runNode(
      ['-e', "require('./src/config/env'); process.stdout.write('config-loaded');"],
      { NODE_ENV: 'production', ADMIN_API_KEY: adminApiKey }
    );
    const output = combinedOutput(result);

    assert.equal(result.error ?? null, null);
    assert.equal(result.status, 0, output);
    assert.match(output, /config-loaded/);
    assert.equal(output.includes('Refusing to start:'), false);
    assertNoKeyMaterial(output, [adminApiKey, DEV_ADMIN_API_KEY]);
  }
});

function assertStartupRefused(envOverrides, unsetKeys, expectedReason, secrets) {
  const result = runNode(['src/server.js'], envOverrides, unsetKeys);
  const output = combinedOutput(result);

  assert.equal(result.error ?? null, null);
  assert.equal(result.status, 1, output);
  assert.match(output, /Refusing to start:/);
  assert.match(output, expectedReason);
  assert.equal(output.includes('Gringo Community API is running'), false);
  assertNoKeyMaterial(output, secrets);
}

test('development without the local opt-in refuses to start and does not use the development key', () => {
  assertStartupRefused({ NODE_ENV: 'development' }, ['ADMIN_API_KEY'], /disabled without that opt-in/, [
    DEV_ADMIN_API_KEY,
    TEST_ADMIN_API_KEY,
  ]);
  assertStartupRefused(
    { NODE_ENV: 'development', ALLOW_DEV_ADMIN_KEY: 'false' },
    ['ADMIN_API_KEY'],
    /disabled without that opt-in/,
    [DEV_ADMIN_API_KEY]
  );
});

test('development on a hosted platform does not allow the development key', () => {
  for (const marker of ['RENDER', 'VERCEL', 'RAILWAY_ENVIRONMENT', 'FLY_APP_NAME', 'K_SERVICE', 'DYNO', 'HEROKU_APP_NAME', 'AWS_EXECUTION_ENV']) {
    assertStartupRefused(
      { NODE_ENV: 'development', [marker]: '1', ALLOW_DEV_ADMIN_KEY: 'true' },
      ['ADMIN_API_KEY'],
      /hosted deployment/,
      [DEV_ADMIN_API_KEY, TEST_ADMIN_API_KEY]
    );
  }
  assertStartupRefused(
    { NODE_ENV: 'development', RENDER: 'true', ADMIN_API_KEY: DEV_ADMIN_API_KEY, ALLOW_DEV_ADMIN_KEY: 'true' },
    [],
    /hosted deployment/,
    [DEV_ADMIN_API_KEY]
  );
});

test('unset NODE_ENV does not allow the development key', () => {
  assertStartupRefused({}, ['NODE_ENV', 'ADMIN_API_KEY'], /NODE_ENV is development or test/, [
    DEV_ADMIN_API_KEY,
    TEST_ADMIN_API_KEY,
  ]);
  assertStartupRefused(
    { ADMIN_API_KEY: DEV_ADMIN_API_KEY, ALLOW_DEV_ADMIN_KEY: 'true' },
    ['NODE_ENV'],
    /NODE_ENV is development or test/,
    [DEV_ADMIN_API_KEY]
  );
});

test('unset NODE_ENV still loads a configured strong admin key', () => {
  const result = runNode(
    ['-e', "require('./src/config/env'); process.stdout.write('config-loaded');"],
    { ADMIN_API_KEY: TEST_ADMIN_API_KEY },
    ['NODE_ENV']
  );
  const output = combinedOutput(result);

  assert.equal(result.error ?? null, null);
  assert.equal(result.status, 0, output);
  assert.match(output, /config-loaded/);
  assertNoKeyMaterial(output, [TEST_ADMIN_API_KEY, DEV_ADMIN_API_KEY]);
});

test('explicit local opt-in allows the development key and does not print it', () => {
  const result = runNode(
    [
      '-e',
      [
        "const { env, DEV_ADMIN_API_KEY } = require('./src/config/env');",
        "process.stdout.write(env.adminApiKey === DEV_ADMIN_API_KEY ? 'dev-fallback' : 'unexpected');",
      ].join(' '),
    ],
    { NODE_ENV: 'development', ALLOW_DEV_ADMIN_KEY: 'true' },
    ['ADMIN_API_KEY']
  );
  const output = combinedOutput(result);

  assert.equal(result.error ?? null, null);
  assert.equal(result.status, 0, output);
  assert.match(result.stdout, /dev-fallback/);
  assert.match(result.stderr, /\[startup\] ADMIN_API_KEY is unset or still the development default/);
  assert.match(result.stderr, /at least 32 characters/);
  assert.match(result.stderr, /cannot prove that a key is truly random/);
  assertNoKeyMaterial(output, [DEV_ADMIN_API_KEY, TEST_ADMIN_API_KEY]);
});

test('development keeps an explicit non-default key and does not warn', () => {
  const localKey = 'local-dev-key';
  const result = runNode(
    [
      '-e',
      [
        "const { env } = require('./src/config/env');",
        'process.stdout.write(env.adminApiKey === process.env.ADMIN_API_KEY ? "custom-key-kept" : "unexpected");',
      ].join(' '),
    ],
    { NODE_ENV: 'development', ADMIN_API_KEY: localKey }
  );
  const output = combinedOutput(result);

  assert.equal(result.error ?? null, null);
  assert.equal(result.status, 0, output);
  assert.match(result.stdout, /custom-key-kept/);
  assert.equal(result.stderr.includes('[startup]'), false);
  assertNoKeyMaterial(output, [localKey, DEV_ADMIN_API_KEY, TEST_ADMIN_API_KEY]);
});

test('test environment without the local opt-in refuses the development key', () => {
  assertStartupRefused({ NODE_ENV: 'test' }, ['ADMIN_API_KEY'], /disabled without that opt-in/, [
    DEV_ADMIN_API_KEY,
    TEST_ADMIN_API_KEY,
  ]);
});

test('test environment with the local opt-in stays quiet and allows the development key', () => {
  const result = runNode(
    [
      '-e',
      [
        "const { env, DEV_ADMIN_API_KEY } = require('./src/config/env');",
        "process.stdout.write(env.adminApiKey === DEV_ADMIN_API_KEY ? 'dev-fallback' : 'unexpected');",
      ].join(' '),
    ],
    { NODE_ENV: 'test', ALLOW_DEV_ADMIN_KEY: 'true' },
    ['ADMIN_API_KEY']
  );
  const output = combinedOutput(result);

  assert.equal(result.error ?? null, null);
  assert.equal(result.status, 0, output);
  assert.match(result.stdout, /dev-fallback/);
  assert.equal((result.stderr || '').includes('[startup]'), false);
  assertNoKeyMaterial(output, [DEV_ADMIN_API_KEY, TEST_ADMIN_API_KEY]);
});

test('development key is accepted from loopback and rejected from other addresses', () => {
  const result = runNode(
    [
      '-e',
      [
        "const { env } = require('./src/config/env');",
        "const adminRoutes = require('./src/modules/admin/admin.routes');",
        'const results = [];',
        'function run(remoteAddress) {',
        '  let statusCode = 0;',
        '  let nextCalled = false;',
        '  const req = {',
        "    get(name) { return String(name).toLowerCase() === 'x-admin-api-key' ? env.adminApiKey : ''; },",
        '    headers: {}, query: {}, body: {},',
        '    socket: { remoteAddress },',
        '  };',
        '  const res = { status(code) { statusCode = code; return this; }, json() { return this; } };',
        '  adminRoutes.requireAdminKey(req, res, () => { nextCalled = true; });',
        "  results.push(nextCalled ? 'allowed' : 'denied:' + statusCode);",
        '}',
        "run('127.0.0.1');",
        "run('::1');",
        "run('::ffff:127.0.0.1');",
        "run('198.51.100.20');",
        "run('');",
        "process.stdout.write(results.join(','));",
      ].join(' '),
    ],
    { NODE_ENV: 'development', ALLOW_DEV_ADMIN_KEY: 'true' },
    ['ADMIN_API_KEY']
  );
  const output = combinedOutput(result);

  assert.equal(result.error ?? null, null);
  assert.equal(result.status, 0, output);
  assert.equal(result.stdout, 'allowed,allowed,allowed,denied:401,denied:401');
  assertNoKeyMaterial(output, [DEV_ADMIN_API_KEY, TEST_ADMIN_API_KEY]);
});

test('admin key check uses timingSafeEqual and does not accept query or body keys', () => {
  const source = fs.readFileSync(path.join(root, 'src/shared/requireAdminKey.js'), 'utf8');
  assert.match(source, /timingSafeEqual/);
  assert.match(source, /createHash\('sha256'\)/);
  assert.doesNotMatch(source, /req\.query\.adminApiKey/);
  assert.doesNotMatch(source, /!==\s*env\.adminApiKey/);
  assert.doesNotMatch(source, /===\s*env\.adminApiKey/);

  const adminRoutesSource = fs.readFileSync(path.join(root, 'src/modules/admin/admin.routes.js'), 'utf8');
  assert.match(adminRoutesSource, /router\.use\(requireAdminKey\)/);
  assert.match(adminRoutesSource, /module\.exports\.requireAdminKey = requireAdminKey/);
  assert.doesNotMatch(adminRoutesSource, /req\.query\.adminApiKey/);
  assert.doesNotMatch(adminRoutesSource, /!==\s*env\.adminApiKey/);
  assert.doesNotMatch(adminRoutesSource, /===\s*env\.adminApiKey/);
});

let app;
const adminService = require('../src/modules/admin/admin.service');
const originalGetDashboard = adminService.getDashboard;
const originalGenerateDailyReport = adminService.generateDailyReport;

function createUrl(server, requestPath) {
  const address = server.address();
  return `http://127.0.0.1:${address.port}${requestPath}`;
}

async function withServer(callback) {
  app = app || require('../src/app');
  const server = app.listen(0);
  try {
    await callback(server);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

async function adminRequest(server, requestPath, options = {}) {
  const response = await fetch(createUrl(server, requestPath), options);
  const body = await response.json();
  return { response, body };
}

test('valid x-admin-api-key header is accepted', async () => {
  let calls = 0;
  adminService.getDashboard = async () => {
    calls += 1;
    return { overview: { marker: 'admin-key-accepted' } };
  };

  try {
    await withServer(async (server) => {
      const { response, body } = await adminRequest(server, '/api/admin/dashboard', {
        headers: { 'X-Admin-Api-Key': TEST_ADMIN_API_KEY },
      });

      assert.equal(response.status, 200);
      assert.equal(body.overview.marker, 'admin-key-accepted');
      assert.equal(calls, 1);
      assert.equal(JSON.stringify(body).includes(TEST_ADMIN_API_KEY), false);
    });
  } finally {
    adminService.getDashboard = originalGetDashboard;
  }
});

test('adminApiKey query string is rejected', async () => {
  let calls = 0;
  adminService.getDashboard = async () => {
    calls += 1;
    return { overview: { marker: 'should-not-run' } };
  };

  try {
    await withServer(async (server) => {
      const params = new URLSearchParams({ adminApiKey: TEST_ADMIN_API_KEY });
      const { response, body } = await adminRequest(server, `/api/admin/dashboard?${params}`);

      assert.equal(response.status, 401);
      assert.equal(body.error.message, 'Admin API key is required.');
      assert.equal(calls, 0);
      assert.equal(JSON.stringify(body).includes(TEST_ADMIN_API_KEY), false);
    });
  } finally {
    adminService.getDashboard = originalGetDashboard;
  }
});

test('valid header is rejected when the URL also carries the admin key', async () => {
  let calls = 0;
  adminService.getDashboard = async () => {
    calls += 1;
    return { overview: { marker: 'should-not-run' } };
  };

  try {
    await withServer(async (server) => {
      const params = new URLSearchParams({ adminApiKey: TEST_ADMIN_API_KEY });
      const { response, body } = await adminRequest(server, `/api/admin/dashboard?${params}`, {
        headers: { 'x-admin-api-key': TEST_ADMIN_API_KEY },
      });

      assert.equal(response.status, 401);
      assert.equal(body.error.message, 'Admin API key is required.');
      assert.equal(calls, 0);
      assert.equal(JSON.stringify(body).includes(TEST_ADMIN_API_KEY), false);
    });
  } finally {
    adminService.getDashboard = originalGetDashboard;
  }
});

test('wrong admin API key is rejected', async () => {
  let calls = 0;
  adminService.getDashboard = async () => {
    calls += 1;
    return { overview: { marker: 'should-not-run' } };
  };

  try {
    await withServer(async (server) => {
      for (const wrongKey of [WRONG_ADMIN_API_KEY, SHORT_WRONG_ADMIN_API_KEY, '']) {
        const headers = wrongKey ? { 'x-admin-api-key': wrongKey } : {};
        const { response, body } = await adminRequest(server, '/api/admin/dashboard', { headers });

        assert.equal(response.status, 401);
        assert.equal(body.error.message, 'Admin API key is required.');
        if (wrongKey) assert.equal(JSON.stringify(body).includes(wrongKey), false);
        assert.equal(JSON.stringify(body).includes(TEST_ADMIN_API_KEY), false);
      }
      assert.equal(calls, 0);
    });
  } finally {
    adminService.getDashboard = originalGetDashboard;
  }
});

test('admin API key in the JSON body is rejected', async () => {
  let calls = 0;
  adminService.generateDailyReport = async () => {
    calls += 1;
    return { id: 'should-not-run' };
  };

  try {
    await withServer(async (server) => {
      const withoutHeader = await adminRequest(server, '/api/admin/reports/daily', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ adminApiKey: TEST_ADMIN_API_KEY }),
      });
      const withHeader = await adminRequest(server, '/api/admin/reports/daily', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-api-key': TEST_ADMIN_API_KEY,
        },
        body: JSON.stringify({ adminApiKey: TEST_ADMIN_API_KEY }),
      });

      assert.equal(withoutHeader.response.status, 401);
      assert.equal(withHeader.response.status, 401);
      assert.equal(withoutHeader.body.error.message, 'Admin API key is required.');
      assert.equal(withHeader.body.error.message, 'Admin API key is required.');
      assert.equal(calls, 0);
      assert.equal(JSON.stringify(withoutHeader.body).includes(TEST_ADMIN_API_KEY), false);
      assert.equal(JSON.stringify(withHeader.body).includes(TEST_ADMIN_API_KEY), false);
    });
  } finally {
    adminService.generateDailyReport = originalGenerateDailyReport;
  }
});

test('a normal admin POST body still works with only the header', async () => {
  adminService.generateDailyReport = async () => ({ id: 'report-accepted' });

  try {
    await withServer(async (server) => {
      const { response, body } = await adminRequest(server, '/api/admin/reports/daily', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-api-key': TEST_ADMIN_API_KEY,
        },
        body: JSON.stringify({ note: 'morning' }),
      });

      assert.equal(response.status, 201);
      assert.equal(body.report.id, 'report-accepted');
      assert.equal(JSON.stringify(body).includes(TEST_ADMIN_API_KEY), false);
    });
  } finally {
    adminService.generateDailyReport = originalGenerateDailyReport;
  }
});

test('admin UI no longer contains the development default key', () => {
  const adminJs = fs.readFileSync(path.join(root, 'src/public/admin.js'), 'utf8');
  const adminHtml = fs.readFileSync(path.join(root, 'src/public/admin.html'), 'utf8');
  const inputTag = adminHtml.match(/<input id="adminApiKey"[^>]*>/);

  assert.equal(Boolean(inputTag), true);
  assert.equal(adminJs.includes(DEV_ADMIN_API_KEY), false);
  assert.equal(adminHtml.includes(DEV_ADMIN_API_KEY), false);
  assert.match(adminJs, /'x-admin-api-key':\s*adminApiKeyInput\.value\.trim\(\)/);
  assert.equal(/value\s*=/.test(inputTag[0]), false);
});
