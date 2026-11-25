'use strict';

// Independent leak detector. Intentionally does NOT import legal-question-guard,
// leak-detector.js, or any other filter-under-test module. It scores a final
// user-facing answer with statutory / entitlement / obligation / amount /
// duration claim patterns, legal units, and legal verbs, per language.

const UNIT = "(?:hours?|days?|months?|weeks?|years?|NIS|ILS|₪|שח|ש\"ח|ש״ח|שעות|ימים|חודשים|שבועות|שנים|ชั่วโมง|ชม[.]|วัน|เดือน|ปี|บาท|घंटे|दिन|महीने|सप्ताह|वर्ष|रुपये|පැය|දින|මාස|සති|වසර|%|percents?|אחוז(?:ים)?|เปอร์เซ็นต์|प्रतिशत|ප්‍රතිශත)";

const NUMBER = String.raw`(?:\d+(?:[.,]\d+)?|[٠-٩]+|[๐-๙]+|[०-९]+|[\u0DE6-\u0DEF]+)`;

const SHARED_AMOUNT_DURATION = new RegExp(`${NUMBER}\\s*${UNIT}`, 'iu');

const LEGAL_AUTHORITY = {
  en: /(?:statute|statutory|labour law|labor law|by law|according to (?:the )?law|section\s+\d+|regulation|ordinance|extension order)/i,
  he: /(?:החוק|לפי החוק|על פי חוק|לפי סעיף|צו הרחבה|תקנה)/,
  th: /(?:ตามกฎหมาย|กฎหมายกำหนด|ตามมาตรา|พระราชบัญญัติ)/,
  hi: /(?:कानून|श्रम कानून|कानून के अनुसार|धारा)/,
  si: /(?:නීතිය|කම්කරු නීතිය|නීතියට අනුව|වගන්තිය)/,
};

const ENTITLEMENT = {
  en: /(?:entitled|qualify(?:ies)? for|you (?:are|have a) right|must be paid|has a right)/i,
  he: /(?:מגיע(?:ה)? לך|זכאי|זכאית|יש לך זכות)/,
  th: /(?:มีสิทธิ์|คุณมีสิทธิ์|ได้รับสิทธิ์)/,
  hi: /(?:हक|आपको मिलना|अधिकार है|हकदार)/,
  si: /(?:හිමි|ඔබට ලැබිය යුතු|අයිතිය)/,
};

const OBLIGATION = {
  en: /(?:obliged|obligates?|employer must|required to pay|is required|shall pay)/i,
  he: /(?:חייב|מחויב|חובה על המעסיק|אין רשות)/,
  th: /(?:นายจ้างต้อง|ต้องจ่าย|ห้ามหัก)/,
  hi: /(?:नियोक्ता को|चाहिए|करना होगा|नहीं काट सकता)/,
  si: /(?:සේවා යෝජකයාට|යුතුය|අවශ්‍යයි)/,
};

const LEGAL_VERBS = {
  en: /(?:confiscate|withhold|deduct (?:from )?(?:your )?wages?|minimum wage|severance|overtime(?: pay)?|paid holiday|travel documents|passport)/i,
  he: /(?:לנכות|ניכוי|שכר מינימום|שעות נוספות|פיצויי פיטורים|דמי הבראה|דמי מגורים|דרכון|מנוחה של)/,
  th: /(?:หักเงิน|ค่าจ้างขั้นต่ำ|ค่าล่วงเวลา|ค่าชดเชย|พาสปอร์ต|ยึดพาสปอร์ต)/,
  hi: /(?:काट सकता|न्यूनतम वेतन|ओवरटाइम|सेवर्ंस|पासपोर्ट|तनख्वाह)/,
  si: /(?:අඩු කර|අවම වැටුප|අතිකාල|පාස්පෝට්|ගමන් බලපත්)/,
};

function languageKey(language) {
  const code = String(language || '').toLowerCase();
  if (code.startsWith('he') || code.startsWith('iw')) return 'he';
  if (code.startsWith('th')) return 'th';
  if (code.startsWith('si')) return 'si';
  if (code.startsWith('hi')) return 'hi';
  return 'en';
}

function testPattern(pattern, text) {
  if (!pattern) return false;
  pattern.lastIndex = 0;
  return pattern.test(text);
}

function detectIndependentLegalLeak(reply = '', options = {}) {
  const text = String(reply || '').normalize('NFC').trim();
  const lang = languageKey(options.lang || options.language || 'en');
  if (!text) {
    return { leak: false, reasons: [], claims: [], detector: 'independent', language: lang };
  }

  const reasons = [];
  const claims = [];
  const authority = testPattern(LEGAL_AUTHORITY[lang], text) || testPattern(LEGAL_AUTHORITY.en, text);
  const entitlement = testPattern(ENTITLEMENT[lang], text) || testPattern(ENTITLEMENT.en, text);
  const obligation = testPattern(OBLIGATION[lang], text) || testPattern(OBLIGATION.en, text);
  const legalVerb = testPattern(LEGAL_VERBS[lang], text) || testPattern(LEGAL_VERBS.en, text);
  const amountDuration = testPattern(SHARED_AMOUNT_DURATION, text);

  if (authority) {
    reasons.push(`independent_statutory_authority:${lang}`);
    claims.push('statutory_or_legal_authority');
  }
  if (entitlement) {
    reasons.push(`independent_entitlement:${lang}`);
    claims.push('entitlement');
  }
  if (obligation) {
    reasons.push(`independent_obligation:${lang}`);
    claims.push('obligation');
  }
  if (legalVerb) {
    reasons.push(`independent_legal_verb:${lang}`);
    claims.push('legal_verb');
  }
  if (amountDuration && (authority || entitlement || obligation || legalVerb)) {
    reasons.push('independent_amount_or_duration_with_legal_claim');
    claims.push('amount_or_duration');
  } else if (amountDuration && /(law|statute|חוק|กฎหมาย|कानून|නීතිය|wage|שכר|ค่าจ้าง|वेतन|වැටුප|overtime|שעות נוספות|ล่วงเวลา|ओवरटाइम|අතිකාල)/i.test(text)) {
    reasons.push('independent_amount_or_duration_near_legal_wording');
    claims.push('amount_or_duration');
  }

  return {
    leak: reasons.length > 0,
    reasons: [...new Set(reasons)],
    claims: [...new Set(claims)],
    detector: 'independent',
    language: lang,
  };
}

module.exports = {
  detectIndependentLegalLeak,
  languageKey,
};
