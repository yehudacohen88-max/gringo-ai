// Source-grounded records are approved only by a human-edited file under
// knowledge/approvals. The runtime never writes that directory. A status
// field of "approved" on the record is ignored. legalClaimsVerified is ignored.
// An approval whose content hash does not match the record is invalid.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const APPROVALS_DIR = path.join(__dirname, '../../../knowledge/approvals');

function clean(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function isSourceGroundedRecord(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  return item.schema === 'source-grounded' || Array.isArray(item.claims);
}

function httpsUrl(value) {
  const url = clean(value);
  if (!/^https:\/\/\S+$/i.test(url)) return '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return '';
    if (!parsed.hostname || !parsed.hostname.includes('.')) return '';
    return url;
  } catch (error) {
    return '';
  }
}

function isoDate(value) {
  const raw = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '';
  const date = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10) === raw ? raw : '';
}

function canonicalContent(record = {}) {
  const claims = (Array.isArray(record.claims) ? record.claims : []).map((claim) => ({
    language: clean(claim.language),
    quote: clean(claim.quote),
    section: clean(claim.section),
    sourceFileSha256: clean(claim.sourceFileSha256).toLowerCase(),
    sourceRetrievedAt: clean(claim.sourceRetrievedAt),
    sourceUrl: clean(claim.sourceUrl),
  }));
  return {
    answer: clean(record.answer),
    claims,
    id: clean(record.id),
    informationLabel: clean(record.informationLabel),
    language: clean(record.language),
    section: clean(record.section),
    topic: clean(record.topic),
  };
}

function contentHash(record) {
  const serialized = JSON.stringify(canonicalContent(record));
  return crypto.createHash('sha256').update(serialized, 'utf8').digest('hex');
}

function loadApprovalEntries(dir = APPROVALS_DIR) {
  if (!dir || !fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((file) => file.endsWith('.json'));
  const entries = [];
  for (const file of files) {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    } catch (error) {
      continue;
    }
    const list = Array.isArray(parsed) ? parsed : [parsed];
    for (const entry of list) {
      if (!entry || typeof entry !== 'object') continue;
      entries.push({
        recordId: clean(entry.recordId || entry.id),
        contentHash: clean(entry.contentHash).toLowerCase(),
        reviewer: clean(entry.reviewer),
        date: clean(entry.date || entry.approvedAt),
      });
    }
  }
  return entries;
}

function reviewerName(value) {
  const reviewer = clean(value);
  if (reviewer.length < 2) return '';
  if (/^(pending|unreviewed|todo|tbd|unknown)$/i.test(reviewer)) return '';
  return reviewer;
}

function claimsAreComplete(record) {
  const claims = Array.isArray(record.claims) ? record.claims : [];
  if (!claims.length) return false;
  return claims.every((claim) => (
    httpsUrl(claim.sourceUrl)
    && clean(claim.quote)
    && clean(claim.section)
    && clean(claim.language)
    && isoDate(claim.sourceRetrievedAt)
    && /^[a-f0-9]{64}$/i.test(clean(claim.sourceFileSha256))
  ));
}

function passesSourceGroundedApproval(record, options = {}) {
  if (!isSourceGroundedRecord(record)) return false;
  if (record.extraction === 'unreliable' || clean(record.status).toLowerCase() === 'extraction_unreliable') return false;
  if (!clean(record.answer)) return false;
  if (!claimsAreComplete(record)) return false;
  const approvals = Array.isArray(options.approvals) ? options.approvals : loadApprovalEntries(options.approvalsDir);
  const match = approvals.find((entry) => clean(entry.recordId) === clean(record.id));
  if (!match) return false;
  if (clean(match.contentHash).toLowerCase() !== contentHash(record)) return false;
  if (!reviewerName(match.reviewer)) return false;
  if (!isoDate(match.date)) return false;
  return true;
}

module.exports = {
  APPROVALS_DIR,
  canonicalContent,
  claimsAreComplete,
  contentHash,
  isSourceGroundedRecord,
  loadApprovalEntries,
  passesSourceGroundedApproval,
};
