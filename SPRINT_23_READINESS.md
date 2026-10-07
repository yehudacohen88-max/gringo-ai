# Sprint 23 Readiness

Readiness classification: READY WITH KNOWN LIMITATIONS

## Scope Completed

Sprint 23 language and translation scope is implemented and documented:

- Central language detection module.
- Persistent language profile fields.
- CRM language preference save, clear, and detected-language update methods.
- Core Agent language resolution using saved preferences, channel hints, text detection, and default fallback.
- Profile API language fields and Web Chat language selector.
- Central translation service foundation.
- Single OpenAI translation provider adapter.
- Incoming translation to English before intent routing.
- Outgoing translation from English before delivery.
- Translation cache.
- Translation metrics.
- Translation recovery.
- Admin translation overview.
- Admin translation settings controls.
- Sprint 23 production readiness test coverage.

## Tests Run

- `npm test`
- Bundled Node runtime with `node --test`
- Direct per-file Node test execution for every `test/*.test.js`
- `test/sprint23-production-readiness.test.js`
- Local HTTP checks against the already-running app on port `3002`
- Admin Translation UI DOM check in the in-app browser

## Test Results

`npm test` did not run because `npm` was not available in the current PATH.

`node --test` did not run as a suite in this environment because subprocess spawning returned `EPERM`.

Direct per-file execution with the bundled Node runtime:

- Passed files: 17
- Failed files: 4
- Reported tests: 149

Passing Sprint 23-focused files:

- `test/admin-translation-overview.test.js`
- `test/admin-translation-settings-ui.test.js`
- `test/chat-profile-language-api.test.js`
- `test/core-agent-incoming-translation.test.js`
- `test/core-agent-outgoing-translation.test.js`
- `test/language-detection.test.js`
- `test/openai-translation-provider.test.js`
- `test/sprint23-production-readiness.test.js`
- `test/translation-cache.test.js`
- `test/translation-metrics.test.js`
- `test/translation-recovery.test.js`
- `test/translation-service.test.js`
- `test/translation-settings.test.js`
- `test/user-language-preference-persistence.test.js`
- `test/user-profile-language-fields.test.js`
- `test/web-language-selector.test.js`

Failed or blocked files:

- `test/contacts.api.test.js`: blocked by missing `express` dependency in the current workspace.
- `test/workers.api.test.js`: blocked by missing `express` dependency in the current workspace.
- `test/core-agent-ai-provider.test.js`: failed in direct local execution because the mocked CRM profile does not provide a complete onboarding profile, causing a Google Sheets-backed profile update path to run without sheet credentials.
- `test/core-agent-language-integration.test.js`: one test failed because an empty message follows the onboarding path and does not reach the mocked AI provider context asserted by the test.

## Supported Languages

Validated with mocks and fixtures:

- English: `en`
- Hebrew: `he`
- Arabic: `ar`
- Thai: `th`
- Sinhala: `si`
- Hindi: `hi`
- Russian: `ru`
- Filipino/Tagalog: `tl`

Validation coverage:

- Detection or explicit alias resolution works for each supported language.
- Preferences can be normalized and persisted by CRM language tests.
- Incoming translation to English works for non-English languages through the central translation service.
- Outgoing translation from English works for non-English languages through the central translation service.
- English and same-language messages skip provider calls.
- Provider failure falls back to the original text and does not block processing.

Note: Tagalog uses Latin script, so script-only text detection resolves Latin text to English unless an explicit, profile, or channel language signal such as `tagalog`, `filipino`, or `tl` is provided.

## Channel Validation

Validated by code-backed tests and review:

- Web Chat uses the shared Core Agent path.
- Telegram, WhatsApp, and LINE pass normalized message context into the shared message-processing flow.
- Incoming translation is centralized in `src/modules/core-agent/core-agent.service.js`.
- Outgoing translation is centralized in `src/modules/core-agent/core-agent.service.js`.
- The Sprint 23 readiness test verifies provider calls are one per translated message in the central translation service.
- Existing command and structured payload protection is covered by outgoing translation tests for URLs, codes, money amounts, and dates.

Runtime checks:

- `http://127.0.0.1:3002/chat.html` returned `200`.
- `http://127.0.0.1:3002/admin.html` returned `200`.
- `http://127.0.0.1:3002/api/admin/dashboard` returned `200`.
- The Admin Translation settings section is present in the current browser DOM.

## Security and Privacy Checks

Confirmed:

- Metrics store counters and timing, not original or translated message content.
- Translation failures are classified into safe technical failure types.
- Provider error logging is disabled by default unless `TRANSLATION_LOG_FAILURES=true`.
- Translation Admin overview does not return API keys or message content.
- Translation Admin settings do not expose API keys and only allow non-secret settings.
- Invalid providers, unknown languages, invalid TTLs, and disabling English are rejected.
- Previous valid translation settings remain active after failed saves.
- Optional `dotenv` loading no longer crashes local fallback or tests when the package is missing.
- Optional Google Sheets client loading no longer crashes module import when the package is missing; configured Sheets usage still reports a clear dependency error.

Not confirmed in this environment:

- Full server restart with fresh dependencies, because `node_modules` is absent and `express` is unavailable from the current workspace.
- Real external provider calls, by design; tests use mocks and do not send production messages.

## Performance Checks

Confirmed:

- English messages skip translation provider calls.
- Same-language translations skip provider calls.
- Cache hits skip provider calls.
- Empty text is not cached and does not call the provider.
- Failed translations and provider errors are not cached.
- Language profile writes are covered by tests that verify no write occurs when values are unchanged.
- Translation metrics are in-memory aggregate counters and do not persist every message.
- Translation cache is an in-memory `Map` with TTL-based expiry on read.

## Known Limitations

- `npm` is unavailable in the current PATH, so `npm test` could not be executed directly.
- Node's built-in suite runner returned `EPERM` for subprocess spawning in this environment.
- `node_modules` is absent; API tests requiring `express` are blocked until dependencies are installed.
- The current app is running on port `3002`, but a fresh restart from source could not be confirmed without installed dependencies.
- Tagalog cannot be reliably detected by script alone because it commonly uses Latin characters.
- Translation cache and metrics are in-memory and reset on process restart.
- No production messages were sent to Web, Telegram, WhatsApp, or LINE as part of this review.

## Remaining Risks

- Full dependency-installed regression still needs to be run in an environment with `npm`, `express`, `dotenv`, and `googleapis` installed.
- Existing non-Sprint-23 API tests need a complete dependency environment before they can be treated as conclusive.
- Real translation provider behavior, latency, quotas, and rate limits need validation with non-production fixtures and real credentials in a safe environment.

## Beta Readiness Recommendation

READY WITH KNOWN LIMITATIONS

Reason:

- Sprint 23 language, translation, cache, metrics, recovery, and Admin control tests pass in isolated/mock validation.
- No Critical or High Sprint 23 production blocker was confirmed in the language/translation code path.
- The repository cannot be marked `READY FOR BETA` from this environment because the full automated suite and fresh server restart are blocked by missing local package tooling and dependencies.
