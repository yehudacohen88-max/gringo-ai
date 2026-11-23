# Audit: paths that can present legal or rights information

Checked on branch `cursor/source-grounded-rights-c633`. No file was added under `knowledge/approvals/`. A record is shown only when that directory contains a matching `recordId`, `contentHash`, `reviewer`, and `date`. `legalClaimsVerified`, `source.verified`, `verifiedAt`, `contentStatus`, and `reviewedBy` do not approve anything by themselves.

## Gate

`passesLegalVerification` in `src/modules/knowledge-agent/legal-verification.js`:

- Source-grounded records (`schema: "source-grounded"` or a `claims` array) pass only through `passesSourceGroundedApproval`. Status on the record is ignored.
- Older workers-rights records pass only when the previous metadata set is complete **and** an approval entry matches `contentHash(record)`. Flipping any metadata field, or setting `legalClaimsVerified`, leaves the record hidden.

`knowledgeSafeForAi` uses the same gate, so unverified legal records are not placed in the model prompt.

## Paths

| Path | What it can show | Approval required |
| --- | --- | --- |
| `guardLegalReply` / `guardGeneratedLegalOutput` | A record answer copied with its source URL, or the handbook fallback plus disclaimer. On a non-legal segment, a model reply is replaced by that fallback when it states an entitlement, pairs an obligation ("must", "has to", "not allowed", "illegal", and Hebrew, Thai, and Hindi equivalents) with a labour-rights subject or a law/regulation/court/ministry cue, cites a section number together with one of those cues or a sum, or ties a sum to a named wage rule. A guide line such as "section 3 … bank account" is kept. A transfer amount with no legal cue is kept. | Yes. `verifiedRecords` are filtered by `passesLegalVerification`. Model text is dropped on a legal segment, and an unapproved legal claim is dropped on every other segment. |
| `searchKnowledgeBase` / `answerQuestion` | Withholds legal items that fail the gate. Category-only legal hits are withheld, not answered | Yes |
| Core agent web chat (`processWebMessage`) | Legal segments call the guard and do not call free AI. Mixed practical results are kept only as structured job, housing, transfer, or rate rows | Yes for any legal sentence |
| Supervisor `composeResponse` / `composeEnglishResponse` | Each domain result is passed through `guardLegalReply` | Yes |
| Employment salary agent | Quotes `rule.salaryDue` / `delayedAfter` only after `presentableLegalRecord`, which calls the gate. Otherwise it asks for facts or says it will not guess | Yes |
| Overtime classification resolver | Uses knowledge records only as structured prerequisites. Statutory percentages are not copied into the user reply unless a record passes the gate | Yes |
| Telegram `/start` and `/help` | Static orientation. No handbook claim, no phone number from the pending contacts list | Not a legal answer |
| Language switch and privacy consent | Unchanged. They do not present rights rules | Not a legal answer |
| Drafts in `knowledge/drafts/` | Read only by `loadApprovedDraftRecords`, and only when `passesLegalVerification` matches `knowledge/approvals` | Shown only for the matching topic and language |
| `docs/CONTACTS_PENDING_VERIFICATION.md` | Human checklist only | Not loaded at runtime |

## Tests

`test/legal-approval-metadata.test.js` flips `legalClaimsVerified`, `source.verified`, `verifiedAt`, `contentStatus`, `reviewedBy`, and the URL, and checks that the answer is not shown. A matching approval entry is the case that does show the answer. Wrong content hash does not.

`test/employment-agent-execution.test.js` checks that a salary-timing record with full legacy metadata and no approval file is not quoted (no "ninth day", no statute name).

## Sinhala script gap

Sinhala questions about passport, wages, insurance, housing, dismissal, and worker rights were not a legal segment unless they happened to contain one of a few fragments (`විදේශ ගමන්`, `සෞඛ්‍ය රක්ෂණ`, `අයිතිවාසිකම්`, and similar). The model was then called, and the old output list did not cover "section 4" or "2,000 shekels".

`classifyUserQuestion` now treats a non-Hebrew, non-Latin script as unverified. If that message is not confidently practical, or it contains a rights signal, the disposition is `uncertain` and the existing fallback is used. A detected Hebrew, English, Thai, or Hindi topic still follows the old path, so an approved record in the reply language can still be shown. New Sinhala hints are machine-derived, marked in code, and used only to block. They do not add a string the user sees and they do not select a record.

The output check runs for every model reply in every language. It does not invent a Sinhala answer. Limits: a practical Sinhala message with a legal point that shares none of the hints can still reach the model, and a model sentence with no section number, entitlement phrase, or rights-tied sum can still pass the output check.
