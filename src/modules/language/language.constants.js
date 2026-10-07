const DEFAULT_LANGUAGE = 'en';

const SUPPORTED_LANGUAGES = Object.freeze({
  en: 'English',
  he: 'Hebrew',
  ar: 'Arabic',
  th: 'Thai',
  si: 'Sinhala',
  hi: 'Hindi',
  ru: 'Russian',
  tl: 'Filipino/Tagalog',
});

const LANGUAGE_ALIASES = Object.freeze({
  english: 'en',
  eng: 'en',
  hebrew: 'he',
  iw: 'he',
  arabic: 'ar',
  thai: 'th',
  sinhala: 'si',
  sinhalese: 'si',
  hindi: 'hi',
  russian: 'ru',
  tagalog: 'tl',
  filipino: 'tl',
  fil: 'tl',
});

module.exports = {
  DEFAULT_LANGUAGE,
  LANGUAGE_ALIASES,
  SUPPORTED_LANGUAGES,
};
