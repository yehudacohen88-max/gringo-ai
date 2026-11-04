const crypto = require('crypto');
const crmAgentRepository = require('../crm-agent/crm-agent.repository');
const store = require('./privacy-store');
const erasure = require('./privacy-erasure.service');
const notice = require('./privacy-notice');
const { isProductionRuntime } = require('../../shared/pilotCatalog');

const DELETE_CODE_TTL_MS = 10 * 60 * 1000;
const MAX_PENDING_DELETES = 5000;
const pendingDeletes = new Map();


function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

// Production and hosted runtimes always require consent. Only a local
// development or test process may turn the gate off, for legacy test suites.
function consentGateEnabled() {
  if (isProductionRuntime()) return true;
  return !['off', 'false', '0', 'no'].includes(cleanText(process.env.GRINGO_PRIVACY_CONSENT_GATE).toLowerCase());
}

function identityKey(identity = {}) {
  return store.subjectKey(identity.channel, identity.channelUserId);
}

async function findProfileRecord(identity = {}) {
  const channel = cleanText(identity.channel).toLowerCase();
  const id = cleanText(identity.channelUserId);
  if (!channel || !id) return null;
  if (channel === 'telegram') {
    const linked = await crmAgentRepository.findUserProfileRecordByTelegramUserId(id);
    if (linked) return linked;
  }
  if (channel === 'line') {
    const linked = await crmAgentRepository.findUserProfileRecordByLineUserId(id);
    if (linked) return linked;
  }
  return crmAgentRepository.findUserProfileRecordByChannel(channel, id);
}

async function getStatus(identity) {
  const record = await store.getConsent(identityKey(identity));
  const accepted = Boolean(record && record.status === 'accepted' && record.consentVersion === notice.PRIVACY_NOTICE_VERSION);
  return {
    gateEnabled: consentGateEnabled(),
    status: record ? record.status : 'none',
    consentVersion: record ? record.consentVersion : '',
    currentVersion: notice.PRIVACY_NOTICE_VERSION,
    acceptedAt: record && record.status === 'accepted' ? record.acceptedAt : '',
    accepted,
    needsConsent: !accepted,
  };
}

async function allowsPersonalProcessing(identity) {
  if (!consentGateEnabled()) return true;
  return (await getStatus(identity)).accepted;
}

// For outbound messages keyed by userId: every channel identity of the
// profile must not be withdrawn, and at least one must be accepted.
async function allowsProcessingForUser(userId) {
  if (!consentGateEnabled()) return true;
  const record = await crmAgentRepository.findUserProfileRecordByUserId(cleanText(userId));
  if (!record) return false;
  const subject = erasure.buildSubject(record.profile);
  let accepted = false;
  for (const pair of subject.pairs) {
    const status = await getStatus(pair);
    if (status.status === 'withdrawn' || status.status === 'declined') return false;
    if (status.accepted) accepted = true;
  }
  return accepted;
}

async function setConsent(identity, status, language) {
  const key = identityKey(identity);
  if (!key) {
    const error = new Error('A verified identity is required.');
    error.statusCode = 401;
    throw error;
  }
  const now = new Date().toISOString();
  const existing = await store.getConsent(key);
  const record = {
    subjectKey: key,
    channel: cleanText(identity.channel).toLowerCase(),
    status,
    consentVersion: notice.PRIVACY_NOTICE_VERSION,
    language: notice.noticeLanguage(language) || '',
    acceptedAt: status === 'accepted' ? now : (existing && existing.acceptedAt) || '',
    updatedAt: now,
  };
  await store.saveConsent(record);
  await store.appendAudit({ event: `consent_${status}`, subjectKey: key, channel: record.channel, outcome: 'ok', detail: record.consentVersion });
  return getStatus(identity);
}

const acceptConsent = (identity, language) => setConsent(identity, 'accepted', language);
const declineConsent = (identity, language) => setConsent(identity, 'declined', language);
const withdrawConsent = (identity, language) => setConsent(identity, 'withdrawn', language);

async function resolveSubject(identity) {
  const record = await findProfileRecord(identity);
  return erasure.buildSubject(record ? record.profile : null, identity);
}

async function exportData(identity) {
  const subject = await resolveSubject(identity);
  const data = await erasure.exportSubject(subject);
  const consent = await getStatus(identity);
  await store.appendAudit({ event: 'export', subjectKey: identityKey(identity), channel: identity.channel, outcome: 'ok' });
  return {
    generatedAt: new Date().toISOString(),
    consent,
    sheets: data.sheets,
    local: data.local,
    incomplete: data.failedSheets.length > 0,
    notIncluded: notice.getNotice('en').limits,
  };
}

function prunePending(now = Date.now()) {
  for (const [key, value] of pendingDeletes) {
    if (value.expiresAt <= now) pendingDeletes.delete(key);
  }
  while (pendingDeletes.size > MAX_PENDING_DELETES) {
    pendingDeletes.delete(pendingDeletes.keys().next().value);
  }
}

function requestDeletion(identity) {
  const key = identityKey(identity);
  if (!key) {
    const error = new Error('A verified identity is required.');
    error.statusCode = 401;
    throw error;
  }
  prunePending();
  const code = String(crypto.randomInt(100000, 1000000));
  const expiresAt = Date.now() + DELETE_CODE_TTL_MS;
  pendingDeletes.set(key, { code, expiresAt, attempts: 0 });
  return { confirmationCode: code, expiresAt: new Date(expiresAt).toISOString() };
}

function codeMatches(expected, supplied) {
  const a = Buffer.from(String(expected));
  const b = Buffer.from(cleanText(supplied));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// The code is bound to the identity that asked for it and works once.
async function confirmDeletion(identity, suppliedCode) {
  const key = identityKey(identity);
  prunePending();
  const pending = pendingDeletes.get(key);
  if (!key || !pending) return { ok: false, code: 'DELETE_CODE_INVALID' };
  if (!codeMatches(pending.code, suppliedCode)) {
    pending.attempts += 1;
    if (pending.attempts >= 5) pendingDeletes.delete(key);
    return { ok: false, code: 'DELETE_CODE_INVALID' };
  }
  pendingDeletes.delete(key);
  const subject = await resolveSubject(identity);
  const result = await erasure.eraseSubject(subject);
  const consentKeys = subject.pairs.map((pair) => store.subjectKey(pair.channel, pair.channelUserId));
  await store.removeConsents(consentKeys);
  for (const consentKey of consentKeys) pendingDeletes.delete(consentKey);
  const rows = Object.values(result.sheets).reduce((sum, count) => sum + count, 0);
  const memory = Object.values(result.memory).reduce((sum, count) => sum + count, 0);
  const complete = result.failedSheets.length === 0;
  await store.appendAudit({
    event: 'delete',
    subjectKey: key,
    channel: identity.channel,
    outcome: complete ? 'ok' : 'partial',
    detail: `rows=${rows};memory=${memory};failedSheets=${result.failedSheets.length}`,
  });
  return {
    ok: true,
    deleted: rows + memory > 0,
    complete,
    erasedRows: result.sheets,
    failedSheets: result.failedSheets,
  };
}

function resetForTests() {
  pendingDeletes.clear();
}

module.exports = {
  DELETE_CODE_TTL_MS,
  acceptConsent,
  allowsPersonalProcessing,
  allowsProcessingForUser,
  confirmDeletion,
  consentGateEnabled,
  declineConsent,
  exportData,
  getStatus,
  requestDeletion,
  resetForTests,
  withdrawConsent,
};
