# Approving a rights record

Rights answers may rely only on official government text. For this pass that means the Population and Immigration Authority Foreign Workers' Rights Handbook 2026 (gov.il PDFs under `knowledge/sources/piba_handbook_2026/`). Kol Zchut, Kav LaOved, Nevo, and other non-government sites are not a basis for a draft or a record.

## What is a draft

Drafts live in `knowledge/drafts/`. The bot does not load that directory. Every draft stays `status: "draft"` or, when the text extract is not reliable, `status: "extraction_unreliable"` with an empty answer and no quote. Thai, Sinhala, and Hindi extracts from these PDFs are marked unreliable. Do not repair them by guessing or by machine translation.

A usable draft quotes the handbook verbatim (Unicode NFC, whitespace collapsed) and its answer is a short paraphrase of that quote in the same language. Numbers in the answer must appear in the quote. `scripts/verify-knowledge-quotes.js` fails CI if a quote, hash, number, script, or cross-language section/amount check fails.

## How Yehuda approves a record

1. Read the draft and the matching lines in the committed handbook text (`knowledge/sources/piba_handbook_2026/<lang>.txt`).
2. If the wording is acceptable, copy the record into the live knowledge base in a pull request. Leave the draft file as a draft, or delete it in that same PR after the live copy exists.
3. Compute the content hash with `contentHash` from `src/modules/knowledge-agent/source-grounded-record.js`. The hash covers the answer and the claims, not the status field.
4. Add `knowledge/approvals/<record-id>.json` with `recordId`, `contentHash`, `reviewer`, and `date` (`YYYY-MM-DD`).
5. Open the pull request. CI runs the quote check and the test suite. Do not set `status` to approved in application code. The approvals file is the only switch, and a hash mismatch keeps the record hidden.

`legalClaimsVerified` on a model reply is ignored. So are `source.verified`, `verifiedAt`, `contentStatus`, and `reviewedBy` by themselves. Older records in `workers-rights.json` use the same rule: those fields may be present, and the record stays hidden until `knowledge/approvals/` has a matching content hash. A verified record is shown only when its topic matches the question, and only its own answer text is copied, with the source URL. See `docs/LEGAL_PRESENTATION_AUDIT.md`.

## What a rights reply contains

Until a record is approved, the reply is the fixed fallback: it says the information is not verified, links the official handbook PDF for the user's language, gives the retrieval date 2026-11-11 and edition 2026, names the handbook section when the question maps to one, and does not show phone numbers or email addresses. Every rights, obligation, or legal reply, including a clarification, ends with the disclaimer in `src/modules/knowledge-agent/legal-disclaimer.js`.

The Hebrew disclaimer is the owner's sentence. The English disclaimer is the handbook introduction, verbatim. Thai, Sinhala, and Hindi disclaimers are faithful translations marked `pending_native_review`. They are not reviewed.

## Remaining blockers

- No draft is approved. The bot still cannot state a wage, deduction, hour, or other legal figure as its own answer.
- Thai, Hindi, and Sinhala handbook text from `pdftotext` is garbled. Those drafts have no answer until a reliable extract or a native-reviewed text exists.
- Phone numbers and emails printed in the handbook are listed in `docs/CONTACTS_PENDING_VERIFICATION.md` and are not shown to users.
- Hebrew handbook section 15 names the Legal Aid Department. The English section 15 names the trafficking-coordination unit. Both are pending verification. The urgent reply names the office without a number.
- Native-speaker review is still open for Thai, Sinhala, and Hindi detector patterns, fallback lines, and disclaimers.
