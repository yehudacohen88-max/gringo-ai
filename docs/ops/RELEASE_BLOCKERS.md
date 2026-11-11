# Release blockers

## Construction-worker rights knowledge is not verified

This blocks treating construction-worker rights as answered by the knowledge base. Do not invent legal text and do not add unverified entries to fill the gap.

Checked against `src/modules/knowledge-agent/knowledge-base/workers-rights.json` and the other JSON files in that directory:

- Every knowledge entry is English-only (`"language": "English"`). There are no Hebrew, Thai, Sinhala or Hindi versions.
- No entry is about construction work specifically.
- Several entries name the construction collective agreement only to exclude it, and mark it as separate knowledge that is not in this base (`construction_collective_agreement`, `construction_collective_agreement_night_premium`).
- Pension appears only in lists of topics those entries do not decide. There is no construction-fund, site-safety, or construction foreign-worker permit and contractor content.

Still missing, and required before this area can ship as covered:

- Construction collective agreement
- Pension and the construction fund
- Site safety
- Construction foreign-worker permit and contractor rules
- Reviewed translations of any rights content that is allowed to be shown

Adding any of these later needs sourced material, the verification metadata below, and a legal review. Do not copy statutory numbers into the knowledge base from search results.

## Legal records are not presentable until review metadata exists

A source URL, or `source.verified: true` by itself, is not enough. Before a legal or worker-rights record may be shown, or sent to the AI as a fact, it needs all of the following on the record:

- `source.verified` set to boolean `true`
- `source.url` as an `https` URL
- a verification date (`source.verifiedAt` or `verifiedAt`, `YYYY-MM-DD`)
- approved content status (`source.contentStatus` or `contentStatus` equal to `approved`)
- review metadata (`reviewedBy` or `legalReviewBy`, on the record or on `source`)

No current entry in `workers-rights.json` has that set. This change does not invent those fields. Until a record passes, a rights-domain question gets the fixed fallback in `src/modules/knowledge-agent/rights-unverified-fallback.js` and the AI is not called. The supervisor employment agent also refuses to quote statutory salary-timing text, missing-salary deadlines, or overtime percentages from records that fail this gate. Basic arithmetic on hours and a rate the user already supplied is unchanged.

The fallback tells the user that no verified information is available, points them at official government websites without naming a page, suggests keeping the contract, payslips and a record of hours, and says it is not legal advice. It states no amount, percentage, or deadline.

## Official pages that were not confirmed

On 2026-11-10 these URLs were requested and did not return the underlying page (Cloudflare or a bot-check interstitial). They are not verified and they are not included in the new rights fallback. Do not add phone numbers or email addresses from secondary write-ups.

- `https://www.gov.il/en/pages/rights-of-foreign-workers` (HTTP 403, Cloudflare)
- `https://www.gov.il/en/pages/foreign_workers_rights_booklets` (HTTP 403, Cloudflare)
- `https://www.gov.il/en/departments/population_and_immigration_authority` (HTTP 403, Cloudflare)
- `https://kavlaoved.org.il/` (Cloudflare interstitial, not the site)
- `https://main.knesset.gov.il/apps/legislation/main/laws/2000019` (bot-check script, not the law text)

The older general AI-failure strings in `FRIENDLY_FALLBACK` (Hebrew, Thai, English) still name `kavlaoved.org.il` and `gov.il`. Those domains were not re-confirmed in this pass. The Sinhala and Hindi additions to that general fallback do not repeat them.

## Native-speaker review still open

Thai, Sinhala and Hindi strings added or already shipped for users are pending native-speaker review. They must not be described as reviewed. That includes:

- rights fallback: `th`, `si`, `hi` in `rights-unverified-fallback.js`
- general fallback and AI-limit lines for `si` and `hi` in `core-agent.service.js` (Thai lines there were already pending)
- language switch, conflict notice, and saved-language names for `th`, `si`, `hi` in `language-preference.js`
- `/start` and `/help` for `th`, `si`, `hi` in `telegram-message.service.js`
- topic-mapping terms whose language is `th`, `si`, or `hi` in `topic-mappings.js` (Hebrew and English terms are the pilot set)

Hebrew and English rights-fallback, `/start`, and `/help` strings are the ones written for this change. Onboarding copy is still only Hebrew, English and Thai (`onboarding.i18n.js`). Sinhala and Hindi speakers can set the language with `/language si`, `/language hi`, `සිංහල`, or `हिंदी` after setup, but onboarding itself does not offer those languages yet.

## Legal questions that do not say "rights"

A separate check runs before any free model answer and again on supervisor synthesis, other domain replies, and the outgoing translation step. It does not depend on the question being classified as Workers Rights. It looks for indirect and mixed-language signals (passport kept by an employer, dismissal while sick, Saturday pay, Hebrew זכויות / דרכון / מגיע לי, and Thai, Sinhala, and Hindi phrases that are still pending native-speaker review).

When that check matches and no record has passed the verification gate, the legal part is the fixed fallback. Job listings, transfer help, a clarifying question, and arithmetic on numbers the user already supplied stay in the reply. Text that states a statutory percentage (125%, 150%, 175%, 200%), the ninth-day deadline, or a named wage or hours statute is removed even if another agent produced it.

The check is a heuristic. A legal question that shares none of those words can still reach the model, and the output check only catches the statutory shapes listed above, not a paraphrase that avoids them. Thai, Sinhala, and Hindi patterns in `legal-question-guard.js` are pending native-speaker review.

## What this does not unblock

- No construction-sector legal answer
- No reviewed translation of a rights answer
- No phone number or email for any office
- No claim that a specific gov.il, Knesset, or Kav LaOved page was opened and checked in this change
