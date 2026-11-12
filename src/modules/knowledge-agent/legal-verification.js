// A legal or worker-rights record is presentable only when every one of these
// is present. A source URL, or source.verified by itself, is not enough.
// Existing knowledge entries are not given this metadata here.
//
// Source-grounded records (schema "source-grounded", or any record with a
// claims array) ignore status and legalClaimsVerified. They pass only when
// knowledge/approvals has a matching content hash, reviewer, and date.

const {
  contentHash,
  isSourceGroundedRecord,
  loadApprovalEntries,
  passesSourceGroundedApproval,
} = require('./source-grounded-record');

function clean(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

const LEGAL_CATEGORIES = new Set(['workers rights', 'rights']);

function isLegalCategory(category) {
  return LEGAL_CATEGORIES.has(clean(category).toLowerCase());
}

function isLegalKnowledgeItem(item = {}) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  if (isLegalCategory(item.category)) return true;
  return clean(item.domain).toLowerCase() === 'employment';
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

function verificationDate(item = {}) {
  const raw = clean(item.verifiedAt || (item.source && item.source.verifiedAt));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '';
  const date = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10) === raw ? raw : '';
}

function approvedStatus(item = {}) {
  const status = clean(item.contentStatus || (item.source && item.source.contentStatus)).toLowerCase();
  return status === 'approved' ? 'approved' : '';
}

function reviewMetadata(item = {}) {
  const source = item.source && typeof item.source === 'object' ? item.source : {};
  const reviewer = clean(item.reviewedBy || item.legalReviewBy || source.reviewedBy || source.legalReviewBy);
  if (reviewer.length < 2) return '';
  if (/^(pending|unreviewed|todo|tbd|unknown)$/i.test(reviewer)) return '';
  return reviewer;
}

function legacyMetadataComplete(item = {}) {
  const source = item.source;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return false;
  if (source.verified !== true) return false;
  if (!httpsUrl(source.url)) return false;
  if (!verificationDate(item)) return false;
  if (!approvedStatus(item)) return false;
  if (!reviewMetadata(item)) return false;
  return true;
}

function approvalMatchesContent(item, options = {}) {
  const approvals = Array.isArray(options.approvals)
    ? options.approvals
    : loadApprovalEntries(options.approvalsDir);
  const match = approvals.find((entry) => clean(entry.recordId) === clean(item.id));
  if (!match) return false;
  if (clean(match.contentHash).toLowerCase() !== contentHash(item)) return false;
  const reviewer = clean(match.reviewer);
  if (reviewer.length < 2 || /^(pending|unreviewed|todo|tbd|unknown)$/i.test(reviewer)) return false;
  const date = clean(match.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return false;
  return true;
}

function passesLegalVerification(item = {}, options = {}) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  // legalClaimsVerified is never read. Metadata fields alone never approve.
  if (isSourceGroundedRecord(item)) return passesSourceGroundedApproval(item, options);
  if (!isLegalKnowledgeItem(item) && !item.source) return false;
  if (!legacyMetadataComplete(item)) return false;
  return approvalMatchesContent(item, options);
}

function knowledgeSafeForAi(items, options = {}) {
  return (Array.isArray(items) ? items : []).filter((item) => {
    if (!isLegalKnowledgeItem(item)) return true;
    return passesLegalVerification(item, options);
  });
}

module.exports = {
  isLegalCategory,
  isLegalKnowledgeItem,
  isSourceGroundedRecord,
  knowledgeSafeForAi,
  passesLegalVerification,
};
