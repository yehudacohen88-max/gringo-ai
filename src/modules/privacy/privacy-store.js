const crypto = require('crypto');
const { env } = require('../../config/env');
const googleSheets = require('../../config/googleSheets');
const { isProductionRuntime } = require('../../shared/pilotCatalog');

// Consent and audit rows hold a keyed hash of the channel identity, never the
// raw phone number, Telegram id, LINE id or web id.
const CONSENT_FIELDS = ['subjectKey', 'channel', 'status', 'consentVersion', 'language', 'acceptedAt', 'updatedAt'];
const AUDIT_FIELDS = ['eventId', 'event', 'subjectKey', 'channel', 'outcome', 'detail', 'at'];
// deletion_pending: the worker confirmed deletion but at least one store
// failed. Processing stays blocked and the deletion can be retried. It is
// kept in the PrivacyConsents sheet so it survives a restart.
const CONSENT_STATUSES = ['accepted', 'declined', 'withdrawn', 'deletion_pending'];

const localConsents = new Map();
const localAudit = [];
const ensuredSheets = new Set();

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

let warnedMissingSecret = false;

// Never HMAC with a published constant. A known key would let anyone who
// knows a channel id recompute the PrivacyAudit subjectKey. Production
// already refuses to start without WEB_SESSION_SECRET; this is the same
// refusal if that secret is missing later.
function hashSecret() {
  if (env.webSessionSecret) return env.webSessionSecret;
  if (!warnedMissingSecret) {
    warnedMissingSecret = true;
    console.error(
      isProductionRuntime()
        ? '[privacy] REFUSING subject keys: WEB_SESSION_SECRET is absent in production. A known fallback key is not used.'
        : '[privacy] REFUSING subject keys: WEB_SESSION_SECRET is absent. A known fallback key is not used.'
    );
  }
  const error = new Error('WEB_SESSION_SECRET is required to derive privacy subject keys.');
  error.code = 'PRIVACY_KEY_UNAVAILABLE';
  throw error;
}

function subjectKey(channel, channelUserId) {
  const ch = cleanText(channel).toLowerCase();
  const id = cleanText(channelUserId);
  if (!ch || !id) return '';
  return crypto.createHmac('sha256', hashSecret()).update(`${ch}:${id}`).digest('hex').slice(0, 40);
}

function sheetsConfigured() {
  return Boolean(env.googleSheets.spreadsheetId && env.googleSheets.clientEmail && env.googleSheets.privateKey);
}

// The in-memory store is for local dev and tests only. In production and
// hosted runtimes it is refused (defense in depth behind the startup check),
// so privacy state is never kept only in memory and lost on restart.
function useLocal() {
  if (sheetsConfigured()) return false;
  if (isProductionRuntime()) {
    const error = new Error('Durable privacy storage is not configured.');
    error.code = 'PRIVACY_STORAGE_UNAVAILABLE';
    throw error;
  }
  return true;
}

function rowToObject(fields, row = []) {
  return fields.reduce((record, field, index) => {
    record[field] = row[index] ?? '';
    return record;
  }, {});
}

function objectToRow(fields, record) {
  return fields.map((field) => record[field] ?? '');
}

async function ensureSheet(sheetName, fields) {
  if (ensuredSheets.has(sheetName)) return;
  const rows = await googleSheets.readSheetRows(sheetName).catch(() => null);
  if (!rows || !rows.length) await googleSheets.ensureSheetWithHeader(sheetName, fields);
  ensuredSheets.add(sheetName);
}

async function getConsent(key) {
  if (!key) return null;
  if (useLocal()) {
    const record = localConsents.get(key);
    return record ? { ...record } : null;
  }
  await ensureSheet(env.googleSheets.sheets.privacyConsents, CONSENT_FIELDS);
  const rows = await googleSheets.readSheetRows(env.googleSheets.sheets.privacyConsents);
  for (let index = rows.length - 1; index >= 1; index -= 1) {
    const record = rowToObject(CONSENT_FIELDS, rows[index]);
    if (record.subjectKey === key) return record;
  }
  return null;
}

async function saveConsent(record) {
  if (!record.subjectKey || !CONSENT_STATUSES.includes(record.status)) {
    throw new Error('Invalid consent record.');
  }
  if (useLocal()) {
    localConsents.set(record.subjectKey, { ...record });
    return { ...record };
  }
  const sheetName = env.googleSheets.sheets.privacyConsents;
  await ensureSheet(sheetName, CONSENT_FIELDS);
  const rows = await googleSheets.readSheetRows(sheetName);
  const index = rows.findIndex((row, i) => i > 0 && rowToObject(CONSENT_FIELDS, row).subjectKey === record.subjectKey);
  if (index > 0) {
    await googleSheets.updateSheetRow(sheetName, index + 1, objectToRow(CONSENT_FIELDS, record));
  } else {
    await googleSheets.appendSheetRow(sheetName, objectToRow(CONSENT_FIELDS, record));
  }
  return { ...record };
}

// A read error is thrown, never treated as "no rows": the caller must not
// report a complete deletion when it could not even see the consent rows.
// Write failures are counted so the caller can report a partial deletion.
async function removeConsents(keys = []) {
  const wanted = new Set(keys.filter(Boolean));
  let removed = 0;
  let failed = 0;
  if (useLocal()) {
    for (const key of wanted) if (localConsents.delete(key)) removed += 1;
    return { removed, failed };
  }
  const sheetName = env.googleSheets.sheets.privacyConsents;
  const rows = await googleSheets.readSheetRows(sheetName);
  for (let index = 1; index < rows.length; index += 1) {
    if (wanted.has(rowToObject(CONSENT_FIELDS, rows[index]).subjectKey)) {
      try {
        await googleSheets.updateSheetRow(sheetName, index + 1, CONSENT_FIELDS.map(() => ''));
        removed += 1;
      } catch (error) {
        failed += 1;
      }
    }
  }
  return { removed, failed };
}

// Audit rows carry no message text, names or raw ids. They prove that a
// consent change or deletion happened, which a regulator may ask for.
async function appendAudit(event = {}) {
  const record = {
    eventId: `pa_${crypto.randomBytes(6).toString('hex')}`,
    event: cleanText(event.event),
    subjectKey: cleanText(event.subjectKey),
    channel: cleanText(event.channel),
    outcome: cleanText(event.outcome),
    detail: cleanText(event.detail).slice(0, 200),
    at: new Date().toISOString(),
  };
  if (useLocal()) {
    localAudit.push(record);
    return record;
  }
  try {
    await ensureSheet(env.googleSheets.sheets.privacyAudit, AUDIT_FIELDS);
    await googleSheets.appendSheetRow(env.googleSheets.sheets.privacyAudit, objectToRow(AUDIT_FIELDS, record));
  } catch (error) {
    console.warn('[privacy] Audit entry could not be saved.');
  }
  return record;
}

async function listConsentsByStatus(status) {
  if (useLocal()) return [...localConsents.values()].filter((record) => record.status === status).map((record) => ({ ...record }));
  await ensureSheet(env.googleSheets.sheets.privacyConsents, CONSENT_FIELDS);
  const rows = await googleSheets.readSheetRows(env.googleSheets.sheets.privacyConsents);
  return rows.slice(1).map((row) => rowToObject(CONSENT_FIELDS, row)).filter((record) => record.status === status);
}

function resetLocalForTests() {
  localConsents.clear();
  localAudit.length = 0;
}

function localAuditEntries() {
  return localAudit.map((item) => ({ ...item }));
}

module.exports = {
  AUDIT_FIELDS,
  CONSENT_FIELDS,
  appendAudit,
  getConsent,
  listConsentsByStatus,
  resetLocalForTests,
  localAuditEntries,
  removeConsents,
  saveConsent,
  sheetsConfigured,
  subjectKey,
};
