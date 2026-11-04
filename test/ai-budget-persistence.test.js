const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const aiBudget = require('../src/modules/ai-provider/ai-budget.service');

function withStateFile(fn) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aib-')), 'state.json');
  const prev = { file: process.env.AI_BUDGET_STATE_FILE, user: process.env.AI_DAILY_USER_LIMIT };
  process.env.AI_BUDGET_STATE_FILE = file;
  try {
    aiBudget.reset({ reload: true });
    fn(file);
  } finally {
    if (prev.file === undefined) delete process.env.AI_BUDGET_STATE_FILE; else process.env.AI_BUDGET_STATE_FILE = prev.file;
    if (prev.user === undefined) delete process.env.AI_DAILY_USER_LIMIT; else process.env.AI_DAILY_USER_LIMIT = prev.user;
    aiBudget.reset();
  }
}

test('counters survive a restart (reload from state file)', () => withStateFile((file) => {
  process.env.AI_DAILY_USER_LIMIT = '2';
  aiBudget.reserve('telegram:12345');
  aiBudget.reserve('telegram:12345');
  aiBudget.recordUsage({ total_tokens: 50 });
  aiBudget.flush();
  aiBudget.reset({ reload: true });
  const snap = aiBudget.snapshot();
  assert.equal(snap.calls, 2);
  assert.equal(snap.tokens, 50);
  assert.throws(() => aiBudget.reserve('telegram:12345'), { reason: 'user_daily_limit' });
}));

test('state file holds no raw user ids', () => withStateFile((file) => {
  aiBudget.reserve('telegram:987654321');
  aiBudget.flush();
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(!text.includes('987654321'));
  assert.ok(!text.includes('telegram'));
}));

test('state from a previous day is ignored', () => withStateFile((file) => {
  fs.writeFileSync(file, JSON.stringify({ day: '2000-01-01', global: 999, tokens: 5, perUser: [] }));
  aiBudget.reset({ reload: true });
  assert.equal(aiBudget.snapshot().calls, 0);
}));

test('corrupt state file starts from zero', () => withStateFile((file) => {
  fs.writeFileSync(file, '{not json');
  aiBudget.reset({ reload: true });
  assert.equal(aiBudget.snapshot().calls, 0);
}));

test('admin page has an AI usage section wired to /ai-usage', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'admin.html'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'admin.js'), 'utf8');
  assert.match(html, /id="aiUsageSection"/);
  assert.match(html, /data-admin-section="aiUsageSection"/);
  assert.match(js, /adminFetch\('\/ai-usage'\)/);
  assert.match(js, /escapeHtml\(value\)\}<\/strong>/);
});
