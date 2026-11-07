# Privacy retention — what erasure changes, and what it does not

Operational description for the Gringo pilot. This is **not** a legal determination and it does not certify compliance with any privacy law. A lawyer still has to review the notice (`PRIVACY_NOTICE_STATUS` stays `DRAFT_PENDING_LEGAL_REVIEW`).

Checked against public vendor docs on **2026-11-07**. Vendor periods can change. Gringo cannot see those systems, so it must not tell a person that a copy there is already gone.

## Disk files (`render.yaml`)

| File | Personal or linkable fields | What erasure does | What stays, and for how long |
| --- | --- | --- | --- |
| `AI_BUDGET_STATE_FILE` (`/var/data/ai-budget.json`) | `perUser` keys. Current writes are HMAC-SHA256 of `channel:channelUserId`, keyed with `WEB_SESSION_SECRET`, truncated to 24 hex chars. Older files used an unsalted truncated SHA-256 of the same string, which anyone who knows the channel id can recompute. `day`, `global`, `tokens`, `denied` are totals, not a person's name. | The subject's unsalted key (and a key HMAC'd with `WEB_SESSION_SECRET_PREVIOUS`, if that is set) is folded into the current HMAC. **The count is kept.** The entry is not deleted. Other users' entries are not modified. | The pseudonymous counter stays until the UTC date changes. The process then drops the whole `perUser` map. That is why a deletion cannot be used to reset the daily AI cap. A restart does not drop it: the file is the source of truth. |
| `TELEGRAM_STATE_FILE` (`/var/data/telegram-state.json`) | Older `processedCallbackKeys` entries are `callbackQueryId:channelUserId:callbackData`. The middle field and sometimes `callbackData` are the raw Telegram user id. New entries are only `cq:<callbackQueryId>`. A callback query id identifies the tap, not the person. | The next save rewrites every callback key to `cq:<callbackQueryId>` and does not write the raw id back, including when `WEB_SESSION_SECRET` is missing. There is no fallback that stores `channelUserId`. The query id is kept, so a replay is still ignored. `lastProcessedUpdateId` and `processedUpdateIds` are not user ids and are not modified. | `processedCallbackKeys` and `processedUpdateIds` keep the newest 200 entries. `lastProcessedUpdateId` is kept so polling does not re-read old updates. These are replay guards, not a chat log. |
| `GRINGO_PROCESS_LOCK_FILE` (`/var/data/gringo.lock`) | None. The file is the pid of the single Gringo process. | Not opened, not rewritten, not deleted. | Replaced when this process starts or exits. |

Erasure flushes the budget file and the Telegram file before it reports success. If either write fails, the profile row is left in place and the consent stays `deletion_pending`, so a retry can finish. A known string is never used as the HMAC key. If `WEB_SESSION_SECRET` is missing, key derivation throws and production logs a refusal.

## Google Sheets

Configured tabs are scanned, except `PrivacyConsents` and `PrivacyAudit`. A row is blanked (the cells are cleared; the row is not deleted, so later rows do not shift) when an ownership column matches this person: `userId`, `ownerUserId`, `ownerKey`, `actor_id`, `channelUserId` (with `channel`), `telegramUserId`, `telegramChatId`, `telegramUsername`, `lineUserId`, `whatsappPhone`, `webId`. `UserProfiles` is blanked last, and only after every other store succeeded, because a retry needs those channel ids.

Tabs that exist in the spreadsheet but are not named in config are scanned the same way. If the tab list cannot be read, erasure is **partial** and is not reported as complete.

Shared rows (daily and weekly reports, recommendations, admin notes, knowledge and content drafts, catalogs) have no owner column. Erasure does not blank them, because that would destroy other people's data. It does replace this person's unambiguous identifiers (length 6 or more, whole token) inside those cells. Question text that does not contain such an identifier can remain. Reports already try to avoid a single person's wording: a question is listed only when at least two conversations asked it, after phone numbers and emails are redacted. Old report rows written before that rule are not rewritten except for the identifier replacement above.

`PrivacyConsents` holds the `deletion_pending` block (HMAC subject key, no raw id) until every store succeeds, then that row is cleared. `PrivacyAudit` is append-only: event, HMAC subject key, channel, outcome, a short operational detail (row counts and store names), and a timestamp. No message text and no raw id. **Gringo does not auto-expire audit rows.** They stay until a person deletes them. This file does not choose a legal retention period for them.

Blanking a cell does not delete Google's copy of the previous value. See below.

## Copies Gringo does not control

These periods are the vendor's published rules. Gringo does not call those systems to delete, and a successful erasure here is not evidence that they deleted anything.

| Copy | What happens on erasure | Expiration Gringo can actually rely on |
| --- | --- | --- |
| Manual spreadsheet copies (runbook: File → Make a copy, weekly) | Nothing. Gringo cannot see them. | None, until someone deletes that file. Drive trash for a file a person deletes is a Google account setting, not something this app does. |
| Google Sheets version history | Nothing. Blanking the current cells leaves earlier versions. Native Sheets history has **no fixed expiry** Gringo can apply; Google may merge old revisions, and a named version is kept. The 30-day / 100-revision rule is for uploaded non-Google files, not for a Google Sheet. | Not verified. Do not tell the user it expired. |
| Render persistent-disk snapshots | Nothing. Snapshots are of the whole disk, including the files above from before the rewrite. | Render's docs: an automatic snapshot about every 24 hours, **kept at least 7 days**. Restoring one would bring back the older files. Gringo cannot delete snapshots. |
| Render logs | Nothing. Application logs can contain operational errors. Privacy code avoids writing raw ids and secrets into the refusal messages. | Render's docs: **7 days** (Hobby), **14 days** (Pro), or **30 days** (Scale / Enterprise), by workspace plan. This repo does not record which plan is active. Older lines disappear from Render; a log stream, if someone adds one later, is outside this app. |
| Telegram, LINE, WhatsApp | Nothing. Gringo does not delete the chat. LINE and WhatsApp are off in `render.yaml`. | None that Gringo can verify. |
| OpenAI | The API request sets `store: false`. That only asks OpenAI not to keep the response for later retrieval. | OpenAI's API docs: abuse-monitoring logs may contain prompts and responses and are kept **up to 30 days** by default, and longer when the law or safety requires it. Zero Data Retention / Modified Abuse Monitoring is a separate approval this pilot does not claim to have. |

## In-memory only

Conversation memory, notifications, quotes, and the Sheets read cache for this person are dropped in the running process. They are not the disk files above. The translation cache is not labeled by user, so erasure clears that whole cache; default TTL is 60 minutes, and it is not durable. That flush does not delete anyone else's sheet rows.
