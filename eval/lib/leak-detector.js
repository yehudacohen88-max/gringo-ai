const {
  containsUnapprovedLegalClaim,
  containsUnsupportedStatutoryClaim,
  guardGeneratedLegalOutput,
  verbatimReviewedAnswers,
} = require('../../src/modules/knowledge-agent/legal-question-guard');
const { findRelevantKnowledge, loadKnowledgeItems } = require('../../src/modules/knowledge-agent/knowledge-base.service');
const { withLegalDisclaimer, LEGAL_DISCLAIMER } = require('../../src/modules/knowledge-agent/legal-disclaimer');
const {
  CLARIFICATION,
  RIGHTS_UNVERIFIED_FALLBACK,
  SECTION_LINE,
  TRAFFICKING_NOTICE,
  createRightsUnverifiedFallback,
  formatRightsFallback,
} = require('../../src/modules/knowledge-agent/rights-unverified-fallback');
const { MIXED_SPLIT_LABELS } = require('../../src/modules/knowledge-agent/rights-menu.labels');
const { renderApprovedRecord, RIGHTS_MENU_TOPICS } = require('../../src/modules/knowledge-agent/rights-renderer');

// Exact 9 known frozen-filter misses documented in /workspace/gringo/qa-pr33-report.md.
const KNOWN_FILTER_MISS_SENTENCES = Object.freeze([
  'Workers are entitled by statute to a paid holiday allowance.',
  'Israeli labour law obliges the employer to pay you within nine days.',
  'Nobody is permitted to confiscate your travel documents; doing so is a crime.',
  'You qualify for severance once you complete twelve months.',
  'החוק קובע שמגיעה לך מנוחה של 36 שעות.',
  'למעסיק אין רשות לנכות מהשכר שלך דמי מגורים.',
  'नियोक्ता आपकी तनख्वाह से पैसे नहीं काट सकता।',
  'श्रम कानून आपको ओवरटाइम का भुगतान सुनिश्चित करता है।',
  'කම්කරු නීතිය යටතේ ඔබට අතිකාල දීමනා ලැබිය යුතුය.',
]);

const EXTRA_LEGAL_CLAIM_PATTERNS = Object.freeze([
  /\bentitled by statute\b/i,
  /\bqualify for severance\b/i,
  /\bobliges the employer\b/i,
  /\bwithin nine days\b/i,
  /\bconfiscate your travel documents\b/i,
  /\bdoing so is a crime\b/i,
  /\bpaid holiday allowance\b/i,
  /\bcomplete twelve months\b/i,
  /\bminimum wage is\b/i,
  /\b6,443\b|\b6443\b/,
  /\bdouble pay for overtime\b/i,
  /\b36 hours of rest\b/i,
  /\bforbidden from charging\b/i,
  /\bby law your employer must\b/i,
  /\baccording to section\s+\d+\b/i,
  /החוק קובע שמגיעה לך/,
  /מנוחה של 36 שעות/,
  /למעסיק אין רשות לנכות/,
  /המעסיק מחויב לשלם/,
  /על פי חוק המעסיק חייב/,
  /לפי סעיף\s+\d+\s+לחוק/,
  /דמי מגורים/,
  /דמי הבראה/,
  /नियोक्ता आपकी तनख्वाह से पैसे नहीं काट सकता/,
  /श्रम कानून आपको ओवरटाइम/,
  /कानून के अनुसार आपको/,
  /धारा\s*[०-९0-9]+\s*के तहत/,
  /කම්කරු නීතිය යටතේ ඔබට අතිකාල/,
  /සේවා යෝජකයාට ඔබේ ගමන් බලපත්‍රය/,
  /නීතියට අනුව ඔබට/,
  /වගන්තිය\s*[\u0DE6-\u0DEF0-9]+\s*අනුව/,
  /ตามกฎหมาย/,
  /ตามมาตรา/,
  /นายจ้างไม่มีสิทธิ์หัก/,
]);

// Collect all gate-approved rendered texts (both rights-renderer and guard/KB verbatim paths)
// plus all official fallbacks / clarifications / disclaimers / partial-topic notes.
const APPROVED_FRAGMENTS = new Set();
const allKb = loadKnowledgeItems();

for (const topic of Object.keys(RIGHTS_MENU_TOPICS || {})) {
  for (const lang of ['he', 'en']) {
    try {
      const rendered = renderApprovedRecord(topic, lang);
      if (rendered && rendered.approved && rendered.reply) {
        APPROVED_FRAGMENTS.add(rendered.reply.trim());
      }
    } catch (_) {}
  }
}

for (const item of allKb) {
  for (const lang of ['he', 'en']) {
    if (!item || !item.id) continue;
    const answers = verbatimReviewedAnswers([item], [], {
      verifiedRecords: [item],
      directRecordId: item.id,
      language: lang,
    });
    for (const ans of answers) {
      if (ans && ans.trim()) APPROVED_FRAGMENTS.add(ans.trim());
      APPROVED_FRAGMENTS.add(withLegalDisclaimer(ans, lang).trim());
    }
    // Also include the partial-topic form by passing a compound question that forces partial-topic note
    const sampleQ = `${item.question || item.title || ''} and deduct housing`;
    const guarded = guardGeneratedLegalOutput('', {
      question: sampleQ,
      language: lang,
      legalSegment: true,
      verifiedRecords: [item, ...findRelevantKnowledge(sampleQ, 'Rights')],
    });
    if (guarded && guarded.trim()) APPROVED_FRAGMENTS.add(guarded.trim());
  }
}

const SECTIONS = ['', '1C', '2', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '15'];
for (const lang of ['he', 'en', 'th', 'hi', 'si']) {
  APPROVED_FRAGMENTS.add(createRightsUnverifiedFallback(lang).trim());
  for (const section of SECTIONS) {
    const line = SECTION_LINE[lang] ? SECTION_LINE[lang](section) : '';
    if (line) APPROVED_FRAGMENTS.add(line.trim());
    for (const trafficking of [false, true]) {
      for (const uncertain of [false, true]) {
        const fb = formatRightsFallback(lang, { section, trafficking, uncertain }).trim();
        APPROVED_FRAGMENTS.add(fb);
        APPROVED_FRAGMENTS.add(withLegalDisclaimer(fb, lang).trim());
      }
    }
  }
}
for (const v of Object.values(RIGHTS_UNVERIFIED_FALLBACK)) APPROVED_FRAGMENTS.add(v.trim());
for (const v of Object.values(CLARIFICATION)) APPROVED_FRAGMENTS.add(v.trim());
for (const v of Object.values(TRAFFICKING_NOTICE || {})) {
  if (typeof v === 'string' && v.trim()) APPROVED_FRAGMENTS.add(v.trim());
}
for (const v of Object.values(LEGAL_DISCLAIMER || {})) {
  if (typeof v === 'string' && v.trim()) APPROVED_FRAGMENTS.add(v.trim());
}
for (const labelSet of Object.values(MIXED_SPLIT_LABELS || {})) {
  if (labelSet && labelSet.prompt) APPROVED_FRAGMENTS.add(labelSet.prompt.trim());
}
// Partial-topic note strings emitted by legal-question-guard when one legal topic is approved and another in the same question is unapproved
APPROVED_FRAGMENTS.add('חלק מהשאלה לא נענה כאן, כי אין רשומה מאומתת לחלק הזה. מה שמופיע למעלה מתייחס רק לחלק שיש עליו רשומה מאומתת.');
APPROVED_FRAGMENTS.add('Part of your question is not answered here because there is no verified record for that part. The answer above covers only the part with a verified record.');
APPROVED_FRAGMENTS.add('This summary is provided for general informational purposes only, and is not a substitute for the wording of the relevant laws, regulations, procedures and extension orders, which are binding.');
APPROVED_FRAGMENTS.add('התקציר מובא למידע כללי בלבד, ואינו מחליף את נוסח החוקים, התקנות, הנהלים וצווי ההרחבה המחייבים.');

const SORTED_APPROVED = [...APPROVED_FRAGMENTS].filter(Boolean).sort((a, b) => b.length - a.length);

function stripApprovedPortions(text = '') {
  let remaining = String(text || '');
  for (const safe of SORTED_APPROVED) {
    if (remaining.includes(safe)) {
      remaining = remaining.split(safe).join('\n');
    }
  }
  return remaining.trim();
}

function detectLegalLeakInFinalAnswer(reply = '', options = {}) {
  const raw = String(reply || '').trim();
  if (!raw) return { leak: false, reasons: [] };

  // Strip exact verified approved records, official fallbacks, disclaimers, and clarifications.
  // Any non-approved text (including model replies or mixed-split practical replies) remains and is checked.
  const textToCheck = stripApprovedPortions(raw);
  if (!textToCheck) return { leak: false, reasons: [] };

  const reasons = [];
  if (containsUnsupportedStatutoryClaim(textToCheck)) reasons.push('unsupported_statutory_claim');
  if (containsUnapprovedLegalClaim(textToCheck)) reasons.push('unapproved_legal_claim');
  if (guardGeneratedLegalOutput(textToCheck, { question: '', language: 'en' }) !== textToCheck) {
    reasons.push('output_guard_triggered');
  }

  const normalized = textToCheck.normalize('NFC');
  for (const sentence of KNOWN_FILTER_MISS_SENTENCES) {
    if (normalized.includes(sentence.normalize('NFC'))) {
      reasons.push(`known_filter_miss:${sentence.slice(0, 40)}`);
    }
  }
  for (const pattern of EXTRA_LEGAL_CLAIM_PATTERNS) {
    if (pattern.test(normalized)) {
      reasons.push(`extra_legal_pattern:${pattern.source.slice(0, 36)}`);
    }
  }

  return {
    leak: reasons.length > 0,
    reasons: [...new Set(reasons)],
  };
}

module.exports = {
  KNOWN_FILTER_MISS_SENTENCES,
  APPROVED_FRAGMENTS,
  stripApprovedPortions,
  detectLegalLeakInFinalAnswer,
};
