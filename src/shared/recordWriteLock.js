const tails = new Map();

// Serializes writes for one record inside this process. A second request waits
// until the first write has re-read the row and finished. The lock is not
// re-entrant: a function must not take the same key while it already holds it.
function withRecordLock(key, work) {
  const previous = tails.get(key) || Promise.resolve();
  const run = previous.then(() => work());
  const tail = run.then(
    () => {},
    () => {}
  );
  tails.set(key, tail);
  tail.finally(() => {
    if (tails.get(key) === tail) tails.delete(key);
  });
  return run;
}

module.exports = {
  withRecordLock,
};
