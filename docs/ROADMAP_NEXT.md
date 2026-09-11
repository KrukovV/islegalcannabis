# ROADMAP

`docs/PLAN.md` is the canonical task tracker. This file is a short product/engineering roadmap summary and must not override `docs/PLAN.md`.

## Current Focus

- Keep canonical `/`, `/c/[code]` and the localhost-only `/new-map` QA compatibility surface on one MapLibre implementation and one static countries payload; production `/new-map` remains a redirect to `/`.
- Keep `/wiki-truth`, `/trust-view`, `/changes`, and `/api/ssot/changes` stable over prebuilt SSOT/audit models.
- Keep network truth, UI singleton, and storage hygiene gates green in `bash tools/pass_cycle.sh`.
- Use the canonical 307-GEO official-evidence review/apply contract for current legal work. Status Engine Audit v3 remains a historical review-only diagnostic and cannot replace that contract.

## Historical first-wave diagnostic

The retained Status Engine Audit v3 first-wave values below describe an earlier review-only diagnostic, not the current 307-GEO operation queue or current Legal Truth:

```text
AL=GREEN, IR=YELLOW, KH=YELLOW, BY=RED, BD=RED, AM=RED
REVIEW_ROWS=5
```

Any current legal-status change requires the independent 307-GEO official-evidence review/apply contract, complete applicability and effective-state proof, explicit authorization, map/API/SEO parity checks, SSOT diff validation, and a green pass cycle.

## Later Product Areas

- Improve country-panel evidence presentation without forking map truth.
- Expand audit coverage beyond the first Status Engine wave.
- Continue production mobile/performance evidence collection when Vercel automation constraints allow reliable browser runs.
- Mature AI assistance only as a consumer of existing legal facts; it must not become a source of truth.
