// LNG-02: every user-facing copy key exists in Thai, English and Hebrew.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REQUIRED = ['th', 'en', 'he'];

function nonEmpty(value) {
  if (Array.isArray(value)) return value.length > 0 && value.every(nonEmpty);
  if (value && typeof value === 'object') return Object.values(value).every(nonEmpty);
  return typeof value === 'string' ? value.trim().length > 0 : value !== undefined && value !== null;
}

function assertKeyedByLanguage(name, map) {
  for (const lang of REQUIRED) assert.ok(nonEmpty(map[lang]), `${name}: missing or empty "${lang}"`);
}

function assertSameKeys(name, byLang) {
  const reference = Object.keys(byLang.en).sort();
  for (const lang of REQUIRED) {
    assert.ok(byLang[lang], `${name}: missing language ${lang}`);
    assert.deepEqual(Object.keys(byLang[lang]).sort(), reference, `${name}: keys differ for ${lang}`);
    for (const key of reference) assert.ok(nonEmpty(byLang[lang][key]), `${name}.${lang}.${key} is empty`);
  }
}

function browserConst(file, constName) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', file), 'utf8');
  const start = source.indexOf(`const ${constName} = {`);
  assert.ok(start >= 0, `${constName} not found in ${file}`);
  let depth = 0;
  let index = source.indexOf('{', start);
  const open = index;
  for (; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') { depth -= 1; if (depth === 0) break; }
  }
  return vm.runInNewContext(`(${source.slice(open, index + 1)})`);
}

test('server error copy has th/en/he for every message', () => {
  const { COPY } = require('../src/shared/userFacingCopy');
  for (const [key, map] of Object.entries(COPY)) assertKeyedByLanguage(`userFacingCopy.${key}`, map);
});

test('privacy notice and channel replies are complete in th/en/he', () => {
  const { NOTICES, REPLIES } = require('../src/modules/privacy/privacy-notice');
  assertSameKeys('NOTICES', NOTICES);
  const replies = REPLIES.en && typeof REPLIES.en === 'object' ? REPLIES : null;
  if (replies) assertSameKeys('REPLIES', REPLIES);
  else for (const [key, map] of Object.entries(REPLIES)) assertKeyedByLanguage(`REPLIES.${key}`, map);
});

test('core fallback and AI-limit replies exist in th/en/he', () => {
  const core = require('../src/modules/core-agent/core-agent.service');
  assertKeyedByLanguage('FRIENDLY_FALLBACK', core.FRIENDLY_FALLBACK);
  assertKeyedByLanguage('AI_PAUSED_REPLY', core.AI_PAUSED_REPLY);
  assert.equal(core.createFriendlyFallback('th'), core.FRIENDLY_FALLBACK.th);
  assert.equal(core.createAiPausedReply('he-IL'), core.AI_PAUSED_REPLY.he);
  assert.equal(core.createAiPausedReply('xx'), core.AI_PAUSED_REPLY.en);
});

test('web chat UI copy is complete in th/en/he', () => {
  assertSameKeys('chat.js UI_COPY', browserConst('chat.js', 'UI_COPY'));
  const paused = browserConst('chat.js', 'COMMENT_REPORT_PAUSED_COPY');
  assertKeyedByLanguage('chat.js COMMENT_REPORT_PAUSED_COPY', paused);
});

test('web privacy panel copy is complete in th/en/he', () => {
  global.window = {};
  global.document = { addEventListener() {} };
  const { COPY } = require('../src/public/privacy-panel.js');
  delete global.window;
  delete global.document;
  assertSameKeys('privacy-panel COPY', COPY);
});

test('chat page loads the privacy panel and it uses only existing privacy routes', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'chat.html'), 'utf8');
  assert.ok(html.indexOf('/privacy-panel.js') >= 0 && html.indexOf('/privacy-panel.js') < html.indexOf('/chat.js'));
  const panel = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'privacy-panel.js'), 'utf8');
  const routes = fs.readFileSync(path.join(__dirname, '..', 'src', 'modules', 'privacy', 'privacy.routes.js'), 'utf8');
  const used = [...panel.matchAll(/'\/api\/privacy\/([a-z-]+)/g)].map((m) => m[1]);
  assert.ok(used.length >= 6);
  for (const route of new Set(used)) assert.ok(routes.includes(`'/${route}'`), `missing route /${route}`);
  assert.ok(!/innerHTML/.test(panel), 'panel must not use innerHTML');
});
