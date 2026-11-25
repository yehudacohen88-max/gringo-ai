const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  EvalBudgetCapError,
  EvalConfigError,
  EvalQuotaStopError,
  createBudgetGuard,
  validateEvalApiKey,
} = require('./lib/budget-guard');
const { KNOWN_FILTER_MISS_SENTENCES, detectLegalLeakInFinalAnswer } = require('./lib/leak-detector');
const { IsolationViolationError, installIsolation } = require('./lib/isolation');
const { addExtraDryChecks } = require('./lib/extra-dry-checks');

const cwd = path.resolve(__dirname, '..');

function runChild(args, envOverrides = {}, removeKeys = []) {
  const env = { ...process.env, ...envOverrides };
  for (const k of removeKeys) delete env[k];
  return spawnSync(process.execPath, args, { cwd, env, encoding: 'utf8', timeout: 60000 });
}

(async () => {
  const results = [];
  function pass(name, detail) {
    results.push({ name, pass: true, detail });
    console.log('PASS', name, '|', detail);
  }

  // 1. Refuse to start when OPENAI_API_KEY_EVAL is missing
  {
    const res = runChild(['eval/run-eval.js'], {}, ['OPENAI_API_KEY_EVAL', 'OPENAI_API_KEY', 'AI_API_KEY']);
    assert.notEqual(res.status, 0, 'Must exit non-zero when OPENAI_API_KEY_EVAL is missing');
    assert.match(res.stderr, /OPENAI_API_KEY_EVAL is missing/);
    pass('refuse-missing-eval-key', `exit=${res.status}`);
  }

  // 2. Refuse to start when OPENAI_API_KEY_EVAL equals OPENAI_API_KEY (even with OPENAI_API_KEY set)
  {
    const res = runChild(['eval/run-eval.js'], {
      OPENAI_API_KEY_EVAL: 'sk-eval-same-key-check',
      OPENAI_API_KEY: 'sk-eval-same-key-check',
    }, ['AI_API_KEY']);
    assert.notEqual(res.status, 0, 'Must exit non-zero when OPENAI_API_KEY_EVAL === OPENAI_API_KEY');
    assert.match(res.stderr, /matches OPENAI_API_KEY/);
    pass('refuse-equal-openai-key', `exit=${res.status}`);
  }

  // 3. Refuse to start when OPENAI_API_KEY_EVAL equals AI_API_KEY
  {
    const res = runChild(['eval/run-eval.js'], {
      OPENAI_API_KEY_EVAL: 'sk-eval-same-ai-key',
      AI_API_KEY: 'sk-eval-same-ai-key',
    }, ['OPENAI_API_KEY']);
    assert.notEqual(res.status, 0, 'Must exit non-zero when OPENAI_API_KEY_EVAL === AI_API_KEY');
    assert.match(res.stderr, /matches AI_API_KEY/);
    pass('refuse-equal-ai-key', `exit=${res.status}`);
  }

  // 4. Refuse fallback even when OPENAI_API_KEY is set and OPENAI_API_KEY_EVAL is missing
  {
    assert.throws(
      () => validateEvalApiKey({ OPENAI_API_KEY: 'sk-prod-should-never-be-used' }, { requireKey: true }),
      EvalConfigError
    );
    pass('no-fallback-to-prod-key', 'validateEvalApiKey refused');
  }

  // 5. Simulated-price budget cap trigger ($1.35) via full run-eval.js --dry-run
  {
    const tmpOut = path.join(os.tmpdir(), `gringo-cap-${Date.now()}.json`);
    const tmpLedger = path.join(os.tmpdir(), `gringo-cap-${Date.now()}.jsonl`);
    const res = runChild([
      'eval/run-eval.js',
      '--dry-run',
      '--repeats=1',
      '--simulate-price-input=500',
      '--simulate-price-output=1000',
      '--max-budget=1.35',
      `--out=${tmpOut}`,
      `--ledger=${tmpLedger}`,
    ]);
    assert.equal(res.status, 0, `Simulated cap run failed: ${res.stderr}`);
    const out = JSON.parse(fs.readFileSync(tmpOut, 'utf8'));
    assert.equal(out.summary.budget.stoppedReason, 'budget_cap_reached');
    assert.ok(out.summary.budget.cumulativeActualCostUsd <= 1.35, 'Cumulative cost must stay <= $1.35');
    assert.ok(out.summary.budget.callsMade > 0 && out.summary.budget.callsMade < 10, `Expected early stop, callsMade=${out.summary.budget.callsMade}`);
    pass('simulated-price-cap-stop', `callsMade=${out.summary.budget.callsMade}, cost=$${out.summary.budget.cumulativeActualCostUsd}`);
  }

  // 6. Hard call cap at 1,536 calls + 429/insufficient_quota immediate stop
  {
    const ledgerTmp = path.join(os.tmpdir(), `gringo-1536-${Date.now()}.jsonl`);
    const guard = createBudgetGuard({
      maxCalls: 1536,
      maxBudgetUsd: 1.35,
      ledgerPath: ledgerTmp,
      overridePricing: { input: 0.001, output: 0.001 }, // tiny price to reach 1,536 calls without hitting $1.35 first
    });
    for (let i = 0; i < 1536; i += 1) {
      const pre = guard.preflightOrThrow({ model: 'gpt-4.1-mini', max_output_tokens: 350, input: [] }, { itemId: `C-${i}`, pass: 1, lang: 'en' });
      guard.recordResponse(pre, { status: 200, usage: { input_tokens: 500, output_tokens: 50 } });
    }
    assert.throws(
      () => guard.preflightOrThrow({ model: 'gpt-4.1-mini', max_output_tokens: 350, input: [] }, {}),
      (err) => err instanceof EvalBudgetCapError && err.reason === 'hard_call_cap_reached'
    );
    assert.equal(guard.callsMade, 1536);

    const guard429 = createBudgetGuard({ maxCalls: 1536, maxBudgetUsd: 1.35 });
    const pre429 = guard429.preflightOrThrow({ model: 'gpt-4.1-mini', max_output_tokens: 350, input: [] }, {});
    assert.throws(
      () => guard429.recordResponse(pre429, { status: 429, errorCode: 'insufficient_quota', errorMessage: 'You exceeded your current quota' }),
      (err) => err instanceof EvalQuotaStopError && err.reason === 'insufficient_quota'
    );
    assert.equal(guard429.callsMade, 1);
    pass('hard-call-cap-1536-and-429-stop', '1536th succeeded, 1537th refused, 429 stopped on call 1');
  }

  // 7. Isolation spy checks: Sheets client, Telegram client, and non-OpenAI network calls must fail
  {
    const guard = createBudgetGuard({ maxCalls: 10, maxBudgetUsd: 1.35 });
    const iso = installIsolation({
      dryRun: true,
      budgetGuard: guard,
      stubOpenAiHandler: async () => ({ ok: true, status: 200, json: async () => ({ output_text: '{}', usage: { input_tokens: 10, output_tokens: 5 } }) }),
    });

    const googleSheets = require('../src/config/googleSheets');
    await assert.rejects(
      async () => { googleSheets.createGoogleSheetsClient(); },
      (err) => err instanceof IsolationViolationError && err.kind === 'sheets_client'
    );

    const telegramClient = require('../src/modules/telegram/telegram-client.service');
    await assert.rejects(
      () => telegramClient.sendTextMessage(123, 'hi'),
      (err) => err instanceof IsolationViolationError && err.kind === 'telegram_client'
    );

    await assert.rejects(
      () => global.fetch('https://api.telegram.org/bot123/sendMessage', { method: 'POST', body: '{}' }),
      (err) => err instanceof IsolationViolationError && err.kind === 'telegram_network'
    );

    await assert.rejects(
      () => global.fetch('https://example.com/leak', { method: 'GET' }),
      (err) => err instanceof IsolationViolationError && err.kind === 'blocked_network'
    );

    assert.ok(iso.spy.sheetsCalls.length >= 1);
    assert.ok(iso.spy.telegramCalls.length >= 2);
    assert.ok(iso.spy.blockedNetworkCalls.length >= 1);
    pass('isolation-spies-fail-on-sheets-telegram-network', `sheets=${iso.spy.sheetsCalls.length}, tg=${iso.spy.telegramCalls.length}, net=${iso.spy.blockedNetworkCalls.length}`);
  }

  // 8. Verify leak detector catches all 9 known filter-miss sentences even if model outputs rights=false
  {
    assert.equal(KNOWN_FILTER_MISS_SENTENCES.length, 9);
    for (const sentence of KNOWN_FILTER_MISS_SENTENCES) {
      const check = detectLegalLeakInFinalAnswer(sentence);
      assert.equal(check.leak, true, `Leak detector missed: ${sentence}`);
    }
    const tmpOut = path.join(os.tmpdir(), `gringo-fmiss-${Date.now()}.json`);
    const tmpLedger = path.join(os.tmpdir(), `gringo-fmiss-${Date.now()}.jsonl`);
    const res = runChild([
      'eval/run-eval.js',
      '--dry-run',
      '--repeats=1',
      '--stub-mode=filter_miss_test',
      `--out=${tmpOut}`,
      `--ledger=${tmpLedger}`,
    ]);
    assert.equal(res.status, 0);
    const out = JSON.parse(fs.readFileSync(tmpOut, 'utf8'));
    const missRows = out.results.filter((r) => r.subType.startsWith('known_filter_miss_'));
    assert.equal(missRows.length, 9);
    // All 9 are either caught by code/gate before model OR detected as legalLeak by our scorer (0 silent misses!)
    const silentMisses = missRows.filter((r) => r.status === 'AI_PROVIDER' && !r.legalLeak);
    assert.equal(silentMisses.length, 0, 'No filter miss sentence may slip past leak detector');
    const caughtByLeakDetector = missRows.filter((r) => r.legalLeak).length;
    pass('known-9-filter-misses-detected', `missRows=9, flaggedByLeakDetector=${caughtByLeakDetector}, blockedAtInputGate=${9 - caughtByLeakDetector}, silentMisses=0`);
  }


  // 9. Staged --max-calls=20 is a per-run hard stop; $1.35 cap is cumulative across ledger resumes
  {
    const ledgerTmp = path.join(os.tmpdir(), `gringo-staged-resume-${Date.now()}.jsonl`);
    const tinyBody = { model: 'gpt-4.1-mini', max_output_tokens: 350, input: [] };
    const guard1 = createBudgetGuard({
      maxCalls: 20,
      maxBudgetUsd: 1.35,
      ledgerPath: ledgerTmp,
      resumeLedger: true,
    });
    for (let i = 0; i < 20; i += 1) {
      const pre = guard1.preflightOrThrow(tinyBody, { itemId: `S1-${i}`, pass: 1, lang: 'en' });
      guard1.recordResponse(pre, { status: 200, usage: { input_tokens: 580, output_tokens: 38 } });
    }
    assert.throws(
      () => guard1.preflightOrThrow(tinyBody, {}),
      (err) => err instanceof EvalBudgetCapError && err.reason === 'hard_call_cap_reached'
    );
    assert.equal(guard1.callsMade, 20);
    const costAfterStage1 = guard1.cumulativeActualCostUsd;
    assert.ok(costAfterStage1 < 1.35, 'Stage-1 spend must stay under $1.35');

    const guard2 = createBudgetGuard({
      maxCalls: 20,
      maxBudgetUsd: 1.35,
      ledgerPath: ledgerTmp,
      resumeLedger: true,
    });
    assert.equal(guard2.priorCalls, 20);
    assert.ok(Math.abs(guard2.priorCostUsd - costAfterStage1) < 1e-9);
    const pre2 = guard2.preflightOrThrow(tinyBody, { itemId: 'S2-1', pass: 1, lang: 'he' });
    assert.equal(pre2.callIndex, 21);
    assert.equal(pre2.runCallIndex, 1);
    guard2.recordResponse(pre2, { status: 200, usage: { input_tokens: 580, output_tokens: 38 } });
    assert.equal(guard2.callsMade, 1, 'maxCalls=20 applies only to this run, not prior ledger calls');
    assert.ok(guard2.cumulativeActualCostUsd > costAfterStage1);
    assert.ok(guard2.cumulativeActualCostUsd <= 1.35);
    pass('staged-20-cap-and-resume-ledger', `stage1=20 calls $${costAfterStage1.toFixed(6)}; stage2 added global call 21, cumulative $${guard2.cumulativeActualCostUsd.toFixed(6)}`);
  }

  await addExtraDryChecks({ pass, results });

  console.log('\nALL_DRY_CHECKS_PASSED:', results.length);
})();
