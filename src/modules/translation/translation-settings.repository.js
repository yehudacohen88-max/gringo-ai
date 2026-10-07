const fs = require('node:fs');
const path = require('node:path');

function getSettingsFilePath() {
  return process.env.TRANSLATION_SETTINGS_FILE || path.join(process.cwd(), '.tools', 'translation-settings.json');
}

class TranslationSettingsRepository {
  readSettings() {
    const filePath = getSettingsFilePath();
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  }

  saveSettings(settings) {
    const filePath = getSettingsFilePath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(settings, null, 2));
    return { ...settings };
  }
}

const translationSettingsRepository = new TranslationSettingsRepository();

module.exports = {
  TranslationSettingsRepository,
  translationSettingsRepository,
};
