#!/usr/bin/env node
// Telegram pilot acceptance checks. No secrets, no real users, no real sheets.
//
//   node scripts/acceptance-telegram.js --local
//     Starts Gringo in this process with in-memory storage, AI off and a MOCKED
//     Telegram API (nothing leaves the machine), then runs /health, the web
//     consent gate and the Telegram consent + privacy commands in he/en/th.
//
//   node scripts/acceptance-telegram.js --url https://<service>.onrender.com
//     Read-only HTTP checks against a deployed instance: /health, security
//     headers, web chat refused without consent (403 CONSENT_REQUIRED).
//     It cannot talk to Telegram (that needs a real phone: see
//     docs/ops/TELEGRAM_ACCEPTANCE_he.md). It creates no consent and no data.
//
// Exit code 0 = all checks passed.
'use strict';

const args = process.argv.slice(2);
const urlIndex = args.indexOf('--url');
const remoteUrl = urlIndex >= 0 ? String(args[urlIndex + 1] || '').replace(/\/$/, '') : '';
const local = args.includes('--local') || !remoteUrl;

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? `  — ${detail}` : ''}`);
}

async function httpChecks(base) {
  const health = await fetch(`${base}/health`);
  const body = await health.json().catch(() => ({}));
  check('/health returns 200 {status:"ok"}', health.status === 200 && body.status === 'ok', `status ${health.status}`);
  check('/health has no personal data', Object.keys(body).every((k) => ['status', 'service'].includes(k)));

  const started = await fetch(`${base}/api/privacy/status`);
  const setCookie = typeof started.headers.getSetCookie === 'function' ? started.headers.getSetCookie() : [];
  const cookie = setCookie.length ? setCookie[0].split(';')[0] : '';
  check('/api/privacy/status reports no consent for a new visitor', started.status === 200, `status ${started.status}`);
  const chat = await fetch(`${base}/api/chat/message`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: base, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ message: 'hello' }),
  });
  const chatBody = await chat.json().catch(() => ({}));
  check('web chat without consent → 403 CONSENT_REQUIRED', chat.status === 403 && chatBody.error?.code === 'CONSENT_REQUIRED', `status ${chat.status}`);
}

async function telegramChecks() {
  const privacyNotice = require('../src/modules/privacy/privacy-notice');
  const telegramUpdateService = require('../src/modules/telegram/telegram-update.service');
  const R = privacyNotice.REPLIES;
  const cases = [
    { lang: 'he', code: 'he', privacy: 'פרטיות', accept: 'מסכים', mydata: 'המידע שלי', withdraw: 'ביטול הסכמה', del: 'מחק את המידע שלי' },
    { lang: 'en', code: 'en', privacy: 'privacy', accept: 'accept', mydata: 'my data', withdraw: 'withdraw consent', del: 'delete my data' },
    { lang: 'th', code: 'th', privacy: 'ความเป็นส่วนตัว', accept: 'ยอมรับ', mydata: 'ข้อมูลของฉัน', withdraw: 'ถอนความยินยอม', del: 'ลบข้อมูล' },
  ];
  // Start above the last update id the duplicate guard has seen.
  let updateId = Number(telegramUpdateService.getStatus().lastProcessedUpdateId) || 0;
  for (const [i, c] of cases.entries()) {
    const chatId = 7000000 + i;
    const say = async (text) => {
      const before = sent.length;
      await telegramUpdateService.processUpdate({ update_id: (updateId += 1), message: { message_id: updateId, date: Math.floor(Date.now() / 1000), text, chat: { id: chatId, type: 'private' }, from: { id: chatId, language_code: c.code } } });
      return sent.slice(before).filter((m) => String(m.chat_id) === String(chatId)).map((m) => m.text).join('\n');
    };
    const t = (k) => String(R[c.lang][k]);
    const greet = c.lang === 'he' ? 'שלום' : c.lang === 'th' ? 'สวัสดี' : 'hello';
    check(`[${c.lang}] first message → consent notice`, (await say(greet)).includes(t('consentRequired')));
    check(`[${c.lang}] privacy command → notice`, (await say(c.privacy)).includes(privacyNotice.getNotice(c.lang).title));
    check(`[${c.lang}] accept → consent saved`, (await say(c.accept)).includes(t('accepted')));
    const summary = await say(c.mydata);
    check(`[${c.lang}] my data → data summary`, summary.includes(t('exportTitle').slice(0, 20)) || summary.includes(t('exportEmpty').slice(0, 20)));
    const delReply = await say(c.del);
    const code = (delReply.match(/(\d{6})/) || [])[1];
    check(`[${c.lang}] delete → 6-digit confirmation code`, Boolean(code));
    check(`[${c.lang}] withdraw → consent withdrawn`, (await say(c.withdraw)).includes(t('withdrawn')));
    check(`[${c.lang}] after withdraw → consent notice again`, (await say(greet)).includes(t('consentRequired')));
    if (code) {
      await say(c.accept);
      const done = await say(`${c.del} ${code}`);
      check(`[${c.lang}] delete + code → deletion reply, then notice again`, done.length > 0 && (await say(greet)).includes(t('consentRequired')));
    }
  }
}

// Onboarding in he/en/th with the static copy (no AI, no translation
// provider). The Telegram app language is Hebrew in every case, like the
// founder's phone, and the user then picks the language in step 1.
async function onboardingChecks() {
  const privacyNotice = require('../src/modules/privacy/privacy-notice');
  const telegramUpdateService = require('../src/modules/telegram/telegram-update.service');
  const { STRINGS } = require('../src/modules/core-agent/onboarding.i18n');
  const R = privacyNotice.REPLIES;
  const HEBREW_FAILURE = /לא הצלחתי (לתרגם|להבין)/;
  const flows = [
    { lang: 'th', pick: 'ไทย', accept: 'ยอมรับ', name: 'Somchai Jaidee', country: 'ไทย', sector: 'ก่อสร้าง', yes: 'ใช่', no: 'ไม่', skip: 'ข้าม' },
    { lang: 'he', pick: 'עברית', accept: 'מסכים', name: 'Somchai Jaidee', country: 'תאילנד', sector: 'בניין', yes: 'כן', no: 'לא', skip: 'דלג' },
    { lang: 'en', pick: 'English', accept: 'accept', name: 'Somchai Jaidee', country: 'Thailand', sector: 'Construction', yes: 'Yes', no: 'No', skip: 'skip' },
  ];
  let updateId = Number(telegramUpdateService.getStatus().lastProcessedUpdateId) || 0;
  for (const [i, f] of flows.entries()) {
    const chatId = 7100000 + i;
    const S = STRINGS[f.lang];
    const say = async (text) => {
      const before = sent.length;
      await telegramUpdateService.processUpdate({ update_id: (updateId += 1), message: { message_id: updateId, date: Math.floor(Date.now() / 1000), text, chat: { id: chatId, type: 'private' }, from: { id: chatId, language_code: 'he' } } });
      return sent.slice(before).filter((m) => String(m.chat_id) === String(chatId)).map((m) => m.text).join('\n');
    };
    await say('hello');
    await say(f.accept);
    const replies = [];
    const step = async (text) => { const r = await say(text); replies.push(r); return r; };
    check(`[onboarding ${f.lang}] language choice → name question in ${f.lang}`, (await step(f.pick)).includes(S.questions.fullName));
    check(`[onboarding ${f.lang}] name → country question in ${f.lang}`, (await step(f.name)).includes(S.questions.country));
    const bad = await step('אתה יכול לכתוב בתאית?');
    check(`[onboarding ${f.lang}] question as country → rejected and re-asked in ${f.lang}`, bad.includes(S.invalid.country) && bad.includes(S.questions.country));
    check(`[onboarding ${f.lang}] valid country → sector question`, (await step(f.country)).includes(S.questions.workSector));
    check(`[onboarding ${f.lang}] sector → profession question`, (await step(f.sector)).includes(S.questions.profession));
    await step(f.skip);
    await step('Tel Aviv');
    await step(f.yes);
    await step('THB');
    const done = await step(f.no);
    check(`[onboarding ${f.lang}] completion summary in ${f.lang}`, done.includes(S.done) && done.includes(S.summaryTitle));
    check(`[onboarding ${f.lang}] country saved as Thailand, not the question`, done.includes(`${S.labels.country}: ${S.values.Thailand || 'Thailand'}`) && !done.includes('אתה יכול'));
    if (f.lang !== 'he') check(`[onboarding ${f.lang}] no Hebrew translation-failure message`, replies.every((r) => !HEBREW_FAILURE.test(r)));
    if (f.lang !== 'en') check(`[onboarding ${f.lang}] no English onboarding question leaked`, replies.every((r) => !Object.values(STRINGS.en.questions).some((q) => r.includes(q))));
    void R;
  }
}

const sent = [];
async function main() {
  if (!local) {
    console.log(`Remote checks against ${remoteUrl}`);
    await httpChecks(remoteUrl);
  } else {
    Object.assign(process.env, {
      NODE_ENV: 'development', ALLOW_DEV_ADMIN_KEY: 'true', GOOGLE_SHEETS_SPREADSHEET_ID: '', AI_ENABLED: 'false', AI_API_KEY: '',
      TELEGRAM_BOT_ENABLED: 'true', TELEGRAM_BOT_MODE: 'polling', TELEGRAM_BOT_TOKEN: '0:mock-token-not-real',
      LINE_ENABLED: 'false', WHATSAPP_ENABLED: 'false', GRINGO_PROCESS_LOCK: 'off', AI_BUDGET_STATE_FILE: 'off',
    });
    delete process.env.GRINGO_PRIVACY_CONSENT_GATE;
    const realFetch = global.fetch;
    global.fetch = async (url, opts = {}) => {
      if (String(url).startsWith('https://api.telegram.org/')) {
        const method = String(url).split('/').pop();
        const payload = opts.body ? JSON.parse(opts.body) : {};
        if (method === 'sendMessage') sent.push(payload);
        const result = method === 'getUpdates' ? [] : { message_id: sent.length, chat: { id: payload.chat_id } };
        return new Response(JSON.stringify({ ok: true, result }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (/^https?:\/\/(127\.0\.0\.1|localhost)/.test(String(url))) return realFetch(url, opts);
      throw new Error(`acceptance --local blocks outbound network: ${new URL(url).host}`);
    };
    const app = require('../src/app');
    const server = app.listen(0, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
    try {
      await httpChecks(`http://127.0.0.1:${server.address().port}`);
      await telegramChecks();
      await onboardingChecks();
    } finally {
      server.close();
    }
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exitCode = failed ? 1 : 0;
}

if (require.main === module) {
  main().catch((error) => { console.error(`acceptance error: ${error.message}`); process.exit(1); });
}
module.exports = { main, results };
