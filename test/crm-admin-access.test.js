const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const TEST_ADMIN_API_KEY = 'test-only-admin-key-0123456789abcdef';
const WRONG_ADMIN_API_KEY = 'wrong-admin-key-fedcba9876543210ffff';
process.env.ADMIN_API_KEY = TEST_ADMIN_API_KEY;

const contactRepository = require('../src/modules/contacts/contact.repository');
const workerRepository = require('../src/modules/workers/worker.repository');
const { coreAgentService } = require('../src/modules/core-agent');
const telegramLinkService = require('../src/modules/telegram/telegram-link.service');
const lineLinkService = require('../src/modules/line/line-link.service');
const lineClient = require('../src/modules/line/line-client.service');

let app;

const contactRecord = {
  rowNumber: 2,
  contact: {
    contact_id: 'con_probe',
    first_name: 'Ada',
    last_name: '',
    display_name: 'Ada',
    email: 'ada@example.com',
    phone: '+15550001111',
    status: 'new',
    source: 'manual',
    country: 'Israel',
    history_count: '1',
    notes_count: '0',
    created_at: '2026-06-25T10:00:00Z',
    updated_at: '2026-06-25T10:00:00Z',
    archived_at: '',
  },
};

const workerRecord = {
  rowNumber: 2,
  worker: {
    worker_id: 'wrk_probe',
    first_name: 'Ada',
    nationality: 'Mexico',
    phone: '+15550001111',
    status: 'ready',
    availability: 'immediate',
    created_at: '2026-06-28T10:00:00Z',
    updated_at: '2026-06-28T10:00:00Z',
    archived_at: '',
  },
};

const protectedRoutes = [
  {
    method: 'GET',
    path: '/api/contacts',
    stores: [contactRepository],
    allow() {
      contactRepository.findAllContacts = async () => [{ contact_id: 'con_probe' }];
    },
    expect(response, body) {
      assert.equal(response.status, 200);
      assert.equal(body.data[0].contact_id, 'con_probe');
    },
  },
  {
    method: 'POST',
    path: '/api/contacts',
    body: { first_name: 'Ada', email: 'ada@example.com' },
    stores: [contactRepository],
    allow() {
      contactRepository.createContact = async (contact) => contact;
      contactRepository.createContactHistory = async (history) => history;
    },
    expect(response, body) {
      assert.equal(response.status, 201);
      assert.equal(body.data.first_name, 'Ada');
    },
  },
  {
    method: 'PUT',
    path: '/api/contacts/con_probe',
    body: { first_name: 'Ada', email: 'ada.new@example.com', phone: '+15550001111' },
    stores: [contactRepository],
    allow() {
      contactRepository.findContactRecordById = async () => contactRecord;
      contactRepository.updateContact = async (rowNumber, contact) => contact;
      contactRepository.createContactHistory = async (history) => history;
    },
    expect(response, body) {
      assert.equal(response.status, 200);
      assert.equal(body.data.email, 'ada.new@example.com');
    },
  },
  {
    method: 'POST',
    path: '/api/contacts/con_probe/archive',
    body: {},
    stores: [contactRepository],
    allow() {
      contactRepository.findContactRecordById = async () => contactRecord;
      contactRepository.updateContact = async (rowNumber, contact) => contact;
      contactRepository.createContactHistory = async (history) => history;
    },
    expect(response, body) {
      assert.equal(response.status, 200);
      assert.equal(body.data.status, 'archived');
    },
  },
  {
    method: 'GET',
    path: '/api/workers',
    stores: [workerRepository],
    allow() {
      workerRepository.findAllWorkers = async () => [{ worker_id: 'wrk_probe' }];
    },
    expect(response, body) {
      assert.equal(response.status, 200);
      assert.equal(body.data[0].worker_id, 'wrk_probe');
    },
  },
  {
    method: 'POST',
    path: '/api/workers',
    body: { first_name: 'Ada', nationality: 'Mexico', phone: '+15550001111' },
    stores: [workerRepository],
    allow() {
      workerRepository.createWorker = async (worker) => worker;
      workerRepository.createWorkerHistory = async (history) => history;
    },
    expect(response, body) {
      assert.equal(response.status, 201);
      assert.equal(body.data.first_name, 'Ada');
    },
  },
  {
    method: 'GET',
    path: '/api/workers/wrk_probe',
    stores: [workerRepository],
    allow() {
      workerRepository.findWorkerRecordById = async () => workerRecord;
    },
    expect(response, body) {
      assert.equal(response.status, 200);
      assert.equal(body.data.worker_id, 'wrk_probe');
    },
  },
  {
    method: 'PUT',
    path: '/api/workers/wrk_probe',
    body: { first_name: 'Ada', nationality: 'Mexico', phone: '+15550001111', status: 'ready' },
    stores: [workerRepository],
    allow() {
      workerRepository.findWorkerRecordById = async () => workerRecord;
      workerRepository.updateWorker = async (rowNumber, worker) => worker;
      workerRepository.createWorkerHistory = async (history) => history;
    },
    expect(response, body) {
      assert.equal(response.status, 200);
      assert.equal(body.data.status, 'ready');
    },
  },
  {
    method: 'POST',
    path: '/api/workers/wrk_probe/archive',
    body: {},
    stores: [workerRepository],
    allow() {
      workerRepository.findWorkerRecordById = async () => workerRecord;
      workerRepository.updateWorker = async (rowNumber, worker) => worker;
      workerRepository.createWorkerHistory = async (history) => history;
    },
    expect(response, body) {
      assert.equal(response.status, 200);
      assert.equal(body.data.status, 'archived');
    },
  },
  {
    method: 'GET',
    path: '/api/telegram/link-history',
    stores: [coreAgentService, telegramLinkService],
    allow() {
      coreAgentService.getOnboardingStatus = async () => ({ user: {}, profile: { userId: 'user_probe' } });
      telegramLinkService.getLinkHistory = async () => [{ event: 'linked' }];
    },
    expect(response, body) {
      assert.equal(response.status, 200);
      assert.equal(body.history.length, 1);
    },
  },
  {
    method: 'GET',
    path: '/api/line/link-history',
    stores: [coreAgentService, lineLinkService],
    allow() {
      coreAgentService.getOnboardingStatus = async () => ({ user: {}, profile: { userId: 'user_probe' } });
      lineLinkService.getLinkHistory = async () => [{ event: 'linked' }];
    },
    expect(response, body) {
      assert.equal(response.status, 200);
      assert.equal(body.history.length, 1);
    },
  },
  {
    method: 'GET',
    path: '/api/line/rich-menu/default',
    stores: [lineClient],
    allow() {},
    expect(response, body) {
      assert.equal(response.status, 200);
      assert.equal(body.ok, true);
      assert.equal(typeof body.richMenu, 'object');
    },
  },
  {
    method: 'POST',
    path: '/api/line/rich-menu/default',
    body: {},
    stores: [lineClient],
    allow() {
      lineClient.createDefaultRichMenu = async () => ({ created: true });
    },
    expect(response, body) {
      assert.equal(response.status, 200);
      assert.equal(body.ok, true);
    },
  },
  {
    method: 'POST',
    path: '/api/line/rich-menu/default/set',
    body: { richMenuId: 'menu-probe' },
    stores: [lineClient],
    allow() {
      lineClient.setDefaultRichMenu = async () => ({ assigned: true });
    },
    expect(response, body) {
      assert.equal(response.status, 200);
      assert.equal(body.ok, true);
      assert.equal(body.result.assigned, true);
    },
  },
];

function snapshotFns(mod) {
  const saved = {};
  for (const [key, value] of Object.entries(mod)) {
    if (typeof value === 'function') saved[key] = value;
  }
  return saved;
}

function restoreFns(mod, saved) {
  for (const [key, value] of Object.entries(saved)) mod[key] = value;
}

function arm(mod) {
  const saved = snapshotFns(mod);
  let calls = 0;
  for (const key of Object.keys(saved)) {
    mod[key] = async function guarded() {
      calls += 1;
      throw new Error('data store called');
    };
  }
  return {
    calls() {
      return calls;
    },
    restore() {
      restoreFns(mod, saved);
    },
  };
}

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

async function send(server, routeCase, mode) {
  const url = new URL(createUrl(server, routeCase.path));
  if (mode.query) url.searchParams.set('adminApiKey', TEST_ADMIN_API_KEY);
  const headers = {};
  if (mode.header === 'valid') headers['x-admin-api-key'] = TEST_ADMIN_API_KEY;
  if (mode.header === 'wrong') headers['x-admin-api-key'] = WRONG_ADMIN_API_KEY;

  const payload = routeCase.body ? { ...routeCase.body } : null;
  if (payload && mode.bodyKey) payload.adminApiKey = TEST_ADMIN_API_KEY;
  let body;
  if (payload) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(payload);
  }

  const response = await fetch(url, { method: routeCase.method, headers, body });
  const parsed = await response.json();
  return { response, body: parsed };
}

function assertHidden(body) {
  const text = JSON.stringify(body);
  assert.equal(text.includes(TEST_ADMIN_API_KEY), false);
  assert.equal(text.includes(WRONG_ADMIN_API_KEY), false);
}

const headerAndQueryModes = [
  { name: 'missing key', header: false, query: false, bodyKey: false },
  { name: 'wrong key', header: 'wrong', query: false, bodyKey: false },
  { name: 'query only', header: false, query: true, bodyKey: false },
  { name: 'url key with valid header', header: 'valid', query: true, bodyKey: false },
];

async function expectBlocked(server, routeCase, mode) {
  const guards = routeCase.stores.map((store) => arm(store));
  try {
    const { response, body } = await send(server, routeCase, mode);
    const calls = guards.reduce((total, guard) => total + guard.calls(), 0);
    assert.equal(response.status === 401 || response.status === 403, true, `${routeCase.method} ${routeCase.path} ${mode.name}`);
    assert.equal(calls, 0, `${routeCase.method} ${routeCase.path} ${mode.name}`);
    assert.equal(body.error.message, 'Admin API key is required.');
    assertHidden(body);
  } finally {
    guards.forEach((guard) => guard.restore());
  }
}

test('protected CRM and channel routes block unauthorized calls before data access', async () => {
  await withServer(async (server) => {
    for (const routeCase of protectedRoutes) {
      for (const mode of headerAndQueryModes) {
        await expectBlocked(server, routeCase, mode);
      }
    }
  });
});

test('protected write routes reject an admin key carried in the JSON body', async () => {
  const writeRoutes = protectedRoutes.filter((routeCase) => routeCase.body);
  await withServer(async (server) => {
    for (const routeCase of writeRoutes) {
      await expectBlocked(server, routeCase, { name: 'body only', header: false, query: false, bodyKey: true });
      await expectBlocked(server, routeCase, { name: 'body plus header', header: 'valid', query: false, bodyKey: true });
    }
  });
});

test('valid admin header reaches contacts, workers, link history, and rich menu', async () => {
  const saved = new Map(protectedRoutes.flatMap((routeCase) => routeCase.stores.map((store) => [store, snapshotFns(store)])));
  try {
    await withServer(async (server) => {
      for (const routeCase of protectedRoutes) {
        routeCase.stores.forEach((store) => restoreFns(store, saved.get(store)));
        routeCase.allow();
        const { response, body } = await send(server, routeCase, { header: 'valid', query: false, bodyKey: false });
        routeCase.expect(response, body);
        assertHidden(body);
      }
    });
  } finally {
    for (const [store, fns] of saved) restoreFns(store, fns);
  }
});

test('telegram and line link-code and disconnect stay available without an admin key', async () => {
  const saved = {
    onboarding: coreAgentService.getOnboardingStatus,
    telegramCreate: telegramLinkService.createLinkCode,
    telegramDisconnect: telegramLinkService.disconnectTelegram,
    lineCreate: lineLinkService.createLinkCode,
    lineDisconnect: lineLinkService.disconnectLine,
  };
  const calls = { onboarding: 0, telegramCreate: 0, telegramDisconnect: 0, lineCreate: 0, lineDisconnect: 0 };
  coreAgentService.getOnboardingStatus = async () => {
    calls.onboarding += 1;
    return { user: {}, profile: { userId: 'user_probe' } };
  };
  telegramLinkService.createLinkCode = async () => {
    calls.telegramCreate += 1;
    return { code: 'STUBCODE' };
  };
  telegramLinkService.disconnectTelegram = async () => {
    calls.telegramDisconnect += 1;
    return { userId: 'user_probe' };
  };
  lineLinkService.createLinkCode = async () => {
    calls.lineCreate += 1;
    return { code: 'STUBCODE' };
  };
  lineLinkService.disconnectLine = async () => {
    calls.lineDisconnect += 1;
    return { userId: 'user_probe' };
  };

  try {
    await withServer(async (server) => {
      const requests = [
        ['/api/telegram/link-code', 201, 'telegramCreate'],
        ['/api/telegram/disconnect', 200, 'telegramDisconnect'],
        ['/api/line/link-code', 201, 'lineCreate'],
        ['/api/line/disconnect', 200, 'lineDisconnect'],
      ];
      for (const [requestPath, status, callName] of requests) {
        const before = calls[callName];
        const response = await fetch(createUrl(server, requestPath), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        const body = await response.json();
        assert.equal(response.status, status, requestPath);
        assert.equal(calls[callName], before + 1, requestPath);
        assert.equal(JSON.stringify(body).includes(TEST_ADMIN_API_KEY), false);
      }
      assert.equal(calls.onboarding, 4);
    });
  } finally {
    coreAgentService.getOnboardingStatus = saved.onboarding;
    telegramLinkService.createLinkCode = saved.telegramCreate;
    telegramLinkService.disconnectTelegram = saved.telegramDisconnect;
    lineLinkService.createLinkCode = saved.lineCreate;
    lineLinkService.disconnectLine = saved.lineDisconnect;
  }
});

test('contacts and workers pages keep the admin key in page memory', () => {
  const root = path.join(__dirname, '..');
  const pages = [
    'src/public/add-contact.html',
    'src/public/contacts.html',
    'src/public/add-worker.html',
    'src/public/edit-worker.html',
    'src/public/workers.html',
  ];
  const scripts = [
    'src/public/admin-key-memory.js',
    'src/public/contact-form.js',
    'src/public/contacts-list.js',
    'src/public/worker-form.js',
    'src/public/workers-list.js',
  ];

  for (const page of pages) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    const inputTag = html.match(/<input id="adminApiKey"[^>]*>/);
    assert.equal(Boolean(inputTag), true, page);
    assert.match(inputTag[0], /type="password"/, page);
    assert.match(inputTag[0], /autocomplete="off"/, page);
    assert.equal(/\sname\s*=/.test(inputTag[0]), false, page);
    assert.equal(/\svalue\s*=/.test(inputTag[0]), false, page);
    assert.equal(html.includes('dev-admin-key'), false, page);
    assert.equal(html.includes('admin-key-memory.js'), true, page);
  }

  const memory = fs.readFileSync(path.join(root, 'src/public/admin-key-memory.js'), 'utf8');
  assert.match(memory, /let adminApiKeyMemory/);
  assert.match(memory, /'x-admin-api-key': adminApiKeyMemory/);
  assert.match(memory, /response\.status === 401/);
  assert.match(memory, /Admin API key was rejected/);
  for (const script of scripts) {
    const source = fs.readFileSync(path.join(root, script), 'utf8');
    assert.equal(/\blocalStorage\b/.test(source), false, script);
    assert.equal(/\bsessionStorage\b/.test(source), false, script);
    assert.equal(/\bdocument\.cookie\b/.test(source), false, script);
    assert.equal(source.includes('dev-admin-key'), false, script);
    assert.equal(source.includes('adminApiKey='), false, script);
  }

  assert.match(fs.readFileSync(path.join(root, 'src/public/contact-form.js'), 'utf8'), /adminApiKeyHeaders\(/);
  assert.match(fs.readFileSync(path.join(root, 'src/public/contacts-list.js'), 'utf8'), /adminApiKeyHeaders\(/);
  assert.match(fs.readFileSync(path.join(root, 'src/public/worker-form.js'), 'utf8'), /adminApiKeyHeaders\(/);
  assert.match(fs.readFileSync(path.join(root, 'src/public/workers-list.js'), 'utf8'), /adminApiKeyHeaders\(/);
  assert.equal(fs.readFileSync(path.join(root, 'src/public/chat.js'), 'utf8').includes('x-admin-api-key'), false);
  assert.equal(
    fs.readFileSync(path.join(root, 'src/modules/line/line-webhook.service.js'), 'utf8').includes('req.query.adminApiKey'),
    false
  );
  assert.match(fs.readFileSync(path.join(root, 'src/public/edit-worker.html'), 'utf8'), /id="loadWorkerButton"/);
});
