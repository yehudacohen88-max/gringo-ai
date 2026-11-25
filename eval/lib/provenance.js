'use strict';

// Answer-provenance classifier, duplicate-paragraph detector, and independent-leak
// attribution for Gringo evaluation. Keeps independent-leak-detector.js decoupled
// from filter-under-test modules while separating:
//   - model_generated
//   - approved_record
//   - fallback
//   - fixed_template (worker-rights CLARIFICATION, practical clarifications, catalog/menus)

const { detectIndependentLegalLeak } = require('./independent-leak-detector');
const { findRelevantKnowledge, loadKnowledgeItems } = require('../../src/modules/knowledge-agent/knowledge-base.service');
const { guardGeneratedLegalOutput, verbatimReviewedAnswers } = require('../../src/modules/knowledge-agent/legal-question-guard');
const {
  withLegalDisclaimer,
  LEGAL_DISCLAIMER,
  ENGLISH_HANDBOOK_DISCLAIMER,
  ENGLISH_NOT_LEGAL_ADVICE,
} = require('../../src/modules/knowledge-agent/legal-disclaimer');
const {
  CLARIFICATION,
  RIGHTS_UNVERIFIED_FALLBACK,
  RIGHTS_UNVERIFIED_FALLBACK_LEAD,
  SECTION_LINE,
  TRAFFICKING_NOTICE,
  createRightsUnverifiedFallback,
  formatRightsFallback,
} = require('../../src/modules/knowledge-agent/rights-unverified-fallback');
const { MIXED_SPLIT_LABELS } = require('../../src/modules/knowledge-agent/rights-menu.labels');
const {
  approvedRightsTopics,
  findApprovedRecordByTopic,
  renderApprovedRecord,
} = require('../../src/modules/knowledge-agent/rights-renderer');
const {
  allPracticalClarificationTexts,
  isPracticalClarificationText,
} = require('../../src/modules/ai-provider/practical-clarification');

function addSet(set, text) {
  const s = String(text || '').normalize('NFC').trim();
  if (s) set.add(s);
}

function buildProvenanceSets() {
  const approvedSet = new Set();
  const fallbackSet = new Set();
  const fixedTemplateSet = new Set();

  // 1. Approved records (rendered PIBA handbook + KB verbatim + legal disclaimers)
  const topicMap = approvedRightsTopics();
  for (const lang of ['he', 'en']) {
    for (const topic of (topicMap[lang] || [])) {
      try {
        const rec = findApprovedRecordByTopic(topic, lang);
        if (rec && rec.id) {
          addSet(approvedSet, renderApprovedRecord(rec.id, lang));
        }
      } catch (_) {}
    }
  }

  const allKb = loadKnowledgeItems();
  for (const item of allKb) {
    if (!item || !item.id) continue;
    for (const lang of ['he', 'en']) {
      const answers = verbatimReviewedAnswers([item], [], {
        verifiedRecords: [item],
        directRecordId: item.id,
        language: lang,
      });
      for (const ans of answers) {
        addSet(approvedSet, ans);
        addSet(approvedSet, withLegalDisclaimer(ans, lang));
      }
      const sampleQ = `${item.question || item.title || ''} and deduct housing`;
      const guarded = guardGeneratedLegalOutput('', {
        question: sampleQ,
        language: lang,
        legalSegment: true,
        verifiedRecords: [item, ...findRelevantKnowledge(sampleQ, 'Rights')],
      });
      addSet(approvedSet, guarded);
    }
  }

  for (const v of Object.values(LEGAL_DISCLAIMER || {})) {
    if (typeof v === 'string') addSet(approvedSet, v);
  }
  addSet(approvedSet, ENGLISH_HANDBOOK_DISCLAIMER);
  addSet(approvedSet, ENGLISH_NOT_LEGAL_ADVICE);
  addSet(approvedSet, 'חלק מהשאלה לא נענה כאן, כי אין רשומה מאומתת לחלק הזה. מה שמופיע למעלה מתייחס רק לחלק שיש עליו רשומה מאומתת.');
  addSet(approvedSet, 'Part of your question is not answered here because there is no verified record for that part. The answer above covers only the part with a verified record.');
  addSet(approvedSet, 'This summary is provided for general informational purposes only, and is not a substitute for the wording of the relevant laws, regulations, procedures and extension orders, which are binding.');
  addSet(approvedSet, 'התקציר מובא למידע כללי בלבד, ואינו מחליף את נוסח החוקים, התקנות, הנהלים וצווי ההרחבה המחייבים.');

  // 2. Fallbacks (rights-unverified fallbacks, section lines, trafficking notice)
  const SECTIONS = ['', '1C', '2', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '15'];
  for (const lang of ['he', 'en', 'th', 'hi', 'si']) {
    addSet(fallbackSet, createRightsUnverifiedFallback(lang));
    for (const section of SECTIONS) {
      const line = SECTION_LINE[lang] ? SECTION_LINE[lang](section) : '';
      addSet(fallbackSet, line);
      for (const trafficking of [false, true]) {
        for (const uncertain of [false, true]) {
          const fb = formatRightsFallback(lang, { section, trafficking, uncertain });
          addSet(fallbackSet, fb);
          addSet(fallbackSet, withLegalDisclaimer(fb, lang));
        }
      }
    }
  }
  for (const v of Object.values(RIGHTS_UNVERIFIED_FALLBACK || {})) addSet(fallbackSet, v);
  for (const v of Object.values(RIGHTS_UNVERIFIED_FALLBACK_LEAD || {})) addSet(fallbackSet, v);
  for (const v of Object.values(TRAFFICKING_NOTICE || {})) {
    if (typeof v === 'string') addSet(fallbackSet, v);
  }

  // 3. Fixed templates (worker-rights CLARIFICATION, practical clarification templates, mixed-split prompt, friendly/catalog templates)
  for (const v of Object.values(CLARIFICATION || {})) addSet(fixedTemplateSet, v);
  for (const v of allPracticalClarificationTexts()) addSet(fixedTemplateSet, v);
  for (const labelSet of Object.values(MIXED_SPLIT_LABELS || {})) {
    if (labelSet && labelSet.prompt) addSet(fixedTemplateSet, labelSet.prompt);
  }
  for (const msg of [
    'אני לא יכול לעזור בזה כרגע. בדקו בבקשה מקור רשמי.',
    "I can't help with that right now. Please check an official source.",
    'ตอนนี้ฉันยังช่วยเรื่องนี้ไม่ได้ กรุณาตรวจสอบจากแหล่งข้อมูลทางการ',
    'मैं अभी इसमें मदद नहीं कर सकता। कृपया आधिकारिक स्रोत देखें।',
    'මට දැනට මෙයට උදව් කළ නොහැක. කරුණාකර නිල මූලාශ්‍රයක් පරීක්ෂා කරන්න.',
  ]) {
    addSet(fixedTemplateSet, msg);
  }

  // Note: formatRightsFallback(lang, { uncertain: true }) starts with CLARIFICATION[lang],
  // so strip fixed_template fragments BEFORE composite fallback fragments when CLARIFICATION
  // is matched standalone, OR match longest-first across typed entries so composite
  // formatRightsFallback(uncertain:true) is split cleanly into [fixed_template, fallback]!
  // Let's keep CLARIFICATION out of fallbackSet composites by matching standalone CLARIFICATION
  // as fixed_template first, then matching fallbackSet, then approvedSet!
  const entries = [];
  for (const text of fixedTemplateSet) entries.push({ provenance: 'fixed_template', text });
  for (const text of approvedSet) entries.push({ provenance: 'approved_record', text });
  for (const text of fallbackSet) {
    // Only add standalone fallback entries that do not swallow a leading CLARIFICATION
    let cleaned = text;
    for (const clar of Object.values(CLARIFICATION || {})) {
      const c = String(clar || '').normalize('NFC').trim();
      if (c && cleaned.startsWith(c)) {
        cleaned = cleaned.slice(c.length).trim();
      }
    }
    if (cleaned) entries.push({ provenance: 'fallback', text: cleaned });
  }
  entries.sort((a, b) => b.text.length - a.text.length);
  return entries;
}

const PROVENANCE_ENTRIES = buildProvenanceSets();

function classifyAnswerProvenance(finalAnswer = '') {
  const source = String(finalAnswer || '').normalize('NFC').trim();
  if (!source) {
    return {
      segments: [],
      provenances: [],
      byProvenance: {
        model_generated: [],
        approved_record: [],
        fallback: [],
        fixed_template: [],
      },
      modelGeneratedText: '',
      nonModelText: '',
    };
  }

  // Find non-overlapping matches longest-first, preserving order in source.
  const occupied = new Array(source.length).fill(false);
  const matched = [];

  for (const entry of PROVENANCE_ENTRIES) {
    let from = 0;
    while (from < source.length) {
      const idx = source.indexOf(entry.text, from);
      if (idx === -1) break;
      const end = idx + entry.text.length;
      let overlaps = false;
      for (let i = idx; i < end; i += 1) {
        if (occupied[i]) {
          overlaps = true;
          break;
        }
      }
      if (!overlaps) {
        for (let i = idx; i < end; i += 1) occupied[i] = true;
        matched.push({ start: idx, end, provenance: entry.provenance, text: entry.text });
      }
      from = idx + 1;
    }
  }

  matched.sort((a, b) => a.start - b.start);

  const segments = [];
  let cursor = 0;
  for (const m of matched) {
    if (m.start > cursor) {
      const gap = source.slice(cursor, m.start).trim();
      if (gap) segments.push({ provenance: 'model_generated', text: gap });
    }
    segments.push({ provenance: m.provenance, text: m.text });
    cursor = m.end;
  }
  if (cursor < source.length) {
    const tail = source.slice(cursor).trim();
    if (tail) segments.push({ provenance: 'model_generated', text: tail });
  }

  const byProvenance = {
    model_generated: [],
    approved_record: [],
    fallback: [],
    fixed_template: [],
  };
  for (const seg of segments) {
    byProvenance[seg.provenance].push(seg.text);
  }

  return {
    segments,
    provenances: [...new Set(segments.map((s) => s.provenance))],
    byProvenance,
    modelGeneratedText: byProvenance.model_generated.join('\n\n').trim(),
    nonModelText: segments
      .filter((s) => s.provenance !== 'model_generated')
      .map((s) => s.text)
      .join('\n\n')
      .trim(),
  };
}

function analyzeIndependentLeaksByProvenance(finalAnswer = '', options = {}) {
  const lang = options.lang || options.language || 'en';
  const provenance = classifyAnswerProvenance(finalAnswer);
  const full = detectIndependentLegalLeak(finalAnswer, { lang });
  const modelGenerated = detectIndependentLegalLeak(provenance.modelGeneratedText, { lang });
  const approvedRecord = detectIndependentLegalLeak(provenance.byProvenance.approved_record.join('\n\n'), { lang });
  const fallback = detectIndependentLegalLeak(provenance.byProvenance.fallback.join('\n\n'), { lang });
  const fixedTemplate = detectIndependentLegalLeak(provenance.byProvenance.fixed_template.join('\n\n'), { lang });

  return {
    provenance: provenance.provenances,
    segments: provenance.segments,
    modelGeneratedText: provenance.modelGeneratedText,
    // Only model-generated unapproved legal content counts as a real independent leak:
    modelGeneratedLeak: modelGenerated.leak,
    modelGeneratedReasons: modelGenerated.reasons,
    modelGeneratedClaims: modelGenerated.claims,
    // Raw full-text detector result + non-model flags reported separately:
    rawFullAnswerLeak: full.leak,
    rawFullAnswerReasons: full.reasons,
    nonModelFlags: {
      approved_record: { flagged: approvedRecord.leak, reasons: approvedRecord.reasons },
      fallback: { flagged: fallback.leak, reasons: fallback.reasons },
      fixed_template: { flagged: fixedTemplate.leak, reasons: fixedTemplate.reasons },
    },
  };
}

function detectDuplicateParagraphs(text = '') {
  const paras = String(text || '')
    .normalize('NFC')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const seen = new Map();
  const duplicates = [];
  for (const p of paras) {
    const key = p.replace(/\s+/g, ' ');
    const count = (seen.get(key) || 0) + 1;
    seen.set(key, count);
    if (count === 2) duplicates.push(p);
  }
  return {
    hasDuplicates: duplicates.length > 0,
    duplicateCount: duplicates.length,
    totalParagraphs: paras.length,
    duplicates,
  };
}

const WORKER_RIGHTS_CLARIFICATIONS = new Set(
  Object.values(CLARIFICATION || {}).map((s) => String(s || '').normalize('NFC').trim()).filter(Boolean)
);

function extractPracticalSnippet(finalAnswer = '', options = {}) {
  const provenance = options.provenance || classifyAnswerProvenance(finalAnswer);
  const modelParts = provenance.byProvenance.model_generated.filter(Boolean);
  const practicalClarParts = provenance.byProvenance.fixed_template.filter((t) => isPracticalClarificationText(t));
  const rightsClarParts = provenance.byProvenance.fixed_template.filter((t) => WORKER_RIGHTS_CLARIFICATIONS.has(String(t || '').normalize('NFC').trim()));

  if (modelParts.length > 0) {
    return {
      snippet: modelParts.join('\n\n').trim(),
      treatment: 'answer_present',
      hasPracticalAnswer: true,
      hasPracticalClarification: false,
      isRightsClarificationOnly: false,
    };
  }
  if (practicalClarParts.length > 0) {
    return {
      snippet: practicalClarParts.join('\n\n').trim(),
      treatment: 'practical_clarification',
      hasPracticalAnswer: false,
      hasPracticalClarification: true,
      isRightsClarificationOnly: false,
    };
  }
  if (rightsClarParts.length > 0) {
    return {
      snippet: '',
      treatment: 'rights_clarification_only',
      hasPracticalAnswer: false,
      hasPracticalClarification: false,
      isRightsClarificationOnly: true,
    };
  }
  return {
    snippet: '',
    treatment: 'missing',
    hasPracticalAnswer: false,
    hasPracticalClarification: false,
    isRightsClarificationOnly: false,
  };
}

module.exports = {
  classifyAnswerProvenance,
  analyzeIndependentLeaksByProvenance,
  detectDuplicateParagraphs,
  extractPracticalSnippet,
};
