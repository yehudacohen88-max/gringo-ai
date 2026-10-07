const crypto = require('node:crypto');
const { translationSettingsService } = require('./translation-settings.service');

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value);
}

function isEnabled() {
  return Boolean(translationSettingsService.getSettings().cacheEnabled);
}

function ttlMs() {
  const settings = translationSettingsService.getSettings();
  const minutes = Number(settings.cacheTtlMinutes === undefined || settings.cacheTtlMinutes === null ? 60 : settings.cacheTtlMinutes);
  return Math.max(0, minutes) * 60 * 1000;
}

function createKey(text, sourceLanguage, targetLanguage) {
  const hash = crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        text: cleanText(text),
        sourceLanguage: cleanText(sourceLanguage).toLowerCase(),
        targetLanguage: cleanText(targetLanguage).toLowerCase(),
      })
    )
    .digest('hex');
  return hash;
}

class TranslationCacheService {
  constructor() {
    this.cache = new Map();
  }

  get(text, sourceLanguage, targetLanguage) {
    if (!isEnabled()) return null;
    const originalText = cleanText(text);
    if (!originalText) return null;

    const key = createKey(originalText, sourceLanguage, targetLanguage);
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() >= entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return { ...entry.value };
  }

  set(text, sourceLanguage, targetLanguage, value = {}) {
    if (!isEnabled()) return null;
    const originalText = cleanText(text);
    if (!originalText || !value.translated || value.fallbackUsed || value.errorCode) return null;
    const duration = ttlMs();
    if (duration <= 0) return null;

    const key = createKey(originalText, sourceLanguage, targetLanguage);
    const entry = {
      value: { ...value },
      expiresAt: Date.now() + duration,
    };
    this.cache.set(key, entry);
    return { ...entry.value };
  }

  invalidate(text, sourceLanguage, targetLanguage) {
    const key = createKey(text, sourceLanguage, targetLanguage);
    return this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }
}

const translationCacheService = new TranslationCacheService();

module.exports = {
  TranslationCacheService,
  translationCacheService,
};
