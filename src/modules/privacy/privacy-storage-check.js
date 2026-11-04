// Production startup check: consents and deletion requests must live in
// durable storage (Google Sheets). Gringo refuses to serve users without it.
//
// Write probe: an idempotent header write. Row 1 of PrivacyConsents and
// PrivacyAudit must already be the expected header (or the tab is new and
// empty); the same header is written again and read back. This proves write
// permission without creating rows, PII or markers that need cleanup. If row
// 1 holds anything else, the check fails rather than overwrite it.
//
// Transient errors (HTTP 429, 5xx, network resets/timeouts) are retried with
// bounded exponential backoff (default 4 attempts: 0.5s, 1s, 2s between).
// Permanent errors (missing config, 400 other than a missing tab, 401, 403,
// 404) fail at once. Either way the process exits non-zero.
const { env } = require('../../config/env');
const googleSheets = require('../../config/googleSheets');
const store = require('./privacy-store');

const DEFAULT_ATTEMPTS = 4;
const DEFAULT_BASE_DELAY_MS = 500;
const TRANSIENT_NETWORK_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN', 'ENOTFOUND', 'ESOCKETTIMEDOUT', 'EPIPE']);

class PrivacyStorageError extends Error {
  constructor(reason, detail) {
    super(`Privacy storage check failed: ${reason}${detail ? ` (${detail})` : ''}`);
    this.name = 'PrivacyStorageError';
    this.reason = reason;
  }
}

function httpStatus(error = {}) {
  return Number(error.code) || Number(error.status) || Number(error.response && error.response.status) || 0;
}

function isTransient(error) {
  const status = httpStatus(error);
  if (status === 429 || (status >= 500 && status < 600)) return true;
  return TRANSIENT_NETWORK_CODES.has(String(error && error.code));
}

function isMissingTab(error) {
  return httpStatus(error) === 400 && /unable to parse range/i.test(String(error && error.message));
}

// Never includes the raw error message: it can echo account or key details.
function redactedDetail(error) {
  const status = httpStatus(error);
  if (status) return `HTTP ${status}`;
  if (error && TRANSIENT_NETWORK_CODES.has(String(error.code))) return String(error.code);
  return 'unexpected error';
}

function missingConfig() {
  const missing = [];
  if (!env.googleSheets.spreadsheetId) missing.push('GOOGLE_SHEETS_SPREADSHEET_ID');
  if (!env.googleSheets.clientEmail) missing.push('GOOGLE_SHEETS_CLIENT_EMAIL');
  if (!env.googleSheets.privateKey) missing.push('GOOGLE_SHEETS_PRIVATE_KEY');
  return missing;
}

function sameHeader(row = [], fields) {
  return fields.every((field, index) => String(row[index] ?? '').trim() === field);
}

async function probeSheet(sheets, sheetName, fields) {
  let rows;
  try {
    rows = await sheets.readSheetRows(sheetName);
  } catch (error) {
    if (!isMissingTab(error)) throw error;
    rows = [];
  }
  const header = rows[0] || [];
  if (header.some((cell) => String(cell ?? '').trim()) && !sameHeader(header, fields)) {
    throw new PrivacyStorageError('unexpected_header', sheetName);
  }
  await sheets.ensureSheetWithHeader(sheetName, fields);
  if (sheets.invalidateReadCacheForSheet) sheets.invalidateReadCacheForSheet(sheetName);
  const readBack = await sheets.readSheetRows(sheetName);
  if (!sameHeader(readBack[0], fields)) throw new PrivacyStorageError('write_not_visible', sheetName);
}

async function verifyPrivacyStorage(options = {}) {
  const sheets = options.sheets || googleSheets;
  const attempts = Math.max(1, options.attempts || DEFAULT_ATTEMPTS);
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

  const missing = missingConfig();
  if (missing.length) throw new PrivacyStorageError('config_missing', missing.join(','));

  const targets = [
    [env.googleSheets.sheets.privacyConsents, store.CONSENT_FIELDS],
    [env.googleSheets.sheets.privacyAudit, store.AUDIT_FIELDS],
  ];
  for (const [sheetName, fields] of targets) {
    for (let attempt = 1; ; attempt += 1) {
      try {
        await probeSheet(sheets, sheetName, fields);
        break;
      } catch (error) {
        if (error instanceof PrivacyStorageError) throw error;
        if (!isTransient(error)) throw new PrivacyStorageError('not_accessible', `${sheetName}, ${redactedDetail(error)}`);
        if (attempt >= attempts) throw new PrivacyStorageError('unavailable_after_retries', `${sheetName}, ${redactedDetail(error)}, ${attempts} attempts`);
        await sleep(baseDelayMs * 2 ** (attempt - 1));
      }
    }
  }
  return { ok: true, sheets: targets.map(([name]) => name) };
}

module.exports = { PrivacyStorageError, verifyPrivacyStorage, isTransient };
