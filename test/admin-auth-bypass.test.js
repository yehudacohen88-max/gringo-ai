const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const TEST_ADMIN_API_KEY = 'test-only-admin-key-0123456789abcdef';
const WRONG_ADMIN_API_KEY = 'wrong-admin-key-fedcba9876543210ffff';
process.env.ADMIN_API_KEY = TEST_ADMIN_API_KEY;

const contactRepository = require('../src/modules/contacts/contact.repository');
const workerRepository = require('../src/modules/workers/worker.repository');
const sheets = require('../src/config/googleSheets');
const { coreAgentService } = require('../src/modules/core-agent');
const telegramLinkService = require('../src/modules/telegram/telegram-link.service');
const lineLinkService = require('../src/modules/line/line-link.service');
const lineClient = require('../src/modules/line/line-client.service');
const app = require('../src/app');

const counters = {
  contact: 0,
  worker: 0,
  sheets: 0,
  core: 0,
  telegram: 0,
  lineLink: 0,
  lineClient: 0,
};

function arm(mod, bucket) {
  for (const [key, value] of Object.entries(mod)) {
    if (typeof value !== 'function') continue;
    mod[key] = async function guarded() {
      counters[bucket] += 1;
      return [];
    };
  }
}

arm(contactRepository, 'contact');
arm(workerRepository, 'worker');
arm(sheets, 'sheets');
arm(coreAgentService, 'core');
arm(telegramLinkService, 'telegram');
arm(lineLinkService, 'lineLink');
arm(lineClient, 'lineClient');

function rawRequest(port, { method, path, headers, body }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path, headers: headers || {} }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function snapshot() {
  return { ...counters };
}

function callsSince(before) {
  return Object.values(counters).reduce((total, value) => total + value, 0) - Object.values(before).reduce((total, value) => total + value, 0);
}

function assertNoKey(text) {
  if (String(text).includes(TEST_ADMIN_API_KEY) || String(text).includes(WRONG_ADMIN_API_KEY)) {
    throw new Error('response contained an admin key value');
  }
}

test('Express routing defaults still require admin auth before any data call', async () => {
  assert.equal(app.enabled('case sensitive routing'), false);
  assert.equal(app.enabled('strict routing'), false);

  const server = app.listen(0);
  const port = server.address().port;
  const blocked = [
    ['GET', '/api/contacts'],
    ['GET', '/api/contacts/'],
    ['GET', '/API/contacts'],
    ['GET', '/Api/Contacts'],
    ['GET', '/api/contacts//'],
    ['HEAD', '/api/contacts'],
    ['OPTIONS', '/api/contacts'],
    ['GET', '/api/workers'],
    ['GET', '/API/WORKERS'],
    ['GET', '/api/workers/'],
    ['HEAD', '/api/workers'],
    ['GET', '/api/workers/wrk_probe'],
    ['POST', '/api/workers/wrk_probe/archive'],
    ['GET', '/api/telegram/link-history'],
    ['HEAD', '/api/telegram/link-history'],
    ['GET', '/api/line/link-history'],
    ['GET', '/api/line/rich-menu/default'],
    ['HEAD', '/api/line/rich-menu/default'],
    ['POST', '/api/line/rich-menu/default'],
    ['POST', '/api/line/rich-menu/default/set'],
    ['GET', '/api/contacts/..%2Fworkers'],
    ['GET', '/api/contacts/%2e%2e/workers'],
    ['PUT', '/api/contacts/..%2F..%2Fapi/workers/wrk'],
    ['GET', '/api/contacts?adminApiKey=' + encodeURIComponent(TEST_ADMIN_API_KEY)],
  ];

  try {
    for (const [method, path] of blocked) {
      const before = snapshot();
      const result = await rawRequest(port, { method, path });
      assert.equal(result.status, 401, `${method} ${path.split('?')[0]}`);
      assert.equal(callsSince(before), 0, `${method} ${path.split('?')[0]}`);
      assertNoKey(result.text);
    }

    const unmatched = [
      ['GET', '/api//contacts'],
      ['GET', '/api/%63ontacts'],
      ['GET', '/api/contacts%2F'],
      ['GET', '/api/contacts.json'],
    ];
    for (const [method, path] of unmatched) {
      const before = snapshot();
      const result = await rawRequest(port, { method, path });
      assert.equal(result.status, 404, path);
      assert.equal(callsSince(before), 0, path);
      assertNoKey(result.text);
    }

    const override = await rawRequest(port, {
      method: 'POST',
      path: '/api/contacts',
      headers: { 'content-type': 'application/json', 'x-http-method-override': 'GET' },
      body: '{}',
    });
    assert.equal(override.status, 401);
    const methodQuery = await rawRequest(port, {
      method: 'POST',
      path: '/api/contacts?_method=GET',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(methodQuery.status, 401);

    const bodyKey = await rawRequest(port, {
      method: 'POST',
      path: '/api/contacts',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ adminApiKey: TEST_ADMIN_API_KEY, first_name: 'Ada', email: 'ada@example.com' }),
    });
    assert.equal(bodyKey.status, 401);
    assertNoKey(bodyKey.text);

    const emptyHeader = await rawRequest(port, {
      method: 'GET',
      path: '/api/contacts',
      headers: { 'x-admin-api-key': '' },
    });
    assert.equal(emptyHeader.status, 401);

    const wrongCase = await rawRequest(port, {
      method: 'GET',
      path: '/api/contacts',
      headers: { 'X-Admin-Api-Key': WRONG_ADMIN_API_KEY },
    });
    assert.equal(wrongCase.status, 401);
    assertNoKey(wrongCase.text);

    const beforeDup = snapshot();
    const duplicate = await rawRequest(port, {
      method: 'GET',
      path: '/api/contacts',
      headers: { 'x-admin-api-key': [WRONG_ADMIN_API_KEY, TEST_ADMIN_API_KEY] },
    });
    assert.equal(duplicate.status, 401);
    assert.equal(callsSince(beforeDup), 0);
    assertNoKey(duplicate.text);

    const beforeValid = snapshot();
    const valid = await rawRequest(port, {
      method: 'GET',
      path: '/api/contacts',
      headers: { 'X-ADMIN-API-KEY': TEST_ADMIN_API_KEY },
    });
    assert.equal(valid.status, 200);
    assert.equal(callsSince(beforeValid) > 0, true);
    assertNoKey(valid.text);

    const beforePage = snapshot();
    const page = await rawRequest(port, { method: 'GET', path: '/contacts.html' });
    assert.equal(page.status, 200);
    assert.equal(callsSince(beforePage), 0);
    assert.equal(page.text.includes('type="password"'), true);
    assertNoKey(page.text);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
