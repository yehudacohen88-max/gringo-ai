const { languageDetectionService } = require('../language');
const {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  TRANSLATION_ERROR_CODES,
  TRANSLATION_FAILURE_TYPES,
  TRANSLATION_PROVIDER_DISABLED,
  TRANSLATION_PROVIDER_OPENAI,
} = require('./translation.constants');
const { createDisabledTranslationProvider } = require('./translation.provider');
const { createOpenAiTranslationProvider } = require('./providers/openai-translation.provider');
const { translationCacheService } = require('./translation-cache.service');
const translationMetricsService = require('./translation-metrics.service');
const { translationSettingsService } = require('./translation-settings.service');

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value);
}

function providerName(provider) {
  if (!provider || typeof provider.getProviderName !== 'function') return TRANSLATION_PROVIDER_DISABLED;
  return cleanText(provider.getProviderName()).trim() || TRANSLATION_PROVIDER_DISABLED;
}

function createResult({
  translatedText,
  sourceLanguage,
  targetLanguage,
  provider,
  translated,
  fallbackUsed,
  errorCode = '',
  failureType = '',
}) {
  return {
    translatedText: cleanText(translatedText),
    sourceLanguage,
    targetLanguage,
    provider,
    translated: Boolean(translated),
    fallbackUsed: Boolean(fallbackUsed),
    ...(errorCode ? { errorCode } : {}),
    ...(failureType ? { failureType } : {}),
  };
}

function classifyTranslationFailure(error, fallbackType = TRANSLATION_FAILURE_TYPES.UNKNOWN) {
  const explicitType = cleanText(error?.failureType).trim();
  if (Object.values(TRANSLATION_FAILURE_TYPES).includes(explicitType)) return explicitType;

  const status = Number(error?.status || error?.statusCode || error?.code || 0);
  if (status === 429) return TRANSLATION_FAILURE_TYPES.RATE_LIMIT;
  if (status === 408 || error?.name === 'AbortError') return TRANSLATION_FAILURE_TYPES.TIMEOUT;

  const message = cleanText(error?.message).toLowerCase();
  if (message.includes('timeout') || message.includes('timed out')) return TRANSLATION_FAILURE_TYPES.TIMEOUT;
  if (message.includes('rate limit') || message.includes('too many request')) return TRANSLATION_FAILURE_TYPES.RATE_LIMIT;
  if (message.includes('not configured') || message.includes('unavailable')) {
    return TRANSLATION_FAILURE_TYPES.UNAVAILABLE_PROVIDER;
  }

  return fallbackType;
}

function isTransientFailure(failureType) {
  return [
    TRANSLATION_FAILURE_TYPES.TIMEOUT,
    TRANSLATION_FAILURE_TYPES.RATE_LIMIT,
  ].includes(failureType);
}

function errorCodeForFailure(failureType) {
  if (failureType === TRANSLATION_FAILURE_TYPES.TIMEOUT) return TRANSLATION_ERROR_CODES.PROVIDER_TIMEOUT;
  if (failureType === TRANSLATION_FAILURE_TYPES.RATE_LIMIT) return TRANSLATION_ERROR_CODES.PROVIDER_RATE_LIMIT;
  if (failureType === TRANSLATION_FAILURE_TYPES.UNAVAILABLE_PROVIDER) {
    return TRANSLATION_ERROR_CODES.PROVIDER_UNAVAILABLE;
  }
  return TRANSLATION_ERROR_CODES.PROVIDER_ERROR;
}

function logTechnicalTranslationFailure(provider, failureType, attempt) {
  if (process.env.TRANSLATION_LOG_FAILURES !== 'true') return;
  console.warn('[translation] provider failure', {
    provider: cleanText(provider) || TRANSLATION_PROVIDER_DISABLED,
    failureType,
    attempt,
  });
}

function getConfiguredProviderName() {
  const settings = translationSettingsService.getSettings();
  if (!settings.translationEnabled) return TRANSLATION_PROVIDER_DISABLED;
  return cleanText(settings.provider).trim().toLowerCase();
}

function createTranslationProviderFromEnvironment() {
  const configuredProvider = getConfiguredProviderName();
  if (!configuredProvider || configuredProvider === TRANSLATION_PROVIDER_DISABLED) return createDisabledTranslationProvider();
  if (configuredProvider === TRANSLATION_PROVIDER_OPENAI) return createOpenAiTranslationProvider();
  return createDisabledTranslationProvider();
}

class TranslationService {
  constructor(provider) {
    this.useSettings = provider === undefined;
    this.provider = provider || createTranslationProviderFromEnvironment();
  }

  setProvider(provider = createDisabledTranslationProvider(), options = {}) {
    if (Object.prototype.hasOwnProperty.call(options, 'useSettings')) {
      this.useSettings = Boolean(options.useSettings);
    }
    this.provider = provider;
  }

  getProvider() {
    return this.provider;
  }

  isAvailable() {
    try {
      return Boolean(this.provider?.isAvailable?.());
    } catch (error) {
      return false;
    }
  }

  getProviderName() {
    return providerName(this.provider);
  }

  reloadProvider() {
    this.useSettings = true;
    this.provider = createTranslationProviderFromEnvironment();
    return this.provider;
  }

  fallback(text, sourceLanguage, targetLanguage, errorCode = '', failureType = '') {
    return createResult({
      translatedText: text,
      sourceLanguage,
      targetLanguage,
      provider: this.getProviderName(),
      translated: false,
      fallbackUsed: Boolean(errorCode),
      errorCode,
      failureType,
    });
  }

  async callProviderWithRecovery(originalText, sourceLanguage, targetLanguage) {
    const maxAttempts = 2;
    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const providerStartedAt = Date.now();
      try {
        const response = await this.provider.translateText(originalText, sourceLanguage, targetLanguage);
        translationMetricsService.recordProviderLatency(Date.now() - providerStartedAt);
        return response;
      } catch (error) {
        translationMetricsService.recordProviderLatency(Date.now() - providerStartedAt);
        lastError = error;
        const failureType = classifyTranslationFailure(error);
        logTechnicalTranslationFailure(this.getProviderName(), failureType, attempt);
        if (attempt < maxAttempts && isTransientFailure(failureType)) continue;
        throw error;
      }
    }

    throw lastError;
  }

  async translateText(text, sourceLanguage, targetLanguage) {
    const originalText = cleanText(text);
    const normalizedSource = languageDetectionService.normalizeLanguageCode(sourceLanguage);
    const normalizedTarget = languageDetectionService.normalizeLanguageCode(targetLanguage);
    const settings = this.useSettings
      ? translationSettingsService.getSettings()
      : {
          translationEnabled: true,
          enabledLanguages: Object.keys(SUPPORTED_LANGUAGES),
        };

    if (!normalizedSource) {
      return this.fallback(
        originalText,
        '',
        normalizedTarget || DEFAULT_LANGUAGE,
        TRANSLATION_ERROR_CODES.UNSUPPORTED_SOURCE_LANGUAGE,
        TRANSLATION_FAILURE_TYPES.INVALID_LANGUAGE
      );
    }

    if (!normalizedTarget) {
      return this.fallback(
        originalText,
        normalizedSource,
        '',
        TRANSLATION_ERROR_CODES.UNSUPPORTED_TARGET_LANGUAGE,
        TRANSLATION_FAILURE_TYPES.INVALID_LANGUAGE
      );
    }

    if (!settings.enabledLanguages.includes(normalizedSource)) {
      return this.fallback(
        originalText,
        normalizedSource,
        normalizedTarget,
        TRANSLATION_ERROR_CODES.UNSUPPORTED_SOURCE_LANGUAGE,
        TRANSLATION_FAILURE_TYPES.INVALID_LANGUAGE
      );
    }

    if (!settings.enabledLanguages.includes(normalizedTarget)) {
      return this.fallback(
        originalText,
        normalizedSource,
        normalizedTarget,
        TRANSLATION_ERROR_CODES.UNSUPPORTED_TARGET_LANGUAGE,
        TRANSLATION_FAILURE_TYPES.INVALID_LANGUAGE
      );
    }

    if (!originalText || normalizedSource === normalizedTarget) {
      return createResult({
        translatedText: originalText,
        sourceLanguage: normalizedSource,
        targetLanguage: normalizedTarget,
        provider: this.getProviderName(),
        translated: false,
        fallbackUsed: false,
      });
    }

    if (!settings.translationEnabled) {
      translationMetricsService.recordTranslationRequest();
      translationMetricsService.recordTranslationFailure();
      return this.fallback(
        originalText,
        normalizedSource,
        normalizedTarget,
        TRANSLATION_ERROR_CODES.PROVIDER_UNAVAILABLE,
        TRANSLATION_FAILURE_TYPES.UNAVAILABLE_PROVIDER
      );
    }

    if (!this.isAvailable()) {
      translationMetricsService.recordTranslationRequest();
      translationMetricsService.recordTranslationFailure();
      return this.fallback(
        originalText,
        normalizedSource,
        normalizedTarget,
        TRANSLATION_ERROR_CODES.PROVIDER_UNAVAILABLE,
        TRANSLATION_FAILURE_TYPES.UNAVAILABLE_PROVIDER
      );
    }

    const startedAt = Date.now();
    translationMetricsService.recordTranslationRequest();
    const cachedResult = translationCacheService.get(originalText, normalizedSource, normalizedTarget);
    if (cachedResult) {
      translationMetricsService.recordCacheHit();
      translationMetricsService.recordTranslationSuccess();
      translationMetricsService.recordLatency(Date.now() - startedAt);
      return cachedResult;
    }
    translationMetricsService.recordCacheMiss();

    try {
      const response = await this.callProviderWithRecovery(originalText, normalizedSource, normalizedTarget);
      const translatedText = typeof response === 'string' ? response : response?.translatedText;
      const result = createResult({
        translatedText: translatedText || originalText,
        sourceLanguage: normalizedSource,
        targetLanguage: normalizedTarget,
        provider: this.getProviderName(),
        translated: Boolean(translatedText),
        fallbackUsed: !translatedText,
      });
      if (result.translated && !result.fallbackUsed) {
        translationMetricsService.recordTranslationSuccess();
      } else {
        translationMetricsService.recordTranslationFailure();
      }
      translationMetricsService.recordLatency(Date.now() - startedAt);
      translationCacheService.set(originalText, normalizedSource, normalizedTarget, result);
      return result;
    } catch (error) {
      const failureType = classifyTranslationFailure(error);
      translationMetricsService.recordTranslationFailure();
      translationMetricsService.recordLatency(Date.now() - startedAt);
      return this.fallback(
        originalText,
        normalizedSource,
        normalizedTarget,
        errorCodeForFailure(failureType),
        failureType
      );
    }
  }

  async detectAndTranslate(text, targetLanguage) {
    const originalText = cleanText(text);
    const normalizedTarget = languageDetectionService.normalizeLanguageCode(targetLanguage);

    if (!normalizedTarget) {
      return this.fallback(
        originalText,
        DEFAULT_LANGUAGE,
        '',
        TRANSLATION_ERROR_CODES.UNSUPPORTED_TARGET_LANGUAGE,
        TRANSLATION_FAILURE_TYPES.INVALID_LANGUAGE
      );
    }

    const detection = languageDetectionService.detectLanguage(originalText);
    return this.translateText(originalText, detection.language, normalizedTarget);
  }
}

const translationService = new TranslationService();

module.exports = {
  TranslationService,
  classifyTranslationFailure,
  createTranslationProviderFromEnvironment,
  errorCodeForFailure,
  translationService,
};
