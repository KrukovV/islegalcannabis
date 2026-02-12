# Minimal Architecture (Anti-Overengineering)

## Layers (4)

1) `apps/web` (UI)
- Allowed:
  - Render data from API DTOs.
  - User input capture and client-side display state.
  - Simple formatting for presentation only.
- Forbidden:
  - Parsing wiki/official sources.
  - Computing legality status/official badges/notes merge.
  - Writing SSOT files or mutating pipeline outputs.

2) `apps/api` (HTTP)
- Allowed:
  - Thin route handlers and DTO validation.
  - Call `core/ssot` for data read/compute.
  - Return stable JSON DTOs.
- Forbidden:
  - Direct SSOT parsing logic in route handlers.
  - Side effects on SSOT or pipeline artifacts.
  - Hidden business logic in request handlers.

3) `core/ssot` (Domain Logic)
- Allowed:
  - Read SSOT files and compute legality/status/official badges.
  - Notes merge/selection rules.
  - Stable, deterministic functions from SSOT -> DTO-ready data.
- Forbidden:
  - Network I/O.
  - Writing SSOT or Reports files.
  - Accessing UI or route-specific concerns.

4) `tools/pipelines` (Generation)
- Allowed:
  - Ingest/refresh/sync pipelines.
  - SSOT writes and Reports/ artifacts.
  - Verification/guard generation.
- Forbidden:
  - UI rendering.
  - API routing.
  - Hidden state changes outside declared SSOT/Reports artifacts.

## SSOT Contracts

- `data/wiki/wiki_claims_map.json` (claims SSOT)
  - Canonical wiki claims map for geos.
  - Read-only for `apps/*` and `core/*`.
  - Writers only in `tools/pipelines`.

- `data/official/official_domains.ssot.json` (official SSOT)
  - Canonical official domain allowlist.
  - Read-only for `apps/*` and `core/*`.
  - Writers only in `tools/pipelines`.

- `Reports/ci-final.txt` (run SSOT)
  - Canonical pipeline run facts and decisions.
  - Quality/commit decisions must read this file only.
  - Writers only in `tools/*` pipeline/guards.

## Mandatory Invariants

- DNS is diagnostic-only. Online status derives only from truth probes.
- SSOT is read-mostly. UI/API never write SSOT.
- CI is read-only (no writes to `data/**`). UPDATE mode is the only writer.
- UI uses SSOT-only data models; no secondary “truth”.
- Metrics must be honest (no masking, no pseudo-pass).
- No destructive operations (e.g., `rm -rf`, `rsync --delete`, `git clean -fd`).
- “Shrink” of official/wiki/notes is forbidden without explicit ALLOW flag and reason.
- Metrics are honest: FAIL is always FAIL; no pseudo-success.
- Code changes and `data/wiki/**` must never be staged or committed together.
