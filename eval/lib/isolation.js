const os = require('os');
const fs = require('fs');
const path = require('path');
const { validateEvalApiKey, assertMaxOutputTokens, EvalConfigError } = require('./budget-guard');
const { createCallLock, ConcurrencyError } = require('./call-lock');
const { scrubString, installConsoleScrubbing } = require('./scrub');

class IsolationViolationError extends Error {
  constructor(message, kind) {
    super(message);
    this.name = 'IsolationViolationError';
    this.kind = kind;
  }
}

function extractOpenAiTexts(opts) {
  try {
    const body = opts && opts.body ? JSON.parse(opts.body) : {};
    const texts = [];
    for (const item of (body.input || [])) {
      const content = item && item.content;
      if (Array.isArray(content)) {
        for (const part of content) {
          if (part && part.text) texts.push(String(part.text));
        }
      } else if (typeof content === 'string') {
        texts.push(content);
      }
    }
    return {
      texts,
      developerText: texts[0] || '',
      userText: texts.slice(1).join('\n'),
      model: body.model || '',
      maxOutputTokens: body.max_output_tokens || 350,
    };
  } catch (_) {
    return { texts: [], developerText: '', userText: '', model: '', maxOutputTokens: 350, parseError: true };
  }
}

function installIsolation({
  dryRun = false,
  budgetGuard,
  stubOpenAiHandler = null,
  model = 'gpt-4.1-mini',
} = {}) {
  const evalKey = validateEvalApiKey(process.env, { requireKey: !dryRun });
  installConsoleScrubbing();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gringo-eval-'));
  const callLock = createCallLock();

  // Remove any fallback production OpenAI/AI key from the isolated child env.
  delete process.env.OPENAI_API_KEY;
  delete process.env.AI_API_KEY;

  Object.assign(process.env, {
    NODE_ENV: 'test',
    ALLOW_DEV_ADMIN_KEY: 'true',
    GRINGO_PRIVACY_CONSENT_GATE: 'on',
    TELEGRAM_BOT_ENABLED: 'true',
    TELEGRAM_BOT_MODE: 'polling',
    TELEGRAM_BOT_TOKEN: '000000:ISOLATED_EVAL_FAKE_TOKEN',
    AI_PROVIDER: 'openai',
    AI_MODEL: model,
    AI_API_KEY: dryRun ? 'ISOLATED_DRY_RUN_STUB_KEY' : evalKey,
    AI_ENABLED: 'true',
    AI_DAILY_USER_LIMIT: '100000',
    AI_DAILY_GLOBAL_LIMIT: '100000',
    AI_DAILY_TOKEN_LIMIT: '100000000',
    TRANSLATION_PROVIDER: '',
    TRANSLATION_API_KEY: '',
    GOOGLE_SHEETS_SPREADSHEET_ID: '',
    GOOGLE_SHEETS_CLIENT_EMAIL: '',
    GOOGLE_SHEETS_PRIVATE_KEY: '',
    TELEGRAM_STATE_FILE: path.join(tmpDir, 'tg.json'),
    AI_BUDGET_STATE_FILE: path.join(tmpDir, 'budget.json'),
    TRANSLATION_SETTINGS_FILE: path.join(tmpDir, 'tr.json'),
    GRINGO_PROCESS_LOCK_FILE: path.join(tmpDir, 'lock'),
    LINE_ENABLED: 'false',
    WHATSAPP_ENABLED: 'false',
    // Disable any SDK / provider retry knobs that might be honored later.
    AI_MAX_RETRIES: '0',
    OPENAI_MAX_RETRIES: '0',
    OPENAI_RETRY: '0',
  });

  const spy = {
    sheetsCalls: [],
    telegramCalls: [],
    blockedNetworkCalls: [],
    openaiCalls: [],
    modelInputs: [],
    fetchAttempts: [],
    retryDisabled: true,
    violation: null,
  };

  let currentMeta = {};
  function setCurrentMeta(meta) {
    currentMeta = meta || {};
  }

  function recordViolation(kind, detail) {
    if (!spy.violation) {
      spy.violation = { kind, detail };
    }
    throw new IsolationViolationError(`Isolation violation (${kind}): ${detail}`, kind);
  }

  const originalFetch = global.fetch;
  // Single-attempt fetch wrapper: never retries 429, 5xx, or timeouts.
  global.fetch = async (url, opts = {}) => {
    const parsed = new URL(String(url));
    const host = parsed.hostname;

    if (host === 'api.telegram.org') {
      spy.telegramCalls.push({ host, path: parsed.pathname, itemId: currentMeta.itemId || '' });
      recordViolation('telegram_network', `${host}${parsed.pathname}`);
    }

    if (host !== 'api.openai.com') {
      spy.blockedNetworkCalls.push({ host, path: parsed.pathname, itemId: currentMeta.itemId || '' });
      recordViolation('blocked_network', `${host}${parsed.pathname}`);
    }

    if (parsed.pathname !== '/v1/responses') {
      spy.blockedNetworkCalls.push({ host, path: parsed.pathname, itemId: currentMeta.itemId || '' });
      recordViolation('unexpected_openai_path', `${host}${parsed.pathname}`);
    }

    return callLock.runExclusive(async () => {
      callLock.assertSerial();
      const extracted = extractOpenAiTexts(opts);
      const requestBody = opts && opts.body ? opts.body : '{}';
      assertMaxOutputTokens(requestBody);

      spy.fetchAttempts.push({
        itemId: currentMeta.itemId || '',
        pass: currentMeta.pass ?? 0,
        path: parsed.pathname,
      });

      const preflight = budgetGuard.preflightOrThrow(requestBody, currentMeta);

      spy.openaiCalls.push({
        callIndex: preflight.callIndex,
        itemId: currentMeta.itemId || '',
        pass: currentMeta.pass ?? 0,
        lang: currentMeta.lang || '',
        model: extracted.model,
        attempts: 1,
      });
      spy.modelInputs.push({
        itemId: currentMeta.itemId || '',
        pass: currentMeta.pass ?? 0,
        ...extracted,
      });

      if (dryRun) {
        if (typeof stubOpenAiHandler !== 'function') {
          throw new Error('Dry-run mode requires stubOpenAiHandler');
        }
        const stubRes = await stubOpenAiHandler(url, opts, extracted, currentMeta);
        const status = stubRes.status || (stubRes.ok === false ? 500 : 200);
        const body = await stubRes.json();
        budgetGuard.recordResponse(preflight, {
          status,
          usage: body.usage || null,
          errorCode: body.error?.code || body.error?.type || '',
          errorMessage: scrubString(body.error?.message || ''),
          meta: currentMeta,
        });
        return {
          ok: status >= 200 && status < 300,
          status,
          json: async () => body,
        };
      }

      // Live path: one attempt, no retry loop, key never copied into the spy.
      const response = await originalFetch(url, opts);
      const body = await response.json().catch(() => ({}));
      budgetGuard.recordResponse(preflight, {
        status: response.status,
        usage: body.usage || null,
        errorCode: body.error?.code || body.error?.type || '',
        errorMessage: scrubString(body.error?.message || ''),
        meta: currentMeta,
      });
      return {
        ok: response.ok,
        status: response.status,
        json: async () => body,
      };
    });
  };

  // Stub & spy googleapis BEFORE app modules load it.
  // Also let unconfigured repository guards fail fast at assertGoogleSheetsEnv(),
  // while ANY attempt to instantiate a Google Sheets client or auth client fails the run.
  const googleapis = require('googleapis');
  googleapis.google.sheets = (...args) => {
    spy.sheetsCalls.push({ api: 'googleapis.google.sheets', argCount: args.length, itemId: currentMeta.itemId || '' });
    recordViolation('sheets_client', 'googleapis.google.sheets()');
  };
  for (const authName of ['JWT', 'GoogleAuth']) {
    if (googleapis.google.auth[authName]) {
      googleapis.google.auth[authName] = function (...args) {
        spy.sheetsCalls.push({ api: `googleapis.google.auth.${authName}`, argCount: args.length, itemId: currentMeta.itemId || '' });
        recordViolation('sheets_auth', `googleapis.google.auth.${authName}()`);
      };
    }
  }

  const googleSheetsConfig = require('../../src/config/googleSheets');
  if (typeof googleSheetsConfig.createGoogleSheetsClient === 'function') {
    googleSheetsConfig.createGoogleSheetsClient = (...args) => {
      spy.sheetsCalls.push({ api: 'googleSheets.createGoogleSheetsClient', argCount: args.length, itemId: currentMeta.itemId || '' });
      recordViolation('sheets_client', 'googleSheets.createGoogleSheetsClient()');
    };
  }

  // Stub & spy src/modules/telegram/telegram-client.service.js exports.
  const telegramClient = require('../../src/modules/telegram/telegram-client.service');
  for (const fnName of Object.keys(telegramClient)) {
    if (typeof telegramClient[fnName] === 'function' && fnName !== 'getPollingStatus' && fnName !== 'stopPolling') {
      telegramClient[fnName] = async (...args) => {
        spy.telegramCalls.push({ api: `telegramClient.${fnName}`, argCount: args.length, itemId: currentMeta.itemId || '' });
        recordViolation('telegram_client', `telegramClient.${fnName}()`);
      };
    }
  }

  return {
    tmpDir,
    spy,
    setCurrentMeta,
    callLock,
  };
}

module.exports = {
  IsolationViolationError,
  ConcurrencyError,
  EvalConfigError,
  installIsolation,
  extractOpenAiTexts,
};
