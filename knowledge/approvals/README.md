# Approvals

The runtime never writes this directory and never treats `status: "approved"` on a record as approval.

A record becomes presentable only when a human adds a JSON file here in a pull request. Each file is either one object or an array of objects:

```json
{
  "recordId": "draft-piba2026-passport-en",
  "contentHash": "<sha256 of the canonical record content>",
  "reviewer": "Yehuda Cohen",
  "date": "2026-11-11"
}
```

`contentHash` is the SHA-256 of the canonical content (id, language, topic, section, answer, information label, and each claim's URL, section, quote, language, retrieval date, and source-file hash). It does not include `status` or `legalClaimsVerified`. If the record text changes, the old hash is invalid and the record stays hidden.

Drafts in `knowledge/drafts/` are not loaded, even if an approval names their id. Move a reviewed record into the live knowledge base only in the same pull request that adds a matching approval.

No record is approved in this directory yet.
