// Runs the Telegram acceptance script in --local mode (mocked Telegram API) as a child process.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const path = require('path');

test('scripts/acceptance-telegram.js --local passes all checks offline', () => {
  const env = { ...process.env };
  delete env.GRINGO_PRIVACY_CONSENT_GATE;
  const run = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'acceptance-telegram.js'), '--local'], { cwd: path.join(__dirname, '..'), env, encoding: 'utf8', timeout: 60000 });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /(\d+)\/\1 checks passed/);
  assert.doesNotMatch(run.stdout, /^FAIL/m);
});
