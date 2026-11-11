// Conservative detector for legal and worker-rights questions, independent of
// the knowledge classifier. It is a heuristic: it catches indirect and mixed
// phrasings we know about, and it will miss paraphrases that share none of
// these signals. Thai, Sinhala and Hindi patterns are pending native-speaker
// review. A match is not a legal conclusion.
//
// Ordinary job search and money-transfer wording is intentionally absent.

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
  /\bentitled\b/i,
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

function isClarifyingOnly(text = '') {
  const value = String(text || '').trim();
  if (!value || !value.includes('?')) return false;
  if (value.length > 500) return false;
  if (containsUnsupportedStatutoryClaim(value)) return false;
  if (/should not guess|do not yet have verified|wage protection|generally have rights/i.test(value)) return false;
  return true;
}

function isSafeNonLegalAssistance(text = '') {
  const value = String(text || '');
  if (!value.trim() || containsUnsupportedStatutoryClaim(value)) return false;
  return (
    /relevant jobs|job alerts|looking for jobs|which city would you like to work/i.test(value)
    || /not currently have enough real reported observations|demo provider ranking|exchange rate/i.test(value)
    || /basic gross pay for those regular hours/i.test(value)
    || /no results right now|this service is unavailable|demo data only/i.test(value)
    || /relevant housing/i.test(value)
  );
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
  if (options.verifiedLegalContext) return reply;
  if (reply.includes(fallback)) return reply;
  if (!reply) return looksLikeLegalOrRightsQuestion(question) ? fallback : reply;

  if (containsUnsupportedStatutoryClaim(reply)) {
    const paragraphs = reply.split(/\n\n+/);
    if (paragraphs.length > 1) {
      const kept = paragraphs.filter((paragraph) => (
        paragraph.trim()
        && !containsUnsupportedStatutoryClaim(paragraph)
        && !looksLikeUnverifiedLegalAnswer(paragraph)
      ));
      if (kept.length) return `${kept.join('\n\n')}\n\n${fallback}`;
    }
    return fallback;
  }

  if (isClarifyingOnly(reply)) return reply;
  if (isSafeNonLegalAssistance(reply)) {
    if (looksLikeLegalOrRightsQuestion(question)) return `${reply}\n\n${fallback}`;
    return reply;
  }
  if (!options.verifiedLegalContext && looksLikeUnverifiedLegalAnswer(reply)) return fallback;
  if (options.appendWhenLegalQuestion && looksLikeLegalOrRightsQuestion(question)) {
    return `${reply}\n\n${fallback}`;
  }
  return reply;
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
  if (options.verifiedLegalContext) return String(text || '');
  const reply = String(text || '');
  if (!containsUnsupportedStatutoryClaim(reply)) return reply;
  return createRightsUnverifiedFallback(options.language || 'en');
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
  containsUnsupportedStatutoryClaim,
  guardGeneratedLegalOutput,
  guardLegalReply,
  isSafeNonLegalAssistance,
  joinGuardedParts,
  looksLikeLegalOrRightsQuestion,
  replyContainsRightsFallback,
  swapRightsFallbackToLanguage,
};
