// AI cost guard (pilot). Counts OpenAI calls per user and in total per UTC day,
// in process memory. This is valid because the pilot runs a single process
// (see README "Single-process requirement"). A restart resets the counters,
// so AI_DAILY_GLOBAL_LIMIT is a soft ceiling, not a billing guarantee; set a
// hard monthly budget in the OpenAI dashboard as well.
//
// AI_ENABLED=false            kill switch: no OpenAI call is made at all.
// AI_DAILY_USER_LIMIT=30      calls per user per UTC day (0 = no calls).
// AI_DAILY_GLOBAL_LIMIT=1000  calls per UTC day for the whole process.
// AI_DAILY_TOKEN_LIMIT=0      total tokens per UTC day (0 = not enforced).
// AI_BUDGET_STATE_FILE        today's counters are saved here so a restart
//                             does not reset them (AI-06). Default:
//                             <tmpdir>/gringo-ai-budget.json; "off" disables.
//                             Off under NODE_ENV=test unless set. User keys
//                             are stored only as truncated HMAC-SHA256 keyed
//                             with WEB_SESSION_SECRET. Older files may still
//                             hold an unsalted truncated SHA-256; the next
//                             reserve or a privacy erasure folds that entry
//                             into the HMAC and keeps the count. Erasure never
//                             deletes a counter: a delete-and-retry must not
//                             reset the daily cap. The whole per-user map is
//                             dropped when the UTC day changes.

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { env } = require('../../config/env');

const DEFAULTS = { userLimit: 30, globalLimit: 1000, tokenLimit: 0 };
const SAVE_DELAY_MS = 1000;

let state = freshState();
let loaded = false;
let saveTimer = null;

function stateFile() {
  const raw = String(process.env.AI_BUDGET_STATE_FILE ?? '').trim();
  if (raw.toLowerCase() === 'off') return '';
  if (raw) return raw;
  if (process.env.NODE_ENV === 'test') return '';
  return path.join(os.tmpdir(), 'gringo-ai-budget.json');
}

function legacyUnsaltedKey(userKey) {
  return crypto.createHash('sha256').update(String(userKey)).digest('hex').slice(0, 24);
}

// A known fallback key would make the counter linkable by anyone who can
// guess the user id. Production already refuses to boot without a secret;
// this refuses again rather than hashing with a published constant.
function keyedHashWith(secret, userKey) {
  return crypto.createHmac('sha256', secret).update(`ai-budget:${userKey}`).digest('hex').slice(0, 24);
}

function keyedHash(userKey) {
  const secret = env.webSessionSecret;
  if (!secret) {
    const error = new Error('WEB_SESSION_SECRET is required to key AI budget counters.');
    error.code = 'PRIVACY_KEY_UNAVAILABLE';
    throw error;
  }
  return keyedHashWith(secret, userKey);
}

function priorKeys(rawUserKey) {
  const keys = [legacyUnsaltedKey(rawUserKey)];
  if (env.webSessionSecretPrevious) keys.push(keyedHashWith(env.webSessionSecretPrevious, rawUserKey));
  return keys;
}

function foldLegacyKey(rawUserKey) {
  const next = keyedHash(rawUserKey);
  let changed = false;
  for (const old of priorKeys(rawUserKey)) {
    if (old === next || !state.perUser.has(old)) continue;
    state.perUser.set(next, (state.perUser.get(next) || 0) + state.perUser.get(old));
    state.perUser.delete(old);
    changed = true;
  }
  return changed;
}

function countFor(rawUserKey) {
  if (!rawUserKey) return 0;
  const next = keyedHash(rawUserKey);
  let total = state.perUser.get(next) || 0;
  for (const old of priorKeys(rawUserKey)) {
    if (old !== next) total += state.perUser.get(old) || 0;
  }
  return total;
}

// Move this user's unsalted counter onto the HMAC key and keep the count.
// Other users' entries are not read or written. Nothing is deleted.
function rekeyUserCounters(rawKeys = []) {
  ensureLoaded();
  const snapshot = new Map(state.perUser);
  let rekeyed = 0;
  try {
    for (const raw of rawKeys) {
      if (!raw) continue;
      if (foldLegacyKey(raw)) rekeyed += 1;
    }
  } catch (error) {
    state.perUser = snapshot;
    console.error('[ai-budget] REFUSING to rekey counters without WEB_SESSION_SECRET. A known fallback key is not used.');
    return { ok: false, rekeyed: 0, persisted: false };
  }
  if (!rekeyed) return { ok: true, rekeyed: 0, persisted: Boolean(stateFile()) };
  if (!stateFile()) return { ok: true, rekeyed, persisted: false };
  const persisted = flush();
  if (!persisted) {
    state.perUser = snapshot;
    return { ok: false, rekeyed: 0, persisted: false };
  }
  return { ok: true, rekeyed, persisted: true };
}

function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  const file = stateFile();
  if (!file) return;
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (saved && saved.day === currentDay()) {
      state = {
        day: saved.day,
        global: Number(saved.global) || 0,
        tokens: Number(saved.tokens) || 0,
        denied: Number(saved.denied) || 0,
        perUser: new Map((saved.perUser || []).filter((e) => Array.isArray(e) && e.length === 2)),
      };
    }
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('[ai-budget] Could not read saved counters; starting from zero.');
  }
}

function flush() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const file = stateFile();
  if (!file) return true;
  const body = JSON.stringify({ day: state.day, global: state.global, tokens: state.tokens, denied: state.denied, perUser: [...state.perUser] });
  try {
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, body, { mode: 0o600 });
    fs.renameSync(tmp, file);
    return true;
  } catch (_) {
    console.warn('[ai-budget] Could not save counters.');
    return false;
  }
}

function scheduleSave() {
  if (saveTimer || !stateFile()) return;
  saveTimer = setTimeout(flush, SAVE_DELAY_MS);
  if (saveTimer.unref) saveTimer.unref();
}

function freshState(day = currentDay()) {
  return { day, global: 0, tokens: 0, perUser: new Map(), denied: 0 };
}

function currentDay(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function readLimit(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || String(raw).trim() === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function config() {
  return {
    enabled: String(process.env.AI_ENABLED ?? 'true').trim().toLowerCase() !== 'false',
    userLimit: readLimit('AI_DAILY_USER_LIMIT', DEFAULTS.userLimit),
    globalLimit: readLimit('AI_DAILY_GLOBAL_LIMIT', DEFAULTS.globalLimit),
    tokenLimit: readLimit('AI_DAILY_TOKEN_LIMIT', DEFAULTS.tokenLimit),
  };
}

function roll(now) {
  ensureLoaded();
  const day = currentDay(now);
  if (state.day !== day) state = freshState(day);
}

class AiBudgetError extends Error {
  constructor(reason) {
    super(`AI request not sent: ${reason}.`);
    this.name = 'AiBudgetError';
    this.reason = reason;
  }
}

// Reserve one call. Throws AiBudgetError (no network call should follow).
// A missing WEB_SESSION_SECRET throws before any counter is written. There is
// no fallback that stores an unsalted hash or the raw user id.
function reserve(rawUserKey, now = new Date()) {
  roll(now);
  const userKey = rawUserKey ? String(rawUserKey) : '';
  const cfg = config();
  let reason = '';
  if (!cfg.enabled) reason = 'disabled';
  else if (state.global >= cfg.globalLimit) reason = 'global_daily_limit';
  else if (cfg.tokenLimit > 0 && state.tokens >= cfg.tokenLimit) reason = 'global_token_limit';
  else if (userKey && countFor(userKey) >= cfg.userLimit) reason = 'user_daily_limit';
  if (reason) {
    state.denied += 1;
    if (reason !== 'user_daily_limit' && state.denied === 1) {
      console.warn(`[ai-budget] AI calls blocked for today: ${reason}.`);
    }
    scheduleSave();
    throw new AiBudgetError(reason);
  }
  state.global += 1;
  if (userKey) {
    foldLegacyKey(userKey);
    const stored = keyedHash(userKey);
    state.perUser.set(stored, (state.perUser.get(stored) || 0) + 1);
  }
  scheduleSave();
}

function recordUsage(usage) {
  const total = Number(usage && (usage.total_tokens ?? (Number(usage.input_tokens || 0) + Number(usage.output_tokens || 0))));
  if (Number.isFinite(total) && total > 0) {
    state.tokens += total;
    scheduleSave();
  }
}

// No user keys in the snapshot: safe for an admin endpoint or logs.
function snapshot(now = new Date()) {
  roll(now);
  const cfg = config();
  return {
    day: state.day,
    enabled: cfg.enabled,
    calls: state.global,
    tokens: state.tokens,
    denied: state.denied,
    users: state.perUser.size,
    limits: { perUser: cfg.userLimit, global: cfg.globalLimit, tokens: cfg.tokenLimit },
  };
}

// Tests only: forget in-memory state; next use reloads from the state file.
function reset({ reload = false } = {}) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  state = freshState();
  loaded = !reload;
}

module.exports = { AiBudgetError, reserve, recordUsage, snapshot, reset, flush, currentDay, rekeyUserCounters, legacyUnsaltedKey };
