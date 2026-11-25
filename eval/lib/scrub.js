'use strict';

const SECRET_ENV_KEYS = Object.freeze([
  'OPENAI_API_KEY_EVAL',
  'OPENAI_API_KEY',
  'AI_API_KEY',
  'TELEGRAM_BOT_TOKEN',
  'GOOGLE_SHEETS_PRIVATE_KEY',
  'TRANSLATION_API_KEY',
]);

const REDACTED = '[REDACTED]';

function collectSecretValues(sourceEnv = process.env) {
  const values = [];
  for (const key of SECRET_ENV_KEYS) {
    const value = typeof sourceEnv[key] === 'string' ? sourceEnv[key].trim() : '';
    if (value && value.length >= 8) values.push(value);
  }
  return [...new Set(values)];
}

function scrubString(text, extraSecrets = [], sourceEnv = process.env) {
  let out = String(text == null ? '' : text);
  const secrets = [...collectSecretValues(sourceEnv), ...extraSecrets]
    .filter((value) => typeof value === 'string' && value.length >= 8)
    .sort((a, b) => b.length - a.length);
  for (const secret of secrets) {
    if (!secret) continue;
    out = out.split(secret).join(REDACTED);
  }
  return out;
}

function scrubValue(value, extraSecrets = [], sourceEnv = process.env, seen) {
  const visited = seen || new WeakSet();
  if (typeof value === 'string') return scrubString(value, extraSecrets, sourceEnv);
  if (typeof value === 'number' || typeof value === 'boolean' || value == null) return value;
  if (value instanceof Error) {
    const copy = { name: value.name, message: scrubString(value.message, extraSecrets, sourceEnv), stack: scrubString(value.stack || '', extraSecrets, sourceEnv) };
    if (value.reason) copy.reason = scrubValue(value.reason, extraSecrets, sourceEnv, visited);
    if (value.kind) copy.kind = scrubValue(value.kind, extraSecrets, sourceEnv, visited);
    return copy;
  }
  if (typeof value !== 'object') return value;
  if (visited.has(value)) return '[Cycle]';
  visited.add(value);
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, extraSecrets, sourceEnv, visited));
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    const lower = key.toLowerCase();
    if (/(api[_-]?key|authorization|secret|passwd|password|token|private[_-]?key)/i.test(lower) && typeof item === 'string') {
      out[key] = item ? REDACTED : item;
    } else {
      out[key] = scrubValue(item, extraSecrets, sourceEnv, visited);
    }
  }
  return out;
}

function scrubJson(value, extraSecrets = [], sourceEnv = process.env) {
  return JSON.stringify(scrubValue(value, extraSecrets, sourceEnv), null, 2);
}

function installConsoleScrubbing(extraSecrets = [], sourceEnv = process.env) {
  for (const method of ['log', 'error', 'warn', 'info']) {
    const original = console[method].bind(console);
    console[method] = (...args) => {
      original(...args.map((arg) => {
        if (typeof arg === 'string') return scrubString(arg, extraSecrets, sourceEnv);
        if (arg && typeof arg === 'object') return JSON.parse(scrubJson(arg, extraSecrets, sourceEnv));
        return arg;
      }));
    };
  }
}

module.exports = {
  SECRET_ENV_KEYS,
  REDACTED,
  collectSecretValues,
  scrubString,
  scrubValue,
  scrubJson,
  installConsoleScrubbing,
};
