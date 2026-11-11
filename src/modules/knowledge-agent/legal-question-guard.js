// Conservative detector for legal and worker-rights questions, independent of
// the knowledge classifier. It is a heuristic: it catches indirect and mixed
// phrasings we know about, and it will miss paraphrases that share none of
// these signals. Thai, Sinhala and Hindi patterns are pending native-speaker
// review. A match is not a legal conclusion.
//
// Ordinary job search and money-transfer wording is intentionally absent.

const { passesLegalVerification } = require('./legal-verification');
const { createRightsUnverifiedFallback, RIGHTS_UNVERIFIED_FALLBACK } = require('./rights-unverified-fallback');

const PENDING_NATIVE_SPEAKER_REVIEW = Object.freeze(['th', 'si', 'hi']);

const LEGAL_QUESTION_PATTERNS = Object.freeze([
  /\b(rights|overtime|payslips?|pension|severance|dismissal|minimum wage|sick leave)\b/i,
  /\b(fired|dismissed|dismiss)\b/i,
  /\b(boss|employer)\b[\s\S]{0,48}\b(allowed|permit|keep|keeps|withhold|take|takes|passport|fire|fires)\b/i,
  /\b(keep|keeps|withhold|take|takes|hold|holds|confiscat\w*)\b[\s\S]{0,48}\bpassport\b/i,
  /\bpassport\b[\s\S]{0,48}\b(keep|keeps|withhold|take|takes|hold|holds|boss|employer)\b/i,
  /\b(fire|fires|fired|dismiss)\b[\s\S]{0,48}\b(sick|illness)\b/i,
  /\b(sick|illness)\b[\s\S]{0,48}\b(fire|fires|fired|dismiss)\b/i,
  /\b(saturday|shabbat)\b[\s\S]{0,40}\b(pay|paid|wage|overtime|work)\b/i,
  /\bhow much should i (get paid|be paid|receive)\b/i,
  /\bwhen should i receive my (salary|pay|wages)\b/i,
  /\b(not paid|unpaid|missing salary|missing wages|did not pay|didn't pay|have not been paid|haven't been paid)\b/i,
  /\b(didn't|did not) receive\b[\s\S]{0,40}\b(salary|pay|wages)\b/i,
  /\b(fire me|fires me|they fire|can they fire|could they fire)\b/i,
  /\b(deduct|deduction|deducted|deducting)\b/i,
  /\b(sick leave|annual leave|maternity leave|vacation days|paid leave)\b/i,
  /\bentitled\b/i,
  /לנכות|ניכוי|מנכים|חופשת מחלה|ימי מחלה/,
  // Pending native-speaker review.
  /หักเงิน|หักค่า|ลาป่วย/,
  /कटौती|छुट्टी/,
  /අඩු කිරීම|නිවාඩු/,
  /זכויות|שעות נוספות|תלוש|פיטור|לפטר|מפוטר|פנסיה|משכורת|לא שילמו|דרכון|מותר למעסיק|מגיע לי/,
  // Pending native-speaker review.
  /สิทธิ|ค่าล่วงเวลา|ค่าจ้าง|หนังสือเดินทาง|ไล่ออก|ป่วย/,
  /අයිතිවාසිකම්|අතිකාල|විදේශ ගමන්|නෙරප/,
  /अधिकार|ओवरटाइम|पासपोर्ट|निकाल|बीमार|शनिवार/,
]);

// Shapes that state a statute: overtime percentages, the ninth-day wage
// deadline, and named Israeli labor laws. User-supplied prices such as
// "1000 shekels" are not in this list.
const UNSUPPORTED_STATUTORY_PATTERNS = Object.freeze([
  /\b(125|150|175|200)\s*%/,
  /overtime at\s+(125|150)/i,
  /not less than\s+\d+\s*%/i,
  /\bninth day\b/i,
  /\b9th day\b/i,
  /\babove 42 hours\b/i,
  /\b42 regular hours\b/i,
  /wage protection law/i,
  /hours of work and rest law/i,
  /\bsection\s+16\b/i,
  /חוק הגנת השכר|חוק שעות עבודה/,
]);

// Topic families a verified record must overlap before its text may answer a
// legal segment. A record about overtime does not authorize a passport claim.
const CLAIM_TOPIC_PATTERNS = Object.freeze([
  ['passport', /passport|דרכון|หนังสือเดินทาง|पासपोर्ट|විදේශ ගමන්/i],
  ['documents', /passport|visa|work permit|דרכון|אשרה|ויזה|מסמך/i],
  ['dismissal', /\b(fired|fires|fire me|dismiss|dismissal)\b|פיטור|לפטר|מפוטר|ไล่ออก|निकाल|නෙරප/i],
  ['deductions', /\b(deduct|deduction|deducted)\b|לנכות|ניכוי|מנכים|หักเงิน|หักค่า|कटौती|අඩු කිරීම/i],
  ['leave', /sick leave|annual leave|maternity leave|vacation days|paid leave|חופשת מחלה|ימי מחלה|ลาป่วย|छुट्टी|නිවාඩු/i],
  ['overtime', /\b(overtime|saturday|shabbat)\b|שעות נוספות|שבת|ค่าล่วงเวลา|ओवरटाइम|शनिवार|අතිකාල/i],
  ['wages', /\b(salary|wage|wages|unpaid|not paid|missing salary|missing wages)\b|משכורת|שכר|לא שילמו|מגיע לי|ค่าจ้าง/i],
  ['rights', /\brights\b|זכויות|สิทธิ|अधिकार|අයිතිවාසිකම්/i],
]);

const RECORD_TOPIC_PATTERNS = Object.freeze([
  ['passport', /passport/i],
  ['documents', /passport|document|visa|permit/i],
  ['dismissal', /dismiss|fired|termination/i],
  ['deductions', /deduct/i],
  ['leave', /\bleave\b|vacation|sick/i],
  ['overtime', /overtime/i],
  ['wages', /salary|wage|missing_salary|payment_timing|\bpay\b/i],
  ['rights', /\brights\b/i],
]);

function claimTopics(text = '') {
  const value = String(text || '');
  return CLAIM_TOPIC_PATTERNS.filter(([, pattern]) => pattern.test(value)).map(([topic]) => topic);
}

function recordTopics(record = {}) {
  const keywords = Array.isArray(record.keywords) ? record.keywords.join(' ') : '';
  const blob = [record.topic, record.id, record.title, keywords].filter(Boolean).join(' ');
  return RECORD_TOPIC_PATTERNS.filter(([, pattern]) => pattern.test(blob)).map(([topic]) => topic);
}

function topicCovered(needed, covered) {
  if (covered.has(needed)) return true;
  if ((needed === 'passport' || needed === 'documents') && (covered.has('passport') || covered.has('documents'))) return true;
  return false;
}

function recordsCoverClaim(records = [], topics = []) {
  const approved = (Array.isArray(records) ? records : []).filter((record) => passesLegalVerification(record));
  if (!approved.length) return false;
  const needed = topics.length ? topics : ['rights'];
  const covered = new Set();
  for (const record of approved) {
    for (const topic of recordTopics(record)) covered.add(topic);
  }
  return needed.every((topic) => topicCovered(topic, covered));
}

function approvedRecords(options = {}) {
  return (Array.isArray(options.verifiedRecords) ? options.verifiedRecords : []).filter((record) => passesLegalVerification(record));
}

function segmentIsLegal(question, options = {}) {
  if (options.legalSegment === true) return true;
  return looksLikeLegalOrRightsQuestion(question);
}

function looksLikeLegalOrRightsQuestion(text = '') {
  const value = String(text || '');
  if (!value.trim()) return false;
  return LEGAL_QUESTION_PATTERNS.some((pattern) => pattern.test(value));
}

function containsUnsupportedStatutoryClaim(text = '') {
  const value = String(text || '');
  if (!value.trim()) return false;
  return UNSUPPORTED_STATUTORY_PATTERNS.some((pattern) => pattern.test(value));
}

// Structured results from our own services. Free-text `message` is never trusted
// on a legal segment, even if it mentions jobs, a question, or an arithmetic phrase.
function trustedStructuredText(output) {
  if (!output || typeof output !== 'object' || Array.isArray(output)) return '';
  const capability = String(output.capability || '');
  if (Array.isArray(output.listings) && capability === 'housing.support') {
    return output.listings.slice(0, 5).map((listing, index) => {
      if (!listing || typeof listing !== 'object') return '';
      const title = String(listing.title || '').trim();
      const city = String(listing.city || '').trim();
      if (!title) return '';
      return `${index + 1}. ${title}${city ? ` - ${city}` : ''}`;
    }).filter(Boolean).join('\n');
  }
  if (Array.isArray(output.jobs) && /^(jobs\.search|jobs\.match)$/.test(capability)) {
    return output.jobs.slice(0, 5).map((job, index) => {
      if (!job || typeof job !== 'object') return '';
      const title = String(job.title || '').trim();
      const city = String(job.city || '').trim();
      if (!title) return '';
      return `${index + 1}. ${title}${city ? ` - ${city}` : ''}`;
    }).filter(Boolean).join('\n');
  }
  const calc = output.calculation;
  if (
    calc && typeof calc === 'object'
    && typeof calc.basicGrossPay === 'number'
    && typeof calc.regularHours === 'number'
    && typeof calc.hourlyRate === 'number'
    && calc.overtimeAt125Hours == null
    && calc.overtimeGrossPay == null
  ) {
    const currency = String(calc.currency || '').trim();
    return `For ${calc.regularHours} regular hours at ${calc.hourlyRate}${currency ? ` ${currency}` : ''} per hour, basic gross pay is ${calc.basicGrossPay}${currency ? ` ${currency}` : ''}.`;
  }
  if (Array.isArray(output.reportedQuotes) && capability === 'finance.transfer') {
    const message = String(output.message || '').trim();
    if (message && !looksLikeLegalOrRightsQuestion(message) && !containsUnsupportedStatutoryClaim(message)) {
      return message;
    }
  }
  return '';
}

function verbatimReviewedAnswers(records = [], topics = []) {
  const approved = (Array.isArray(records) ? records : []).filter((record) => passesLegalVerification(record));
  const needed = topics.length ? topics : ['rights'];
  const lines = [];
  for (const record of approved) {
    const covered = new Set(recordTopics(record));
    if (!needed.some((topic) => topicCovered(topic, covered))) continue;
    const answer = String(record.answer || '').trim();
    const source = record.source && typeof record.source === 'object' ? record.source : {};
    const url = String(source.url || '').trim();
    const title = String(source.title || '').trim();
    if (!answer || !url) continue;
    lines.push(`${answer}\n\nSource: ${[title, url].filter(Boolean).join(' ')}`);
  }
  return lines;
}

function looksLikeUnverifiedLegalAnswer(text = '') {
  const value = String(text || '');
  return /should not guess|does not yet have verified|do not yet have verified|workers in israel generally have rights|rights around payment/i.test(value);
}

function replyContainsRightsFallback(text = '') {
  const value = String(text || '');
  return Object.values(RIGHTS_UNVERIFIED_FALLBACK).some((fallback) => value.includes(fallback));
}

function guardLegalReply(text = '', options = {}) {
  const reply = String(text || '').trim();
  const question = String(options.question || '');
  const language = options.language || 'en';
  const fallback = createRightsUnverifiedFallback(language);
  const legal = segmentIsLegal(question, options);
  if (!legal) {
    if (containsUnsupportedStatutoryClaim(reply) || looksLikeUnverifiedLegalAnswer(reply)) return fallback;
    return reply;
  }

  // Fail closed. Topic overlap does not license model text. The only legal
  // words allowed are a gate-approved record's own answer, copied with its source.
  const reviewed = verbatimReviewedAnswers(approvedRecords(options), claimTopics(question));
  const trusted = trustedStructuredText(options.output);
  const parts = reviewed.length ? [...reviewed] : [fallback];
  if (trusted) parts.push(trusted);
  return joinGuardedParts(parts, language);
}

function joinGuardedParts(parts = [], language = 'en') {
  const fallback = createRightsUnverifiedFallback(language);
  const cleaned = [];
  let sawFallback = false;
  for (const part of parts) {
    const value = String(part || '').trim();
    if (!value) continue;
    if (value.includes(fallback)) {
      sawFallback = true;
      for (const piece of value.split(fallback)) {
        const trimmed = piece.trim();
        if (trimmed && !cleaned.includes(trimmed)) cleaned.push(trimmed);
      }
    } else if (!cleaned.includes(value)) {
      cleaned.push(value);
    }
  }
  if (sawFallback && !cleaned.includes(fallback)) cleaned.push(fallback);
  return cleaned.join('\n\n');
}

function guardGeneratedLegalOutput(text = '', options = {}) {
  const question = String(options.question || '');
  const legal = segmentIsLegal(question, options);
  if (legal) {
    const reviewed = verbatimReviewedAnswers(approvedRecords(options), claimTopics(question));
    if (reviewed.length) return reviewed.join('\n\n');
    return createRightsUnverifiedFallback(options.language || 'en');
  }
  const reply = String(text || '');
  if (containsUnsupportedStatutoryClaim(reply)) return createRightsUnverifiedFallback(options.language || 'en');
  return reply;
}

function swapRightsFallbackToLanguage(text = '', language = 'en') {
  const target = createRightsUnverifiedFallback(language);
  let next = String(text || '');
  let found = false;
  for (const value of Object.values(RIGHTS_UNVERIFIED_FALLBACK)) {
    if (value !== target && next.includes(value)) {
      next = next.split(value).join(target);
      found = true;
    } else if (next.includes(value)) {
      found = true;
    }
  }
  return { text: next, found };
}

module.exports = {
  LEGAL_QUESTION_PATTERNS,
  PENDING_NATIVE_SPEAKER_REVIEW,
  UNSUPPORTED_STATUTORY_PATTERNS,
  claimTopics,
  containsUnsupportedStatutoryClaim,
  guardGeneratedLegalOutput,
  guardLegalReply,
  joinGuardedParts,
  looksLikeLegalOrRightsQuestion,
  recordsCoverClaim,
  replyContainsRightsFallback,
  swapRightsFallbackToLanguage,
};
