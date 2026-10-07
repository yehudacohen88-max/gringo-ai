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

function resolveLanguage(input = {}) {
  const explicit = resolveCandidate(input.explicitLanguage || input.requestedLanguage, 'explicit');
  if (explicit) return explicit;

  const profile = input.profile || {};
  const profileLanguage = resolveCandidate(
    input.profileLanguage || profile.preferredLanguage || profile.detectedLanguage || profile.language,
    'profile'
  );
  if (profileLanguage) return profileLanguage;

  const channelLanguage = resolveCandidate(
    input.channelLanguage || input.channelLanguageCode || input.languageCode || input.platformLanguage,
    'channel'
  );
  if (channelLanguage) return channelLanguage;

  return detectTextLanguage(input.text || input.message);
}

module.exports = {
  detectLanguage,
  isSupportedLanguage,
  normalizeLanguageCode,
  resolveLanguage,
};
