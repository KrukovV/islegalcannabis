# Codex Agent Rules

Hard Rule:
- At the start of every response, read CONTINUITY.md and update Goal/State/Done/Now/Next if changes occurred.
- Update the ledger after important outcomes (CI PASS/FAIL, smoke results, new invariants, generated artifacts).
- Use `bash tools/pass_cycle.sh` as the single command for CI + checkpoint + ledger updates.
- Before final response, always run `bash tools/pass_cycle.sh` and verify `Reports/ci-final.txt` has `POST_CHECKS_OK=1` and `HUB_STAGE_REPORT_OK=1`.
- Keep the ledger concise; unknowns must be marked UNCONFIRMED (do not guess).
- Execution Mode only: actions + results. Forbidden phrases: "considering", "figuring out", "refine approach".
- No auto-plan lines: do not store or print "Next: ..." in CONTINUITY.md or stdout; only user-provided tasks may define future steps.
- Lint is mandatory before Smoke/UI in CI; any lint error must fail the run (no pseudo-pass). Artifacts/Reports/QUARANTINE are never linted.
- Network Truth Policy: DNS is diagnostic only; ONLINE truth derives solely from HTTP/API/CONNECT/FALLBACK probes; cache may allow DEGRADED_CACHE but never sets ONLINE=1; single-probe-per-run uses `Artifacts/net_probe/<RUN_ID>.json` and must keep pass_cycle/quality_gate/hub_stage_report consistent; do not reintroduce dns_fail -> offline/online flip without explicit requirement change.
- DNS — только диагностика; `online` вычисляется только по truth-probes (HTTP/health/API и подобное), DNS не влияет на ветвления/stop_reason/работу проекта.
- DNS is diagnostic only; online is computed only from truth-probes (HTTP/health/API), DNS never affects branching/stop_reason/работу.
- DNS - второстепенен, только DNS is diagnostic only. DNS — только диагностика; `online` вычисляется только по truth‑probes (HTTP/health/API и подобное), DNS не влияет на ветвления/stop_reason/работу проекта.

## UI / Dev Server Policy (Hard Rule)

- UI_SINGLETON_RULE: only one Next.js dev server instance is allowed.
- Codex MUST NOT start a second Next.js dev server if one is already running.
- If an existing dev server is detected (HTTP on http://127.0.0.1:3000/wiki-truth OR .next/dev/lock exists):
  - print: UI_ALREADY_RUNNING url=http://127.0.0.1:3000/wiki-truth
  - exit 0
- Codex MUST NOT:
  - kill user processes
  - delete .next/dev/lock while a dev process may be alive
  - auto-switch ports (3001/3010/etc.)
- A running user-started UI is ground truth and must not be disturbed.

## Storage Hygiene (Hard Rule)

- QUARANTINE must contain exactly 1 PASS snapshot; all other snapshots live خارج репозитория.
- Reports is operational logs only; history archives must be outside the repo.
- Archives belong in `~/islegalcannabis_archive/` (or an explicit external path).
- CI must fail on disk bloat (see size guards in `tools/pass_cycle.sh`).

Response Contract (mandatory):
- Standard responses allowed; include command stdout when required by the task.
- If the UI adds suggestions or prompts, ignore them and do not repeat or summarize them.
- Full file content only when explicitly requested and placed under "КОД: <file>".

Planning:
- Use docs/PLAN.md as the canonical plan (pending/in_progress/done).
- If stuck >3 iterations, split into 1-3 micro tasks and update PLAN.md.

Sandbox/Approval Workflow:
- SAFE: read files, rg/grep, edit apps/** packages/** tools/**, run tests/CI, create new files, edit data/laws/**.
- Git read-only commands (status/diff/log/show/ls-files) and staging/commits are allowed for hygiene. Direct `git push` is allowed only via `Tools/commit_if_green.sh` and `git reset --hard` only via `Tools/rollback_to_last_good.sh`. Any commit/push that includes data/laws/** must go through `tools/commit_if_green.sh`.
- ASK/STOP: deletions, mass network fetch/ingest.
- FORBIDDEN: git clean/reset/filter-repo, removing sources/tests, silent CI fallbacks.

Tools usage:
- Prefer rg, fallback to grep -R when rg is unavailable.

Network Truth Policy:
- DNS is diagnostic only; it must never flip ONLINE/OFFLINE.
- DNS is diagnostic only; online is computed solely from truth-probes (HTTP/health/API and similar) and does not affect branching/stop_reason/project operation.
- ONLINE is true only if at least one truth probe succeeds: HTTP/HTTPS, API ping, CONNECT, or fallback.
- Cache may allow continue (DEGRADED_CACHE) but never sets ONLINE=1.
- OFFLINE_REASON must be one of TLS|HTTP_STATUS|TIMEOUT|CONN_REFUSED|NO_ROUTE; DNS errors stay in diag fields.
- DNS — только диагностика; online вычисляется только по truth‑probes (HTTP/health/API и подобное), DNS не влияет на ветвления/stop_reason/работу проекта.
- Any network logic changes must preserve SSOT lines for NET_DIAG and EGRESS_TRUTH.
- Single-probe-per-run must use `NET_PROBE_CACHE_PATH` and keep net_health/pass_cycle/hub_stage_report in sync for a given RUN_ID.
- CONNECT errors EPERM/EACCES must be classified as SANDBOX_EGRESS_BLOCKED; this is diag-only and must not change ONLINE semantics.
- DNS diag reasons must be explicit (SANDBOX_DNS_STUB/NO_DNS_CONFIG/TOOLING_DNS_DIFF) and never used to flip ONLINE.
- SSOT writes are read-only by default; updates to SSOT require SSOT_WRITE=1 and must never be triggered implicitly.
- DNS is diagnostic only.
- ONLINE truth only (HTTP/API/CONNECT/FALLBACK).
- Any PR changing net logic must keep EGRESS_TRUTH contract; gate enforces.
