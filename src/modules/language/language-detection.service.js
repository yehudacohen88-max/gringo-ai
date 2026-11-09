const { DEFAULT_LANGUAGE, LANGUAGE_ALIASES, SUPPORTED_LANGUAGES } = require('./language.constants');

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function normalizeLanguageCode(value) {
  const raw = cleanText(value);
  if (!raw) return '';

  const normalized = raw.toLowerCase().replace(/_/g, '-');
  const primary = normalized.split('-')[0];
  const aliased = LANGUAGE_ALIASES[normalized] || LANGUAGE_ALIASES[primary] || primary;

  return SUPPORTED_LANGUAGES[aliased] ? aliased : '';
}

function isSupportedLanguage(value) {
  return Boolean(normalizeLanguageCode(value));
}

function result(language, source, confidence) {
  const normalized = normalizeLanguageCode(language) || DEFAULT_LANGUAGE;
  return {
    language: normalized,
    source,
    confidence,
    supported: true,
  };
}

function detectTextLanguage(text) {
  const value = cleanText(text);
  if (!value) return result(DEFAULT_LANGUAGE, 'default', 'low');

  if (/[\u0590-\u05ff]/.test(value)) return result('he', 'text', 'medium');
  if (/[\u0600-\u06ff]/.test(value)) return result('ar', 'text', 'medium');
  if (/[\u0e00-\u0e7f]/.test(value)) return result('th', 'text', 'medium');
  if (/[\u0d80-\u0dff]/.test(value)) return result('si', 'text', 'medium');
  if (/[\u0900-\u097f]/.test(value)) return result('hi', 'text', 'medium');
  if (/[\u0400-\u04ff]/.test(value)) return result('ru', 'text', 'medium');
  if (/[a-z]/i.test(value)) return result('en', 'text', 'medium');

  return result(DEFAULT_LANGUAGE, 'default', 'low');
}

// Letters per script. A language is "clear" when its letters are most of the
// message letters, so one English word inside a Hebrew sentence stays Hebrew.
// Emoji and digits have no letters and are not a language.
const SCRIPT_PATTERNS = Object.freeze([
  ['he', /[\u0590-\u05ff]/g],
  ['ar', /[\u0600-\u06ff]/g],
  ['th', /[\u0e00-\u0e7f]/g],
  ['si', /[\u0d80-\u0dff]/g],
  ['hi', /[\u0900-\u097f]/g],
  ['ru', /[\u0400-\u04ff]/g],
  ['en', /[A-Za-z]/g],
]);

function detectMessageLanguage(text) {
  const value = cleanText(text);
  // Slash commands and callback payloads are not a written language.
  if (/^\//.test(value) || /^\[callback:/i.test(value)) return { language: '', clear: false };
  let best = { language: '', count: 0 };
  let total = 0;
  for (const [language, pattern] of SCRIPT_PATTERNS) {
    const count = (value.match(pattern) || []).length;
    total += count;
    if (count > best.count) best = { language, count };
  }
  if (!total || !best.language) return { language: '', clear: false };
  const clear = best.count > total / 2;
  return { language: clear ? best.language : '', clear };
}

function detectLanguage(text, options = {}) {
  if (options.explicitLanguage || options.profileLanguage || options.channelLanguage) {
    return resolveLanguage({ ...options, text });
  }

  return detectTextLanguage(text);
}

function resolveCandidate(value, source) {
  const language = normalizeLanguageCode(value);
  return language ? result(language, source, 'high') : null;
}

function channelCandidate(input = {}) {
  return resolveCandidate(
    input.channelLanguage || input.channelLanguageCode || input.languageCode || input.platformLanguage,
    'channel'
  );
}

function withMessage(resolution, messageLanguage) {
  return {
    ...resolution,
    messageLanguage: messageLanguage || '',
    conflict: false,
  };
}

// Language of the incoming text, used to translate it for processing.
// A clear script wins over the Telegram app language: a Hebrew message is
// Hebrew even when the phone UI is English or Thai.
function resolveIncomingLanguage(input = {}) {
  const explicit = resolveCandidate(input.explicitLanguage || input.requestedLanguage, 'explicit');
  if (explicit) return withMessage(explicit, '');

  const message = detectMessageLanguage(input.text || input.message);
  if (message.clear) return withMessage(result(message.language, 'text', 'high'), message.language);

  const channel = channelCandidate(input);
  if (channel) return withMessage(channel, '');

  return withMessage(detectTextLanguage(input.text || input.message), '');
}

// Reply language. An explicit saved choice (preferredLanguage) outranks a
// clear message. Auto-detected language and the legacy language column do not.
// With no explicit choice, a clear message script wins, then the channel
// language, then English. Emoji and digits do not invent a preference.
// conflict is true when the saved choice and a clear message language differ,
// so the caller can answer in the saved language and say how to switch.
function resolveReplyLanguage(input = {}) {
  const message = detectMessageLanguage(input.text || input.message);
  const messageLanguage = message.clear ? normalizeLanguageCode(message.language) : '';
  const explicitTurn = resolveCandidate(input.explicitLanguage || input.requestedLanguage, 'explicit');
  if (explicitTurn) return withMessage(explicitTurn, messageLanguage);

  const profile = input.profile || {};
  const preferred = resolveCandidate(
    input.preferredLanguage || profile.preferredLanguage || input.profileLanguage,
    'profile'
  );
  if (preferred) {
    return {
      ...preferred,
      messageLanguage,
      conflict: Boolean(messageLanguage && messageLanguage !== preferred.language),
    };
  }

  if (messageLanguage) return withMessage(result(messageLanguage, 'text', 'high'), messageLanguage);

  const channel = channelCandidate(input);
  if (channel) return withMessage(channel, '');

  return withMessage(detectTextLanguage(input.text || input.message), '');
}

function resolveLanguage(input = {}) {
  return resolveReplyLanguage(input);
}

module.exports = {
  detectLanguage,
  detectMessageLanguage,
  isSupportedLanguage,
  normalizeLanguageCode,
  resolveIncomingLanguage,
  resolveLanguage,
  resolveReplyLanguage,
};
