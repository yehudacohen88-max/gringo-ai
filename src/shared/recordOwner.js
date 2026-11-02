// Pure ownership check. A missing owner argument keeps admin and channel
// callers working. A provided owner must match a non-empty record userId.
function isOwnedBy(record, ownerUserId) {
  if (!record) return false;
  if (ownerUserId === undefined) return true;
  const recordOwner = String(record.userId || '');
  const expected = String(ownerUserId || '');
  if (!recordOwner || !expected) return false;
  return recordOwner === expected;
}

module.exports = {
  isOwnedBy,
};
