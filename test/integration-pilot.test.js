// Integration checks for PRs #15-#19 combined (consent gate on).
process.env.GRINGO_PRIVACY_CONSENT_GATE = 'on';

const { describe, test, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawnSync, spawn } = require('child_process');

const app = require('../src/app');
const { env } = require('../src/config/env');
const { COOKIE_NAME } = require('../src/shared/webIdentity');
const { resetRateLimitsForTests } = require('../src/shared/rateLimit');
const privacyService = require('../src/modules/privacy/privacy.service');
const aiBudget = require('../src/modules/ai-provider/ai-budget.service');
const ROOT = path.join(__dirname, '..');

let server;
let base;

// Minimal DOM, enough to run src/public/privacy-panel.js unmodified.
function makeDom() {
  const listeners = {};
  function node(tag) {
    return {
      tagName: tag, attrs: {}, children: [], textContent: '', hidden: false, parentNode: null, value: '', handlers: {},
      setAttribute(k, v) { this.attrs[k] = v; },
      appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
      insertBefore(c, ref) { c.parentNode = this; const i = this.children.indexOf(ref); if (i < 0) this.children.push(c); else this.children.splice(i, 0, c); return c; },
      replaceChildren() { this.children = []; },
      addEventListener(type, fn) { this.handlers[type] = fn; },
      remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((x) => x !== this); },
      click() {},
      get lastChild() { return this.children[this.children.length - 1]; },
      get nextSibling() { const s = this.parentNode ? this.parentNode.children : []; return s[s.indexOf(this) + 1] || null; },
    };
  }
  const body = node('body');
  const alert = node('div'); alert.attrs.id = 'chatAlert'; body.appendChild(alert);
  const profileButton = node('button'); body.appendChild(profileButton);
  const document = {
    documentElement: { lang: 'en' }, body,
    createElement: node,
    querySelector: (sel) => (sel === '#chatAlert' ? alert : sel === '#profileButton' ? profileButton : null),
    addEventListener: (type, fn) => { listeners[type] = fn; },
  };
  return { document, listeners, body };
}

function all(n, out = []) { out.push(n); (n.children || []).forEach((c) => all(c, out)); return out; }

function loadPanel(uiLang) {
  const dom = makeDom();
  let cookie = '';
  const downloads = [];
  const browserFetch = async (url, opts = {}) => {
    const headers = { ...(opts.headers || {}) };
    if (cookie) headers.cookie = `${COOKIE_NAME}=${encodeURIComponent(cookie)}`;
    if (opts.method && opts.method !== 'GET') headers.origin = base; // browsers send Origin on POST
    const res = await fetch(`${base}${url}`, { ...opts, headers });
    const set = res.headers.getSetCookie().find((v) => v.startsWith(`${COOKIE_NAME}=`));
    if (set) cookie = decodeURIComponent(set.split(';')[0].slice(COOKIE_NAME.length + 1));
    return res;
  };
  const window = { gringoUiLanguage: () => uiLang };
  const ctx = {
    window, document: dom.document, navigator: { language: 'en' }, fetch: browserFetch, console,
    Blob: class { constructor(parts) { downloads.push(parts.join('')); } }, URL: { createObjectURL: () => 'blob:x' },
  };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'src/public/privacy-panel.js'), 'utf8'), ctx);
  const panel = () => all(dom.body).find((n) => n.attrs.id === 'privacyPanel');
  const state = () => all(panel()).find((n) => n.attrs['data-privacy-state']).attrs['data-privacy-state'];
  const click = async (label) => {
    const b = all(panel()).find((n) => n.tagName === 'button' && n.textContent === label);
    assert.ok(b, `button "${label}" expected; have ${all(panel()).filter((n) => n.tagName === 'button').map((n) => n.textContent)}`);
    await b.handlers.click();
  };
  return { window, dom, panel, state, click, downloads, copy: window.gringoPrivacy && window.gringoPrivacy.copy, getCookie: () => cookie };
}

describe('integration: PRs #15-#19 combined', { concurrency: false }, () => {
  before(async () => {
    server = app.listen(0, '127.0.0.1');
    if (!server.listening) await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => {
    mock.restoreAll();
    await new Promise((r) => server.close(r));
  });
  beforeEach(() => {
    resetRateLimitsForTests();
    privacyService.resetForTests();
  });

  for (const uiLang of ['th', 'he', 'en']) {
    test(`web privacy panel (${uiLang}): notice -> consent -> export -> withdraw -> delete, end to end`, async () => {
      const p = loadPanel(uiLang);
      const COPY = p.window.gringoPrivacy.copy[uiLang];
      await p.dom.listeners.DOMContentLoaded();
      for (let i = 0; i < 100 && !(p.panel() && all(p.panel()).some((n) => n.attrs['data-privacy-state'])); i += 1) await new Promise((r) => setTimeout(r, 10));
      assert.ok(p.panel(), 'panel opens on load when consent is needed');
      assert.equal(p.state(), 'statusNone');
      const texts = all(p.panel()).map((n) => n.textContent).join('\n');
      if (uiLang === 'th') assert.match(texts, /[\u0e00-\u0e7f]/);
      if (uiLang === 'he') assert.match(texts, /[\u0590-\u05ff]/);

      await p.click(COPY.accept);
      assert.equal(p.state(), 'statusAccepted');

      // Chat now passes the gate with the same browser cookie.
      const chat = await fetch(`${base}/api/chat/profile`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', origin: base, cookie: `${COOKIE_NAME}=${encodeURIComponent(p.getCookie())}` },
        body: JSON.stringify({ fullName: `Panel ${uiLang}` }),
      });
      assert.equal(chat.status, 200);

      await p.click(COPY.export);
      assert.equal(p.downloads.length, 1);
      assert.match(p.downloads[0], new RegExp(`Panel ${uiLang}`));

      await p.click(COPY.withdraw);
      assert.equal(p.state(), 'statusWithdrawn');

      await p.click(COPY.deleteStart);
      const label = all(p.panel()).find((n) => n.tagName === 'label');
      const code = label.textContent.match(/(\d{4,})/)[1];
      all(p.panel()).find((n) => n.tagName === 'input').value = code;
      await p.click(COPY.deleteConfirm);
      const status = await (await fetch(`${base}/api/privacy/status`, { headers: { cookie: `${COOKIE_NAME}=${encodeURIComponent(p.getCookie())}` } })).json();
      assert.equal(status.accepted, false);
      assert.equal(status.deletionPending, false);
    });
  }

  test('web chat without consent is refused (403 CONSENT_REQUIRED) and chat.js opens the panel on that code', async () => {
    const started = await fetch(`${base}/api/privacy/status`);
    const cookie = decodeURIComponent(started.headers.getSetCookie()[0].split(';')[0].slice(COOKIE_NAME.length + 1));
    const res = await fetch(`${base}/api/chat/message`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: base, cookie: `${COOKIE_NAME}=${encodeURIComponent(cookie)}` },
      body: JSON.stringify({ message: 'hello' }),
    });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error.code, 'CONSENT_REQUIRED');
    const chatJs = fs.readFileSync(path.join(ROOT, 'src/public/chat.js'), 'utf8');
    assert.match(chatJs, /CONSENT_REQUIRED/);
    assert.match(chatJs, /gringoPrivacy/);
  });

  test('express 4.22.3: body over 100kb is 413 (not 500); trust proxy stays off; qs nested parsing works', async () => {
    const big = await fetch(`${base}/api/privacy/consent`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify({ accept: true, pad: 'x'.repeat(200 * 1024) }),
    });
    assert.equal(big.status, 413);
    assert.equal(app.get('trust proxy'), false);
    assert.equal(require('express/package.json').version, '4.22.3');
    const express = require('express');
    const probe = express();
    probe.set('trust proxy', false);
    probe.get('/p', (req, res) => res.json({ ip: req.ip, q: req.query }));
    const s = probe.listen(0, '127.0.0.1');
    await new Promise((r) => s.once('listening', r));
    const r = await (await fetch(`http://127.0.0.1:${s.address().port}/p?a[b]=1&list[]=x&list[]=y`, { headers: { 'x-forwarded-for': '6.6.6.6' } })).json();
    s.close();
    assert.notEqual(r.ip, '6.6.6.6');
    assert.deepEqual(r.q, { a: { b: '1' }, list: ['x', 'y'] });
    const malformed = await fetch(`${base}/api/privacy/consent`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: '{"accept":' });
    assert.equal(malformed.status, 400);
  });

  test('pinned dependency versions are the patched ones', () => {
    const v = (name) => require(require.resolve(`${name}/package.json`, { paths: [path.dirname(require.resolve('express'))] })).version;
    const [bpMaj, bpMin, bpPatch] = v('body-parser').split('.').map(Number);
    assert.ok(bpMaj > 1 || (bpMin > 20 || (bpMin === 20 && bpPatch >= 9)), v('body-parser'));
    const [, paMin, paPatch] = v('proxy-addr').split('.').map(Number);
    assert.ok(paMin > 0 || paPatch >= 8, v('proxy-addr'));
    const [, qsMin, qsPatch] = v('qs').split('.').map(Number);
    assert.ok(qsMin > 16 || (qsMin === 16 && qsPatch >= 1), v('qs'));
  });

  test('scheduler registers privacy deletion retry and notification expiry (every 60s)', async () => {
    const intervals = [];
    mock.method(global, 'setInterval', (fn, ms) => { intervals.push(ms); return { unref() {} }; });
    const telegram = require('../src/modules/telegram');
    mock.method(telegram.telegramUpdateService, 'startPolling', async () => {});
    const retry = mock.method(privacyService, 'retryPendingDeletions', async () => ({ attempted: 0, completed: 0, stillPending: 0, unresolved: 0 }));
    const { startBackgroundWork } = require('../src/server');
    startBackgroundWork();
    await new Promise((r) => setImmediate(r));
    mock.restoreAll();
    assert.equal(retry.mock.callCount(), 1);
    assert.ok(intervals.length >= 3 && intervals.every((ms) => ms === 60000));
  });
});

describe('integration: AI limits and restart', { concurrency: false }, () => {
  test('timeout: a hanging provider is aborted after AI_TIMEOUT_MS', async () => {
    const provider = require('../src/modules/ai-provider/openai.provider');
    const prevKey = env.ai.apiKey;
    env.ai.apiKey = 'test-not-a-secret';
    process.env.AI_TIMEOUT_MS = '50';
    mock.method(global, 'fetch', (url, opts) => new Promise((_, reject) => opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))));
    const t0 = Date.now();
    await assert.rejects(provider.createResponse({ message: 'hi' }), /timed out/);
    assert.ok(Date.now() - t0 < 2000);
    mock.restoreAll();
    env.ai.apiKey = prevKey;
    delete process.env.AI_TIMEOUT_MS;
  });

  test('kill switch and limits produce the localized paused reply, including Thai', () => {
    const core = require('../src/modules/core-agent/core-agent.service');
    assert.match(core.createAiPausedReply('th'), /[\u0e00-\u0e7f]/);
    assert.match(core.createFriendlyFallback('th-TH'), /[\u0e00-\u0e7f]/);
    assert.match(core.createAiPausedReply('he'), /[\u0590-\u05ff]/);
    assert.notEqual(core.createAiPausedReply('en'), core.createFriendlyFallback('en'));
  });

  test('counters persist across a real process restart; old and corrupt files are ignored', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aib-int-')), 'state.json');
    // The per-user key is an HMAC with WEB_SESSION_SECRET. A restart only
    // keeps the cap when that secret is the same, which production guarantees.
    const run = (code) => spawnSync(process.execPath, ['-e', code], {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        WEB_SESSION_SECRET: 'test-only-web-session-secret-0123456789abcdef',
        AI_BUDGET_STATE_FILE: file,
        AI_DAILY_USER_LIMIT: '2',
        AI_DAILY_GLOBAL_LIMIT: '100',
      },
    });
    const mod = "const b=require('./src/modules/ai-provider/ai-budget.service');";
    let r = run(`${mod} b.reserve('telegram:1'); b.reserve('telegram:1'); b.recordUsage({total_tokens:7}); b.flush();`);
    assert.equal(r.status, 0, r.stderr);
    r = run(`${mod} const s=b.snapshot(); let blocked=''; try{b.reserve('telegram:1')}catch(e){blocked=e.reason} console.log(JSON.stringify({calls:s.calls,tokens:s.tokens,blocked}));`);
    assert.deepEqual(JSON.parse(r.stdout.trim().split('\n').pop()), { calls: 2, tokens: 7, blocked: 'user_daily_limit' });
    fs.writeFileSync(file, JSON.stringify({ day: '1999-12-31', global: 99, tokens: 1, perUser: [] }));
    r = run(`${mod} console.log(b.snapshot().calls)`);
    assert.equal(r.stdout.trim().split('\n').pop(), '0');
    fs.writeFileSync(file, 'garbage{');
    r = run(`${mod} console.log(b.snapshot().calls)`);
    assert.equal(r.stdout.trim().split('\n').pop(), '0');
    aiBudget.reset();
  });
});

describe('integration: single-process lock with real processes', () => {
  test('second process is refused while the first lives; stale lock from a dead pid is taken over', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lock-int-')), 'g.lock');
    const holder = spawn(process.execPath, ['-e', `require('./src/shared/processLock').acquire(${JSON.stringify(file)}); setTimeout(()=>{}, 20000)`], { cwd: ROOT });
    for (let i = 0; i < 100 && !fs.existsSync(file); i += 1) await new Promise((r) => setTimeout(r, 30));
    const second = spawnSync(process.execPath, ['-e', `try{require('./src/shared/processLock').acquire(${JSON.stringify(file)});console.log('GOT')}catch(e){console.log(e.name)}`], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(second.stdout.trim(), 'ProcessLockError');
    holder.kill('SIGKILL');
    await new Promise((r) => holder.once('exit', r));
    const third = spawnSync(process.execPath, ['-e', `const l=require('./src/shared/processLock').acquire(${JSON.stringify(file)});console.log('GOT');l.release()`], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(third.stdout.trim(), 'GOT', third.stderr);
    assert.equal(fs.existsSync(file), false);
  });
});

test('OpenAI requests ask the provider not to store responses (store:false)', async () => {
  const provider = require('../src/modules/ai-provider/openai.provider');
  const prevKey = env.ai.apiKey;
  env.ai.apiKey = 'test-not-a-secret';
  let sent;
  mock.method(global, 'fetch', async (url, opts) => { sent = JSON.parse(opts.body); return { ok: true, json: async () => ({ output_text: 'ok' }) }; });
  await provider.createResponse({ message: 'hi' });
  mock.restoreAll();
  env.ai.apiKey = prevKey;
  assert.equal(sent.store, false);
  const { createOpenAiTranslationProvider } = require('../src/modules/translation/providers/openai-translation.provider');
  let tSent;
  const translator = createOpenAiTranslationProvider({ apiKey: 'test-not-a-secret', model: 'm', fetchImpl: async (url, opts) => { tSent = JSON.parse(opts.body); return { ok: true, json: async () => ({ output_text: 'สวัสดี' }) }; } });
  const out = await translator.translateText('hello', 'en', 'th');
  assert.equal(out.translatedText, 'สวัสดี');
  assert.equal(tSent.store, false);
});
