const { env } = require('../config/env');
const { clientIp } = require('./clientIp');
const { requestPath } = require('./logRedaction');
const { languageFromRequest, messageFor } = require('./userFacingCopy');
const { COOKIE_NAME, openWebSession, parseCookieHeader } = require('./webIdentity');

// In-memory fixed windows for this process only. Counters reset on restart
// and are not shared with other instances. That matches the existing
// single-process requirement for sheet row locks and link-code claims.
//
// Each guarded route counts the TCP peer and, when a valid gw_sid is already
// present, that session. The IP bucket increments even if a cookie is sent,
// so a new cookie cannot reset it. Minting a gw_sid is a separate per-IP
// budget, applied inside attachWebIdentity before a new id is created.
//
// Webhooks have no browser session. Over limit they return HTTP 200
// { ok: true } and skip the handler. LINE and Meta retry non-2xx responses;
// a 429 would turn a flood into a retry storm. The event is dropped.
// Telegram has no HTTP webhook (it uses polling) and is not covered here.
// Link-code redeem limits in src/shared/linkCode.js are unchanged.

const MINUTE = 60 * 1000;

const DEFAULT_POLICIES = Object.freeze({
  chat: Object.freeze({ ipLimit: 20, sessionLimit: 10, windowMs: MINUTE }),
  publicRead: Object.freeze({ ipLimit: 120, sessionLimit: 120, windowMs: MINUTE }),
  linkGenerate: Object.freeze({ ipLimit: 10, sessionLimit: 5, windowMs: 60 * MINUTE }),
  webhook: Object.freeze({ ipLimit: 600, sessionLimit: 0, windowMs: MINUTE }),
  newSession: Object.freeze({ ipLimit: 60, sessionLimit: 0, windowMs: 10 * MINUTE }),
});

let policies = clonePolicies(DEFAULT_POLICIES);
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

function hit(key, limit, windowMs, now) {
  if (!limit || limit < 1) return { allowed: true, retryAfterSeconds: 0 };
  const times = buckets.get(key) || [];
  prune(times, now, windowMs);
  if (times.length >= limit) {
    buckets.set(key, times);
    const retryAfterSeconds = Math.max(1, Math.ceil((times[0] + windowMs - now) / 1000));
    return { allowed: false, retryAfterSeconds };
  }
  times.push(now);
  buckets.set(key, times);
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

function acknowledgeWebhook(req, res) {
  console.warn(`[http] ${req.method || 'UNKNOWN'} ${requestPath(req)} webhook rate limit`);
  res.status(200).json({ ok: true });
}

function guard(policyName, { webhook = false } = {}) {
  return function rateLimitGuard(req, res, next) {
    const sessionId = webhook ? '' : verifiedWebId(req);
    const decision = consume(policyName, clientIp(req), sessionId);
    if (decision.allowed) {
      next();
      return;
    }
    if (webhook) {
      acknowledgeWebhook(req, res);
      return;
    }
    sendRateLimited(req, res, decision);
  };
}

function consumeNewSession(req, now = Date.now()) {
  return consume('newSession', clientIp(req), '', now);
}

function setRateLimitForTests(name, config) {
  if (!policies[name]) policies[name] = { ipLimit: 0, sessionLimit: 0, windowMs: MINUTE };
  Object.assign(policies[name], config);
}

function resetRateLimitsForTests() {
  buckets.clear();
  policies = clonePolicies(DEFAULT_POLICIES);
}

module.exports = {
  DEFAULT_POLICIES,
  acknowledgeWebhook,
  consumeNewSession,
  guard,
  limitChat: guard('chat'),
  limitLinkGenerate: guard('linkGenerate'),
  limitPublicRead: guard('publicRead'),
  limitWebhook: guard('webhook', { webhook: true }),
  resetRateLimitsForTests,
  sendRateLimited,
  setRateLimitForTests,
  verifiedWebId,
};
