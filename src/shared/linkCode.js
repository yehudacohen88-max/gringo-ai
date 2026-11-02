const crypto = require('crypto');
const { env } = require('../config/env');

// Crockford base32 without 0/O/1/I. 32 symbols, so each character is 5 unbiased bits.
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_LENGTH = 12;
const ENTROPY_BITS = CODE_LENGTH * Math.log2(ALPHABET.length);
const ACCOUNT_WINDOW_MS = 10 * 60 * 1000;
const ACCOUNT_ATTEMPT_LIMIT = 5;
const CODE_FAILURE_LIMIT = 5;
const GLOBAL_WINDOW_MS = 60 * 1000;
const GLOBAL_FAILURE_LIMIT = 30;
const CREATE_WINDOW_MS = 60 * 60 * 1000;
const CREATE_LIMIT = 5;

const accountAttempts = new Map();
const codeFailures = new Map();
const globalFailures = [];
const createAttempts = new Map();
// In-process single-use claims. Check and add happen with no await between them.
// Two processes can still redeem the same code before Sheets records Used.
const singleUseClaims = new Set();

function cleanCode(code) {
  return String(code || '').trim().toUpperCase();
}

function hashCode(code, secret = env.webSessionSecret) {
  if (typeof secret !== 'string' || secret.length < 32) {
    const error = new Error('Link codes require a configured session secret.');
    error.statusCode = 500;
    throw error;
  }
  return crypto.createHmac('sha256', secret).update(cleanCode(code)).digest('hex');
}

function hashesEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''), 'hex');
  const rightBuffer = Buffer.from(String(right || ''), 'hex');
  if (leftBuffer.length === 0 || leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function generatePlainCode() {
  let code = '';
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    code += ALPHABET[crypto.randomInt(ALPHABET.length)];
  }
  return code;
}

function codeExpiresAt(ttlMinutes = env.telegram?.linkCodeTtlMinutes) {
  const minutes = Number(ttlMinutes);
  const ttl = Number.isFinite(minutes) ? minutes : 10;
  return new Date(Date.now() + ttl * 60 * 1000).toISOString();
}

function pruneOlder(times, windowMs, now) {
  return times.filter((time) => now - time < windowMs);
}

function codeFailureCount(codeKey, now = Date.now()) {
  const entry = codeFailures.get(codeKey);
  if (!entry) return 0;
  if (now - entry.updatedAt >= ACCOUNT_WINDOW_MS) {
    codeFailures.delete(codeKey);
    return 0;
  }
  return entry.count;
}

function beginRedeemAttempt(channel, accountId, plainCode) {
  const now = Date.now();
  while (globalFailures.length && now - globalFailures[0] >= GLOBAL_WINDOW_MS) globalFailures.shift();
  if (globalFailures.length >= GLOBAL_FAILURE_LIMIT) {
    return { allowed: false, reason: 'global_lockout' };
  }

  const codeKey = hashCode(plainCode);
  if (codeFailureCount(codeKey, now) >= CODE_FAILURE_LIMIT) {
    return { allowed: false, reason: 'code_rate_limited' };
  }

  const accountKey = `${channel}:${String(accountId || '').trim()}`;
  const attempts = pruneOlder(accountAttempts.get(accountKey) || [], ACCOUNT_WINDOW_MS, now);
  if (attempts.length >= ACCOUNT_ATTEMPT_LIMIT) {
    accountAttempts.set(accountKey, attempts);
    return { allowed: false, reason: 'account_rate_limited' };
  }
  attempts.push(now);
  accountAttempts.set(accountKey, attempts);
  return { allowed: true, codeKey };
}

function recordRedeemFailure(codeKey) {
  if (!codeKey) return;
  const now = Date.now();
  const count = codeFailureCount(codeKey, now) + 1;
  codeFailures.set(codeKey, { count, updatedAt: now });
  globalFailures.push(now);
}

function claimKey(channel, codeKey) {
  return `${channel}:${codeKey}`;
}

function claimSingleUse(channel, codeKey) {
  const key = claimKey(channel, codeKey);
  if (!key || key.endsWith(':')) return false;
  if (singleUseClaims.has(key)) return false;
  singleUseClaims.add(key);
  return true;
}

function releaseSingleUse(channel, codeKey) {
  singleUseClaims.delete(claimKey(channel, codeKey));
}

function assertCanCreate(ownerId) {
  const key = String(ownerId || '').trim();
  if (!key) {
    const error = new Error('A verified web session is required.');
    error.statusCode = 401;
    error.code = 'WEB_SESSION_REQUIRED';
    throw error;
  }
  const now = Date.now();
  const attempts = pruneOlder(createAttempts.get(key) || [], CREATE_WINDOW_MS, now);
  if (attempts.length >= CREATE_LIMIT) {
    createAttempts.set(key, attempts);
    const error = new Error('Too many link codes. Please wait and try again.');
    error.statusCode = 429;
    error.code = 'LINK_CODE_CREATE_LIMIT';
    throw error;
  }
  attempts.push(now);
  createAttempts.set(key, attempts);
}

function resetLinkCodeSecurityForTests() {
  accountAttempts.clear();
  codeFailures.clear();
  globalFailures.length = 0;
  createAttempts.clear();
  singleUseClaims.clear();
}

module.exports = {
  ACCOUNT_ATTEMPT_LIMIT,
  ALPHABET,
  CODE_FAILURE_LIMIT,
  CODE_LENGTH,
  CREATE_LIMIT,
  ENTROPY_BITS,
  GLOBAL_FAILURE_LIMIT,
  assertCanCreate,
  beginRedeemAttempt,
  claimSingleUse,
  codeExpiresAt,
  generatePlainCode,
  hashCode,
  hashesEqual,
  recordRedeemFailure,
  releaseSingleUse,
  resetLinkCodeSecurityForTests,
};
