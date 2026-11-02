const crypto = require('crypto');

const app = require('../src/app');
const { COOKIE_NAME, openWebSession } = require('../src/shared/webIdentity');
const { env } = require('../src/config/env');

const NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'Not found.', details: [] } };
const today = new Date().toISOString().slice(0, 10);

function listen() {
  const server = app.listen(0);
  const { port } = server.address();
  return {
    base: `http://127.0.0.1:${port}`,
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

function cookieValue(response) {
  const header = response.headers.getSetCookie().find((value) => value.startsWith(`${COOKIE_NAME}=`));
  if (!header) throw new Error('missing session cookie');
  return decodeURIComponent(header.split(';')[0].slice(COOKIE_NAME.length + 1));
}

async function readBody(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch (error) {
    return text;
  }
}

function cookieHeader(cookie) {
  return { cookie: `${COOKIE_NAME}=${encodeURIComponent(cookie)}` };
}

async function session(base, fullName) {
  const started = await fetch(`${base}/api/chat/profile`);
  const cookie = cookieValue(started);
  await readBody(started);
  const saved = await fetch(`${base}/api/chat/profile`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      origin: base,
      ...cookieHeader(cookie),
    },
    body: JSON.stringify({ fullName, preferredCurrency: 'THB', country: 'Thailand' }),
  });
  const body = await readBody(saved);
  if (saved.status !== 200) throw new Error(JSON.stringify(body));
  return { cookie, userId: body.profile.userId, fullName: body.profile.fullName };
}

async function callApi(base, cookie, method, urlPath, payload, extraHeaders = {}) {
  const unsafe = !['GET', 'HEAD'].includes(method);
  const response = await fetch(`${base}${urlPath}`, {
    method,
    headers: {
      ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
      ...(unsafe ? { origin: base } : {}),
      ...cookieHeader(cookie),
      ...extraHeaders,
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  return { response, body: await readBody(response) };
}

function assertHidden(assert, response, body, secret) {
  assert.equal(response.status, 404, JSON.stringify(body));
  assert.deepEqual(body, NOT_FOUND);
  assert.equal(JSON.stringify(body).includes(secret), false);
}

async function withUsers(fn) {
  const suffix = crypto.randomBytes(3).toString('hex');
  const server = listen();
  try {
    const ada = await session(server.base, `Ada ${suffix}`);
    const bo = await session(server.base, `Bo ${suffix}`);
    const api = (user, method, urlPath, payload, headers) => callApi(server.base, user.cookie, method, urlPath, payload, headers);
    await fn({ server, ada, bo, api, suffix });
  } finally {
    await server.close();
  }
}

function webIdFromCookie(cookie) {
  const opened = openWebSession(cookie, [env.webSessionSecret, env.webSessionSecretPrevious].filter(Boolean));
  return opened && opened.webId;
}

module.exports = {
  NOT_FOUND,
  assertHidden,
  callApi,
  cookieHeader,
  cookieValue,
  listen,
  readBody,
  session,
  today,
  webIdFromCookie,
  withUsers,
};
