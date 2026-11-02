const crypto = require('crypto');
const { env } = require('../config/env');

const COOKIE_NAME = 'gw_sid';
const COOKIE_VERSION = 'v1';
const ID_BYTES = 32;
const MAX_AGE_SECONDS = 180 * 24 * 60 * 60;
const ID_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function sessionCookieAttributes(nodeEnv = env.nodeEnv) {
  return {
    httpOnly: true,
    secure: nodeEnv === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  };
}

function signPayload(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function signaturesMatch(actual, expected) {
  const actualBuffer = Buffer.from(String(actual));
  const expectedBuffer = Buffer.from(String(expected));
  if (actualBuffer.length === 0 || actualBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function createWebId() {
  return crypto.randomBytes(ID_BYTES).toString('base64url');
}

function sealWebSession(webId, secret) {
  const payload = `${COOKIE_VERSION}.${webId}`;
  return `${payload}.${signPayload(payload, secret)}`;
}

function openWebSession(token, secrets) {
  const list = (Array.isArray(secrets) ? secrets : [secrets]).filter((secret) => typeof secret === 'string' && secret.length > 0);
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const [version, webId, signature] = parts;
  if (version !== COOKIE_VERSION || !ID_PATTERN.test(webId)) return null;
  const payload = `${version}.${webId}`;
  for (let index = 0; index < list.length; index += 1) {
    const expected = signPayload(payload, list[index]);
    if (signaturesMatch(signature, expected)) {
      return { webId, rotated: index !== 0 };
    }
  }
  return null;
}

function parseCookieHeader(header) {
  const cookies = {};
  if (!header) return cookies;
  for (const part of String(header).split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    const name = part.slice(0, separator).trim();
    if (!name) continue;
    const rawValue = part.slice(separator + 1).trim();
    try {
      cookies[name] = decodeURIComponent(rawValue);
    } catch (error) {
      cookies[name] = rawValue;
    }
  }
  return cookies;
}

function serializeSessionCookie(value, nodeEnv = env.nodeEnv) {
  const attributes = sessionCookieAttributes(nodeEnv);
  const pieces = [`${COOKIE_NAME}=${encodeURIComponent(value)}`, `Max-Age=${attributes.maxAge}`, `Path=${attributes.path}`];
  if (attributes.httpOnly) pieces.push('HttpOnly');
  if (attributes.secure) pieces.push('Secure');
  pieces.push(`SameSite=${attributes.sameSite}`);
  return pieces.join('; ');
}

function sessionSecrets() {
  return [env.webSessionSecret, env.webSessionSecretPrevious].filter((secret) => typeof secret === 'string' && secret.length > 0);
}

function identityFor(webId, isNew) {
  return {
    kind: 'web',
    channel: 'web',
    webId,
    ownerKey: `web:${webId}`,
    isNew,
  };
}

function writeSessionCookie(res, webId) {
  res.append('Set-Cookie', serializeSessionCookie(sealWebSession(webId, env.webSessionSecret)));
}

function attachWebIdentity(req, res, next) {
  const secrets = sessionSecrets();
  const cookies = parseCookieHeader(req.headers.cookie);
  const opened = openWebSession(cookies[COOKIE_NAME], secrets);
  if (opened) {
    req.identity = identityFor(opened.webId, false);
    writeSessionCookie(res, opened.webId);
    next();
    return;
  }

  const webId = createWebId();
  req.identity = identityFor(webId, true);
  writeSessionCookie(res, webId);
  next();
}

module.exports = {
  COOKIE_NAME,
  COOKIE_VERSION,
  ID_BYTES,
  MAX_AGE_SECONDS,
  attachWebIdentity,
  createWebId,
  openWebSession,
  parseCookieHeader,
  sealWebSession,
  serializeSessionCookie,
  sessionCookieAttributes,
};
