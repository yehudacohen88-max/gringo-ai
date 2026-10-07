const { languageDetectionService } = require('../language');
const {
  SUPPORTED_LANGUAGES,
  TRANSLATION_PROVIDER_DISABLED,
  TRANSLATION_PROVIDERS,
} = require('./translation.constants');
const { translationSettingsRepository } = require('./translation-settings.repository');

const CORE_AGENT_WORKING_LANGUAGE = 'en';
const DEFAULT_CACHE_TTL_MINUTES = 60;

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function createValidationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function booleanFrom(value, fallback) {
  if (value === true || value === 'true' || value === 'Yes' || value === 'Enabled') return true;
  if (value === false || value === 'false' || value === 'No' || value === 'Disabled') return false;
  return fallback;
}

function normalizeProvider(value) {
  const provider = cleanText(value).toLowerCase() || TRANSLATION_PROVIDER_DISABLED;
  if (!TRANSLATION_PROVIDERS.includes(provider)) {
    throw createValidationError('Invalid translation provider.');
  }
  return provider;
}

function normalizeCacheTtl(value, fallback = DEFAULT_CACHE_TTL_MINUTES) {
  if (value === undefined || value === null || value === '') return fallback;
  const ttl = Number(value);
  if (!Number.isInteger(ttl) || ttl < 1 || ttl > 10080) {
    throw createValidationError('Invalid translation cache TTL.');
  }
  return ttl;
}

function normalizeEnvironmentCacheTtl(value, fallback = DEFAULT_CACHE_TTL_MINUTES) {
  if (value === undefined || value === null || value === '') return fallback;
  const ttl = Number(value);
  return Number.isInteger(ttl) && ttl >= 0 ? ttl : fallback;
}

function normalizeEnabledLanguages(value, fallback = Object.keys(SUPPORTED_LANGUAGES)) {
  if (value === undefined || value === null) return [...fallback];
  const rawLanguages = Array.isArray(value) ? value : String(value).split(',');
  const languages = [];
  for (const rawLanguage of rawLanguages) {
    const language = languageDetectionService.normalizeLanguageCode(rawLanguage);
    if (!language || !SUPPORTED_LANGUAGES[language]) {
      throw createValidationError('Unknown translation language.');
    }
    if (!languages.includes(language)) languages.push(language);
  }
  if (!languages.length) throw createValidationError('At least one translation language must remain enabled.');
  if (!languages.includes(CORE_AGENT_WORKING_LANGUAGE)) {
    throw createValidationError('English must remain enabled.');
  }
  return languages;
}

function defaultsFromEnvironment() {
  const configuredProvider = cleanText(process.env.TRANSLATION_PROVIDER).toLowerCase();
  return {
    translationEnabled: Boolean(configuredProvider),
    provider: TRANSLATION_PROVIDERS.includes(configuredProvider) ? configuredProvider : TRANSLATION_PROVIDER_DISABLED,
    cacheEnabled: String(process.env.TRANSLATION_CACHE_ENABLED || 'true').toLowerCase() !== 'false',
    cacheTtlMinutes: normalizeEnvironmentCacheTtl(process.env.TRANSLATION_CACHE_TTL_MINUTES, DEFAULT_CACHE_TTL_MINUTES),
    enabledLanguages: Object.keys(SUPPORTED_LANGUAGES),
    updatedAt: '',
  };
}

function sanitizeSettings(settings = {}, fallback = defaultsFromEnvironment()) {
  return {
    translationEnabled: booleanFrom(settings.translationEnabled, fallback.translationEnabled),
    provider: normalizeProvider(settings.provider || fallback.provider),
    cacheEnabled: booleanFrom(settings.cacheEnabled, fallback.cacheEnabled),
    cacheTtlMinutes: normalizeCacheTtl(settings.cacheTtlMinutes, fallback.cacheTtlMinutes),
    enabledLanguages: normalizeEnabledLanguages(settings.enabledLanguages, fallback.enabledLanguages),
    updatedAt: cleanText(settings.updatedAt || fallback.updatedAt),
  };
}

class TranslationSettingsService {
  constructor(repository = translationSettingsRepository) {
    this.repository = repository;
    this.memorySettings = null;
  }

  setRepository(repository) {
    this.repository = repository;
    this.memorySettings = null;
  }

  getSettings() {
    try {
      const stored = this.repository?.readSettings?.();
      this.memorySettings = stored ? sanitizeSettings(stored) : defaultsFromEnvironment();
      return { ...this.memorySettings, enabledLanguages: [...this.memorySettings.enabledLanguages] };
    } catch (error) {
      const fallback = this.memorySettings || defaultsFromEnvironment();
      return { ...fallback, enabledLanguages: [...fallback.enabledLanguages] };
    }
  }

  updateSettings(input = {}) {
    const current = this.getSettings();
    const next = sanitizeSettings(
      {
        ...current,
        ...(Object.prototype.hasOwnProperty.call(input, 'translationEnabled')
          ? { translationEnabled: input.translationEnabled }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(input, 'provider') ? { provider: input.provider } : {}),
        ...(Object.prototype.hasOwnProperty.call(input, 'cacheEnabled') ? { cacheEnabled: input.cacheEnabled } : {}),
        ...(Object.prototype.hasOwnProperty.call(input, 'cacheTtlMinutes')
          ? { cacheTtlMinutes: input.cacheTtlMinutes }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(input, 'enabledLanguages')
          ? { enabledLanguages: input.enabledLanguages }
          : {}),
        updatedAt: new Date().toISOString(),
      },
      current
    );
    const saved = this.repository.saveSettings(next);
    this.memorySettings = sanitizeSettings(saved || next, current);
    return { ...this.memorySettings, enabledLanguages: [...this.memorySettings.enabledLanguages] };
  }

  isLanguageEnabled(language) {
    const normalized = languageDetectionService.normalizeLanguageCode(language);
    return Boolean(normalized && this.getSettings().enabledLanguages.includes(normalized));
  }
}

const translationSettingsService = new TranslationSettingsService();

module.exports = {
  CORE_AGENT_WORKING_LANGUAGE,
  TranslationSettingsService,
  translationSettingsService,
};
