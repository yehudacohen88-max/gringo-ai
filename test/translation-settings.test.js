const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  TranslationSettingsRepository,
  TranslationSettingsService,
  TranslationService,
  createDisabledTranslationProvider,
} = require('../src/modules/translation');

function memoryRepository(initial = null, options = {}) {
  let settings = initial;
  return {
    readSettings: () => settings,
    saveSettings: (next) => {
      if (options.failSave) throw new Error('save failed');
      settings = { ...next, enabledLanguages: [...next.enabledLanguages] };
      return settings;
    },
    peek: () => settings,
  };
}

test('translation can be enabled and disabled', () => {
  const repo = memoryRepository();
  const service = new TranslationSettingsService(repo);

  const enabled = service.updateSettings({ translationEnabled: true, provider: 'openai' });
  assert.equal(enabled.translationEnabled, true);
  assert.equal(enabled.provider, 'openai');

  const disabled = service.updateSettings({ translationEnabled: false, provider: 'disabled' });
  assert.equal(disabled.translationEnabled, false);
  assert.equal(disabled.provider, 'disabled');
});

test('invalid provider is rejected', () => {
  const service = new TranslationSettingsService(memoryRepository());

  assert.throws(() => service.updateSettings({ provider: 'unknown-provider' }), /Invalid translation provider/);
});

test('English cannot be disabled', () => {
  const service = new TranslationSettingsService(memoryRepository());

  assert.throws(() => service.updateSettings({ enabledLanguages: ['he', 'th'] }), /English must remain enabled/);
});

test('unknown language is rejected', () => {
  const service = new TranslationSettingsService(memoryRepository());

  assert.throws(() => service.updateSettings({ enabledLanguages: ['en', 'fr'] }), /Unknown translation language/);
});

test('invalid cache TTL is rejected', () => {
  const service = new TranslationSettingsService(memoryRepository());

  assert.throws(() => service.updateSettings({ cacheTtlMinutes: 0 }), /Invalid translation cache TTL/);
  assert.throws(() => service.updateSettings({ cacheTtlMinutes: 'soon' }), /Invalid translation cache TTL/);
});

test('failed save preserves previous settings', () => {
  const repo = memoryRepository({
    translationEnabled: true,
    provider: 'openai',
    cacheEnabled: true,
    cacheTtlMinutes: 60,
    enabledLanguages: ['en', 'he'],
  });
  const service = new TranslationSettingsService(repo);
  const previous = service.getSettings();
  repo.saveSettings = () => {
    throw new Error('disk unavailable');
  };

  assert.throws(() => service.updateSettings({ provider: 'disabled' }), /disk unavailable/);
  assert.deepEqual(service.getSettings(), previous);
});

test('disabled translation uses fallback safely', async () => {
  const service = new TranslationService(createDisabledTranslationProvider());

  const result = await service.translateText('Hello', 'en', 'he');

  assert.equal(result.translatedText, 'Hello');
  assert.equal(result.translated, false);
  assert.equal(result.fallbackUsed, true);
});

test('translation settings repository persists settings to disk', () => {
  const previousPath = process.env.TRANSLATION_SETTINGS_FILE;
  const filePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gringo-translation-settings-')), 'settings.json');
  process.env.TRANSLATION_SETTINGS_FILE = filePath;

  try {
    const repository = new TranslationSettingsRepository();
    repository.saveSettings({
      translationEnabled: true,
      provider: 'openai',
      cacheEnabled: true,
      cacheTtlMinutes: 30,
      enabledLanguages: ['en', 'he'],
      updatedAt: '2026-07-27T00:00:00.000Z',
    });

    assert.deepEqual(repository.readSettings(), {
      translationEnabled: true,
      provider: 'openai',
      cacheEnabled: true,
      cacheTtlMinutes: 30,
      enabledLanguages: ['en', 'he'],
      updatedAt: '2026-07-27T00:00:00.000Z',
    });
  } finally {
    if (previousPath === undefined) delete process.env.TRANSLATION_SETTINGS_FILE;
    else process.env.TRANSLATION_SETTINGS_FILE = previousPath;
  }
});
