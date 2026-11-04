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

const DEFAULTS = { userLimit: 30, globalLimit: 1000, tokenLimit: 0 };

let state = freshState();

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
function reserve(userKey, now = new Date()) {
  roll(now);
  const cfg = config();
  let reason = '';
  if (!cfg.enabled) reason = 'disabled';
  else if (state.global >= cfg.globalLimit) reason = 'global_daily_limit';
  else if (cfg.tokenLimit > 0 && state.tokens >= cfg.tokenLimit) reason = 'global_token_limit';
  else if (userKey && (state.perUser.get(userKey) || 0) >= cfg.userLimit) reason = 'user_daily_limit';
  if (reason) {
    state.denied += 1;
    if (reason !== 'user_daily_limit' && state.denied === 1) {
      console.warn(`[ai-budget] AI calls blocked for today: ${reason}.`);
    }
    throw new AiBudgetError(reason);
  }
  state.global += 1;
  if (userKey) state.perUser.set(userKey, (state.perUser.get(userKey) || 0) + 1);
}

function recordUsage(usage) {
  const total = Number(usage && (usage.total_tokens ?? (Number(usage.input_tokens || 0) + Number(usage.output_tokens || 0))));
  if (Number.isFinite(total) && total > 0) state.tokens += total;
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

function reset() {
  state = freshState();
}

module.exports = { AiBudgetError, reserve, recordUsage, snapshot, reset, currentDay };
