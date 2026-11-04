// render.yaml and .env.production.example: Telegram-only pilot, one instance,
// state on the persistent disk, and no secret values committed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const yaml = fs.readFileSync(path.join(ROOT, 'render.yaml'), 'utf8');
const prodEnv = fs.readFileSync(path.join(ROOT, '.env.production.example'), 'utf8');
const SECRETS = ['ADMIN_API_KEY', 'WEB_SESSION_SECRET', 'TELEGRAM_BOT_TOKEN', 'AI_API_KEY', 'GOOGLE_SHEETS_SPREADSHEET_ID', 'GOOGLE_SHEETS_CLIENT_EMAIL', 'GOOGLE_SHEETS_PRIVATE_KEY'];

function yamlValue(key) {
  const m = yaml.match(new RegExp(`- key: ${key}\\n\\s+(value: "?([^"\\n#]*)"?|sync: false)`));
  return m ? (m[1] === 'sync: false' ? { sync: false } : { value: m[2].trim() }) : null;
}

test('render.yaml: one Starter web service with a /var/data disk and /health check', () => {
  assert.equal((yaml.match(/- type: web/g) || []).length, 1);
  assert.match(yaml, /plan: 0\.5c-512mb/);
  assert.match(yaml, /numInstances: 1\b/);
  assert.match(yaml, /mountPath: \/var\/data/);
  assert.match(yaml, /healthCheckPath: \/health/);
  assert.match(yaml, /autoDeployTrigger: off/);
  assert.match(yaml, /startCommand: node src\/server\.js/);
});

test('render.yaml: pilot settings', () => {
  const want = { NODE_ENV: 'production', TRUST_PROXY_HOPS: '1', TELEGRAM_BOT_ENABLED: 'true', TELEGRAM_BOT_MODE: 'polling', LINE_ENABLED: 'false', WHATSAPP_ENABLED: 'false', AI_BUDGET_STATE_FILE: '/var/data/ai-budget.json', GRINGO_PROCESS_LOCK_FILE: '/var/data/gringo.lock', TELEGRAM_STATE_FILE: '/var/data/telegram-state.json' };
  for (const [k, v] of Object.entries(want)) assert.deepEqual(yamlValue(k), { value: v }, k);
  for (const k of ['AI_DAILY_USER_LIMIT', 'AI_DAILY_GLOBAL_LIMIT', 'AI_DAILY_TOKEN_LIMIT', 'AI_TIMEOUT_MS']) assert.match(yamlValue(k).value, /^\d+$/, k);
});

test('render.yaml: every secret is sync:false, none has a value', () => {
  for (const k of SECRETS) assert.deepEqual(yamlValue(k), { sync: false }, k);
  assert.doesNotMatch(yaml, /BEGIN PRIVATE KEY|sk-[A-Za-z0-9]|\d{6,}:[A-Za-z0-9_-]{30,}/);
});

test('.env.production.example has every secret name with an empty value', () => {
  for (const k of SECRETS) assert.match(prodEnv, new RegExp(`^${k}=$`, 'm'), k);
  assert.match(prodEnv, /^LINE_ENABLED=false$/m);
  assert.match(prodEnv, /^WHATSAPP_ENABLED=false$/m);
});

test('the app reads PORT from the environment (Render sets it)', () => {
  assert.match(fs.readFileSync(path.join(ROOT, 'src/config/env.js'), 'utf8'), /Number\(process\.env\.PORT \|\| 3000\)/);
});

test('setup:pilot covers the Telegram tabs that nothing else creates', () => {
  const { pilotTabs } = require('../scripts/setupPilotSheets');
  const names = pilotTabs().map(([n]) => n);
  for (const n of ['TelegramLinkCodes', 'TelegramLinkHistory', 'TelegramDeliveries', 'UserNotifications', 'UserTasks']) assert.ok(names.includes(n), n);
  for (const [, fields] of pilotTabs()) assert.ok(fields.length > 0);
});
