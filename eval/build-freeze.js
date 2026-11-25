#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { sha256File } = require('./lib/freeze-verify');

const HARNESS_ROOT = path.join(__dirname, '..');
const FREEZE_DIR = process.argv[2] || '/workspace/gringo/eval-freeze-2026-11-25';

const FILES = [
  'eval/run-eval.js',
  'eval/run-dry-checks.js',
  'eval/run-isolated.js',
  'eval/build-dataset.js',
  'eval/build-freeze.js',
  'eval/cleanup.sh',
  'eval/dataset.json',
  'eval/staged-sample-20.json',
  'eval/run-config.json',
  'eval/package.json',
  'eval/package-lock.json',
  'eval/lib/budget-guard.js',
  'eval/lib/isolation.js',
  'eval/lib/leak-detector.js',
  'eval/lib/tokenizer.js',
  'eval/lib/scrub.js',
  'eval/lib/call-lock.js',
  'eval/lib/independent-leak-detector.js',
  'eval/lib/provenance.js',
  'eval/run-offline-replay.js',
  'eval/lib/usefulness-rubric.js',
  'eval/lib/decision-trace.js',
  'eval/lib/freeze-verify.js',
  'eval/lib/extra-dry-checks.js',
];

function copyFile(relative) {
  const src = path.join(HARNESS_ROOT, relative);
  const dest = path.join(FREEZE_DIR, relative);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function main() {
  fs.rmSync(FREEZE_DIR, { recursive: true, force: true });
  fs.mkdirSync(FREEZE_DIR, { recursive: true });
  const sha = execFileSync('git', ['-C', HARNESS_ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const shaShort = execFileSync('git', ['-C', HARNESS_ROOT, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  const branch = execFileSync('git', ['-C', HARNESS_ROOT, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim();
  fs.writeFileSync(path.join(FREEZE_DIR, 'GIT_SHA'), `${sha}\nbranch=${branch}\nshort=${shaShort}\n`);
  for (const relative of FILES) copyFile(relative);
  const lines = FILES.map((relative) => `${sha256File(path.join(FREEZE_DIR, relative))}  ${relative}`);
  const sums = `${lines.join('\n')}\n`;
  fs.writeFileSync(path.join(FREEZE_DIR, 'SHA256SUMS'), sums);
  fs.writeFileSync(path.join(HARNESS_ROOT, 'eval', 'SHA256SUMS'), sums);
  try { fs.chmodSync(FREEZE_DIR, 0o700); } catch (_) {}
  try { fs.chmodSync(path.join(HARNESS_ROOT, 'eval'), 0o700); } catch (_) {}
  const sumsHash = sha256File(path.join(FREEZE_DIR, 'SHA256SUMS'));
  console.log(JSON.stringify({ freezeDir: FREEZE_DIR, files: FILES.length, sha256OfSha256Sums: sumsHash, repoHead: sha }, null, 2));
}

if (require.main === module) main();
module.exports = { FILES, FREEZE_DIR, main };
