const { TRANSLATION_PROVIDER_DISABLED } = require('./translation.constants');

class DisabledTranslationProvider {
  async translateText(text) {
    return text;
  }

  async detectAndTranslate(text) {
    return text;
  }

  isAvailable() {
    return false;
  }

  getProviderName() {
    return TRANSLATION_PROVIDER_DISABLED;
  }
}

function createDisabledTranslationProvider() {
  return new DisabledTranslationProvider();
}

module.exports = {
  DisabledTranslationProvider,
  createDisabledTranslationProvider,
};
