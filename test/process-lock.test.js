const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const lockLib = require('../src/shared/processLock');

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'glock-')), 'g.lock');

test('second live process is refused', () => {
  const file = tmp();
  const first = lockLib.acquire(file, { pid: 111, alive: () => true });
  assert.throws(() => lockLib.acquire(file, { pid: 222, alive: () => true }), { name: 'ProcessLockError' });
  first.release();
  assert.equal(fs.existsSync(file), false);
});

test('stale lock from a dead pid is replaced', () => {
  const file = tmp();
  fs.writeFileSync(file, '999999');
  const lock = lockLib.acquire(file, { pid: 333, alive: () => false });
  assert.equal(fs.readFileSync(file, 'utf8'), '333');
  lock.release();
});

test('release does not remove another process lock', () => {
  const file = tmp();
  fs.writeFileSync(file, '444');
  lockLib.release(file, 555);
  assert.equal(fs.readFileSync(file, 'utf8'), '444');
});

test('startServer refuses when lock is held', async () => {
  const { startServer } = require('../src/server');
  const file = tmp();
  fs.writeFileSync(file, String(process.ppid));
  await assert.rejects(startServer({ production: false, port: 0, lockFile: file, startBackgroundWork: () => {} }), { name: 'ProcessLockError' });
});
