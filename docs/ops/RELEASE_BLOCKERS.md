# Release blockers

## Construction-worker rights knowledge is not verified

This blocks treating construction-worker rights as answered by the knowledge base. Do not invent legal text and do not add unverified entries to fill the gap.

Checked against `src/modules/knowledge-agent/knowledge-base/workers-rights.json` and the other JSON files in that directory:

- Every knowledge entry is English-only (`"language": "English"`). There are no Hebrew or Thai versions.
- No entry is about construction work specifically.
- Several entries name the construction collective agreement only to exclude it, and mark it as separate knowledge that is not in this base (`construction_collective_agreement`, `construction_collective_agreement_night_premium`).
- Pension appears only in lists of topics those entries do not decide. There is no construction-fund, site-safety, or construction foreign-worker permit and contractor content.

Still missing, and required before this area can ship as covered:

- Construction collective agreement
- Pension and the construction fund
- Site safety
- Construction foreign-worker permit and contractor rules
- Hebrew and Thai versions of the rights content

Adding any of these later needs sourced material and a legal review.
