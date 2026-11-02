const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const TEST_ADMIN_API_KEY = 'test-only-admin-key-0123456789abcdef';
process.env.ADMIN_API_KEY = TEST_ADMIN_API_KEY;

const contactRepository = require('../src/modules/contacts/contact.repository');
const app = require('../src/app');

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

function captureOutput(fn) {
  const lines = [];
  const levels = ['log', 'info', 'warn', 'error', 'debug'];
  const savedConsole = {};
  const savedWrite = {
    stdout: process.stdout.write,
    stderr: process.stderr.write,
  };
  for (const level of levels) {
    savedConsole[level] = console[level];
    console[level] = (...args) => {
      lines.push(args.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join(' '));
    };
  }
  process.stdout.write = (chunk, ...rest) => {
    lines.push(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk));
    return savedWrite.stdout.call(process.stdout, chunk, ...rest);
  };
  process.stderr.write = (chunk, ...rest) => {
    lines.push(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk));
    return savedWrite.stderr.call(process.stderr, chunk, ...rest);
  };
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const level of levels) console[level] = savedConsole[level];
      process.stdout.write = savedWrite.stdout;
      process.stderr.write = savedWrite.stderr;
    })
    .then(() => lines.join('\n'));
}

function assertNoKey(text, label) {
  if (String(text).includes(TEST_ADMIN_API_KEY)) {
    throw new Error(`${label} contained the admin key value`);
  }
}

test('request and error paths do not log or echo the admin key', async () => {
  const originalFind = contactRepository.findAllContacts;
  const server = app.listen(0);
  const port = server.address().port;
  try {
    const output = await captureOutput(async () => {
      const missing = await rawRequest(port, { method: 'GET', path: '/api/contacts' });
      assert.equal(missing.status, 401);
      assertNoKey(missing.text, '401 response');

      const headerOnly = await rawRequest(port, {
        method: 'GET',
        path: '/api/contacts',
        headers: { 'x-admin-api-key': TEST_ADMIN_API_KEY },
      });
      assertNoKey(headerOnly.text, 'header response');

      const queryAndHeader = await rawRequest(port, {
        method: 'GET',
        path: '/api/contacts?adminApiKey=' + encodeURIComponent(TEST_ADMIN_API_KEY),
        headers: { 'x-admin-api-key': TEST_ADMIN_API_KEY },
      });
      assert.equal(queryAndHeader.status, 401);
      assertNoKey(queryAndHeader.text, 'query response');

      const bodyAndHeader = await rawRequest(port, {
        method: 'POST',
        path: '/api/contacts',
        headers: { 'content-type': 'application/json', 'x-admin-api-key': TEST_ADMIN_API_KEY },
        body: JSON.stringify({ adminApiKey: TEST_ADMIN_API_KEY, first_name: 'Ada' }),
      });
      assert.equal(bodyAndHeader.status, 401);
      assertNoKey(bodyAndHeader.text, 'body response');

      const invalidJson = await rawRequest(port, {
        method: 'POST',
        path: '/api/contacts',
        headers: { 'content-type': 'application/json', 'x-admin-api-key': TEST_ADMIN_API_KEY },
        body: '{"first_name":',
      });
      assert.equal(invalidJson.status, 400);
      assert.equal(JSON.parse(invalidJson.text).error.message, 'Invalid JSON request body.');
      assertNoKey(invalidJson.text, 'invalid JSON response');

      contactRepository.findAllContacts = async () => {
        throw new Error('boom-internal');
      };
      const serverError = await rawRequest(port, {
        method: 'GET',
        path: '/api/contacts',
        headers: { 'x-admin-api-key': TEST_ADMIN_API_KEY },
      });
      assert.equal(serverError.status, 500);
      assert.equal(JSON.parse(serverError.text).error.message, 'boom-internal');
      assertNoKey(serverError.text, '500 response');
    });
    assertNoKey(output, 'captured console and stdio');
  } finally {
    contactRepository.findAllContacts = originalFind;
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
