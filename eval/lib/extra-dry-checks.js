'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  createBudgetGuard,
  assertMaxOutputTokens,
  estimateWorstCaseCall,
  EvalConfigError,
  EvalBudgetCapError,
  EvalQuotaStopError,
} = require('./budget-guard');
const { estimateInputTokens, ENCODING_NAME, countTokens } = require('./tokenizer');
const { installIsolation, IsolationViolationError } = require('./isolation');
const { ConcurrencyError } = require('./call-lock');
const { scrubString, scrubJson } = require('./scrub');
const { verifyFreezeChecksums, sha256File, FreezeChecksumError } = require('./freeze-verify');
const { detectIndependentLegalLeak } = require('./independent-leak-detector');
const { buildIsolatedEnv } = require('../run-isolated');
const { pricingForModel } = require('./budget-guard');

function addExtraDryChecks({ pass }) {
  // 10. Tokenizer is o200k_base with a safety margin, not a char/3 estimate.
  {
    const sample = { model: 'gpt-4.1-mini', max_output_tokens: 350, input: [{ role: 'user', content: [{ type: 'input_text', text: 'How do I get to the train station in Haifa?' }] }], text: { format: { type: 'json_schema', name: 'gringo_domain_reply', schema: { type: 'object' } } } };
    const serialized = JSON.stringify(sample);
    const tokenEstimate = estimateInputTokens(sample);
    const charGuess = Math.max(800, Math.ceil(serialized.length / 3) + 250);
    assert.equal(tokenEstimate.encoding, ENCODING_NAME);
    assert.equal(ENCODING_NAME, 'o200k_base');
    assert.ok(tokenEstimate.rawTokens > 0);
    assert.ok(tokenEstimate.estimatedInputTokens >= Math.ceil(tokenEstimate.rawTokens * 1.15) + 24);
    assert.notEqual(tokenEstimate.estimatedInputTokens, charGuess);
    assert.equal(countTokens('hello world'), 2);
    pass('tokenizer-o200k-with-margin', `raw=${tokenEstimate.rawTokens}, estimated=${tokenEstimate.estimatedInputTokens}, oldCharGuess=${charGuess}`);
  }

  // 11. max_output_tokens must be present and <= 350 or the send is refused.
  {
    const pricing = pricingForModel('gpt-4.1-mini');
    assert.throws(() => assertMaxOutputTokens({ model: 'gpt-4.1-mini', input: [] }), (err) => err instanceof EvalConfigError);
    assert.throws(
      () => estimateWorstCaseCall({ requestBody: { model: 'gpt-4.1-mini', max_output_tokens: 351, input: [] }, pricing }),
      (err) => err instanceof EvalConfigError && /max_output_tokens/.test(err.message)
    );
    const ok = assertMaxOutputTokens({ model: 'gpt-4.1-mini', max_output_tokens: 350, input: [] });
    assert.equal(ok, 350);
    pass('max-output-tokens-assert', 'missing and 351 refused; 350 accepted');
  }

  // 12. Stage cap $0.05 is a hard stop, independent of the $1.35 cumulative cap.
  {
    const guard = createBudgetGuard({
      maxCalls: 20,
      maxBudgetUsd: 1.35,
      stageBudgetUsd: 0.05,
      overridePricing: { input: 100, output: 100 },
    });
    const body = { model: 'gpt-4.1-mini', max_output_tokens: 350, input: [{ role: 'user', content: [{ type: 'input_text', text: 'x'.repeat(200) }] }] };
    let stopped = false;
    let calls = 0;
    try {
      for (let i = 0; i < 20; i += 1) {
        const pre = guard.preflightOrThrow(body, { itemId: `ST-${i}` });
        guard.recordResponse(pre, { status: 200, usage: { input_tokens: pre.estimate.estimatedInputTokens, output_tokens: 350 } });
        calls += 1;
      }
    } catch (err) {
      assert.ok(err instanceof EvalBudgetCapError && err.reason === 'stage_budget_cap_reached');
      stopped = true;
    }
    assert.ok(stopped, 'stage cap must stop the run');
    assert.ok(calls < 20);
    assert.ok(guard.summary().stageActualCostUsd <= 0.05 || guard.stoppedReason === 'stage_budget_cap_reached');
    assert.ok(guard.cumulativeActualCostUsd < 1.35);
    pass('stage-budget-cap-0.05', `stopped after ${calls} calls, stage=$${guard.summary().stageActualCostUsd}`);
  }

  // 13. No automatic retries: 500, 429, and timeout each produce exactly 1 attempt.
  async function oneAttemptCase(name, stubFn) {
    const guard = createBudgetGuard({ maxCalls: 5, maxBudgetUsd: 1.35, stageBudgetUsd: 0.05 });
    const iso = installIsolation({
      dryRun: true,
      budgetGuard: guard,
      stubOpenAiHandler: stubFn,
    });
    const body = JSON.stringify({ model: 'gpt-4.1-mini', max_output_tokens: 350, input: [] });
    try {
      await global.fetch('https://api.openai.com/v1/responses', { method: 'POST', body });
    } catch (_) {
      // 429 / timeout may throw; that is still one attempt.
    }
    assert.equal(iso.spy.fetchAttempts.length, 1, `${name} attempts=${iso.spy.fetchAttempts.length}`);
    return iso.spy.fetchAttempts.length;
  }

  return Promise.resolve()
    .then(async () => {
      const a500 = await oneAttemptCase('http-500', async () => ({ ok: false, status: 500, json: async () => ({ error: { message: 'server' } }) }));
      const a429 = await oneAttemptCase('http-429', async () => ({ ok: false, status: 429, json: async () => ({ error: { code: 'insufficient_quota', message: 'quota' } }) }));
      const aTimeout = await oneAttemptCase('timeout', async () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        throw err;
      });
      pass('no-retry-single-attempt', `500=${a500}, 429=${a429}, timeout=${aTimeout} (each exactly 1)`);
    })
    .then(async () => {
      // 14. Concurrency lock: a second in-flight call is refused; maxObserved stays 1.
      const guard = createBudgetGuard({ maxCalls: 5, maxBudgetUsd: 1.35, stageBudgetUsd: 0.05 });
      let releaseHang;
      const hang = new Promise((resolve) => { releaseHang = resolve; });
      const iso = installIsolation({
        dryRun: true,
        budgetGuard: guard,
        stubOpenAiHandler: async () => {
          await hang;
          return { ok: true, status: 200, json: async () => ({ output_text: '{}', usage: { input_tokens: 1, output_tokens: 1 } }) };
        },
      });
      const body = JSON.stringify({ model: 'gpt-4.1-mini', max_output_tokens: 350, input: [] });
      const first = global.fetch('https://api.openai.com/v1/responses', { method: 'POST', body });
      const started = Date.now();
      while (iso.callLock.inFlight !== 1 && Date.now() - started < 1000) {
        await new Promise((r) => setTimeout(r, 5));
      }
      assert.equal(iso.callLock.inFlight, 1);
      await assert.rejects(
        () => global.fetch('https://api.openai.com/v1/responses', { method: 'POST', body }),
        (err) => err instanceof ConcurrencyError || (err && err.kind === 'concurrency_violation')
      );
      releaseHang();
      await first;
      assert.equal(iso.callLock.maxObserved, 1);
      iso.callLock.assertSerial();
      pass('concurrency-lock-serial', `maxObserved=${iso.callLock.maxObserved}, acquires=${iso.callLock.totalAcquires}`);
    })
    .then(() => {
      // 15. Key scrubbing: a fake key is never written to ledger, results, or errors.
      const fake = 'sk-eval-FAKE-SCRUB-ONLY-NOT-A-REAL-KEY-7a1c';
      const prev = process.env.OPENAI_API_KEY_EVAL;
      process.env.OPENAI_API_KEY_EVAL = fake;
      try {
        const tmpLedger = path.join(os.tmpdir(), `gringo-scrub-${Date.now()}.jsonl`);
        const guard = createBudgetGuard({ maxCalls: 2, maxBudgetUsd: 1.35, ledgerPath: tmpLedger });
        const body = { model: 'gpt-4.1-mini', max_output_tokens: 350, input: [] };
        const pre = guard.preflightOrThrow(body, { itemId: 'SCRUB-1' });
        guard.recordResponse(pre, { status: 200, usage: { input_tokens: 10, output_tokens: 1 }, errorMessage: `failed for ${fake}` });
        const ledger = fs.readFileSync(tmpLedger, 'utf8');
        assert.equal(ledger.includes(fake), false, 'ledger leaked the fake key');
        assert.ok(ledger.includes('[REDACTED]'));
        const dumped = scrubJson({ message: `Authorization Bearer ${fake}`, nested: { OPENAI_API_KEY_EVAL: fake } });
        assert.equal(dumped.includes(fake), false);
        const msg = scrubString(`Eval failed: ${fake}`);
        assert.equal(msg.includes(fake), false);
        const tmpOut = path.join(os.tmpdir(), `gringo-scrub-${Date.now()}.json`);
        fs.writeFileSync(tmpOut, dumped);
        const outText = fs.readFileSync(tmpOut, 'utf8');
        assert.equal(outText.includes(fake), false, 'result JSON leaked the fake key');
        pass('key-scrubbing-fake-key-absent', 'ledger/errors/JSON scrubbed; in-process scan found 0 matches');
      } finally {
        if (prev == null) delete process.env.OPENAI_API_KEY_EVAL;
        else process.env.OPENAI_API_KEY_EVAL = prev;
      }
    })
    .then(() => {
      // 16. Checksum refusal: a changed frozen file is rejected.
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gringo-freeze-'));
      const liveRoot = path.join(dir, 'live');
      fs.mkdirSync(path.join(liveRoot, 'eval'), { recursive: true });
      const filePath = path.join(liveRoot, 'eval', 'run-config.json');
      fs.writeFileSync(filePath, '{}\n');
      const hash = sha256File(filePath);
      const sumsPath = path.join(dir, 'SHA256SUMS');
      fs.writeFileSync(sumsPath, `${hash}  eval/run-config.json\n`);
      const ok = verifyFreezeChecksums({ sumsPath, rootDir: liveRoot });
      assert.equal(ok.checked, 1);
      fs.writeFileSync(filePath, '{"changed":true}\n');
      assert.throws(
        () => verifyFreezeChecksums({ sumsPath, rootDir: liveRoot }),
        (err) => err instanceof FreezeChecksumError
      );
      pass('checksum-refusal-on-change', 'unchanged accepted, edited file refused');
    })
    .then(() => {
      // 17. Isolation: filtered env keeps only the eval key; production keys are dropped.
      const isolated = buildIsolatedEnv({
        PATH: '/usr/bin',
        HOME: '/tmp',
        OPENAI_API_KEY_EVAL: 'sk-eval-FAKE-ISOLATED-ENV-CHECK',
        OPENAI_API_KEY: 'sk-prod-must-not-be-forwarded',
        AI_API_KEY: 'sk-ai-must-not-be-forwarded',
        GITHUB_TOKEN: 'ghs-must-not-be-forwarded',
        SSH_AUTH_SOCK: '/tmp/ssh',
      });
      assert.equal(isolated.OPENAI_API_KEY_EVAL, 'sk-eval-FAKE-ISOLATED-ENV-CHECK');
      assert.equal(isolated.OPENAI_API_KEY, undefined);
      assert.equal(isolated.AI_API_KEY, undefined);
      assert.equal(isolated.GITHUB_TOKEN, undefined);
      assert.equal(isolated.SSH_AUTH_SOCK, undefined);
      assert.equal(isolated.PATH, '/usr/bin');

      const evalDir = path.join(__dirname, '..');
      const mode = fs.statSync(evalDir).mode & 0o777;
      // 700 is applied best-effort; assert owner rwx at minimum.
      assert.ok((mode & 0o700) === 0o700, `eval dir mode ${mode.toString(8)} should include 700 owner bits`);
      pass('isolation-filtered-env-and-perms', `env keys=${Object.keys(isolated).join(',')}, evalMode=${mode.toString(8)}`);
    })
    .then(() => {
      // Independent detector does not import the filter under test and flags a statutory claim.
      const src = fs.readFileSync(path.join(__dirname, 'independent-leak-detector.js'), 'utf8');
      assert.equal(/require\([^)]*legal-question-guard/.test(src), false);
      assert.equal(/require\([^)]*leak-detector/.test(src), false);
      const hit = detectIndependentLegalLeak('By law your employer must pay overtime of 125% after eight hours.', { lang: 'en' });
      assert.equal(hit.leak, true);
      const clean = detectIndependentLegalLeak('The train to Haifa leaves from the downtown station.', { lang: 'en' });
      assert.equal(clean.leak, false);
      pass('independent-leak-detector-separate', `claims=${hit.claims.join(',')}`);
    });
}

module.exports = { addExtraDryChecks };
