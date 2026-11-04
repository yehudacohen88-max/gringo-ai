const { env } = require('../config/env');
const { clientIp } = require('./clientIp');
const { requestPath } = require('./logRedaction');
const { languageFromRequest, messageFor } = require('./userFacingCopy');
const { COOKIE_NAME, openWebSession, parseCookieHeader } = require('./webIdentity');

// In-memory fixed windows for this process only. Counters reset on restart
// and are not shared with other instances.
//
// Route limits count the client address and, when a valid gw_sid is already
// present, that session. The address bucket increments even if a cookie is
// sent. Minting a gw_sid is a separate per-address budget.
//
// LINE and WhatsApp verify the signature before any signed-event limit.
// A missing or bad signature is rejected with the existing 401/403/503 and
// counted only in webhookUnsigned. It cannot spend webhookSigned.
// A verified event over webhookSigned returns HTTP 429 so LINE (when webhook
// redelivery is enabled) and Meta (any non-200) can deliver it again.
// Telegram has no HTTP webhook. Link-code redeem limits are unchanged.

const MINUTE = 60 * 1000;
const DEFAULT_BUCKET_CAP = 10000;
const DEFAULT_SWEEP_INTERVAL = 64;

const DEFAULT_POLICIES = Object.freeze({
  chat: Object.freeze({ ipLimit: 20, sessionLimit: 10, windowMs: MINUTE }),
  publicRead: Object.freeze({ ipLimit: 120, sessionLimit: 120, windowMs: MINUTE }),
  privacy: Object.freeze({ ipLimit: 20, sessionLimit: 10, windowMs: MINUTE }),
  linkGenerate: Object.freeze({ ipLimit: 10, sessionLimit: 5, windowMs: 60 * MINUTE }),
  webhookSigned: Object.freeze({ ipLimit: 600, sessionLimit: 0, windowMs: MINUTE }),
  webhookUnsigned: Object.freeze({ ipLimit: 60, sessionLimit: 0, windowMs: MINUTE }),
  newSession: Object.freeze({ ipLimit: 60, sessionLimit: 0, windowMs: 10 * MINUTE }),
});

let policies = clonePolicies(DEFAULT_POLICIES);
let bucketCap = DEFAULT_BUCKET_CAP;
let sweepInterval = DEFAULT_SWEEP_INTERVAL;
let operations = 0;
const buckets = new Map();

function clonePolicies(source) {
  return Object.fromEntries(Object.entries(source).map(([name, policy]) => [name, { ...policy }]));
}

function verifiedWebId(req) {
  const cookies = parseCookieHeader(req && req.headers && req.headers.cookie);
  const secrets = [env.webSessionSecret, env.webSessionSecretPrevious].filter((secret) => typeof secret === 'string' && secret.length > 0);
  const opened = openWebSession(cookies[COOKIE_NAME], secrets);
  return opened ? opened.webId : '';
}

function prune(times, now, windowMs) {
  let index = 0;
  while (index < times.length && now - times[index] >= windowMs) index += 1;
  if (index > 0) times.splice(0, index);
  return times;
}

function sweepExpired(now) {
  for (const [key, entry] of buckets) {
    prune(entry.times, now, entry.windowMs);
    if (entry.times.length === 0) buckets.delete(key);
  }
}

function evictOldest() {
  let oldestKey = '';
  let oldestAt = Infinity;
  for (const [key, entry] of buckets) {
    if (entry.touchedAt < oldestAt) {
      oldestAt = entry.touchedAt;
      oldestKey = key;
    }
  }
  if (!oldestKey) return false;
  buckets.delete(oldestKey);
  return true;
}

function maybeSweep(now) {
  operations += 1;
  if (sweepInterval > 0 && (operations % sweepInterval === 0 || buckets.size >= bucketCap)) {
    sweepExpired(now);
  }
}

function makeRoom(now) {
  if (buckets.size < bucketCap) return;
  sweepExpired(now);
  while (buckets.size >= bucketCap) {
    if (!evictOldest()) break;
  }
}

function hit(key, limit, windowMs, now) {
  if (!limit || limit < 1) return { allowed: true, retryAfterSeconds: 0 };
  maybeSweep(now);
  let entry = buckets.get(key);
  if (!entry) {
    makeRoom(now);
    entry = { times: [], windowMs, touchedAt: now };
    buckets.set(key, entry);
  } else {
    entry.touchedAt = now;
    entry.windowMs = windowMs;
  }
  prune(entry.times, now, windowMs);
  if (entry.times.length >= limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((entry.times[0] + windowMs - now) / 1000));
    return { allowed: false, retryAfterSeconds };
  }
  entry.times.push(now);
  entry.touchedAt = now;
  return { allowed: true, retryAfterSeconds: 0 };
}

function consume(policyName, ip, sessionId, now = Date.now()) {
  const policy = policies[policyName];
  if (!policy) return { allowed: true, retryAfterSeconds: 0 };
  const ipDecision = hit(`ip:${policyName}:${ip}`, policy.ipLimit, policy.windowMs, now);
  const sessionDecision = sessionId
    ? hit(`session:${policyName}:${sessionId}`, policy.sessionLimit, policy.windowMs, now)
    : { allowed: true, retryAfterSeconds: 0 };
  return {
    allowed: ipDecision.allowed && sessionDecision.allowed,
    retryAfterSeconds: Math.max(ipDecision.retryAfterSeconds, sessionDecision.retryAfterSeconds),
  };
}

function sendRateLimited(req, res, decision) {
  const language = languageFromRequest(req);
  res.set('Retry-After', String(decision.retryAfterSeconds || 1));
  res.status(429).json({
    error: {
      code: 'RATE_LIMITED',
      message: messageFor(language, 'rateLimited'),
      details: [],
    },
  });
}

function guard(policyName) {
  return function rateLimitGuard(req, res, next) {
    const decision = consume(policyName, clientIp(req), verifiedWebId(req));
    if (decision.allowed) {
      next();
      return;
    }
    sendRateLimited(req, res, decision);
  };
}

function consumeNewSession(req, now = Date.now()) {
  return consume('newSession', clientIp(req), '', now);
}

function noteUnsignedWebhook(req) {
  consume('webhookUnsigned', clientIp(req), '');
}

function limitSignedWebhook(req, res) {
  const decision = consume('webhookSigned', clientIp(req), '');
  if (decision.allowed) return true;
  console.warn(`[http] ${req.method || 'UNKNOWN'} ${requestPath(req)} signed webhook rate limit`);
  sendRateLimited(req, res, decision);
  return false;
}

function setRateLimitForTests(name, config) {
  if (!policies[name]) policies[name] = { ipLimit: 0, sessionLimit: 0, windowMs: MINUTE };
  Object.assign(policies[name], config);
}

function setBucketCapForTests(cap) {
  const numeric = Number(cap);
  bucketCap = Number.isInteger(numeric) && numeric > 0 ? numeric : DEFAULT_BUCKET_CAP;
}

function setSweepIntervalForTests(interval) {
  const numeric = Number(interval);
  sweepInterval = Number.isInteger(numeric) && numeric > 0 ? numeric : DEFAULT_SWEEP_INTERVAL;
}

function bucketCountForTests() {
  return buckets.size;
}

function resetRateLimitsForTests() {
  buckets.clear();
  policies = clonePolicies(DEFAULT_POLICIES);
  bucketCap = DEFAULT_BUCKET_CAP;
  sweepInterval = DEFAULT_SWEEP_INTERVAL;
  operations = 0;
}

module.exports = {
  DEFAULT_BUCKET_CAP,
  DEFAULT_POLICIES,
  bucketCountForTests,
  consume,
  consumeNewSession,
  guard,
  limitChat: guard('chat'),
  limitLinkGenerate: guard('linkGenerate'),
  limitPrivacy: guard('privacy'),
  limitPublicRead: guard('publicRead'),
  limitSignedWebhook,
  noteUnsignedWebhook,
  resetRateLimitsForTests,
  sendRateLimited,
  setBucketCapForTests,
  setRateLimitForTests,
  setSweepIntervalForTests,
  verifiedWebId,
};
