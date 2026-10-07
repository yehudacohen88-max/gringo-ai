const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const chatHtml = fs.readFileSync(path.join(root, 'src/public/chat.html'), 'utf8');
const chatJs = fs.readFileSync(path.join(root, 'src/public/chat.js'), 'utf8');

test('language selector exists with supported options and Auto mode', () => {
  assert.match(chatHtml, /<select id="profilePreferredLanguage" name="preferredLanguage">/);
  for (const value of ['', 'en', 'he', 'ar', 'th', 'si', 'hi', 'ru', 'tl']) {
    assert.match(chatHtml, new RegExp(`<option value="${value}">`));
  }
  assert.match(chatHtml, />Auto</);
});

test('selector loads the current normalized preferredLanguage value', () => {
  assert.match(chatJs, /function normalizeLanguageValue/);
  assert.match(chatJs, /setProfileField\('#profilePreferredLanguage', normalizeLanguageValue\(profile\.preferredLanguage\)\)/);
});

test('selector saves language changes immediately', () => {
  assert.match(chatJs, /function savePreferredLanguage/);
  assert.match(chatJs, /#profilePreferredLanguage'\)\.addEventListener\('change'/);
  assert.match(chatJs, /preferredLanguage: value \|\| null/);
});

test('full profile save persists Auto mode as null', () => {
  assert.match(chatJs, /const preferredLanguage = formData\.get\('preferredLanguage'\) \|\| null/);
  assert.match(chatJs, /preferredLanguage,/);
});
