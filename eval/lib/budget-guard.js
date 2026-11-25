const fs = require('fs');
const path = require('path');
const { estimateInputTokens, TOKEN_SAFETY_MARGIN, PER_MESSAGE_OVERHEAD_TOKENS, REQUEST_FRAMING_OVERHEAD_TOKENS, ENCODING_NAME } = require('./tokenizer');
const { scrubString, scrubValue } = require('./scrub');

const DEFAULT_MAX_CALLS = 1536;
const DEFAULT_MAX_BUDGET_USD = 1.35;
const DEFAULT_STAGE_BUDGET_USD = 0.05;
const MAX_OUTPUT_TOKENS_ALLOWED = 350;

// The OpenAI project / account budget is NOT a stop mechanism for this eval.
// Only this local guard (per-stage cap, cumulative $1.35, and max-calls) may
// stop a run. A project limit in the OpenAI dashboard must not be relied on.
const OPENAI_PROJECT_BUDGET_IS_NOT_A_STOP_MECHANISM = true;

// Checked Nov 24, 2026 on openai.com/api/pricing (Standard tier per 1M tokens)
const MODEL_PRICING_PER_M = Object.freeze({
  'gpt-4.1-mini': { input: 0.40, output: 1.60 },
});

class EvalConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EvalConfigError';
  }
}

class EvalBudgetCapError extends Error {
  constructor(message, reason) {
    super(message);
    this.name = 'EvalBudgetCapError';
    this.reason = reason;
  }
}

class EvalQuotaStopError extends Error {
  constructor(message, reason, status) {
    super(message);
    this.name = 'EvalQuotaStopError';
    this.reason = reason;
    this.status = status;
  }
}

function validateEvalApiKey(sourceEnv = process.env, { requireKey = true } = {}) {
  const evalKey = typeof sourceEnv.OPENAI_API_KEY_EVAL === 'string' ? sourceEnv.OPENAI_API_KEY_EVAL.trim() : '';
  const prodOpenAiKey = typeof sourceEnv.OPENAI_API_KEY === 'string' ? sourceEnv.OPENAI_API_KEY.trim() : '';
  const prodAiKey = typeof sourceEnv.AI_API_KEY === 'string' ? sourceEnv.AI_API_KEY.trim() : '';

  if (requireKey && !evalKey) {
    throw new EvalConfigError('Refusing to start: OPENAI_API_KEY_EVAL is missing. Never falls back to OPENAI_API_KEY or AI_API_KEY.');
  }
  if (evalKey && prodOpenAiKey && evalKey === prodOpenAiKey) {
    throw new EvalConfigError('Refusing to start: OPENAI_API_KEY_EVAL matches OPENAI_API_KEY (production key isolation violated).');
  }
  if (evalKey && prodAiKey && evalKey === prodAiKey) {
    throw new EvalConfigError('Refusing to start: OPENAI_API_KEY_EVAL matches AI_API_KEY (production key isolation violated).');
  }
  return evalKey;
}

function pricingForModel(model, overridePricing = null) {
  if (overridePricing && typeof overridePricing.input === 'number' && typeof overridePricing.output === 'number') {
    return overridePricing;
  }
  const key = String(model || 'gpt-4.1-mini').trim();
  return MODEL_PRICING_PER_M[key] || MODEL_PRICING_PER_M['gpt-4.1-mini'];
}

function parseRequestBody(requestBody) {
  if (requestBody && typeof requestBody === 'object' && !Buffer.isBuffer(requestBody)) {
    return { parsed: requestBody, parseError: false };
  }
  try {
    return { parsed: JSON.parse(String(requestBody || '{}')), parseError: false };
  } catch (_) {
    return { parsed: {}, parseError: true };
  }
}

function assertMaxOutputTokens(requestBody) {
  const { parsed, parseError } = parseRequestBody(requestBody);
  if (parseError) {
    throw new EvalConfigError('Refusing to send: outgoing request body is not valid JSON, so max_output_tokens cannot be asserted.');
  }
  if (parsed.max_output_tokens == null) {
    throw new EvalConfigError('Refusing to send: request body is missing max_output_tokens.');
  }
  const maxOutputTokens = Number(parsed.max_output_tokens);
  if (!Number.isFinite(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > MAX_OUTPUT_TOKENS_ALLOWED) {
    throw new EvalConfigError(
      `Refusing to send: max_output_tokens=${String(parsed.max_output_tokens)} is not <= ${MAX_OUTPUT_TOKENS_ALLOWED}.`
    );
  }
  return maxOutputTokens;
}

function estimateWorstCaseCall({ requestBody = {}, pricing }) {
  const maxOutputTokens = assertMaxOutputTokens(requestBody);
  const tokenEstimate = estimateInputTokens(requestBody);
  const estimatedInputTokens = tokenEstimate.estimatedInputTokens;
  const worstCaseCostUsd =
    (estimatedInputTokens * pricing.input) / 1_000_000 +
    (maxOutputTokens * pricing.output) / 1_000_000;
  return {
    encoding: ENCODING_NAME,
    rawInputTokens: tokenEstimate.rawTokens,
    safetyMargin: tokenEstimate.safetyMargin,
    perMessageOverheadTokens: tokenEstimate.perMessageOverheadTokens,
    requestFramingOverheadTokens: tokenEstimate.requestFramingOverheadTokens,
    estimatedInputTokens,
    maxOutputTokens,
    worstCaseCostUsd,
  };
}

function loadLedgerState(ledgerPath) {
  if (!ledgerPath || !fs.existsSync(ledgerPath)) {
    return { priorEntries: [], priorCalls: 0, priorCostUsd: 0, priorInputTokens: 0, priorOutputTokens: 0 };
  }
  const lines = fs.readFileSync(ledgerPath, 'utf8').split('\n').filter(Boolean);
  const priorEntries = lines.map((line) => JSON.parse(line));
  return {
    priorEntries,
    priorCalls: priorEntries.length,
    priorCostUsd: priorEntries.reduce((sum, entry) => sum + Number(entry.actualCostUsd || 0), 0),
    priorInputTokens: priorEntries.reduce((sum, entry) => sum + Number(entry.inputTokens || 0), 0),
    priorOutputTokens: priorEntries.reduce((sum, entry) => sum + Number(entry.outputTokens || 0), 0),
  };
}

function createBudgetGuard({
  maxCalls = DEFAULT_MAX_CALLS,
  maxBudgetUsd = DEFAULT_MAX_BUDGET_USD,
  stageBudgetUsd = null,
  ledgerPath,
  model = 'gpt-4.1-mini',
  overridePricing = null,
  resumeLedger = false,
} = {}) {
  let priorCalls = 0;
  let priorCostUsd = 0;
  let priorInputTokens = 0;
  let priorOutputTokens = 0;
  if (ledgerPath) {
    fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
    if (resumeLedger && fs.existsSync(ledgerPath)) {
      const loaded = loadLedgerState(ledgerPath);
      priorCalls = loaded.priorCalls;
      priorCostUsd = loaded.priorCostUsd;
      priorInputTokens = loaded.priorInputTokens;
      priorOutputTokens = loaded.priorOutputTokens;
    } else {
      fs.writeFileSync(ledgerPath, '', 'utf8');
    }
  }

  const pricing = pricingForModel(model, overridePricing);
  // callsMade counts only this run. maxCalls is a hard stop for this run.
  // cumulativeActualCostUsd starts from any prior ledger spend so later stages
  // count toward the same $1.35 cap.
  let callsMade = 0;
  let cumulativeActualCostUsd = priorCostUsd;
  let stageActualCostUsd = 0;
  let totalInputTokens = priorInputTokens;
  let totalOutputTokens = priorOutputTokens;
  let stoppedReason = '';
  const entries = [];
  const stageCap = (stageBudgetUsd == null || stageBudgetUsd === false) ? null : Number(stageBudgetUsd);

  function writeLedgerEntry(entry) {
    entries.push(entry);
    if (ledgerPath) {
      fs.appendFileSync(ledgerPath, JSON.stringify(entry) + '\n', 'utf8');
    }
  }

  function preflightOrThrow(requestBody, meta = {}) {
    if (stoppedReason) {
      throw new EvalBudgetCapError(`Run already stopped (${stoppedReason}).`, stoppedReason);
    }
    if (callsMade >= maxCalls) {
      stoppedReason = 'hard_call_cap_reached';
      throw new EvalBudgetCapError(
        `Stopping before call ${priorCalls + callsMade + 1}: hard cap of ${maxCalls} calls for this run reached (prior ledger calls: ${priorCalls}).`,
        stoppedReason
      );
    }
    // Assert max_output_tokens before any estimate or send.
    assertMaxOutputTokens(requestBody);
    const estimate = estimateWorstCaseCall({ requestBody, pricing });
    if (stageCap != null && stageActualCostUsd + estimate.worstCaseCostUsd > stageCap) {
      stoppedReason = 'stage_budget_cap_reached';
      throw new EvalBudgetCapError(
        `Stopping before call ${callsMade + 1}: stage spend $${stageActualCostUsd.toFixed(6)} + worst-case $${estimate.worstCaseCostUsd.toFixed(6)} exceeds stage cap $${stageCap.toFixed(2)}.`,
        stoppedReason
      );
    }
    if (cumulativeActualCostUsd + estimate.worstCaseCostUsd > maxBudgetUsd) {
      stoppedReason = 'budget_cap_reached';
      throw new EvalBudgetCapError(
        `Stopping before call ${callsMade + 1}: cumulative $${cumulativeActualCostUsd.toFixed(6)} + worst-case $${estimate.worstCaseCostUsd.toFixed(6)} exceeds $${maxBudgetUsd.toFixed(2)}.`,
        stoppedReason
      );
    }
    callsMade += 1;
    return {
      callIndex: priorCalls + callsMade,
      runCallIndex: callsMade,
      estimate,
      meta,
    };
  }

  function recordResponse(preflight, { status, usage, errorCode = '', errorMessage = '', meta = {} }) {
    const isQuotaOr429 =
      status === 429 ||
      errorCode === 'insufficient_quota' ||
      /insufficient_quota|exceeded your current quota/i.test(String(errorMessage || ''));

    const inputTokens = Number(usage?.input_tokens ?? usage?.prompt_tokens ?? 0);
    const outputTokens = Number(usage?.output_tokens ?? usage?.completion_tokens ?? 0);

    // If HTTP 200 returned without usage, charge conservative worst-case estimate so we never undercount.
    const billedInput = status === 200 && !usage ? preflight.estimate.estimatedInputTokens : inputTokens;
    const billedOutput = status === 200 && !usage ? preflight.estimate.maxOutputTokens : outputTokens;
    // Round to 6 decimals before accumulating so a resumed ledger sums to the same total.
    const actualCostUsd = Number((
      (billedInput * pricing.input) / 1_000_000 +
      (billedOutput * pricing.output) / 1_000_000
    ).toFixed(6));

    totalInputTokens += billedInput;
    totalOutputTokens += billedOutput;
    cumulativeActualCostUsd += actualCostUsd;
    stageActualCostUsd += actualCostUsd;

    const entry = scrubValue({
      callIndex: preflight.callIndex,
      runCallIndex: preflight.runCallIndex,
      timestamp: new Date().toISOString(),
      itemId: meta.itemId || preflight.meta?.itemId || '',
      pass: meta.pass ?? preflight.meta?.pass ?? 0,
      lang: meta.lang || preflight.meta?.lang || '',
      model,
      encoding: preflight.estimate.encoding || ENCODING_NAME,
      estimatedInputTokens: preflight.estimate.estimatedInputTokens,
      rawInputTokens: preflight.estimate.rawInputTokens,
      httpStatus: status,
      worstCaseEstimatedCostUsd: Number(preflight.estimate.worstCaseCostUsd.toFixed(6)),
      inputTokens: billedInput,
      outputTokens: billedOutput,
      totalTokens: billedInput + billedOutput,
      actualCostUsd: Number(actualCostUsd.toFixed(6)),
      stageCostUsd: Number(stageActualCostUsd.toFixed(6)),
      cumulativeCostUsd: Number(cumulativeActualCostUsd.toFixed(6)),
      errorCode: errorCode || '',
      errorMessage: scrubString(errorMessage || ''),
    });
    writeLedgerEntry(entry);

    if (isQuotaOr429) {
      stoppedReason = errorCode === 'insufficient_quota' || /insufficient_quota/i.test(String(errorMessage || ''))
        ? 'insufficient_quota'
        : 'http_429_rate_limit';
      throw new EvalQuotaStopError(
        `Stopped immediately on ${stoppedReason} (HTTP ${status}) at call #${preflight.callIndex}: ${scrubString(errorMessage || 'rate/quota limit')}`,
        stoppedReason,
        status
      );
    }

    return entry;
  }

  function summary() {
    return {
      model,
      pricingPerM: pricing,
      maxCalls,
      maxBudgetUsd,
      stageBudgetUsd: stageCap,
      stageActualCostUsd: Number(stageActualCostUsd.toFixed(6)),
      tokenizer: {
        encoding: ENCODING_NAME,
        safetyMargin: TOKEN_SAFETY_MARGIN,
        perMessageOverheadTokens: PER_MESSAGE_OVERHEAD_TOKENS,
        requestFramingOverheadTokens: REQUEST_FRAMING_OVERHEAD_TOKENS,
      },
      openaiProjectBudgetIsNotAStopMechanism: OPENAI_PROJECT_BUDGET_IS_NOT_A_STOP_MECHANISM,
      resumeLedger: Boolean(resumeLedger && priorCalls > 0),
      priorCalls,
      priorCostUsd: Number(priorCostUsd.toFixed(6)),
      callsMadeThisRun: callsMade,
      callsMade,
      totalInputTokens,
      totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
      cumulativeActualCostUsd: Number(cumulativeActualCostUsd.toFixed(6)),
      stoppedReason: stoppedReason || null,
      ledgerCount: priorCalls + entries.length,
      ledgerEntriesThisRun: entries.length,
    };
  }

  function entriesThisRun() {
    return entries.slice();
  }

  function entriesForItem(itemId) {
    return entries.filter((entry) => entry.itemId === itemId);
  }

  return {
    preflightOrThrow,
    recordResponse,
    summary,
    entriesThisRun,
    entriesForItem,
    get callsMade() { return callsMade; },
    get priorCalls() { return priorCalls; },
    get priorCostUsd() { return priorCostUsd; },
    get cumulativeActualCostUsd() { return cumulativeActualCostUsd; },
    get stoppedReason() { return stoppedReason; },
  };
}

module.exports = {
  DEFAULT_MAX_CALLS,
  DEFAULT_MAX_BUDGET_USD,
  DEFAULT_STAGE_BUDGET_USD,
  MAX_OUTPUT_TOKENS_ALLOWED,
  OPENAI_PROJECT_BUDGET_IS_NOT_A_STOP_MECHANISM,
  MODEL_PRICING_PER_M,
  EvalConfigError,
  EvalBudgetCapError,
  EvalQuotaStopError,
  validateEvalApiKey,
  pricingForModel,
  parseRequestBody,
  assertMaxOutputTokens,
  estimateWorstCaseCall,
  loadLedgerState,
  createBudgetGuard,
};
