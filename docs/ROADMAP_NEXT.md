# ROADMAP

`docs/PLAN.md` is the canonical task tracker. This file is a short product/engineering roadmap summary and must not override `docs/PLAN.md`.

## Current Focus

- Keep `/`, `/new-map`, and `/c/[code]` on one MapLibre runtime and one static countries payload.
- Keep `/wiki-truth`, `/trust-view`, `/changes`, and `/api/ssot/changes` stable over prebuilt SSOT/audit models.
- Keep network truth, UI singleton, and storage hygiene gates green in `bash tools/pass_cycle.sh`.
- Use Status Engine Audit v1 as a review-only queue before any SSOT or map-color changes.

## Review Queue

Status Engine Audit v1 first-wave color-review candidates:

```text
AL, DZ, AO, AM, AZ, BD, BY, BJ, BW, BI, KH, IR
```

Any follow-up status change requires official/source review, SSOT update, map/API parity checks, SSOT diff validation, and a green pass cycle.

## Later Product Areas

- Improve country-panel evidence presentation without forking map truth.
- Expand audit coverage beyond the first Status Engine wave.
- Continue production mobile/performance evidence collection when Vercel automation constraints allow reliable browser runs.
- Mature AI assistance only as a consumer of existing legal facts; it must not become a source of truth.
