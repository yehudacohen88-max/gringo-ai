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
| `guardLegalReply` / `guardGeneratedLegalOutput` | A record answer copied with its source URL, or the handbook fallback plus disclaimer | Yes. `verifiedRecords` are filtered by `passesLegalVerification`. Model text is dropped. |
| `searchKnowledgeBase` / `answerQuestion` | Withholds legal items that fail the gate. Category-only legal hits are withheld, not answered | Yes |
| Core agent web chat (`processWebMessage`) | Legal segments call the guard and do not call free AI. Mixed practical results are kept only as structured job, housing, transfer, or rate rows | Yes for any legal sentence |
| Supervisor `composeResponse` / `composeEnglishResponse` | Each domain result is passed through `guardLegalReply` | Yes |
| Employment salary agent | Quotes `rule.salaryDue` / `delayedAfter` only after `presentableLegalRecord`, which calls the gate. Otherwise it asks for facts or says it will not guess | Yes |
| Overtime classification resolver | Uses knowledge records only as structured prerequisites. Statutory percentages are not copied into the user reply unless a record passes the gate | Yes |
| Telegram `/start` and `/help` | Static orientation. No handbook claim, no phone number from the pending contacts list | Not a legal answer |
| Language switch and privacy consent | Unchanged. They do not present rights rules | Not a legal answer |
| Drafts in `knowledge/drafts/` | Not read by `loadKnowledgeItems` | Cannot be shown |
| `docs/CONTACTS_PENDING_VERIFICATION.md` | Human checklist only | Not loaded at runtime |

## Tests

`test/legal-approval-metadata.test.js` flips `legalClaimsVerified`, `source.verified`, `verifiedAt`, `contentStatus`, `reviewedBy`, and the URL, and checks that the answer is not shown. A matching approval entry is the case that does show the answer. Wrong content hash does not.

`test/employment-agent-execution.test.js` checks that a salary-timing record with full legacy metadata and no approval file is not quoted (no "ninth day", no statute name).
