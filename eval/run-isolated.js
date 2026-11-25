#!/usr/bin/env node
'use strict';

// Spawns the eval runner with a filtered environment. The eval key is copied
// from process.env into the child env object only — it is never written to a
// file and never placed on the command line (avoid `env -i KEY=value`, which
// would leak via ps).

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { scrubString } = require('./lib/scrub');

const ALLOWED_ENV = Object.freeze([
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TZ',
  'TMPDIR',
  'TEMP',
  'TMP',
  'TERM',
  'OPENAI_API_KEY_EVAL',
]);

function buildIsolatedEnv(sourceEnv = process.env) {
  const env = {};
  for (const key of ALLOWED_ENV) {
    if (typeof sourceEnv[key] === 'string' && sourceEnv[key] !== '') {
      env[key] = sourceEnv[key];
    }
  }
  // Never forward production key names, even if someone put them in ALLOWED later.
  delete env.OPENAI_API_KEY;
  delete env.AI_API_KEY;
  return env;
}

function chmodPrivate(targetPath) {
  try {
    fs.chmodSync(targetPath, 0o700);
  } catch (_) {
    // Best effort: some bind mounts may not honor chmod.
  }
}

function main(argv = process.argv.slice(2)) {
  const evalDir = __dirname;
  const harnessRoot = path.join(__dirname, '..');
  chmodPrivate(evalDir);
  const childEnv = buildIsolatedEnv();
  const child = spawn(process.execPath, [path.join(evalDir, 'run-eval.js'), ...argv], {
    cwd: harnessRoot,
    env: childEnv,
    stdio: 'inherit',
  });
  child.on('error', (err) => {
    console.error(`[eval-isolated] ${scrubString(err.message)}`);
    process.exit(1);
  });
  child.on('exit', (code, signal) => {
    if (signal) process.exit(1);
    process.exit(code == null ? 1 : code);
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  ALLOWED_ENV,
  buildIsolatedEnv,
  chmodPrivate,
  main,
};
