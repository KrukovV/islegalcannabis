#!/usr/bin/env bash
set -euo pipefail

pass_cycle_collect_worktree_summary() {
  HARD_FAIL_REASONS=()
  QUARANTINE_MAX_MB=500
  REPORTS_MAX_MB=1024
  QUARANTINE_SIZE_MB=0
  REPORTS_SIZE_MB=0
  if [ -d "${ROOT}/QUARANTINE" ]; then
    QUARANTINE_SIZE_MB=$(du -sm "${ROOT}/QUARANTINE" | awk '{print $1}' || echo 0)
  fi
  if [ -d "${ROOT}/Reports" ]; then
    REPORTS_SIZE_MB=$(du -sm "${ROOT}/Reports" | awk '{print $1}' || echo 0)
  fi
  append_ci_line "QUARANTINE_SIZE_MB=${QUARANTINE_SIZE_MB}"
  append_ci_line "REPORTS_SIZE_MB=${REPORTS_SIZE_MB}"
  WORKTREE_DIRTY=0
  if git -C "${ROOT}" status --porcelain | rg -q "."; then
    WORKTREE_DIRTY=1
  fi
  DATA_DIRTY_COUNT=0
  if git -C "${ROOT}" status --porcelain -- data | rg -q "."; then
    DATA_DIRTY_COUNT=$(git -C "${ROOT}" status --porcelain -- data | wc -l | tr -d " ")
  fi
  DATA_DIRTY_AFTER=$(git -C "${ROOT}" status --porcelain -- data | sed '/^$/d' || true)
  DATA_DIRTY_CHANGED=0
  if [ "${READONLY_CI:-1}" = "1" ]; then
    if [ "${DATA_DIRTY_AFTER}" != "${DATA_DIRTY_BEFORE:-}" ]; then
      DATA_DIRTY_CHANGED=1
    fi
  fi
  SUMMARY_LINES+=("WORKTREE_DIRTY=${WORKTREE_DIRTY}")
  SUMMARY_LINES+=("CI_DATA_DIRTY=${DATA_DIRTY_COUNT}")
  SUMMARY_LINES+=("CI_DATA_DIRTY_CHANGED=${DATA_DIRTY_CHANGED}")
  if [ "${WORKTREE_DIRTY}" -eq 1 ]; then
    echo "WARN_WORKTREE_DIRTY=1" >> "${STEP_LOG}"
    SUMMARY_LINES+=("WARN_WORKTREE_DIRTY=1")
  fi
  if [ "${DATA_DIRTY_CHANGED}" -gt 0 ]; then
    echo "FAIL: CI_WROTE_DATA count=${DATA_DIRTY_COUNT}" >> "${STEP_LOG}"
  fi
  SUMMARY_LINES+=("GIT_BLOCKING_DISABLED=1")
  SUMMARY_LINES+=("DEV_MODE=LOCAL")
  SANITIZE_HIT_COUNT=0
  if [ -s "${STEP_LOG}" ]; then
    SANITIZE_HIT_COUNT=$(rg -n "› Write tests|@filename|Implement \\{feature\\}|context left|for shortcuts" "${STEP_LOG}" 2>/dev/null || true)
    SANITIZE_HIT_COUNT=$(printf "%s\n" "${SANITIZE_HIT_COUNT}" | awk 'NF{c++} END{print c+0}')
  fi
  SUMMARY_LINES+=("SANITIZE_HIT_COUNT=${SANITIZE_HIT_COUNT}")
  if [ "${QUARANTINE_SIZE_MB}" -gt "${QUARANTINE_MAX_MB}" ] || [ "${REPORTS_SIZE_MB}" -gt "${REPORTS_MAX_MB}" ]; then
    HARD_FAIL_REASONS+=("DISK_BLOAT")
  fi
  if [ "${SANITIZE_HIT_COUNT}" -gt 0 ]; then
    HARD_FAIL_REASONS+=("SANITIZE_HIT")
  fi
  if [ "${DATA_DIRTY_CHANGED}" -gt 0 ]; then
    HARD_FAIL_REASONS+=("CI_WROTE_DATA")
    CI_RC=1
  fi
  if [ "${CI_RC}" -ne 0 ]; then
    HARD_FAIL_REASONS+=("PIPELINE_RC")
  fi
  if [ "${SHRINK_OK_FLAG:-0}" != "1" ]; then
    HARD_FAIL_REASONS+=("DATA_SHRINK")
  fi
  if [ "${WIKI_DB_GATE_OK_FLAG:-0}" != "1" ]; then
    HARD_FAIL_REASONS+=("DB_GATE_FAIL")
  fi
  if [ "${WIKI_GATE_OK_FLAG:-0}" != "1" ]; then
    HARD_FAIL_REASONS+=("WIKI_GATE_FAIL_STRICT")
  fi
  if [ "${NOTES_STRICT_STATUS:-}" = "FAIL" ]; then
    HARD_FAIL_REASONS+=("NOTES_EMPTY_STRICT")
  fi
}
