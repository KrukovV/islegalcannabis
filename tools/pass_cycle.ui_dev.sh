#!/usr/bin/env bash
set -euo pipefail

# Extracted from tools/pass_cycle.sh (keep behavior aligned). Do not edit without updating pass_cycle.
run_ui_dev_proof() {
  UI_LOCAL_OUTPUT=""
  UI_LOCAL_RC=0
  KEEP_UI="${KEEP_UI:-0}"
  CURRENT_STEP="ui_local"
  CURRENT_CMD="bash tools/ui/ui_dev.sh --smoke"
  if [ "${UI_LOCAL:-1}" = "1" ]; then
    UI_DEV_SSOT_OUTPUT="$(MAP_ENABLED=1 PREMIUM=1 NO_TILE_NETWORK=1 bash "${ROOT}/tools/ui/ui_dev_ssot.sh" 2>&1)"
    UI_DEV_SSOT_RC=$?
    if [ -n "${UI_DEV_SSOT_OUTPUT}" ]; then
      printf "%s\n" "${UI_DEV_SSOT_OUTPUT}" >> "${REPORTS_FINAL}"
      printf "%s\n" "${UI_DEV_SSOT_OUTPUT}" >> "${RUN_REPORT_FILE}"
    fi
    UI_STARTED_LINE=$(printf "%s\n" "${UI_DEV_SSOT_OUTPUT}" | grep -E "^UI_STARTED " | tail -n 1 || true)
    UI_ALREADY_LINE=$(printf "%s\n" "${UI_DEV_SSOT_OUTPUT}" | grep -E "^UI_ALREADY_RUNNING " | tail -n 1 || true)
    UI_HTTP_OK_LINE=$(printf "%s\n" "${UI_DEV_SSOT_OUTPUT}" | grep -E "^UI_HTTP_OK=" | tail -n 1 || true)
    [ -n "${UI_STARTED_LINE}" ] && SUMMARY_LINES+=("${UI_STARTED_LINE}")
    [ -n "${UI_ALREADY_LINE}" ] && SUMMARY_LINES+=("${UI_ALREADY_LINE}")
    [ -n "${UI_HTTP_OK_LINE}" ] && SUMMARY_LINES+=("${UI_HTTP_OK_LINE}")
    if [ "${UI_DEV_SSOT_RC}" -ne 0 ] || ! printf "%s\n" "${UI_HTTP_OK_LINE}" | grep -q "UI_HTTP_OK=1"; then
      FAIL_EXTRA_LINES="${FAIL_EXTRA_LINES:+${FAIL_EXTRA_LINES}"$'\n'"}${UI_DEV_SSOT_OUTPUT}"
      FAIL_STEP="ui_dev_ssot"
      FAIL_CMD="bash tools/ui/ui_dev_ssot.sh"
      FAIL_RC="${UI_DEV_SSOT_RC}"
      fail_with_reason "UI_HTTP_NOT_200"
    fi
    if [ "${KEEP_UI}" = "1" ]; then
      CURRENT_STEP="ui_serve"
      CURRENT_CMD="bash tools/ui/ui_serve.sh"
      UI_SERVE_LOG="${ROOT}/Reports/ui_serve.log"
      UI_URL_VALUE=""
      TRUTH_URL_VALUE=""
      if [ -f "${ROOT}/Reports/ui_url.txt" ]; then
        ui_url_line=$(grep -E "^UI_URL=" "${ROOT}/Reports/ui_url.txt" | tail -n 1 || true)
        truth_line=$(grep -E "^TRUTH_URL=" "${ROOT}/Reports/ui_url.txt" | tail -n 1 || true)
        if [ -n "${ui_url_line}" ]; then
          UI_URL_VALUE="${ui_url_line#UI_URL=}"
        fi
        if [ -n "${truth_line}" ]; then
          TRUTH_URL_VALUE="${truth_line#TRUTH_URL=}"
        fi
      fi
      if [ -z "${UI_URL_VALUE}" ]; then
        UI_URL_VALUE="http://127.0.0.1:3000/"
      fi
      if [ -z "${TRUTH_URL_VALUE}" ]; then
        TRUTH_URL_VALUE="${UI_URL_VALUE%/}/wiki-truth"
      fi
      root_status="0"
      truth_status="0"
      for _ in $(seq 1 10); do
        root_status="$(curl -s -L -o /dev/null -w "%{http_code}" "${UI_URL_VALUE%/}" || echo 0)"
        truth_status="$(curl -s -L -o /dev/null -w "%{http_code}" "${TRUTH_URL_VALUE}" || echo 0)"
        if [ "${truth_status}" = "200" ]; then
          break
        fi
        sleep 0.5
      done
      if [ "${truth_status}" != "200" ]; then
        : > "${UI_SERVE_LOG}"
        if [ -x "${ROOT}/tools/ui/ui_serve.sh" ]; then
          echo "STEP_BEGIN name=ui_serve cmd=$(escape_cmd "${CURRENT_CMD}") ts=$(date -u +%FT%TZ)" | tee -a "${STEP_LOG}"
          echo "CI_STEP_BEGIN step=ui_serve cmd=$(escape_cmd "${CURRENT_CMD}")" | tee -a "${STEP_LOG}"
          set +e
          bash "${ROOT}/tools/ui/ui_serve.sh" >"${UI_SERVE_LOG}" 2>&1 &
          UI_SERVE_PID=$!
          set -e
          for _ in $(seq 1 80); do
            ui_url_line=$(grep -E "^UI_URL=" "${UI_SERVE_LOG}" | tail -n 1 || true)
            truth_line=$(grep -E "^TRUTH_URL=" "${UI_SERVE_LOG}" | tail -n 1 || true)
            if [ -n "${ui_url_line}" ]; then
              UI_URL_VALUE="${ui_url_line#UI_URL=}"
              if [ -n "${truth_line}" ]; then
                TRUTH_URL_VALUE="${truth_line#TRUTH_URL=}"
              else
                TRUTH_URL_VALUE="${UI_URL_VALUE%/}/wiki-truth"
              fi
              break
            fi
            sleep 0.2
          done
          if [ -n "${UI_URL_VALUE}" ]; then
            for _ in $(seq 1 20); do
              root_status="$(curl -s -L -o /dev/null -w "%{http_code}" "${UI_URL_VALUE%/}" || echo 0)"
              truth_status="$(curl -s -L -o /dev/null -w "%{http_code}" "${TRUTH_URL_VALUE}" || echo 0)"
              if [ "${truth_status}" = "200" ]; then
                break
              fi
              sleep 0.5
            done
            echo "STEP_END name=ui_serve rc=0 reason=OK dur_ms=0" | tee -a "${STEP_LOG}"
            echo "CI_STEP_END step=ui_serve rc=0 reason=OK" | tee -a "${STEP_LOG}"
          else
            UI_LOCAL_OUTPUT="UI_LOCAL_OK=0 reason=UI_START_FAIL missing_ui_url=1"
            UI_LOCAL_RC=1
          fi
        else
          UI_LOCAL_OUTPUT="UI_LOCAL_OK=0 reason=UI_START_FAIL missing_ui_serve=1"
          UI_LOCAL_RC=127
        fi
      fi
      if [ -z "${UI_URL_VALUE}" ]; then
        UI_URL_VALUE="http://127.0.0.1:3000/"
        TRUTH_URL_VALUE="http://127.0.0.1:3000/wiki-truth"
      fi
      if [ "${root_status}" = "200" ] && [ "${truth_status}" = "200" ]; then
        UI_LOCAL_OUTPUT="UI_URL=${UI_URL_VALUE%/}/"$'\n'"TRUTH_URL=${TRUTH_URL_VALUE}"$'\n'"UI_LOCAL_OK=1"$'\n'"UI_TRUTH_OK=1 root_status=${root_status} truth_status=${truth_status}"
        UI_LOCAL_RC=0
      else
        UI_LOCAL_OUTPUT="UI_URL=${UI_URL_VALUE%/}/"$'\n'"TRUTH_URL=${TRUTH_URL_VALUE}"$'\n'"UI_LOCAL_OK=0 reason=UI_HTTP_NOT_200"$'\n'"UI_TRUTH_OK=0 root_status=${root_status} truth_status=${truth_status}"
        UI_LOCAL_RC=1
      fi
    else
      if [ -x "${ROOT}/tools/ui/ui_dev.sh" ]; then
        set +e
        UI_LOCAL_OUTPUT=$(bash "${ROOT}/tools/ui/ui_dev.sh" --smoke 2>&1)
        UI_LOCAL_RC=$?
        set -e
      else
        UI_LOCAL_OUTPUT="UI_LOCAL_OK=0 reason=UI_START_FAIL missing_ui_dev=1"
        UI_LOCAL_RC=127
      fi
    fi
    printf "%s\n" "${UI_LOCAL_OUTPUT}" >> "${REPORTS_FINAL}"
    printf "%s\n" "${UI_LOCAL_OUTPUT}" >> "${RUN_REPORT_FILE}"
    if [ "${CI_WRITE_ROOT}" = "1" ]; then
      printf "%s\n" "${UI_LOCAL_OUTPUT}" >> "${ROOT}/ci-final.txt"
    fi
  else
    UI_LOCAL_RC=127
  fi
  UI_LOCAL_OK_LINE=$(printf "%s\n" "${UI_LOCAL_OUTPUT}" | grep -E "^UI_LOCAL_OK=" | tail -n 1 || true)
  UI_URL_LINE=$(printf "%s\n" "${UI_LOCAL_OUTPUT}" | grep -E "^UI_URL=" | tail -n 1 || true)
  UI_TRUTH_URL_LINE=$(printf "%s\n" "${UI_LOCAL_OUTPUT}" | grep -E "^TRUTH_URL=" | tail -n 1 || true)
  UI_ALREADY_RUNNING_LINE=$(printf "%s\n" "${UI_LOCAL_OUTPUT}" | grep -E "^UI_ALREADY_RUNNING " | tail -n 1 || true)
  if [ -n "${UI_URL_LINE}" ]; then
    {
      printf "%s\n" "${UI_URL_LINE}"
      if [ -n "${UI_TRUTH_URL_LINE}" ]; then
        printf "%s\n" "${UI_TRUTH_URL_LINE}"
      else
        printf "TRUTH_URL=%s\n" "${UI_URL_LINE#UI_URL=}"
      fi
    } > "${ROOT}/Reports/ui_url.txt"
  fi
  if [ -n "${UI_LOCAL_OK_LINE}" ]; then
    SUMMARY_LINES+=("${UI_LOCAL_OK_LINE}")
  fi
  if [ -n "${UI_ALREADY_RUNNING_LINE}" ]; then
    SUMMARY_LINES+=("${UI_ALREADY_RUNNING_LINE}")
  fi
  if [ -n "${UI_URL_LINE}" ]; then
    SUMMARY_LINES+=("${UI_URL_LINE}")
    UI_URL_VALUE="${UI_URL_LINE#UI_URL=}"
    if [ -n "${UI_URL_VALUE}" ]; then
      if [ -n "${UI_TRUTH_URL_LINE}" ]; then
        TRUTH_URL_LINE="${UI_TRUTH_URL_LINE}"
      else
        TRUTH_URL_LINE="TRUTH_URL=${UI_URL_VALUE%/}/wiki-truth"
      fi
      SUMMARY_LINES+=("${TRUTH_URL_LINE}")
      printf "%s\n" "${TRUTH_URL_LINE}" >> "${REPORTS_FINAL}"
      printf "%s\n" "${TRUTH_URL_LINE}" >> "${RUN_REPORT_FILE}"
      if [ "${CI_WRITE_ROOT}" = "1" ]; then
        printf "%s\n" "${TRUTH_URL_LINE}" >> "${ROOT}/ci-final.txt"
      fi
    fi
  fi
  UI_TRUTH_OK_LINE=""
  UI_TRUTH_OK_LINE=$(printf "%s\n" "${UI_LOCAL_OUTPUT}" | grep -E "^UI_TRUTH_OK=" | tail -n 1 || true)
  if [ -n "${UI_TRUTH_OK_LINE}" ]; then
    SUMMARY_LINES+=("${UI_TRUTH_OK_LINE}")
    printf "%s\n" "${UI_TRUTH_OK_LINE}" >> "${REPORTS_FINAL}"
    printf "%s\n" "${UI_TRUTH_OK_LINE}" >> "${RUN_REPORT_FILE}"
    if [ "${CI_WRITE_ROOT}" = "1" ]; then
      printf "%s\n" "${UI_TRUTH_OK_LINE}" >> "${ROOT}/ci-final.txt"
    fi
    if printf "%s\n" "${UI_TRUTH_OK_LINE}" | grep -q "UI_TRUTH_OK=1"; then
      UI_TRUTH_RC=0
    else
      UI_TRUTH_RC=1
    fi
  fi
  if [ -n "${UI_URL_LINE}" ]; then
    UI_URL_VALUE="${UI_URL_LINE#UI_URL=}"
    if [ -n "${UI_TRUTH_URL_LINE}" ]; then
      TRUTH_URL_VALUE="${UI_TRUTH_URL_LINE#TRUTH_URL=}"
    else
      TRUTH_URL_VALUE="${UI_URL_VALUE%/}/wiki-truth"
    fi
    ui_truth_ok=0
    if printf "%s\n" "${UI_TRUTH_OK_LINE}" | grep -q "UI_TRUTH_OK=1"; then
      ui_truth_ok=1
    fi
    truth_status="$(printf "%s\n" "${UI_TRUTH_OK_LINE}" | sed -n 's/.*truth_status=\\([0-9][0-9]*\\).*/\\1/p')"
    if [ -z "${truth_status}" ] && [ "${ui_truth_ok}" = "1" ]; then
      truth_status="200"
    fi
    if [ -z "${truth_status}" ]; then
      truth_status="$(curl -s -L -o /dev/null -w "%{http_code}" "${TRUTH_URL_VALUE}" || echo 0)"
    fi
    host_val="$(printf "%s" "${UI_URL_VALUE}" | sed -n 's#^https\\?://\\([^:/]*\\).*#\\1#p')"
    port_val="$(printf "%s" "${UI_URL_VALUE}" | sed -n 's#.*:\\([0-9][0-9]*\\).*#\\1#p')"
    if [ -z "${host_val}" ]; then
      host_val="127.0.0.1"
    fi
    if [ -z "${port_val}" ]; then
      port_val="3000"
    fi
    UI_LISTEN_LINE="UI_LISTEN host=${host_val} port=${port_val} url=${UI_URL_VALUE%/}"
    UI_WIKI_TRUTH_HTTP_LINE="UI_WIKI_TRUTH_HTTP status=${truth_status} url=${TRUTH_URL_VALUE}"
    SUMMARY_LINES+=("${UI_LISTEN_LINE}")
    SUMMARY_LINES+=("${UI_WIKI_TRUTH_HTTP_LINE}")
    printf "%s\n" "${UI_LISTEN_LINE}" >> "${REPORTS_FINAL}"
    printf "%s\n" "${UI_LISTEN_LINE}" >> "${RUN_REPORT_FILE}"
    printf "%s\n" "${UI_WIKI_TRUTH_HTTP_LINE}" >> "${REPORTS_FINAL}"
    printf "%s\n" "${UI_WIKI_TRUTH_HTTP_LINE}" >> "${RUN_REPORT_FILE}"
    if [ "${CI_WRITE_ROOT}" = "1" ]; then
      printf "%s\n" "${UI_LISTEN_LINE}" >> "${ROOT}/ci-final.txt"
      printf "%s\n" "${UI_WIKI_TRUTH_HTTP_LINE}" >> "${ROOT}/ci-final.txt"
    fi
    if [ "${truth_status}" != "200" ] && [ "${ui_truth_ok}" != "1" ]; then
      FAIL_STEP="ui_truth"
      FAIL_CMD="curl ${TRUTH_URL_VALUE}"
      FAIL_RC=1
      fail_with_reason "UI_HTTP_NOT_200"
    fi
  fi
  if [ -n "${UI_URL_VALUE:-}" ] && [ -z "${UI_TRUTH_OK_LINE}" ]; then
    FAIL_STEP="ui_truth"
    FAIL_CMD="ui_dev smoke check"
    FAIL_RC=1
    fail_with_reason "UI_TRUTH_FAIL"
  fi
  if [ "${UI_TRUTH_RC:-1}" -ne 0 ]; then
    FAIL_STEP="ui_truth"
    FAIL_CMD="ui_dev smoke check"
    FAIL_RC="${UI_TRUTH_RC:-1}"
    fail_with_reason "UI_TRUTH_FAIL"
  fi
  if [ "${UI_LOCAL_RC}" -ne 0 ] || ! printf "%s\n" "${UI_LOCAL_OK_LINE}" | grep -q "UI_LOCAL_OK=1" || [ -z "${UI_URL_LINE}" ]; then
    FAIL_EXTRA_LINES="${FAIL_EXTRA_LINES:+${FAIL_EXTRA_LINES}"$'\n'"}${UI_LOCAL_OUTPUT}"
    FAIL_STEP="ui_local"
    FAIL_CMD="bash tools/ui/ui_dev.sh --smoke"
    if [ "${UI_LOCAL_RC}" -ne 0 ]; then
      FAIL_RC="${UI_LOCAL_RC}"
    else
      FAIL_RC=1
    fi
    fail_with_reason "UI_START_FAIL"
  fi
}
