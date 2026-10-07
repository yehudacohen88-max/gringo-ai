const test = require('node:test');
const assert = require('node:assert/strict');

const { languageDetectionService } = require('../src/modules/language');

test('detects Hebrew text', () => {
  assert.deepEqual(languageDetectionService.detectLanguage('שלום').language, 'he');
});

test('detects Arabic text', () => {
  assert.deepEqual(languageDetectionService.detectLanguage('مرحبا').language, 'ar');
});

test('detects Thai text', () => {
  assert.deepEqual(languageDetectionService.detectLanguage('สวัสดี').language, 'th');
});

test('detects Sinhala text', () => {
  assert.deepEqual(languageDetectionService.detectLanguage('ආයුබෝවන්').language, 'si');
});

test('detects Hindi text', () => {
  assert.deepEqual(languageDetectionService.detectLanguage('नमस्ते').language, 'hi');
});

test('detects Russian text', () => {
  assert.deepEqual(languageDetectionService.detectLanguage('Привет').language, 'ru');
});

test('detects English text', () => {
  assert.deepEqual(languageDetectionService.detectLanguage('Hello Gringo').language, 'en');
});

test('empty text falls back to default language', () => {
  assert.deepEqual(languageDetectionService.detectLanguage('').language, 'en');
  assert.deepEqual(languageDetectionService.detectLanguage('').source, 'default');
});

test('unsupported explicit language falls through to text detection', () => {
  const result = languageDetectionService.resolveLanguage({
    explicitLanguage: 'fr',
    text: 'שלום',
  });

  assert.equal(result.language, 'he');
  assert.equal(result.source, 'text');
});

test('explicit language overrides detected text', () => {
  const result = languageDetectionService.resolveLanguage({
    explicitLanguage: 'Thai',
    text: 'שלום',
  });

  assert.equal(result.language, 'th');
  assert.equal(result.source, 'explicit');
});

test('saved profile language overrides text', () => {
  const result = languageDetectionService.resolveLanguage({
    profile: { preferredLanguage: 'Russian' },
    text: 'Hello',
  });

  assert.equal(result.language, 'ru');
  assert.equal(result.source, 'profile');
});

test('channel language is used as fallback before text', () => {
  const result = languageDetectionService.resolveLanguage({
    channelLanguage: 'ar',
    text: 'Hello',
  });

  assert.equal(result.language, 'ar');
  assert.equal(result.source, 'channel');
});

test('default fallback is returned for missing signals', () => {
  const result = languageDetectionService.resolveLanguage({});

  assert.equal(result.language, 'en');
  assert.equal(result.source, 'default');
  assert.equal(result.confidence, 'low');
  assert.equal(result.supported, true);
});

test('normalizes aliases', () => {
  assert.equal(languageDetectionService.normalizeLanguageCode('iw'), 'he');
  assert.equal(languageDetectionService.normalizeLanguageCode('tagalog'), 'tl');
  assert.equal(languageDetectionService.normalizeLanguageCode('filipino'), 'tl');
  assert.equal(languageDetectionService.normalizeLanguageCode('sinhala'), 'si');
});
