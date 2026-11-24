// Splits one message that mixes a practical question with a legal question.
// The legal clause is never sent to a model. A split that is not confident
// asks the user to choose, and does not call a model either.
//
// Confident: the clause split returns exactly two clauses, one legal or
// uncertain, and one practical whose code practical flag (not a greeting)
// confirms it.
// Not confident: three or more clauses, two legal clauses alongside a
// practical signal, no confirming practical flag, a clause that is neither,
// or any other doubt. A message the splitter does not divide stays on the
// existing path.

const { PRACTICAL_FLAG_DOMAINS } = require('../ai-provider/dual-gate');
const { classifyUserQuestion } = require('./legal-topic-detector');

// Sentence and conjunction breaks for a mixed question. This is not a legal
// word list. Thai และ and แต่, and Hindi और and लेकिन, are machine-chosen
// separators, pending native-speaker review. They are never shown to the user.
// A bare Hebrew ו glued to the next word is not a separator: it is too ambiguous.
const MIXED_CLAUSE_SEPARATOR = new RegExp([
  String.raw`\r?\n+`,
  // A period, question mark, or exclamation mark ends a clause. Leave it in
  // place when the next word is itself a conjunction, so that conjunction
  // stays the separator.
  String.raw`[.?!]\s+(?!(?:and|also|plus|but)\b|אבל|וגם|וגמ(?!ם))`,
  String.raw`\s+\b(?:and|also|plus|but)\b\s+`,
  String.raw`\s+ו(?:אני|גם)?\s+`,
  String.raw`\s+וגם(?=\S)`,
  String.raw`\s+וגמ(?!ם)(?=\S)`,
  String.raw`\s+אבל(?:\s+|(?=\S))`,
  String.raw`\s*และ\s*`,
  String.raw`\s*แต่\s*`,
  String.raw`\s+और(?:\s+|(?=\S))`,
  String.raw`\s+लेकिन(?:\s+|(?=\S))`,
].join('|'), 'iu');

function splitMixedClauses(message = '') {
  return String(message || '')
    .trim()
    .split(MIXED_CLAUSE_SEPARATOR)
    .map((clause) => clause.trim())
    .filter(Boolean);
}
const { MIXED_SPLIT_LABELS } = require('./rights-menu.labels');
const {
  createRightsReplyMarkup,
  findApprovedRecordByTopic,
  renderApprovedRecord,
} = require('./rights-renderer');
const {
  CLARIFICATION,
  formatRightsFallback,
  rightsFallbackLanguage,
} = require('./rights-unverified-fallback');

const CHOOSE_PRACTICAL = 'choose:rights:practical';
const CHOOSE_RIGHTS = 'choose:rights:menu';

function confirmingFlags(flags = {}) {
  return Object.keys(PRACTICAL_FLAG_DOMAINS).filter((flag) => flags && flags[flag] === true);
}

function isLegalClause(clause) {
  return clause.disposition === 'legal' || clause.disposition === 'uncertain';
}

function isPracticalClause(clause) {
  return clause.disposition === 'practical' && confirmingFlags(clause.practical).length > 0;
}

function assessMixedSplit(message = '') {
  const clauses = splitMixedClauses(message).map((clause) => ({
    clause,
    ...classifyUserQuestion(clause),
  }));
  if (clauses.length < 2) return { kind: 'passthrough', reason: 'unsplit', clauses };

  const legal = clauses.filter(isLegalClause);
  const practical = clauses.filter(isPracticalClause);
  const taken = new Set([...legal, ...practical]);
  const other = clauses.filter((clause) => !taken.has(clause));
  const domainFlag = clauses.some((clause) => confirmingFlags(clause.practical).length > 0);
  const practicalDisposition = clauses.some((clause) => clause.disposition === 'practical');

  if (
    clauses.length === 2
    && legal.length === 1
    && practical.length === 1
    && other.length === 0
  ) {
    return { kind: 'confident', reason: 'one_each', clauses, legal: legal[0], practical: practical[0] };
  }

  if (legal.length === 0 || (!domainFlag && !practicalDisposition)) {
    return { kind: 'passthrough', reason: legal.length === 0 ? 'no_legal' : 'no_practical', clauses };
  }

  let reason = 'doubt';
  if (clauses.length >= 3) reason = 'too_many_clauses';
  else if (legal.length >= 2) reason = 'two_legal';
  else if (!domainFlag) reason = 'no_practical_flag';
  return { kind: 'clarify', reason, clauses, legal, practical };
}

function legalAnswerForClause(clause, language) {
  const lang = rightsFallbackLanguage(language);
  const classified = classifyUserQuestion(clause);
  const record = classified.topic ? findApprovedRecordByTopic(classified.topic, lang) : null;
  const reply = record
    ? renderApprovedRecord(record.id, lang)
    : formatRightsFallback(lang, {
      section: classified.section,
      trafficking: classified.trafficking,
      uncertain: classified.disposition === 'uncertain',
    });
  return {
    reply,
    replyMarkup: createRightsReplyMarkup(lang),
    approved: Boolean(record),
  };
}

function joinSplitReply(split, practicalReply, legalReply) {
  const practicalText = String(practicalReply || '').trim();
  const legalText = String(legalReply || '').trim();
  const ordered = split.clauses.map((clause) => (
    clause === split.practical ? practicalText : legalText
  ));
  const parts = [];
  for (const part of ordered) {
    if (!part || parts.includes(part)) continue;
    if (parts.some((kept) => kept.includes(part))) continue;
    parts.push(part);
  }
  return parts.join('\n\n');
}

function mergeInlineKeyboards(primary, extra) {
  const rows = [];
  if (primary && Array.isArray(primary.inline_keyboard)) rows.push(...primary.inline_keyboard);
  if (extra && Array.isArray(extra.inline_keyboard)) rows.push(...extra.inline_keyboard);
  return rows.length ? { inline_keyboard: rows } : undefined;
}

function clarificationButtons(language) {
  const lang = rightsFallbackLanguage(language);
  if (lang !== 'he' && lang !== 'en') return undefined;
  const labels = MIXED_SPLIT_LABELS[lang];
  const { inlineKeyboard } = require('../telegram/telegram-message.service');
  return inlineKeyboard([
    [{ text: labels.practical, data: CHOOSE_PRACTICAL }],
    [{ text: labels.rights, data: CHOOSE_RIGHTS }],
  ]);
}

function clarificationForMixedSplit(language) {
  const lang = rightsFallbackLanguage(language);
  return {
    reply: CLARIFICATION[lang],
    replyMarkup: clarificationButtons(lang),
    skipOutgoingTranslation: true,
    preserveSplitReply: true,
    replyLanguage: lang,
    category: 'Knowledge',
    status: 'MIXED_SPLIT_UNSURE',
    ai: { attempted: false, used: false, error: '' },
  };
}

module.exports = {
  CHOOSE_PRACTICAL,
  CHOOSE_RIGHTS,
  assessMixedSplit,
  clarificationForMixedSplit,
  joinSplitReply,
  legalAnswerForClause,
  mergeInlineKeyboards,
  splitMixedClauses,
};
