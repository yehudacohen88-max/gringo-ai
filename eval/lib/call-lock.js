'use strict';

class ConcurrencyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConcurrencyError';
    this.kind = 'concurrency_violation';
    this.reason = 'concurrency_violation';
  }
}

function createCallLock() {
  let inFlight = 0;
  let maxObserved = 0;
  let totalAcquires = 0;

  function acquire() {
    if (inFlight !== 0) {
      throw new ConcurrencyError(`Refusing concurrent model call: inFlight=${inFlight} (hard concurrency=1).`);
    }
    inFlight += 1;
    totalAcquires += 1;
    maxObserved = Math.max(maxObserved, inFlight);
    if (inFlight !== 1) {
      throw new ConcurrencyError(`Concurrency assertion failed: inFlight=${inFlight}, expected 1.`);
    }
  }

  function release() {
    inFlight = Math.max(0, inFlight - 1);
  }

  async function runExclusive(fn) {
    acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  return {
    acquire,
    release,
    runExclusive,
    get inFlight() { return inFlight; },
    get maxObserved() { return maxObserved; },
    get totalAcquires() { return totalAcquires; },
    assertSerial() {
      if (inFlight !== 0 && inFlight !== 1) {
        throw new ConcurrencyError(`Concurrency assertion failed: inFlight=${inFlight}.`);
      }
      if (maxObserved > 1) {
        throw new ConcurrencyError(`Concurrency assertion failed: maxObserved=${maxObserved}.`);
      }
      return true;
    },
    summary() {
      return { inFlight, maxObserved, totalAcquires, concurrencyLimit: 1 };
    },
  };
}

module.exports = {
  ConcurrencyError,
  createCallLock,
};
