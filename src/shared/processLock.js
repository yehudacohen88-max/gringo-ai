const fs = require('fs');
const os = require('os');
const path = require('path');

// Same-host guard for the single-process requirement (in-memory caches,
// budgets, rate limits and Telegram polling assume one process). It does not
// protect against a second host or container; see docs/ops/PILOT_RUNBOOK_he.md.
class ProcessLockError extends Error {
  constructor(message, holderPid) {
    super(message);
    this.name = 'ProcessLockError';
    this.holderPid = holderPid;
  }
}

function defaultLockPath(port) {
  return process.env.GRINGO_PROCESS_LOCK_FILE || path.join(os.tmpdir(), `gringo-${port}.lock`);
}

function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function acquire(lockPath, { pid = process.pid, alive = isAlive } = {}) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      fs.writeFileSync(lockPath, String(pid), { flag: 'wx' });
      return { path: lockPath, release: () => release(lockPath, pid) };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const holder = Number.parseInt(fs.readFileSync(lockPath, 'utf8'), 10);
      if (holder !== pid && alive(holder)) {
        throw new ProcessLockError(`Another Gringo process (pid ${holder}) holds ${lockPath}. Gringo must run as a single process.`, holder);
      }
      fs.rmSync(lockPath, { force: true });
    }
  }
  throw new ProcessLockError(`Could not acquire ${lockPath}.`);
}

function release(lockPath, pid = process.pid) {
  try {
    if (Number.parseInt(fs.readFileSync(lockPath, 'utf8'), 10) === pid) fs.rmSync(lockPath, { force: true });
  } catch (_) { /* already gone */ }
}

module.exports = { acquire, release, defaultLockPath, isAlive, ProcessLockError };
