# SSOT tools

Purpose: read/validate SSOT files only. No network fetch.

SSOT files:
- data/official/official_domains.ssot.json
- data/wiki/wiki_claims_map.json

DERIVED files are produced elsewhere and are not SSOT.

Invariants:
- SSOT is read-mostly; only sync pipelines write.
- SSOT must not shrink without explicit override in gates.
