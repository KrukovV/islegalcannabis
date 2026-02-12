#!/usr/bin/env bash
set -euo pipefail

# Extracted from tools/pass_cycle.sh (keep behavior aligned). Do not edit without updating pass_cycle.
run_update_schedule_guard() {
  REFRESH_STATUS_OUTPUT=$(python3 - <<'PY'
import json
from datetime import datetime, timezone
from pathlib import Path
path = Path("Reports/wiki_refresh.ssot.json")
if not path.exists():
    path = Path("Reports/refresh_status.json")
if not path.exists():
    print("REFRESH_GUARD=FAIL reason=MISSING_REFRESH_STATUS")
    raise SystemExit(0)
try:
    data = json.loads(path.read_text("utf-8"))
except Exception:
    print("REFRESH_GUARD=FAIL reason=INVALID_REFRESH_STATUS")
    raise SystemExit(0)
last_ts = data.get("last_success_ts") or data.get("last_refresh_ts") or "-"
refresh_ts = data.get("last_refresh_ts") or last_ts
source = data.get("source") or data.get("refresh_source") or "unknown"
print(f"LAST_REFRESH_TS={refresh_ts}")
if data.get("last_success_ts"):
    print(f"LAST_SUCCESS_TS={data.get('last_success_ts')}")
print(f"REFRESH_SOURCE={source}")
try:
    last_dt = datetime.fromisoformat(str(last_ts).replace("Z","+00:00"))
    now = datetime.now(timezone.utc)
    age_h = (now - last_dt).total_seconds() / 3600.0
except Exception:
    age_h = 9999.0
print(f"REFRESH_AGE_H={age_h:.2f}")
if age_h > 8:
    print("REFRESH_GUARD=FAIL reason=STALE_REFRESH")
elif age_h > 4:
    print("REFRESH_GUARD=WARN reason=STALE_REFRESH")
else:
    print("REFRESH_GUARD=PASS")
PY
)
  if [ -n "${REFRESH_STATUS_OUTPUT}" ]; then
    while IFS= read -r line; do
      [ -n "${line}" ] && SUMMARY_LINES+=("${line}")
    done <<< "${REFRESH_STATUS_OUTPUT}"
  fi
  REFRESH_AGE_LINE=$(printf "%s\n" "${REFRESH_STATUS_OUTPUT}" | grep -E "^REFRESH_AGE_H=" | tail -n 1 || true)
  UPDATE_SCHEDULE_HOURS_LINE="UPDATE_SCHEDULE_HOURS=4"
  if printf "%s\n" "${REFRESH_STATUS_OUTPUT}" | grep -q "^REFRESH_GUARD=PASS"; then
    UPDATE_DID_RUN_LINE="UPDATE_DID_RUN=1"
  else
    UPDATE_DID_RUN_LINE="UPDATE_DID_RUN=0"
  fi
  SUMMARY_LINES+=("${UPDATE_SCHEDULE_HOURS_LINE}")
  SUMMARY_LINES+=("${UPDATE_DID_RUN_LINE}")
  printf "%s\n" "${UPDATE_SCHEDULE_HOURS_LINE}" >> "${REPORTS_FINAL}"
  printf "%s\n" "${UPDATE_SCHEDULE_HOURS_LINE}" >> "${RUN_REPORT_FILE}"
  printf "%s\n" "${UPDATE_DID_RUN_LINE}" >> "${REPORTS_FINAL}"
  printf "%s\n" "${UPDATE_DID_RUN_LINE}" >> "${RUN_REPORT_FILE}"
  if [ "${CI_WRITE_ROOT}" = "1" ]; then
    printf "%s\n" "${UPDATE_SCHEDULE_HOURS_LINE}" >> "${ROOT}/ci-final.txt"
    printf "%s\n" "${UPDATE_DID_RUN_LINE}" >> "${ROOT}/ci-final.txt"
  fi
  if printf "%s\n" "${REFRESH_STATUS_OUTPUT}" | grep -q "^REFRESH_GUARD=FAIL"; then
    if [ "${REFRESH_STALE_OK:-0}" = "1" ]; then
      :
    else
      FAIL_EXTRA_LINES="${FAIL_EXTRA_LINES:+${FAIL_EXTRA_LINES}"$'\n'"}${REFRESH_STATUS_OUTPUT}"
      FAIL_STEP="refresh_guard"
      FAIL_CMD="python3 refresh_guard"
      FAIL_RC=1
      fail_with_reason "REFRESH_STALE"
    fi
  fi
}
