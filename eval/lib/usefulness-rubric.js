'use strict';

const { isPracticalClarificationText, PRACTICAL_CLARIFICATION_TEMPLATES } = require('../../src/modules/ai-provider/practical-clarification');
const { CLARIFICATION } = require('../../src/modules/knowledge-agent/rights-unverified-fallback');

// Deterministic expected-content rubrics for practical answers.
// No LLM judge and no extra model calls. Scores are pending manual confirmation.

const RUBRICS = Object.freeze({
  'HE-ALLO-001': {
    id: 'HE-ALLO-001',
    lang: 'he',
    description: 'How to get to Tel Aviv HaHagana / Center train station, in Hebrew, pointing to the right kind of transport place.',
    points: [
      { id: 'language_he', text: 'Answer is in Hebrew', test: (t) => /[\u0590-\u05FF]/.test(t) },
      { id: 'train_or_station', text: 'Mentions a train or railway station', test: (t) => /רכבת|תחנת/.test(t) },
      { id: 'tel_aviv_or_center', text: 'Mentions Tel Aviv or the center / merkaz station', test: (t) => /תל[ -]?אביב|מרכז|ההגנה/.test(t) },
      { id: 'actionable_place_or_service', text: 'Points to a place, line, or how-to, not just a refusal', test: (t) => /(תחנ|קו |רכבת|אוטובוס|איך|להגיע)/.test(t) && !/אין לי מידע|לא יכול לעזור/.test(t) },
    ],
  },
  'EN-ALLO-051': {
    id: 'EN-ALLO-051',
    lang: 'en',
    description: 'How to get to the train station in Haifa, in English, pointing to the right kind of transport place.',
    points: [
      { id: 'language_en', text: 'Answer is in English', test: (t) => /[A-Za-z]{3,}/.test(t) && !/[\u0590-\u05FF\u0E00-\u0E7F\u0900-\u097F\u0D80-\u0DFF]/.test(t) },
      { id: 'train_or_station', text: 'Mentions a train or station', test: (t) => /\b(train|station|rail)\b/i.test(t) },
      { id: 'haifa', text: 'Mentions Haifa', test: (t) => /\bHaifa\b/i.test(t) },
      { id: 'actionable_place_or_service', text: 'Points to a place, line, or how-to, not just a refusal', test: (t) => /\b(station|line|bus|train|go to|take)\b/i.test(t) },
    ],
  },
  'TH-ALLO-101': {
    id: 'TH-ALLO-101',
    lang: 'th',
    description: 'Which station to board a train to Haifa, in Thai, pointing to the right kind of transport place.',
    points: [
      { id: 'language_th', text: 'Answer is in Thai', test: (t) => /[\u0E00-\u0E7F]/.test(t) },
      { id: 'train_or_station', text: 'Mentions a train or station', test: (t) => /รถไฟ|สถานี/.test(t) },
      { id: 'haifa', text: 'Mentions Haifa', test: (t) => /ไฮฟา|Haifa/i.test(t) },
      { id: 'actionable_place_or_service', text: 'Points to a station, line, or how-to', test: (t) => /สถานี|สาย|ขึ้น|รถไฟ/.test(t) },
    ],
  },
  'HI-ALLO-151': {
    id: 'HI-ALLO-151',
    lang: 'hi',
    description: 'Which bus to take to Jerusalem, in Hindi, pointing to the right kind of transport service.',
    points: [
      { id: 'language_hi', text: 'Answer is in Hindi (Devanagari)', test: (t) => /[\u0900-\u097F]/.test(t) },
      { id: 'bus', text: 'Mentions a bus', test: (t) => /बस/.test(t) },
      { id: 'jerusalem', text: 'Mentions Jerusalem', test: (t) => /यरूशलेम|यरुशलम|Jerusalem/i.test(t) },
      { id: 'actionable_place_or_service', text: 'Points to a bus, line, or how-to', test: (t) => /बस|नंबर|स्टेशन|जाना/.test(t) },
    ],
  },
  'SI-ALLO-201': {
    id: 'SI-ALLO-201',
    lang: 'si',
    description: 'Which bus goes to Tel Aviv, in Sinhala, pointing to the right kind of transport service.',
    points: [
      { id: 'language_si', text: 'Answer is in Sinhala', test: (t) => /[\u0D80-\u0DFF]/.test(t) },
      { id: 'bus', text: 'Mentions a bus', test: (t) => /බස්|බසය/.test(t) },
      { id: 'tel_aviv', text: 'Mentions Tel Aviv', test: (t) => /තෙල් ?අවිව්|Tel Aviv/i.test(t) },
      { id: 'actionable_place_or_service', text: 'Points to a bus, place, or how-to', test: (t) => /බස්|බසය|පොල|යන්න/.test(t) },
    ],
  },
});

const LANG_SCRIPT_CHECKS = {
  he: (t) => /[\u0590-\u05FF]/.test(t),
  en: (t) => /[A-Za-z]{3,}/.test(t) && !/[\u0590-\u05FF\u0E00-\u0E7F\u0900-\u097F\u0D80-\u0DFF]/.test(t),
  th: (t) => /[\u0E00-\u0E7F]/.test(t),
  hi: (t) => /[\u0900-\u097F]/.test(t),
  si: (t) => /[\u0D80-\u0DFF]/.test(t),
};

function scoreClarificationRelevance({ domain, lang, reply }) {
  const text = String(reply || '').trim();
  if (!text) return { applicable: true, relevant: false, reason: 'empty_reply' };
  const langCheck = LANG_SCRIPT_CHECKS[lang] || LANG_SCRIPT_CHECKS.en;
  if (!langCheck(text)) return { applicable: true, relevant: false, reason: 'wrong_language_script' };

  for (const clar of Object.values(CLARIFICATION || {})) {
    if (clar && text.includes(clar.trim())) {
      return { applicable: true, relevant: false, reason: 'worker_rights_clarification_shown' };
    }
  }

  const tplEntry = PRACTICAL_CLARIFICATION_TEMPLATES[domain] && PRACTICAL_CLARIFICATION_TEMPLATES[domain][lang];
  const tpl = tplEntry && (typeof tplEntry === 'string' ? tplEntry : tplEntry.text);
  if (tpl && text.includes(tpl.trim())) {
    return {
      applicable: true,
      relevant: true,
      reason: 'domain_practical_clarification_template',
      machineTranslated: lang !== 'he' && lang !== 'en',
      nativeReviewRequired: lang !== 'he' && lang !== 'en',
    };
  }
  if (isPracticalClarificationText(text)) {
    return {
      applicable: true,
      relevant: true,
      reason: 'practical_clarification_template',
      machineTranslated: lang !== 'he' && lang !== 'en',
      nativeReviewRequired: lang !== 'he' && lang !== 'en',
    };
  }
  return { applicable: true, relevant: false, reason: 'not_a_relevant_practical_clarification' };
}

function scoreUsefulness(item, reply) {
  const rubric = RUBRICS[item && item.id] || null;
  const text = String(reply || '').trim();
  if (!rubric) {
    return {
      applicable: false,
      score: 'n/a',
      pendingManualConfirmation: true,
      points: [],
      passed: 0,
      total: 0,
      note: 'No expected-content rubric for this item (not a staged practical item).',
    };
  }
  if (!text) {
    return {
      applicable: true,
      score: 'fail',
      pendingManualConfirmation: true,
      points: rubric.points.map((point) => ({ id: point.id, text: point.text, met: false })),
      passed: 0,
      total: rubric.points.length,
      description: rubric.description,
      note: 'Empty answer.',
    };
  }
  const points = rubric.points.map((point) => ({ id: point.id, text: point.text, met: Boolean(point.test(text)) }));
  const passed = points.filter((point) => point.met).length;
  const total = points.length;
  let score = 'fail';
  if (passed === total) score = 'pass';
  else if (passed > 0) score = 'partial';
  return {
    applicable: true,
    score,
    pendingManualConfirmation: true,
    points,
    passed,
    total,
    description: rubric.description,
    note: 'Automatic rubric only. An answer is not OK just because it is legal-free. Pending manual confirmation.',
  };
}

function evaluateMixedParts({
  item,
  finalReply,
  promptLegalLeak,
  split,
  legalTreatment,
  practicalReplySnippet,
  practicalTreatment,
  independentLegal,
  filterLeak,
}) {
  const legalClause = split && split.legal && split.legal.clause ? split.legal.clause : '';
  const practicalClause = split && split.practical && split.practical.clause ? split.practical.clause : '';
  const splitKind = split ? split.kind : 'unknown';
  const legalOkTreatment = ['approved_record', 'fallback', 'menu', 'clarification'].includes(legalTreatment);
  const legalPart = {
    clause: legalClause,
    treatment: legalTreatment || 'unknown',
    reachedModel: Boolean(promptLegalLeak),
    filterLeak: Boolean(filterLeak),
    independentLeak: Boolean(independentLegal && independentLegal.leak),
    ok: Boolean(legalOkTreatment && !promptLegalLeak),
    note: promptLegalLeak
      ? 'Legal clause reached the model user text — not the intended record/fallback/menu path.'
      : (legalOkTreatment ? 'Legal part treated as record/fallback/menu/clarification.' : 'Legal part treatment was not a record, fallback, menu, or clarification.'),
  };

  // Never fall back to full finalReply when practicalReplySnippet was rights-clarification-only or missing.
  const resolvedPracticalTreatment = practicalTreatment || (practicalReplySnippet ? 'answer_present' : 'missing');
  const practicalSnippet = String(practicalReplySnippet || '').trim();
  const hasUsablePractical = resolvedPracticalTreatment === 'answer_present' || resolvedPracticalTreatment === 'practical_clarification';
  const practicalUsefulness = (resolvedPracticalTreatment === 'answer_present' && practicalSnippet)
    ? scoreUsefulness({ id: item && item.id, lang: item && item.lang }, practicalSnippet)
    : { applicable: false, score: resolvedPracticalTreatment === 'practical_clarification' ? 'clarification_template' : 'fail', pendingManualConfirmation: true, points: [], passed: 0, total: 0 };

  let practicalNote = 'Practical part answered separately from legal part. Pending manual confirmation.';
  if (resolvedPracticalTreatment === 'rights_clarification_only') {
    practicalNote = 'Practical part was NOT answered: user received worker-rights clarification instead of a practical answer or practical clarification.';
  } else if (resolvedPracticalTreatment === 'missing') {
    practicalNote = 'Practical part missing from mixed answer.';
  } else if (resolvedPracticalTreatment === 'practical_clarification') {
    practicalNote = 'Practical part routed to structured practical clarification template.';
  }

  const practicalPart = {
    clause: practicalClause,
    treatment: resolvedPracticalTreatment,
    usefulnessPendingManual: true,
    usefulnessScore: practicalUsefulness.applicable ? practicalUsefulness.score : practicalUsefulness.score,
    ok: Boolean(hasUsablePractical && !promptLegalLeak),
    note: practicalNote,
  };
  return {
    splitKind,
    splitReason: split ? split.reason : '',
    legal: legalPart,
    practical: practicalPart,
  };
}

module.exports = {
  RUBRICS,
  scoreUsefulness,
  scoreClarificationRelevance,
  evaluateMixedParts,
};
