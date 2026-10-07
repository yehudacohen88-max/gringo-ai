const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const adminHtml = fs.readFileSync(path.join(root, 'src/public/admin.html'), 'utf8');
const adminJs = fs.readFileSync(path.join(root, 'src/public/admin.js'), 'utf8');

test('Admin Translation settings controls exist', () => {
  assert.equal(adminHtml.includes('id="translationSettingsForm"'), true);
  assert.equal(adminHtml.includes('name="translationEnabled"'), true);
  assert.equal(adminHtml.includes('name="provider"'), true);
  assert.equal(adminHtml.includes('name="cacheEnabled"'), true);
  assert.equal(adminHtml.includes('name="cacheTtlMinutes"'), true);
  assert.equal(adminHtml.includes('id="translationLanguageToggles"'), true);
});

test('Admin Translation settings save uses protected Admin API', () => {
  assert.equal(adminJs.includes("adminFetch('/translation/settings'"), true);
  assert.equal(adminJs.includes("method: 'PUT'"), true);
  assert.equal(adminJs.includes('Translation settings saved.'), true);
});

test('Admin Translation UI keeps English enabled locally', () => {
  assert.equal(adminJs.includes("const enabledLanguages = ['en'"), true);
  assert.equal(adminJs.includes("code === 'en' ? 'disabled'"), true);
});
