GOLDEN SNAPSHOT
Date: 2026-01-21
Commit: b54da68a5e6140a93f5c93bf3160dada06932190
Tag: good/now

RUN_ID semantics
- Each run sets RUN_ID and writes run-scoped artifacts under `Artifacts/runs/<RUN_ID>/`.
- Network probes are cached per RUN_ID in `Artifacts/runs/<RUN_ID>/net_probe.json`.
- Pass/quality/hub reports must reference the same RUN_ID and probe cache.

SSOT (read-only by default; require SSOT_WRITE=1 for updates)
- data/wiki/wiki_claims.json
- data/wiki/wiki_claims.meta.json
- data/wiki/wiki_claims_map.json
- data/wiki/wiki_claims/*.json
- data/wiki/wiki_claims_enriched.json
- data/wiki/wiki_official_eval.json
- data/sources/official_allowlist.json
- data/sources/wikidata_candidates.json

Network truth policy (summary)
- DNS is diagnostic only.
- ONLINE truth = HTTP/API/CONNECT/FALLBACK probes.
- Cache allows DEGRADED_CACHE but never sets ONLINE=1.
