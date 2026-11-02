const OWNER_FIELDS = ['userId', 'ownerUserId', 'channel', 'channelUserId', 'webId', 'ownerKey', 'webIdentityBoundAt'];

function requireOwnerUserId(ownerUserId) {
  const owner = String(ownerUserId ?? '').trim();
  if (!owner) {
    const error = new Error('A verified owner is required.');
    error.statusCode = 403;
    error.code = 'OWNER_REQUIRED';
    throw error;
  }
  return owner;
}

function isOwnedBy(record, ownerUserId) {
  if (!record) return false;
  const recordOwner = String(record.userId || '');
  const expected = String(ownerUserId || '').trim();
  if (!recordOwner || !expected) return false;
  return recordOwner === expected;
}

function stripOwnerFields(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const copy = { ...input };
  for (const key of OWNER_FIELDS) delete copy[key];
  return copy;
}

module.exports = {
  OWNER_FIELDS,
  isOwnedBy,
  requireOwnerUserId,
  stripOwnerFields,
};
