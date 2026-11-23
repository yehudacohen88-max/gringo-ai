# Approvals

The runtime never writes this directory and never treats `status: "approved"` on a record as approval.

A handbook draft is loaded from `knowledge/drafts/` only when a file here names that record id and the `contentHash` is the hash of the draft as it is now. Reviewer and date are required. `status`, `legalClaimsVerified`, `source.verified`, and the other metadata fields do not load or display a record. A different hash, a different language, or a different topic leaves it hidden.

```json
{
  "recordId": "draft-piba2026-passport-en",
  "contentHash": "<sha256 of the canonical record content>",
  "reviewer": "Yehuda Cohen",
  "date": "2026-11-22",
  "note": "owner decision t103u"
}
```

`contentHash` is the SHA-256 of the canonical content (id, language, topic, section, answer, information label, and each claim's URL, section, quote, language, retrieval date, and source-file hash). It does not include `status` or `legalClaimsVerified`. If the record text changes, the old hash is invalid and the record stays hidden.

## What is in this directory

Sixteen files, added in PR #28, one each for Hebrew and English:

passport, construction_transfer, minimum_wage, housing, medical_insurance, weekly_rest, sick_leave, severance.

Each file records the owner's content decision t103u (Yehuda Cohen, 2026-11-22). That decision is not an independent legal review. The draft files stay `status: "draft"`.

No approval file exists for deductions, annual_leave, deposit, or complaints, or for Thai, Hindi, or Sinhala.

## What the runtime shows after the loader change

After PR #27, PR #28, and the loader change are merged, a Hebrew or English question whose detected topic is one of those eight, and whose reply language matches the record, can show that record's own answer, the official source link, and the legal disclaimer. The approval gate still runs on the loaded record. Anything else stays on the fixed fallback.
