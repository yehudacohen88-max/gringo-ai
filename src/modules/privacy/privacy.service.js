const { env } = require('../../config/env');
const crypto = require('crypto');
const crmAgentRepository = require('../crm-agent/crm-agent.repository');
const store = require('./privacy-store');
const erasure = require('./privacy-erasure.service');
const notice = require('./privacy-notice');
const { isProductionRuntime } = require('../../shared/pilotCatalog');

const DELETE_CODE_TTL_MS = 10 * 60 * 1000;
const MAX_PENDING_DELETES = 5000;
const pendingDeletes = new Map();
const DELETION_PENDING = 'deletion_pending';


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
    deletionPending: Boolean(record && record.status === DELETION_PENDING),
  };
}

// A pending deletion blocks processing even when the gate is off locally.
async function allowsPersonalProcessing(identity) {
  const status = await getStatus(identity);
  if (status.deletionPending) return false;
  if (!consentGateEnabled()) return true;
  return status.accepted;
}

// For outbound messages keyed by userId: every channel identity of the
// profile must not be withdrawn, and at least one must be accepted.
async function allowsProcessingForUser(userId) {
  const id = cleanText(userId);
  const record = id ? await crmAgentRepository.findUserProfileRecordByUserId(id) : null;
  if (!record) return !consentGateEnabled() && !(await pendingKeyIncludes(id));
  const subject = erasure.buildSubject(record.profile);
  let accepted = false;
  for (const pair of subject.pairs) {
    const status = await getStatus(pair);
    if (status.deletionPending) return false;
    if (status.status === 'withdrawn' || status.status === 'declined') return false;
    if (status.accepted) accepted = true;
  }
  return consentGateEnabled() ? accepted : true;
}

// Rows written under a raw channel id (legacy Telegram error path) have no
// profile; they are blocked when that id itself has a pending deletion.
async function pendingKeyIncludes(rawId) {
  if (!rawId) return false;
  for (const channel of ['telegram', 'line', 'whatsapp', 'web']) {
    const record = await store.getConsent(store.subjectKey(channel, rawId));
    if (record && record.status === DELETION_PENDING) return true;
  }
  return false;
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
  // Consent changes cannot reopen processing while a deletion is unfinished.
  if (existing && existing.status === DELETION_PENDING) return getStatus(identity);
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
    exportType: 'full_stored_records',
    scope: 'Every row Gringo stores for your verified identity in its own sheets and server memory, plus free-text cells that contain your identifier. Copies held by Telegram, LINE, WhatsApp, OpenAI, Google Sheets version history, manual spreadsheet copies, Render disk snapshots and host logs are not included. A pseudonymous daily AI counter and anonymized Telegram replay keys may remain until they expire.',
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
  return runDeletion(identity, 'delete');
}

function deletionOutcome(result) {
  const rows = Object.values(result.sheets).reduce((sum, count) => sum + count, 0);
  const memory = Object.values(result.memory).reduce((sum, count) => sum + count, 0);
  const pendingSheets = [...result.failedSheets, ...result.deferredSheets];
  const complete = pendingSheets.length === 0;
  return { rows, memory, pendingSheets, complete };
}

// Erases every store for the verified identity. When a store fails, the
// identity and every linked identity move to deletion_pending: nothing more
// is processed or created for them, and the deletion can be retried without
// a new consent. Sheet names are not personal data, so the audit lists them.
//
// Order matters: the durable deletion_pending block is written BEFORE any
// data is erased. If it cannot be saved, nothing is deleted and the caller
// gets "not_started", so there is never a half-deleted user without a
// durable block. The block is removed only after every store is erased.
async function runDeletion(identity, event) {
  const key = identityKey(identity);
  const subject = await resolveSubject(identity);
  const consentKeys = [...new Set([key, ...subject.pairs.map((pair) => store.subjectKey(pair.channel, pair.channelUserId))].filter(Boolean))];
  for (const consentKey of consentKeys) pendingDeletes.delete(consentKey);
  if (!(await markDeletionPending(consentKeys, identity.channel))) {
    await store.appendAudit({ event, subjectKey: key, channel: identity.channel, outcome: 'not_started', detail: 'pendingStateNotSaved' });
    return { ok: false, status: 'not_started', code: 'DELETION_NOT_STARTED', deleted: false, complete: false, erasedRows: {}, failedSheets: [] };
  }
  const result = await erasure.eraseSubject(subject);
  const { rows, memory, pendingSheets } = deletionOutcome(result);
  let { complete } = deletionOutcome(result);
  if (complete) {
    let cleared = false;
    try {
      cleared = (await store.removeConsents(consentKeys)).failed === 0;
    } catch (error) {
      cleared = false;
    }
    if (!cleared) {
      complete = false;
      pendingSheets.push(env.googleSheets.sheets.privacyConsents);
    }
  }
  await store.appendAudit({
    event,
    subjectKey: key,
    channel: identity.channel,
    outcome: complete ? 'ok' : 'partial',
    detail: `rows=${rows};memory=${memory};pending=${pendingSheets.join('|') || 'none'}`,
  })
  return {
    ok: true,
    status: complete ? (rows + memory > 0 ? 'complete' : 'nothing') : 'partial',
    deleted: complete && rows + memory > 0,
    complete,
    erasedRows: result.sheets,
    failedSheets: pendingSheets,
  };
}

async function markDeletionPending(keys, channel) {
  const now = new Date().toISOString();
  let saved = true;
  for (const subjectKey of keys) {
    try {
      await store.saveConsent({
        subjectKey,
        channel: cleanText(channel).toLowerCase(),
        status: DELETION_PENDING,
        consentVersion: notice.PRIVACY_NOTICE_VERSION,
        language: '',
        acceptedAt: '',
        updatedAt: now,
      });
    } catch (error) {
      saved = false;
    }
  }
  return saved;
}

// Retry for the verified identity only. No new consent and no new code are
// needed: the worker already confirmed. Erasing is idempotent and nothing is
// re-created because processing stays blocked while the state is pending.
async function retryDeletion(identity) {
  const status = await getStatus(identity);
  if (!status.deletionPending) return { ok: false, code: 'NO_PENDING_DELETION' };
  return runDeletion(identity, 'delete_retry');
}

// Admin or scheduled retry: finds pending identities through the profile
// rows that were kept for this purpose, then retries each one.
async function retryPendingDeletions() {
  const pending = await store.listConsentsByStatus(DELETION_PENDING);
  const wanted = new Set(pending.map((record) => record.subjectKey));
  if (!wanted.size) return { attempted: 0, completed: 0, stillPending: 0 };
  const profiles = (await crmAgentRepository.findAllUserProfileRecords()).map((record) => record.profile);
  let attempted = 0;
  let completed = 0;
  const done = new Set();
  for (const profile of profiles) {
    const subject = erasure.buildSubject(profile);
    const pair = subject.pairs.find((item) => wanted.has(store.subjectKey(item.channel, item.channelUserId)));
    if (!pair) continue;
    const pairKey = store.subjectKey(pair.channel, pair.channelUserId);
    if (done.has(pairKey)) continue;
    attempted += 1;
    const outcome = await runDeletion(pair, 'delete_retry_admin');
    subject.pairs.forEach((item) => done.add(store.subjectKey(item.channel, item.channelUserId)));
    if (outcome.complete) completed += 1;
  }
  // Pending identities without a profile row: find their raw channel ids in
  // the data sheets by matching keyed hashes. A key with no matching row
  // anywhere stays pending (its data may still be in a sheet that could not
  // be read) and is counted as unresolved for a human to review.
  const remaining = [...wanted].filter((key) => !done.has(key));
  let unresolved = 0;
  if (remaining.length) {
    let candidates = [];
    try {
      candidates = await erasure.collectCandidatePairs();
    } catch (error) {
      candidates = [];
    }
    const byKey = new Map(candidates.map((pair) => [store.subjectKey(pair.channel, pair.channelUserId), pair]));
    for (const key of remaining) {
      const pair = byKey.get(key);
      if (!pair) {
        unresolved += 1;
        continue;
      }
      attempted += 1;
      const outcome = await runDeletion(pair, 'delete_retry_admin');
      done.add(key);
      if (outcome.complete) completed += 1;
    }
  }
  const stillPending = (await store.listConsentsByStatus(DELETION_PENDING)).length;
  return { attempted, completed, stillPending, unresolved };
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
  retryDeletion,
  retryPendingDeletions,
  DELETION_PENDING,
  consentGateEnabled,
  declineConsent,
  exportData,
  getStatus,
  requestDeletion,
  resetForTests,
  withdrawConsent,
};
