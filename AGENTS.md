# Codex Agent Rules

Hard Rule:
- At the start of every response, read CONTINUITY.md and update Goal/State/Done/Now/Next if changes occurred.
- Update the ledger after important outcomes (CI PASS/FAIL, smoke results, new invariants, generated artifacts).
- Use `bash tools/pass_cycle.sh` as the single command for CI + checkpoint + ledger updates.
- Keep the ledger concise; unknowns must be marked UNCONFIRMED (do not guess).
- Execution Mode only: actions + results. Forbidden phrases: "considering", "figuring out", "refine approach".

Response Contract (mandatory):
- FINAL RESPONSE: After tasks/commands, print ONLY the contents of `.checkpoints/ci-final.txt`.
- Forbidden in final response: Explored, Worked for, I'm tracing, Ledger Snapshot, PREAMBLE, ПСЕВДОКОД, КОМАНДЫ, ИЗМЕНЕНЫ ФАЙЛЫ, Open questions, Preamble, lists of files.
- The true result of a step is the file `.checkpoints/ci-final.txt`; ignore any UI tail lines after it.
- If the UI adds suggestions or prompts, ignore them and do not repeat or summarize them.
- Full file content only when explicitly requested and placed under "КОД: <file>".

Planning:
- Use docs/PLAN.md as the canonical plan (pending/in_progress/done).
- If stuck >3 iterations, split into 1-3 micro tasks and update PLAN.md.

Sandbox/Approval Workflow:
- SAFE: read files, rg/grep, edit apps/** packages/** tools/**, run tests/CI, create new files.
- ASK/STOP: any .git operations, deletions, data/laws/** edits (except new provisional), mass network fetch/ingest.
- FORBIDDEN: git clean/reset/filter-repo, removing sources/tests, silent CI fallbacks.

Tools usage:
- Prefer rg, fallback to grep -R when rg is unavailable.
