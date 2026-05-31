# Stability Versioning

Stability tags are annotated Git tags in `MAJOR.MINOR.PATCH` form, starting with `0.0.1`.

## Current Track

- `0.0.1` marks the first green production baseline after `/new-map` payload, source-map, and country/city ZoomIn gates were added.
- The next stability tag must be `0.0.2`, then `0.0.3`, and so on unless a deliberate minor/major policy change is documented here first.

## Tag Rules

- A stability tag may be created only after `bash tools/pass_cycle.sh` passes and `Reports/ci-final.txt` contains `POST_CHECKS_OK=1`, `HUB_STAGE_REPORT_OK=1`, `PROD_LIVE_OK=1`, `PROD_PAYLOAD_OK=1`, `PROD_JS_CITY_OK=1`, and `PROD_GPS_OK=1`.
- Use `Tools/commit_if_green.sh --tag <version>` for commit and push; do not push stability tags by hand.
- Do not reuse a pushed stability tag. If a tagged baseline needs correction, create the next patch tag.
- Keep stability tags monotonic on `main`: `0.0.1 < 0.0.2 < 0.0.3`.

## Increment Policy

- Patch: green production baseline, docs/spec update, gate hardening, performance improvement, or bug fix with no intentional product contract break.
- Minor: user-visible feature set or product workflow expansion that keeps existing contracts compatible.
- Major: intentional incompatible product/API/data-contract change.

Root `VERSION` remains the app/API version source documented in `docs/CONTRACT.md`. Stability tags are release-quality markers for checked production baselines.
