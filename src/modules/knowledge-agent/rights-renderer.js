// Renders one approved rights record by id, and builds the code-controlled
// topic menu. There is no model call on this path. Unknown ids, unapproved
// records, and language mismatches stay on the existing fallback.

const { loadApprovedDraftRecords } = require('./knowledge-base.service');
const { disclaimerLanguage, legalDisclaimerText, withLegalDisclaimer } = require('./legal-disclaimer');
const { verbatimReviewedAnswers } = require('./legal-question-guard');
const { handbookPdfUrl } = require('./handbook-links');
const { STRINGS } = require('../core-agent/onboarding.i18n');
const {
  MIXED_SPLIT_LABELS,
  RIGHTS_MENU_TOPIC_ORDER,
  RIGHTS_TOPIC_LABELS,
} = require('./rights-menu.labels');
const {
  CLARIFICATION,
  SOURCE_LINE,
  createRightsUnverifiedFallback,
  rightsFallbackLanguage,
} = require('./rights-unverified-fallback');

// Existing onboarding label. Hindi and Sinhala have no separate onboarding
// copy, so they reuse this same word. It is not a new translation.
const ENGLISH_MENU_LABEL = STRINGS.th.values.en;

function clean(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function approvedRecords() {
  return loadApprovedDraftRecords();
}

function recordMenuLanguage(record = {}) {
  const language = disclaimerLanguage(record.language);
  return language === 'he' || language === 'en' ? language : '';
}

function approvedRightsTopics() {
  const topics = { he: [], en: [] };
  const seen = { he: new Set(), en: new Set() };
  for (const record of approvedRecords()) {
    const topic = clean(record.topic);
    const language = recordMenuLanguage(record);
    if (!topic || !language || seen[language].has(topic)) continue;
    seen[language].add(topic);
    topics[language].push(topic);
  }
  return {
    he: RIGHTS_MENU_TOPIC_ORDER.filter((topic) => seen.he.has(topic)),
    en: RIGHTS_MENU_TOPIC_ORDER.filter((topic) => seen.en.has(topic)),
  };
}

function findApprovedRecord(recordId) {
  const id = clean(recordId);
  if (!id) return null;
  return approvedRecords().find((record) => clean(record.id) === id) || null;
}

function findApprovedRecordByTopic(topic, language) {
  const wanted = disclaimerLanguage(language);
  const name = clean(topic);
  if (!name || (wanted !== 'he' && wanted !== 'en')) return null;
  return approvedRecords().find((record) => (
    clean(record.topic) === name && recordMenuLanguage(record) === wanted
  )) || null;
}

function renderApprovedRecord(recordId, language) {
  const lang = rightsFallbackLanguage(language);
  const record = findApprovedRecord(recordId);
  if (!record || recordMenuLanguage(record) !== disclaimerLanguage(lang)) {
    return createRightsUnverifiedFallback(lang);
  }
  const lines = verbatimReviewedAnswers([record], [record.topic], {
    directRecordId: record.id,
    language: lang,
    question: '',
  });
  if (!lines.length) return createRightsUnverifiedFallback(lang);
  const rendered = withLegalDisclaimer(lines.join('\n\n'), lang);
  if (!rendered || rendered === legalDisclaimerText(lang)) return createRightsUnverifiedFallback(lang);
  return rendered;
}

// The handbook name is the title already inside SOURCE_LINE. Thai has no
// comma in that line, so the name is the text after the colon. No new
// translation is introduced. th/hi/si stay pending native-speaker review.
function handbookButtonLabel(language) {
  const lang = rightsFallbackLanguage(language);
  const line = SOURCE_LINE[lang];
  const comma = line.lastIndexOf(',');
  const raw = comma === -1 ? line.slice(line.indexOf(':') + 1) : line.slice(comma + 1);
  return raw.trim().replace(/[.]+$/u, '').trim();
}

function menuRows(language, explicitEnglish) {
  const lang = explicitEnglish ? 'en' : rightsFallbackLanguage(language);
  if (lang !== 'he' && lang !== 'en') {
    return [
      [{ text: handbookButtonLabel(lang), url: handbookPdfUrl(lang) }],
      [{ text: ENGLISH_MENU_LABEL, data: 'lang:rights:en' }],
    ];
  }
  const topics = approvedRightsTopics()[lang].filter((topic) => RIGHTS_TOPIC_LABELS[lang][topic]);
  const prefix = explicitEnglish ? 'en:' : '';
  const rows = topics.map((topic) => [{
    text: RIGHTS_TOPIC_LABELS[lang][topic],
    data: `show:rights:${prefix}${topic}`,
  }]);
  rows.push([{
    text: RIGHTS_TOPIC_LABELS[lang].other,
    data: `show:rights:${prefix}other`,
  }]);
  return rows;
}

function createRightsReplyMarkup(language, options = {}) {
  const { inlineKeyboard } = require('../telegram/telegram-message.service');
  return inlineKeyboard(menuRows(language, options.explicitEnglish === true));
}

function rightsShowTarget(recordId = '') {
  const value = String(recordId || '');
  if (!value || value.includes('/')) return null;
  if (value === 'other') return { topic: 'other', explicitEnglish: false };
  if (value.startsWith('en:')) {
    const topic = value.slice(3);
    if (!topic || topic.includes(':')) return null;
    return { topic, explicitEnglish: true };
  }
  if (value.includes(':')) return null;
  return { topic: value, explicitEnglish: false };
}

function rightsCallbackAllowed(parsed = {}) {
  if (!parsed || parsed.moduleName !== 'rights') return false;
  if (parsed.action === 'choose') return parsed.recordId === 'practical' || parsed.recordId === 'menu';
  if (parsed.action === 'lang') return parsed.recordId === 'handbook' || parsed.recordId === 'en';
  if (parsed.action !== 'show') return false;
  const target = rightsShowTarget(parsed.recordId);
  if (!target) return false;
  if (target.topic === 'other') return true;
  const topics = approvedRightsTopics();
  if (target.explicitEnglish) return topics.en.includes(target.topic);
  return topics.he.includes(target.topic) || topics.en.includes(target.topic);
}

function replyForRightsCallback(parsed = {}, userLanguage) {
  if (!rightsCallbackAllowed(parsed)) return null;
  const userLang = rightsFallbackLanguage(userLanguage);
  // A mixed-split choice never sends the original message to a model.
  // Worker rights opens the existing menu. Practical asks for a new message.
  if (parsed.action === 'choose' && parsed.recordId === 'menu') {
    return {
      reply: createRightsUnverifiedFallback(userLang),
      replyMarkup: createRightsReplyMarkup(userLang),
    };
  }
  if (parsed.action === 'choose' && parsed.recordId === 'practical') {
    if (userLang === 'he' || userLang === 'en') {
      return { reply: MIXED_SPLIT_LABELS[userLang].resend, replyMarkup: { inline_keyboard: [] } };
    }
    return { reply: CLARIFICATION[userLang], replyMarkup: { inline_keyboard: [] } };
  }
  if (parsed.action === 'lang' && parsed.recordId === 'en') {
    return {
      reply: createRightsUnverifiedFallback(userLang),
      replyMarkup: createRightsReplyMarkup('en', { explicitEnglish: true }),
    };
  }
  if (parsed.action === 'lang' && parsed.recordId === 'handbook') {
    return {
      reply: createRightsUnverifiedFallback(userLang),
      replyMarkup: createRightsReplyMarkup(userLang),
    };
  }
  const target = rightsShowTarget(parsed.recordId);
  if (!target.explicitEnglish && userLang !== 'he' && userLang !== 'en') {
    return {
      reply: createRightsUnverifiedFallback(userLang),
      replyMarkup: createRightsReplyMarkup(userLang),
    };
  }
  const menuLang = target.explicitEnglish ? 'en' : userLang;
  const explicitEnglish = target.explicitEnglish === true;
  if (target.topic === 'other') {
    return {
      reply: createRightsUnverifiedFallback(menuLang),
      replyMarkup: createRightsReplyMarkup(menuLang, { explicitEnglish }),
    };
  }
  const record = findApprovedRecordByTopic(target.topic, menuLang);
  return {
    reply: record ? renderApprovedRecord(record.id, menuLang) : createRightsUnverifiedFallback(menuLang),
    replyMarkup: createRightsReplyMarkup(menuLang, { explicitEnglish }),
  };
}

module.exports = {
  ENGLISH_MENU_LABEL,
  approvedRightsTopics,
  createRightsReplyMarkup,
  findApprovedRecord,
  findApprovedRecordByTopic,
  handbookButtonLabel,
  renderApprovedRecord,
  replyForRightsCallback,
  rightsCallbackAllowed,
  rightsShowTarget,
};
