#!/usr/bin/env bash
set -euo pipefail

# Extracted from tools/pass_cycle.sh (keep logic 1:1). Do not edit behavior here.
run_net_health() {
  NET_HEALTH_ATTEMPTED=1
  local output
  local json
  set +e
  output=$(${NODE_BIN} tools/net/net_health.mjs --json)
  NET_HEALTH_EXIT=$?
  set -e
  json=$(printf "%s" "${output}" | sed -n 's/^NET_HTTP_PROBE json=//p')
  if [ -z "${json}" ]; then
    json="${output}"
  fi
  NET_HEALTH_HTTP_OK=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.http_ok?1:0)')
  NET_HEALTH_API_OK=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.api_ok?1:0)')
  NET_HEALTH_FALLBACK_OK=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.fallback_ok?1:0)')
  NET_HEALTH_ONLINE=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.http_ok||d.api_ok||d.fallback_ok||d.connect_ok?1:0)')
NET_HEALTH_REASON=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.http_ok||d.api_ok||d.fallback_ok||d.connect_ok?"OK":"HTTP_API_CONNECT_FALLBACK_FAIL")')
  NET_HEALTH_DNS_NS=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.dns_ns||"UNKNOWN")')
  NET_HEALTH_DNS_ERR=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.dns_err||"UNKNOWN")')
  NET_HEALTH_DNS_DIAG_REASON=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.dns_diag_reason||"NONE")')
  NET_HEALTH_DNS_DIAG_HINT=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.dns_diag_hint||"-")')
  NET_HEALTH_PROBE_URL=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.target||"-")')
  NET_HEALTH_HTTP_STATUS=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.http_status||"-")')
  NET_HEALTH_HTTP_REASON=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.http_reason||"HTTP")')
  NET_HEALTH_API_STATUS=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.api_status||"-")')
  NET_HEALTH_API_REASON=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.api_reason||"HTTP")')
  NET_HEALTH_CONNECT_OK=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.connect_ok?1:0)')
  NET_HEALTH_CONNECT_ERR_RAW=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.connect_err_raw||d.connect_err||"UNKNOWN")')
  NET_HEALTH_CONNECT_REASON=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.connect_reason||"CONNECT_ERROR")')
  NET_HEALTH_CONNECT_TARGET=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.connect_target||"1.1.1.1:443")')
  NET_HEALTH_FALLBACK_STATUS=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.fallback_status||"-")')
  NET_HEALTH_FALLBACK_REASON=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.fallback_reason||"HTTP")')
  NET_HEALTH_FALLBACK_TARGET=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.fallback_target||"http://1.1.1.1/cdn-cgi/trace")')
  NET_HEALTH_RTT_MS=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.rtt_ms||0)')
  NET_HEALTH_DNS_OK=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.dns_ok?1:0)')
  NET_HEALTH_DNS_MODE=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.dns_ok? "OK":"FAIL")')
  NET_HEALTH_SOURCE=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.source||"LIVE")')
  NET_HEALTH_CACHE_HIT=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.cache_hit?1:0)')
}

if [ "${NET_ENABLED}" -eq 1 ]; then
  run_net_health
else
  NET_HEALTH_ATTEMPTED=0
  NET_HEALTH_ONLINE=0
  NET_HEALTH_URL="-"
  NET_HEALTH_STATUS="-"
  NET_HEALTH_ERR="-"
NET_HEALTH_REASON="CONFIG_DISABLED"
NET_HEALTH_EXIT=0
fi
NET_HEALTH_PROBE_URL="${NET_HEALTH_PROBE_URL:--}"
NET_HEALTH_HTTP_STATUS="${NET_HEALTH_HTTP_STATUS:--}"
NET_HEALTH_DNS_ERR="${NET_HEALTH_DNS_ERR:-UNKNOWN}"
NET_HEALTH_DNS_MODE="${NET_HEALTH_DNS_MODE:-FAIL}"
NET_HEALTH_DNS_DIAG_REASON="${NET_HEALTH_DNS_DIAG_REASON:-NONE}"
NET_HEALTH_DNS_DIAG_HINT="${NET_HEALTH_DNS_DIAG_HINT:--}"
WIKI_PING_STATUS="-"
WIKI_PING_REASON="-"
WIKI_PING_ERR="-"
WIKI_PING_OK=0
if [ "${NET_ENABLED}" -eq 1 ]; then
  set +e
  WIKI_PING_OUTPUT=$(${NODE_BIN} tools/wiki/mediawiki_api.mjs --ping 2>/dev/null || true)
  WIKI_PING_RC=0
  set -e
  WIKI_PING_STATUS=$(printf "%s" "${WIKI_PING_OUTPUT}" | sed -n 's/.*status=\([0-9-]*\).*/\1/p')
  WIKI_PING_REASON=$(printf "%s" "${WIKI_PING_OUTPUT}" | sed -n 's/.*reason=\([^ ]*\).*/\1/p')
  WIKI_PING_ERR=$(printf "%s" "${WIKI_PING_OUTPUT}" | sed -n 's/.*err=\([^ ]*\).*/\1/p')
  if [ "${WIKI_PING_RC}" -eq 0 ] && printf "%s" "${WIKI_PING_OUTPUT}" | grep -q "status=200"; then
    WIKI_PING_STATUS="200"
    WIKI_PING_REASON="OK"
    WIKI_PING_ERR="-"
    WIKI_PING_OK=1
  fi
fi

NET_HEALTH_LINE="NET_HEALTH: ok=${NET_HEALTH_ONLINE} reason=${NET_HEALTH_REASON} target=${NET_HEALTH_PROBE_URL} rtt_ms=${NET_HEALTH_RTT_MS} dns_diag=${NET_HEALTH_DNS_DIAG_REASON}"
NET_DIAG_DNS_LINE="NET_DIAG_DNS ok=${NET_HEALTH_DNS_OK} err=${NET_HEALTH_DNS_ERR} ns=${NET_HEALTH_DNS_NS} reason=${NET_HEALTH_DNS_DIAG_REASON} hint=${NET_HEALTH_DNS_DIAG_HINT}"
DNS_DIAG_LINE="DNS_DIAG ok=${NET_HEALTH_DNS_OK} err=${NET_HEALTH_DNS_ERR} ns=${NET_HEALTH_DNS_NS} reason=${NET_HEALTH_DNS_DIAG_REASON}"
NET_HTTP_PROBE_LINE="NET_HTTP_PROBE ok=${NET_HEALTH_HTTP_OK} target=${NET_HEALTH_PROBE_URL} status=${NET_HEALTH_HTTP_STATUS} reason=${NET_HEALTH_HTTP_REASON} api_ok=${NET_HEALTH_API_OK} api_status=${NET_HEALTH_API_STATUS} api_reason=${NET_HEALTH_API_REASON}"
CACHE_FRESH=0
if [ "${WIKI_CACHE_OK}" = "1" ]; then
  CACHE_FRESH=$(CACHE_AGE="${WIKI_CACHE_AGE_MAX}" CACHE_MAX="${WIKI_CACHE_MAX_AGE_H}" ${NODE_BIN} -e 'const age=Number(process.env.CACHE_AGE);const max=Number(process.env.CACHE_MAX);const ok=Number.isFinite(age)&&Number.isFinite(max)&&age<=max;console.log(ok?1:0)')
fi
NET_DIAG_LINE="NET_DIAG json={\"dns_ok\":${NET_HEALTH_DNS_OK},\"dns_err\":\"${NET_HEALTH_DNS_ERR}\",\"dns_ns\":\"${NET_HEALTH_DNS_NS}\",\"dns_mode\":\"${NET_HEALTH_DNS_MODE}\",\"dns_diag_reason\":\"${NET_HEALTH_DNS_DIAG_REASON}\",\"dns_diag_hint\":\"${NET_HEALTH_DNS_DIAG_HINT}\",\"http_ok\":${NET_HEALTH_HTTP_OK},\"http_status\":\"${NET_HEALTH_HTTP_STATUS}\",\"http_reason\":\"${NET_HEALTH_HTTP_REASON}\",\"api_ok\":${NET_HEALTH_API_OK},\"api_status\":\"${NET_HEALTH_API_STATUS}\",\"api_reason\":\"${NET_HEALTH_API_REASON}\",\"connect_ok\":${NET_HEALTH_CONNECT_OK},\"connect_err_raw\":\"${NET_HEALTH_CONNECT_ERR_RAW}\",\"connect_reason\":\"${NET_HEALTH_CONNECT_REASON}\",\"connect_target\":\"${NET_HEALTH_CONNECT_TARGET}\",\"fallback_ok\":${NET_HEALTH_FALLBACK_OK},\"fallback_status\":\"${NET_HEALTH_FALLBACK_STATUS}\",\"fallback_reason\":\"${NET_HEALTH_FALLBACK_REASON}\",\"fallback_target\":\"${NET_HEALTH_FALLBACK_TARGET}\",\"cache_ok\":${WIKI_CACHE_OK},\"cache_age_h\":\"${WIKI_CACHE_AGE_MAX}\",\"max_cache_h\":\"${WIKI_CACHE_MAX_AGE_H}\",\"cache_hit\":${WIKI_CACHE_HIT},\"source\":\"${NET_HEALTH_SOURCE}\"}"
NET_TRUTH_SOURCE_LINE="NET_TRUTH_SOURCE=EGRESS_TRUTH"
NET_PROBE_CACHE_HIT_LINE="NET_PROBE_CACHE_HIT=${NET_HEALTH_CACHE_HIT:-0}"
WIKI_PING_LINE="WIKI_PING status=${WIKI_PING_STATUS} reason=${WIKI_PING_REASON} err=${WIKI_PING_ERR} ok=${WIKI_PING_OK}"
WIKI_REACHABILITY_OK="${WIKI_PING_OK}"
WIKI_REACHABILITY_REASON="${WIKI_PING_REASON}"
if [ "${WIKI_PING_OK}" = "1" ]; then
  WIKI_REACHABILITY_REASON="OK"
elif [ -z "${WIKI_REACHABILITY_REASON}" ] || [ "${WIKI_REACHABILITY_REASON}" = "-" ]; then
  WIKI_REACHABILITY_REASON="UNAVAILABLE"
fi
WIKI_REACHABILITY_LINE="WIKI_REACHABILITY ok=${WIKI_REACHABILITY_OK} status=${WIKI_PING_STATUS} reason=${WIKI_REACHABILITY_REASON}"
echo "${NET_MODE_LINE}"
echo "${OVERRIDE_NETWORK_LINE}"
echo "${WIKI_MODE_LINE}"
echo "${SSOT_WRITE_LINE}"
echo "${NET_HEALTH_LINE}"
echo "${NET_DIAG_DNS_LINE}"
echo "${NET_HTTP_PROBE_LINE}"
echo "${NET_DIAG_LINE}"
echo "${WIKI_PING_LINE}"
echo "${WIKI_REACHABILITY_LINE}"

if [ "${DIAG_FAST}" = "1" ]; then
  cat /etc/resolv.conf || true
  if command -v scutil >/dev/null 2>&1; then
    scutil --dns | sed -n '1,160p' || true
  fi
  ${NODE_BIN} tools/net/dns_diag.mjs --json || true
  echo "NET_MODE enabled=${NET_ENABLED} fetch_network=${FETCH_NETWORK} override=${OVERRIDE_NETWORK}"
  if [ "${FETCH_NETWORK}" != "${INITIAL_FETCH_NETWORK}" ]; then
    echo "NETWORK_FLIP ok=0 initial=${INITIAL_FETCH_NETWORK} current=${FETCH_NETWORK}"
  else
  echo "NETWORK_FLIP ok=1"
  fi
  echo "${NET_DIAG_LINE}"
  if [ "${WIKI_PING_OK}" = "1" ] || [ "${NET_HEALTH_API_OK}" = "1" ] || [ "${NET_HEALTH_HTTP_OK}" = "1" ] || [ "${NET_HEALTH_CONNECT_OK}" = "1" ] || [ "${NET_HEALTH_FALLBACK_OK}" = "1" ]; then
    DIAG_ONLINE=1
    DIAG_ALLOW=1
    DIAG_REASON="OK"
  else
    DIAG_ONLINE=0
    if [ "${CACHE_FRESH}" = "1" ]; then
      DIAG_ALLOW=1
      DIAG_REASON="CACHE_OK"
    else
      DIAG_ALLOW=0
      case "${WIKI_CACHE_REASON}" in
        stale*|STALE*) DIAG_REASON="CACHE_STALE";;
        *) DIAG_REASON="NO_CACHE";;
      esac
    fi
  fi
  if [ "${DIAG_ONLINE}" = "1" ]; then
    DIAG_NET_MODE="ONLINE"
  elif [ "${CACHE_FRESH}" = "1" ]; then
    DIAG_NET_MODE="DEGRADED_CACHE"
  else
    DIAG_NET_MODE="OFFLINE"
  fi
  if [ "${DIAG_NET_MODE}" = "ONLINE" ] && [ "${NET_ENABLED}" -eq 1 ]; then
    DIAG_WIKI_REFRESH_MODE="LIVE"
  else
    DIAG_WIKI_REFRESH_MODE="CACHE_ONLY"
  fi
  echo "PIPELINE_NET_MODE=${DIAG_NET_MODE}"
  echo "WIKI_REFRESH_MODE=${DIAG_WIKI_REFRESH_MODE}"
  echo "OFFLINE_DECISION: online=${DIAG_ONLINE} allow_continue=${DIAG_ALLOW} reason=${DIAG_REASON} dns_diag=${NET_HEALTH_DNS_DIAG_REASON} source=${NET_HEALTH_SOURCE}"
  echo "EGRESS_TRUTH http_ok=${NET_HEALTH_HTTP_OK} api_ok=${NET_HEALTH_API_OK} connect_ok=${NET_HEALTH_CONNECT_OK} fallback_ok=${NET_HEALTH_FALLBACK_OK} online=${DIAG_ONLINE} net_mode=${DIAG_NET_MODE} source=${NET_HEALTH_SOURCE}"
  gate_start=$(step_now_ms)
  set +e
  gate_output=$(${NODE_BIN} tools/wiki/wiki_claim_gate.mjs --geos RU,RO,AU,US-CA,CA 2>&1)
  gate_rc=$?
  ssot_guard_output=$(${NODE_BIN} tools/wiki/ssot_shrink_guard.mjs --prev "${SSOT_GUARD_PREV}" 2>&1)
  ssot_guard_rc=$?
  set -e
  printf "%s\n" "${gate_output}"
  if [ "${ssot_guard_rc}" -ne 0 ]; then
    ssot_diff=$(printf "%s\n" "${ssot_guard_output}" | grep -E "^(SSOT_COUNTS |SSOT_GUARD |SSOT_COVERAGE |DATA_SHRINK_GUARD |SSOT_SHRINK_DIAG )" | head -n 8)
    if [ -n "${ssot_diff}" ]; then
      FAIL_EXTRA_LINES="${ssot_diff}"
    else
      FAIL_EXTRA_LINES="${ssot_guard_output}"
    fi
    FAIL_STEP="ssot_shrink_guard"
    FAIL_RC="${ssot_guard_rc}"
    ssot_reason=$(printf "%s\n" "${ssot_guard_output}" | grep -E "^SSOT_GUARD_OK=0" | tail -n 1 | sed -E "s/.*reason=([^ ]+).*/\\1/")
    if [ "${ssot_reason}" = "NOTES_EMPTY_STRICT" ]; then
      fail_with_reason "NOTES_EMPTY_STRICT"
    elif [ "${ssot_reason}" = "NOTES_SHRINK" ]; then
      fail_with_reason "NOTES_SHRINK"
    else
      fail_with_reason "DATA_SHRINK"
    fi
  fi
  gate_end=$(step_now_ms)
  gate_dur=$((gate_end - gate_start))
  if [ "${gate_rc}" -ne 0 ]; then
    echo "WIKI_GATE_OK=0 duration_ms=${gate_dur}"
    {
      printf "%s\n" "${NET_MODE_LINE}"
      printf "%s\n" "${OVERRIDE_NETWORK_LINE}"
      printf "%s\n" "${WIKI_MODE_LINE}"
      printf "%s\n" "${NET_HEALTH_LINE}"
      printf "%s\n" "${NET_DIAG_DNS_LINE}"
      printf "%s\n" "${NET_HTTP_PROBE_LINE}"
      printf "%s\n" "${NET_DIAG_LINE}"
      printf "%s\n" "${WIKI_PING_LINE}"
      printf "%s\n" "${WIKI_REACHABILITY_LINE}"
      printf "%s\n" "OFFLINE_DECISION: online=${DIAG_ONLINE} allow_continue=${DIAG_ALLOW} reason=${DIAG_REASON} dns_diag=${NET_HEALTH_DNS_DIAG_REASON} source=${NET_HEALTH_SOURCE}"
      printf "%s\n" "EGRESS_TRUTH http_ok=${NET_HEALTH_HTTP_OK} api_ok=${NET_HEALTH_API_OK} connect_ok=${NET_HEALTH_CONNECT_OK} fallback_ok=${NET_HEALTH_FALLBACK_OK} online=${DIAG_ONLINE} net_mode=${DIAG_NET_MODE} source=${NET_HEALTH_SOURCE}"
      if [ -n "${ssot_guard_output}" ]; then
        printf "%s\n" "${ssot_guard_output}"
      fi
      printf "%s\n" "${gate_output}"
      printf "%s\n" "CI_STATUS=FAIL"
      printf "%s\n" "PIPELINE_RC=1"
      printf "%s\n" "FAIL_REASON=WIKI_GATE_FAIL"
      printf "%s\n" "WIKI_GATE_OK=0 duration_ms=${gate_dur}"
    } > "${STDOUT_FILE}"
    cp "${STDOUT_FILE}" "${RUN_REPORT_FILE}" 2>/dev/null || true
    cp "${RUN_REPORT_FILE}" "${REPORTS_FINAL}" 2>/dev/null || true
    if [ "${CI_WRITE_ROOT}" = "1" ]; then
      cp "${RUN_REPORT_FILE}" "${ROOT}/ci-final.txt" 2>/dev/null || true
    fi
    SSOT_KEEP_UI_COUNTRY=0 ${NODE_BIN} tools/ssot/ssot_last_values.mjs >/dev/null 2>&1 || true
    exit 1
  fi
  echo "WIKI_GATE_DIAG duration_ms=${gate_dur}"
  {
    printf "%s\n" "${NET_MODE_LINE}"
    printf "%s\n" "${OVERRIDE_NETWORK_LINE}"
    printf "%s\n" "${WIKI_MODE_LINE}"
    printf "%s\n" "${NET_HEALTH_LINE}"
    printf "%s\n" "${NET_DIAG_DNS_LINE}"
    printf "%s\n" "${NET_HTTP_PROBE_LINE}"
    printf "%s\n" "${NET_DIAG_LINE}"
    printf "%s\n" "${WIKI_PING_LINE}"
    printf "%s\n" "${WIKI_REACHABILITY_LINE}"
    printf "%s\n" "OFFLINE_DECISION: online=${DIAG_ONLINE} allow_continue=${DIAG_ALLOW} reason=${DIAG_REASON} dns_diag=${NET_HEALTH_DNS_DIAG_REASON} source=${NET_HEALTH_SOURCE}"
    printf "%s\n" "EGRESS_TRUTH http_ok=${NET_HEALTH_HTTP_OK} api_ok=${NET_HEALTH_API_OK} connect_ok=${NET_HEALTH_CONNECT_OK} fallback_ok=${NET_HEALTH_FALLBACK_OK} online=${DIAG_ONLINE} net_mode=${DIAG_NET_MODE} source=${NET_HEALTH_SOURCE}"
    if [ -n "${ssot_guard_output}" ]; then
      printf "%s\n" "${ssot_guard_output}"
    fi
    printf "%s\n" "${gate_output}"
    printf "%s\n" "CI_STATUS=PASS"
    printf "%s\n" "PIPELINE_RC=0"
    printf "%s\n" "FAIL_REASON=OK"
    printf "%s\n" "WIKI_GATE_DIAG duration_ms=${gate_dur}"
  } > "${STDOUT_FILE}"
  cp "${STDOUT_FILE}" "${RUN_REPORT_FILE}" 2>/dev/null || true
  cp "${RUN_REPORT_FILE}" "${REPORTS_FINAL}" 2>/dev/null || true
  if [ "${CI_WRITE_ROOT}" = "1" ]; then
    cp "${RUN_REPORT_FILE}" "${ROOT}/ci-final.txt" 2>/dev/null || true
  fi
  SSOT_KEEP_UI_COUNTRY=0 ${NODE_BIN} tools/ssot/ssot_last_values.mjs >/dev/null 2>&1 || true
  exit 0
fi

NETWORK_DISABLED=0
NETWORK_DISABLED_REASON="-"
WIKI_ONLINE=0
if [ "${WIKI_PING_STATUS}" = "200" ]; then
  WIKI_ONLINE=1
fi
ONLINE_SIGNAL=0
if [ "${WIKI_PING_OK}" = "1" ] || [ "${NET_HEALTH_API_OK}" = "1" ] || [ "${NET_HEALTH_HTTP_OK}" = "1" ] || [ "${NET_HEALTH_CONNECT_OK}" = "1" ] || [ "${NET_HEALTH_FALLBACK_OK}" = "1" ]; then
  ONLINE_SIGNAL=1
fi
NET_MODE="OFFLINE"
SANDBOX_EGRESS=0
if [ "${NET_HEALTH_CONNECT_REASON}" = "SANDBOX_EGRESS_BLOCKED" ]; then
  SANDBOX_EGRESS=1
fi
if [ "${ONLINE_SIGNAL}" = "1" ]; then
  NET_MODE="ONLINE"
elif [ "${CACHE_FRESH}" = "1" ]; then
  NET_MODE="DEGRADED_CACHE"
fi
PIPELINE_NET_MODE="${NET_MODE}"
if [ "${PIPELINE_NET_MODE}" = "ONLINE" ] && [ "${NET_ENABLED}" -eq 1 ]; then
  WIKI_REFRESH_MODE="LIVE"
else
  WIKI_REFRESH_MODE="CACHE_ONLY"
fi
echo "PIPELINE_NET_MODE=${PIPELINE_NET_MODE}"
echo "WIKI_REFRESH_MODE=${WIKI_REFRESH_MODE}"
if [ "${NET_ENABLED}" -eq 1 ]; then
  if [ "${ONLINE_SIGNAL}" = "0" ] && [ "${CACHE_FRESH}" = "1" ] && [ "${NET_MODE}" != "DEGRADED_CACHE" ]; then
    fail_with_reason "NET_MODE_MISMATCH:expected_DEGRADED_CACHE"
  fi
  if [ "${ONLINE_SIGNAL}" = "1" ] && [ "${NET_MODE}" != "ONLINE" ]; then
    fail_with_reason "NET_MODE_MISMATCH:expected_ONLINE"
  fi
fi
if [ "${NET_ENABLED}" -eq 0 ]; then
  NETWORK_DISABLED=1
  NETWORK_DISABLED_REASON="CONFIG_NETWORK_DISABLED"
  OFFLINE=0
  OFFLINE_REASON="CONFIG_DISABLED"
  if [ "${WIKI_OFFLINE_OK}" != "1" ] || [ "${WIKI_CACHE_OK}" != "1" ]; then
    fail_with_reason "CONFIG_NETWORK_DISABLED"
  fi
elif [ "${NET_MODE}" = "OFFLINE" ]; then
  OFFLINE_REASON="HTTP_STATUS"
  for candidate in "${NET_HEALTH_HTTP_REASON}" "${NET_HEALTH_API_REASON}" "${NET_HEALTH_FALLBACK_REASON}" "${NET_HEALTH_CONNECT_REASON}"; do
    case "${candidate}" in
      TLS*) OFFLINE_REASON="TLS"; break;;
      TIMEOUT*) OFFLINE_REASON="TIMEOUT"; break;;
      CONN_REFUSED*|REFUSED*) OFFLINE_REASON="CONN_REFUSED"; break;;
      NO_ROUTE*|NO_NETWORK*) OFFLINE_REASON="NO_ROUTE"; break;;
      SANDBOX_EGRESS_BLOCKED*) OFFLINE_REASON="NO_ROUTE"; break;;
      HTTP_STATUS*) OFFLINE_REASON="HTTP_STATUS"; break;;
      HTTP) OFFLINE_REASON="HTTP_STATUS"; break;;
      DNS*|CONNECT_POLICY*|CONNECT_ERROR*|"") ;;
    esac
  done
  OFFLINE=1
  FETCH_DIAG_LINE="FETCH_DIAG: url=${NET_HEALTH_PROBE_URL} err=${NET_HEALTH_REASON} code=${OFFLINE_REASON}"
  if [ "${WIKI_OFFLINE_OK}" != "1" ]; then
    fail_with_reason "OFFLINE_NOT_ALLOWED:${OFFLINE_REASON}"
  fi
  if [ "${WIKI_ALLOW_OFFLINE:-0}" != "1" ] || [ "${WIKI_CACHE_OK}" != "1" ]; then
    fail_with_reason "NETWORK_FETCH_FAILED:${OFFLINE_REASON}"
  fi
elif [ "${NET_MODE}" = "DEGRADED_CACHE" ]; then
  OFFLINE_REASON="NONE"
  OFFLINE=0
fi

NETWORK="${NETWORK}"
FETCH_NETWORK="${FETCH_NETWORK}"
ALLOW_NETWORK="${ALLOW_NETWORK}"
FACTS_NETWORK="${FACTS_NETWORK}"
export ALLOW_NETWORK NETWORK FETCH_NETWORK FACTS_NETWORK
NETCHECK_ATTEMPTED="${NET_HEALTH_ATTEMPTED}"
NETCHECK_STATUS="${NET_HEALTH_STATUS}"
NETCHECK_ERR="${NET_HEALTH_ERR}"
NETCHECK_EXIT="${NET_HEALTH_EXIT}"

NETWORK_DISABLED_LINE="NETWORK_DISABLED: ${NETWORK_DISABLED} reason=${NETWORK_DISABLED_REASON}"
WIKI_NETCHECK_LINE="WIKI_NETCHECK: attempted=${NETCHECK_ATTEMPTED} status=${NETCHECK_STATUS} err=${NETCHECK_ERR} exit=${NETCHECK_EXIT}"
OFFLINE_LINE="OFFLINE: ${OFFLINE} reason=${OFFLINE_REASON}"
OFFLINE_REASON_LINE="OFFLINE_REASON=${OFFLINE_REASON}"
NET_REASON_LINE="NET_REASON=${NET_HEALTH_REASON}"
DNS_LINE="DNS_NS=${NET_HEALTH_DNS_NS} DNS_OK=${NET_HEALTH_DNS_OK} DNS_MODE=${NET_HEALTH_DNS_MODE} DNS_ERR=${NET_HEALTH_DNS_ERR}"
HTTPS_PROBE_LINE="HTTPS_PROBE=${NET_HEALTH_PROBE_URL} PROBE_OK=${NET_HEALTH_HTTP_OK} PROBE_CODE=${NET_HEALTH_HTTP_STATUS}"
EGRESS_TRUTH_LINE="EGRESS_TRUTH http_ok=${NET_HEALTH_HTTP_OK} api_ok=${NET_HEALTH_API_OK} connect_ok=${NET_HEALTH_CONNECT_OK} fallback_ok=${NET_HEALTH_FALLBACK_OK} online=${ONLINE_SIGNAL} net_mode=${NET_MODE} source=${NET_HEALTH_SOURCE}"
ONLINE_POLICY_LINE="ONLINE_POLICY truth=EGRESS_TRUTH dns=diag_only"
ONLINE_REASON_LINE="ONLINE_REASON=${NET_HEALTH_REASON}"
if [ "${WIKI_PING_STATUS}" = "200" ] && [ "${OFFLINE}" = "1" ]; then
  fail_with_reason "OFFLINE_CONTRADICTION"
fi
OFFLINE_DECISION_ONLINE=0
if [ "${ONLINE_SIGNAL}" = "1" ]; then
  OFFLINE_DECISION_ONLINE=1
fi
OFFLINE_DECISION_ALLOW=1
OFFLINE_DECISION_REASON="NONE"
CI_LOCAL_OFFLINE_OK=0
if [ "${OFFLINE_DECISION_ONLINE}" != "1" ]; then
  OFFLINE_DECISION_ONLINE=0
  if [ "${CACHE_FRESH}" = "1" ]; then
    OFFLINE_DECISION_ALLOW=1
    OFFLINE_DECISION_REASON="CACHE_OK"
    CI_LOCAL_OFFLINE_OK=1
  else
    OFFLINE_DECISION_ALLOW=0
    case "${WIKI_CACHE_REASON}" in
      stale*|STALE*) OFFLINE_DECISION_REASON="CACHE_STALE";;
      *) OFFLINE_DECISION_REASON="NO_CACHE";;
    esac
  fi
else
  OFFLINE_DECISION_REASON="OK"
fi
if [ "${NET_HEALTH_DNS_OK}" = "1" ]; then
  OFFLINE_DECISION_DNS_DIAG="ok"
else
  OFFLINE_DECISION_DNS_DIAG="${NET_HEALTH_DNS_DIAG_REASON}"
fi
OFFLINE_DECISION_LINE="OFFLINE_DECISION: online=${OFFLINE_DECISION_ONLINE} allow_continue=${OFFLINE_DECISION_ALLOW} reason=${OFFLINE_DECISION_REASON} dns_diag=${OFFLINE_DECISION_DNS_DIAG} source=${NET_HEALTH_SOURCE}"
OFFLINE_DECISION_V2_REASON="NONE"
if [ "${OFFLINE}" = "1" ]; then
  OFFLINE_DECISION_V2_REASON="${OFFLINE_REASON}"
elif [ "${NET_MODE}" = "DEGRADED_CACHE" ]; then
  OFFLINE_DECISION_V2_REASON="CACHE_OK"
elif [ "${NET_ENABLED}" -eq 0 ]; then
  OFFLINE_DECISION_V2_REASON="CONFIG_DISABLED"
fi
OFFLINE_DECISION_V2_LINE="OFFLINE_DECISION offline=${OFFLINE} reason=${OFFLINE_DECISION_V2_REASON} allow_cache=${WIKI_ALLOW_OFFLINE}"
echo "${OFFLINE_DECISION_LINE}"
if [ "${NET_MODE}" = "OFFLINE" ] && { [ "${WIKI_PING_OK}" = "1" ] || [ "${NET_HEALTH_API_OK}" = "1" ] || [ "${NET_HEALTH_HTTP_OK}" = "1" ] || [ "${NET_HEALTH_CONNECT_OK}" = "1" ] || [ "${NET_HEALTH_FALLBACK_OK}" = "1" ]; }; then
  echo "OFFLINE_CONTRADICTION=1 reason=PROBE_OK"
  exit 2
fi

RU_BLOCKED_ENV="${RU_BLOCKED:-0}"
RU_BLOCKED=0
RU_BLOCKED_REASON="-"
if [ "${RU_BLOCKED_ENV}" = "1" ]; then
  RU_BLOCKED=1
  RU_BLOCKED_REASON="RU_BLOCKED"
fi
export RU_BLOCKED

if [ "${NETWORK:-0}" = "1" ]; then
  MIN_SOURCES_PER_RUN_SET=0
  if [ -n "${MIN_SOURCES_PER_RUN+x}" ]; then
    MIN_SOURCES_PER_RUN_SET=1
  fi
  if [ -z "${AUTO_LEARN+x}" ]; then
    AUTO_LEARN=1
  fi
  if [ -z "${AUTO_VERIFY+x}" ]; then
    AUTO_VERIFY=1
  fi
  if [ -z "${AUTO_FACTS+x}" ]; then
    AUTO_FACTS=1
  fi
  if [ "${AUTO_LEARN_SCALE:-0}" = "1" ]; then
    AUTO_LEARN_MODE="scale"
  elif [ "${AUTO_LEARN:-0}" = "1" ] && [ -z "${AUTO_LEARN_MODE+x}" ] && [ "${MIN_SOURCES_PER_RUN_SET}" -eq 1 ]; then
    AUTO_LEARN_MODE="min_sources"
  elif [ "${AUTO_LEARN:-0}" = "1" ] && [ -z "${AUTO_LEARN_MODE+x}" ]; then
    AUTO_LEARN_MODE="scale"
  fi
  if [ "${AUTO_LEARN_MIN_SOURCES:-0}" = "1" ]; then
    AUTO_LEARN_MODE="min_sources"
  fi
  if [ "${AUTO_LEARN_MODE:-}" = "scale" ]; then
    if [ -z "${AUTO_LEARN_BATCH+x}" ]; then
      AUTO_LEARN_BATCH=120
    fi
    if [ -z "${AUTO_LEARN_PARALLEL+x}" ]; then
      AUTO_LEARN_PARALLEL=8
    fi
    if [ -z "${AUTO_LEARN_TIMEOUT_MS+x}" ]; then
      AUTO_LEARN_TIMEOUT_MS=12000
    fi
    if [ -z "${AUTO_LEARN_RETRIES+x}" ]; then
      AUTO_LEARN_RETRIES=2
    fi
    if [ -z "${AUTO_LEARN_MAX_TARGETS+x}" ]; then
      AUTO_LEARN_MAX_TARGETS=120
    fi
  fi
  if [ -z "${MIN_SOURCES_PER_RUN+x}" ]; then
    MIN_SOURCES_PER_RUN=3
  fi
  export AUTO_LEARN AUTO_VERIFY AUTO_FACTS AUTO_LEARN_MODE
  export AUTO_LEARN_BATCH AUTO_LEARN_PARALLEL AUTO_LEARN_TIMEOUT_MS AUTO_LEARN_RETRIES AUTO_LEARN_MAX_TARGETS
  export MIN_SOURCES_PER_RUN
fi

if [ "${AUTO_LEARN:-0}" = "1" ] && [ -z "${AUTO_VERIFY+x}" ]; then
  AUTO_VERIFY=1
fi
NO_PROGRESS_STRICT="${NO_PROGRESS_STRICT:-0}"
NOTES_SHRINK_GUARD_PHASE="${NOTES_SHRINK_GUARD_PHASE:-post}"

LAW_PAGE_OK="0"
if [ -f "${ROOT}/Reports/auto_learn_law/last_run.json" ]; then
  LAW_PAGE_OK=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const path=process.env.ROOT_DIR+"/Reports/auto_learn_law/last_run.json";if(!fs.existsSync(path)){process.stdout.write("0");process.exit(0);}const data=JSON.parse(fs.readFileSync(path,"utf8"));const url=String(data.law_page_ok_url||"");process.stdout.write(url&&url!=="-"?"1":"0");')
fi
FORCE_CANNABIS=0
if [ -n "${TARGET_ISO:-}" ] || [ "${LAW_PAGE_OK}" = "1" ]; then
  FORCE_CANNABIS=1
  AUTO_FACTS=1
  AUTO_FACTS_PIPELINE="cannabis"
fi
export AUTO_FACTS AUTO_FACTS_PIPELINE FORCE_CANNABIS

NETWORK_GUARD="${NETWORK_GUARD:-1}"

if [ "${ALLOW_SCOPE_OVERRIDE:-0}" = "1" ] && [ "${EXTENDED_SMOKE:-0}" != "1" ]; then
  echo "❌ FAIL: ALLOW_SCOPE_OVERRIDE запрещён вне EXTENDED_SMOKE"
  fail_with_reason "ALLOW_SCOPE_OVERRIDE запрещён вне EXTENDED_SMOKE"
fi

${NODE_BIN} tools/sources/build_sources_registry.mjs >>"${PRE_LOG}" 2>&1

run_step "wiki_legality_table_sync" 60 "${NODE_BIN} tools/wiki/wiki_legality_table_sync.mjs >>\"${PRE_LOG}\" 2>&1"

set +e
SSOT_OFFICIAL_VALIDATE_OUTPUT=$(${NODE_BIN} tools/ssot/validate_official_ssot.mjs 2>&1)
SSOT_OFFICIAL_VALIDATE_RC=$?
SSOT_WIKI_VALIDATE_OUTPUT=$(${NODE_BIN} tools/ssot/validate_wiki_ssot.mjs 2>&1)
SSOT_WIKI_VALIDATE_RC=$?
SSOT_VALIDATE_OUTPUT=$(${NODE_BIN} tools/ssot/ssot_validate.mjs 2>&1)
SSOT_VALIDATE_RC=$?
set -e
printf "%s\n" "${SSOT_OFFICIAL_VALIDATE_OUTPUT}" >> "${PRE_LOG}"
printf "%s\n" "${SSOT_WIKI_VALIDATE_OUTPUT}" >> "${PRE_LOG}"
printf "%s\n" "${SSOT_VALIDATE_OUTPUT}" >> "${PRE_LOG}"
if [ "${SSOT_OFFICIAL_VALIDATE_RC}" -ne 0 ] || [ "${SSOT_WIKI_VALIDATE_RC}" -ne 0 ] || [ "${SSOT_VALIDATE_RC}" -ne 0 ]; then
  FAIL_EXTRA_LINES="${SSOT_OFFICIAL_VALIDATE_OUTPUT}"$'\n'"${SSOT_WIKI_VALIDATE_OUTPUT}"$'\n'"${SSOT_VALIDATE_OUTPUT}"
  FAIL_STEP="ssot_validate"
  FAIL_CMD="${NODE_BIN} tools/ssot/validate_official_ssot.mjs + validate_wiki_ssot.mjs + ssot_validate.mjs"
  fail_with_reason "SSOT_VALIDATE_FAIL"
fi

TOP50_LINE="TOP50_INGEST: added=0 updated=0 missing_official=0"
if [ "${TOP50_INGEST:-0}" = "1" ]; then
  ${NODE_BIN} tools/seo/top50_to_candidates.mjs >>"${PRE_LOG}" 2>&1
  ${NODE_BIN} tools/registry/ingest_top50_provisional.mjs >>"${PRE_LOG}" 2>&1
  TOP50_LINE=$(${NODE_BIN} tools/registry/render_top50_ingest_line.mjs) || {
    fail_with_reason "invalid top50 ingest report";
  }
fi

set +e
${NODE_BIN} tools/promotion/promote_next.mjs --count=1 --seed=1337 >>"${PRE_LOG}" 2>&1
PRE_STATUS=$?
if [ "${PRE_STATUS}" -eq 0 ]; then
  ${NODE_BIN} tools/validate-sources-registry-extra.mjs >>"${PRE_LOG}" 2>&1
  PRE_STATUS=$?
fi
if [ "${PRE_STATUS}" -eq 0 ]; then
  ${NODE_BIN} tools/validate-iso3166.js >>"${PRE_LOG}" 2>&1
  PRE_STATUS=$?
fi
if [ "${PRE_STATUS}" -eq 0 ]; then
  ${NODE_BIN} tools/validate-laws.js >>"${PRE_LOG}" 2>&1
  PRE_STATUS=$?
fi
if [ "${PRE_STATUS}" -eq 0 ]; then
  ${NODE_BIN} tools/validate-laws-extended.js >>"${PRE_LOG}" 2>&1
  PRE_STATUS=$?
fi
if [ "${PRE_STATUS}" -eq 0 ]; then
  ${NODE_BIN} tools/validate-sources-registry.mjs >>"${PRE_LOG}" 2>&1
  PRE_STATUS=$?
fi
if [ "${PRE_STATUS}" -eq 0 ]; then
  ${NODE_BIN} tools/laws/validate_sources.mjs >>"${PRE_LOG}" 2>&1
  PRE_STATUS=$?
fi
if [ "${PRE_STATUS}" -eq 0 ]; then
  ${NODE_BIN} tools/coverage/report_coverage.mjs >>"${PRE_LOG}" 2>&1
  PRE_STATUS=$?
fi
set -e
if [ "${PRE_STATUS}" -ne 0 ]; then
  PRE_REASON=$(tail -n 1 "${PRE_LOG}" 2>/dev/null || true)
  fail_with_reason "${PRE_REASON:-pre-step failed}"
fi

run_step "wiki_claim_gate" 60 "${NODE_BIN} tools/wiki/wiki_claim_gate.mjs --geos RU,RO,AU,US-CA,CA >>\"${PRE_LOG}\" 2>&1"
run_step "notes_sections_backfill" 60 "bash tools/sync/wiki_notes_backfill.sh >>\"${PRE_LOG}\" 2>&1"
NOTES_COVERAGE_PATH="${ROOT}/Reports/notes-coverage.txt"
run_shrink_guard_step
WIKI_GATE_OK_LINE=$(grep -E "WIKI_GATE_OK=" "${PRE_LOG}" | tail -n 1 || true)
if [ -z "${WIKI_GATE_OK_LINE}" ]; then
  WIKI_GATE_OK_LINE="WIKI_GATE_OK=0 ok=0 fail=0"
fi
if echo "${WIKI_GATE_OK_LINE}" | grep -q "WIKI_GATE_OK=1 ok=5 fail=0"; then
  WIKI_GATE_OK_FLAG=1
  stage_mark "WIKI"
else
  WIKI_GATE_OK_FLAG=0
fi
if [ "${NOTES_STRICT:-0}" = "1" ] && [ "${NOTES_ALL_GATE}" = "1" ] && [ "${NOTES_SCOPE:-}" = "ALL" ]; then
  set +e
  NOTES_SCOPE=ALL NOTES_STRICT=1 ${NODE_BIN} tools/wiki/wiki_db_gate.mjs >>"${PRE_LOG}" 2>&1
  NOTES_DB_ALL_RC=$?
  set -e
else
  NOTES_DB_ALL_RC=0
fi
NOTES_WEAK_MAX="${NOTES_WEAK_MAX:-10}"
NOTES_WEAK_POLICY_LINE="NOTES_WEAK_POLICY fail_on_weak=1 max=${NOTES_WEAK_MAX} scope=5geo"
printf "%s\n" "${NOTES_WEAK_POLICY_LINE}" >>"${PRE_LOG}"
run_wiki_db_gate_step
set +e
NOTES_COVERAGE_OUTPUT=$(${NODE_BIN} tools/wiki/wiki_db_gate.mjs --report-notes-coverage 2>&1)
NOTES_COVERAGE_RC=$?
set -e
printf "%s\n" "${NOTES_COVERAGE_OUTPUT}" > "${NOTES_COVERAGE_PATH}"
printf "%s\n" "${NOTES_COVERAGE_OUTPUT}" >> "${PRE_LOG}"
NOTES_COVERAGE_LINE=$(printf "%s\n" "${NOTES_COVERAGE_OUTPUT}" | grep -E "^NOTES_COVERAGE " | tail -n 1 || true)
NOTES_COVERAGE_WITH_NOTES=$(notes_coverage_value "${NOTES_COVERAGE_LINE}" "with_notes")
NOTES_COVERAGE_EMPTY=$(notes_coverage_value "${NOTES_COVERAGE_LINE}" "empty")
NOTES_COVERAGE_PLACEHOLDER=$(notes_coverage_value "${NOTES_COVERAGE_LINE}" "placeholder")
NOTES_COVERAGE_WEAK=$(notes_coverage_value "${NOTES_COVERAGE_LINE}" "weak")
set +e
NOTES_COVERAGE_GUARD_OUTPUT=$(bash tools/ssot_shrink_guard.sh 2>&1)
NOTES_COVERAGE_GUARD_RC=$?
set -e
if [ -n "${NOTES_COVERAGE_GUARD_OUTPUT}" ]; then
  printf "%s\n" "${NOTES_COVERAGE_GUARD_OUTPUT}" >> "${PRE_LOG}"
fi
NOTES_COVERAGE_BASELINE_PATH_LINE=$(printf "%s\n" "${NOTES_COVERAGE_GUARD_OUTPUT}" | grep -E "^NOTES_COVERAGE_BASELINE_PATH=" | tail -n 1 || true)
NOTES_COVERAGE_CURRENT_COUNT_LINE=$(printf "%s\n" "${NOTES_COVERAGE_GUARD_OUTPUT}" | grep -E "^NOTES_COVERAGE_CURRENT_COUNT=" | tail -n 1 || true)
NOTES_COVERAGE_GUARD_LINE=$(printf "%s\n" "${NOTES_COVERAGE_GUARD_OUTPUT}" | grep -E "^NOTES_COVERAGE_GUARD=" | tail -n 1 || true)
NOTES_COVERAGE_GUARD_REASON_LINE=$(printf "%s\n" "${NOTES_COVERAGE_GUARD_OUTPUT}" | grep -E "^NOTES_COVERAGE_SHRINK_REASON=" | tail -n 1 || true)
if [ "${NOTES_COVERAGE_GUARD_RC}" -ne 0 ] || printf "%s\n" "${NOTES_COVERAGE_GUARD_OUTPUT}" | grep -q "NOTES_COVERAGE_GUARD=FAIL"; then
  FAIL_EXTRA_LINES="${FAIL_EXTRA_LINES:+${FAIL_EXTRA_LINES}"$'\n'"}${NOTES_COVERAGE_GUARD_OUTPUT}"
  fail_with_reason "NOTES_COVERAGE_SHRINK"
fi
if [ "${NOTES_SHRINK_GUARD_PHASE}" = "pre" ]; then
  NOTES_SHRINK_ERR_TRAP="$(trap -p ERR || true)"
  trap - ERR
  set +e
  NOTES_SHRINK_OUTPUT=$(${NODE_BIN} tools/gates/notes_shrink_guard.mjs 2>&1)
  NOTES_SHRINK_RC=$?
  set -e
  if [ -n "${NOTES_SHRINK_ERR_TRAP}" ]; then
    eval "${NOTES_SHRINK_ERR_TRAP}"
  fi
  if [ -n "${NOTES_SHRINK_OUTPUT}" ]; then
    printf "%s\n" "${NOTES_SHRINK_OUTPUT}" >> "${PRE_LOG}"
  fi
  NOTES_SHRINK_GUARD_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_QUALITY_GUARD=" | tail -n 1 || true)
  NOTES_SHRINK_OK_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_ALLOW_SHRINK=" | tail -n 1 || true)
  NOTES_SHRINK_GUARD_REASON_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_SHRINK_REASON=" | tail -n 1 || true)
  NOTES_BASELINE_WITH_NOTES_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_BASELINE_WITH_NOTES=" | tail -n 1 || true)
  NOTES_CURRENT_WITH_NOTES_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_CURRENT_WITH_NOTES=" | tail -n 1 || true)
  NOTES_BASELINE_OK_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_BASELINE_OK=" | tail -n 1 || true)
  NOTES_CURRENT_OK_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_CURRENT_OK=" | tail -n 1 || true)
  NOTES_BASELINE_EMPTY_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_BASELINE_EMPTY=" | tail -n 1 || true)
  NOTES_CURRENT_EMPTY_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_CURRENT_EMPTY=" | tail -n 1 || true)
  NOTES_BASELINE_PLACEHOLDER_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_BASELINE_PLACEHOLDER=" | tail -n 1 || true)
  NOTES_CURRENT_PLACEHOLDER_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_CURRENT_PLACEHOLDER=" | tail -n 1 || true)
  NOTES_BASELINE_WEAK_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_BASELINE_WEAK=" | tail -n 1 || true)
  NOTES_CURRENT_WEAK_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_CURRENT_WEAK=" | tail -n 1 || true)
  NOTES_WEAK_COUNT_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_WEAK_COUNT=" | tail -n 1 || true)
  NOTES_WEAK_GEOS_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_WEAK_GEOS=" | tail -n 1 || true)
  NOTES_MIN_ONLY_GEOS_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_MIN_ONLY_GEOS=" | tail -n 1 || true)
  NOTES_WEAK_COUNT_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_WEAK_COUNT=" | tail -n 1 || true)
  NOTES_WEAK_GEOS_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_WEAK_GEOS=" | tail -n 1 || true)
  NOTES_WEAK_COUNT_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_WEAK_COUNT=" | tail -n 1 || true)
  NOTES_WEAK_GEOS_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_WEAK_GEOS=" | tail -n 1 || true)
  NOTES_MIN_ONLY_GEOS_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_MIN_ONLY_GEOS=" | tail -n 1 || true)
  NOTES_BASELINE_KIND_RICH_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_BASELINE_KIND_RICH=" | tail -n 1 || true)
  NOTES_CURRENT_KIND_RICH_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_CURRENT_KIND_RICH=" | tail -n 1 || true)
  NOTES_BASELINE_KIND_MIN_ONLY_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_BASELINE_KIND_MIN_ONLY=" | tail -n 1 || true)
  NOTES_CURRENT_KIND_MIN_ONLY_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_CURRENT_KIND_MIN_ONLY=" | tail -n 1 || true)
  NOTES_BASELINE_STRICT_WEAK_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_BASELINE_STRICT_WEAK=" | tail -n 1 || true)
  NOTES_CURRENT_STRICT_WEAK_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_CURRENT_STRICT_WEAK=" | tail -n 1 || true)
  NOTES_TOTAL_GEO_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_TOTAL_GEO=" | tail -n 1 || true)
  NOTES_MIN_ONLY_REGRESSIONS_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_MIN_ONLY_REGRESSIONS=" | tail -n 1 || true)
  NOTES_MIN_ONLY_REGRESSION_GEOS_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_MIN_ONLY_REGRESSION_GEOS=" | tail -n 1 || true)
  if [ "${NOTES_SHRINK_RC}" -ne 0 ] || printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -q "NOTES_QUALITY_GUARD=FAIL"; then
    FAIL_EXTRA_LINES="${FAIL_EXTRA_LINES:+${FAIL_EXTRA_LINES}"$'\n'"}${NOTES_SHRINK_OUTPUT}"
    FAIL_STEP="notes_shrink_guard"
    FAIL_CMD="${NODE_BIN} tools/gates/notes_shrink_guard.mjs"
    fail_with_reason "NOTES_SHRINK"
  fi
fi
set +e
NOTES_QUALITY_OUTPUT=$(${NODE_BIN} tools/wiki/notes_coverage_gate.mjs 2>&1)
NOTES_QUALITY_RC=$?
set -e
if [ -n "${NOTES_QUALITY_OUTPUT}" ]; then
  printf "%s\n" "${NOTES_QUALITY_OUTPUT}" >> "${PRE_LOG}"
fi
NOTES_OK_LINE=$(printf "%s\n" "${NOTES_QUALITY_OUTPUT}" | grep -E "^NOTES_OK=" | tail -n 1 || true)
NOTES_PLACEHOLDER_LINE=$(printf "%s\n" "${NOTES_QUALITY_OUTPUT}" | grep -E "^NOTES_PLACEHOLDER=" | tail -n 1 || true)
NOTES_WEAK_LINE=$(printf "%s\n" "${NOTES_QUALITY_OUTPUT}" | grep -E "^NOTES_WEAK=" | tail -n 1 || true)
NOTES_QUALITY_GUARD_LINE=$(printf "%s\n" "${NOTES_QUALITY_OUTPUT}" | grep -E "^NOTES_QUALITY_GUARD=" | tail -n 1 || true)
NOTES_QUALITY_ALLOW_LINE=$(printf "%s\n" "${NOTES_QUALITY_OUTPUT}" | grep -E "^NOTES_QUALITY_ALLOW_DROP=" | tail -n 1 || true)
NOTES_QUALITY_REASON_LINE=$(printf "%s\n" "${NOTES_QUALITY_OUTPUT}" | grep -E "^NOTES_QUALITY_DROP_REASON=" | tail -n 1 || true)
if [ "${NOTES_QUALITY_RC}" -ne 0 ] || printf "%s\n" "${NOTES_QUALITY_OUTPUT}" | grep -q "NOTES_QUALITY_GUARD=FAIL"; then
  FAIL_EXTRA_LINES="${FAIL_EXTRA_LINES:+${FAIL_EXTRA_LINES}"$'\n'"}${NOTES_QUALITY_OUTPUT}"
  fail_with_reason "NOTES_QUALITY_DROP"
fi
if [ "${NOTES_COVERAGE_RC}" -ne 0 ]; then
  FAIL_STEP="wiki_db_gate"
  FAIL_RC="${NOTES_COVERAGE_RC}"
  FAIL_CMD="${NODE_BIN} tools/wiki/wiki_db_gate.mjs --report-notes-coverage"
  fail_with_reason "NOTES_COVERAGE_FAIL"
fi
if [ "${NOTES_STRICT:-0}" = "1" ] && [ "${NOTES_SCOPE:-}" = "ALL" ]; then
  if [ "${NOTES_COVERAGE_EMPTY:-0}" -gt 0 ]; then
    FAIL_STEP="wiki_db_gate"
    FAIL_RC=1
    FAIL_CMD="notes_coverage_all"
    fail_with_reason "NOTES_EMPTY"
  fi
fi
WIKI_GATE_BLOCK=$(awk '
  /^WIKI_GATE /{block="";inblock=1}
  inblock{block=block $0 "\n"}
  /^WIKI_GATE_OK=/{inblock=0;last=block}
  END{printf "%s", last}
' "${PRE_LOG}" 2>/dev/null || true)
WIKI_DB_BLOCK=$(awk '
  /^WIKI_DB_GATE /{block="";inblock=1}
  inblock{block=block $0 "\n"}
  /^WIKI_DB_GATE_OK=/{inblock=0;last=block}
  END{printf "%s", last}
' "${PRE_LOG}" 2>/dev/null || true)
WIKI_DB_GATE_OK_LINE=$(grep -E "^WIKI_DB_GATE_OK=" "${PRE_LOG}" | tail -n 1 || true)
if [ -z "${WIKI_DB_GATE_OK_LINE}" ]; then
  WIKI_DB_GATE_OK_LINE="WIKI_DB_GATE_OK=0 ok=0 fail=0"
fi
if echo "${WIKI_DB_GATE_OK_LINE}" | grep -q "WIKI_DB_GATE_OK=1"; then
  WIKI_DB_GATE_OK_FLAG=1
else
  WIKI_DB_GATE_OK_FLAG=0
fi
NOTES_STRICT_RESULT_ALL_LINE=$(grep -E "^NOTES_STRICT_RESULT " "${PRE_LOG}" | grep "scope=ALL" | tail -n 1 || true)
NOTES_STRICT_RESULT_5_LINE=$(grep -E "^NOTES_STRICT_RESULT " "${PRE_LOG}" | grep "scope=geos:RU,RO,AU,US-CA,CA" | tail -n 1 || true)
if [ -z "${NOTES_STRICT_RESULT_5_LINE}" ]; then
  NOTES_STRICT_RESULT_5_LINE=$(grep -E "^NOTES_STRICT_RESULT " "${PRE_LOG}" | tail -n 1 || true)
fi
NOTES_STRICT_RESULT_LINE="${NOTES_STRICT_RESULT_ALL_LINE:-${NOTES_STRICT_RESULT_5_LINE}}"

CI_LOCAL_ENV="CI_LOCAL_OFFLINE_OK=${CI_LOCAL_OFFLINE_OK}"
if [ "${CI_LOCAL_OFFLINE_OK}" = "1" ]; then
  CI_LOCAL_ENV="CI_LOCAL_OFFLINE_OK=1 ALLOW_SMOKE_SKIP=1 SMOKE_MODE=skip"
fi
MAP_ENABLED="${MAP_ENABLED:-0}"
export MAP_ENABLED
set +e
run_ci_local_step
CI_LOCAL_RC="${CI_LOCAL_STEP_RC:-1}"
set -e
CI_LOCAL_STEP_LINE="STEP_END name=ci_local rc=${CI_LOCAL_RC}"
CI_LOCAL_RESULT_LINE="CI_LOCAL_RESULT rc=${CI_LOCAL_RC} skipped=0 reason=UNKNOWN"
CI_LOCAL_SKIP_LINE=""
CI_LOCAL_REASON_LINE=""
CI_LOCAL_SUBSTEP_LINE=""
CI_LOCAL_GUARDS_COUNTS_LINE=""
CI_LOCAL_GUARDS_TOP10_LINE=""
CI_LOCAL_SCOPE_OK_LINE=""
CI_LOCAL_HARD_GUARDS="${CI_LOCAL_HARD_GUARDS:-1}"
CI_LOCAL_SOFT_FAIL=0
CI_LOCAL_SOFT_REASON=""
if [ -f "${CI_LOG}" ]; then
  CI_LOCAL_RESULT_LINE=$(grep -E "^CI_LOCAL_RESULT " "${CI_LOG}" | tail -n 1 || echo "${CI_LOCAL_RESULT_LINE}")
  CI_LOCAL_SKIP_LINE=$(grep -E "^CI_LOCAL_SKIP " "${CI_LOG}" | tail -n 1 || true)
  CI_LOCAL_REASON_LINE=$(grep -E "^CI_LOCAL_REASON=" "${CI_LOG}" | tail -n 1 || true)
  CI_LOCAL_SUBSTEP_LINE=$(grep -E "^CI_LOCAL_SUBSTEP=" "${CI_LOG}" | tail -n 1 || true)
  CI_LOCAL_GUARDS_COUNTS_LINE=$(grep -E "^CI_LOCAL_GUARDS_COUNTS=" "${CI_LOG}" | tail -n 1 || true)
  CI_LOCAL_GUARDS_TOP10_LINE=$(grep -E "^CI_LOCAL_GUARDS_TOP10=" "${CI_LOG}" | tail -n 1 || true)
  CI_LOCAL_SCOPE_OK_LINE=$(grep -E "^CI_LOCAL_SCOPE_OK=" "${CI_LOG}" | tail -n 1 || true)
  if [ -z "${CI_LOCAL_REASON_LINE}" ]; then
    CI_LOCAL_REASON_LINE=$(grep -E "^CI_LOCAL_REASON=" "Reports/ci_local_fail.txt" 2>/dev/null | tail -n 1 || true)
    CI_LOCAL_SUBSTEP_LINE=$(grep -E "^CI_LOCAL_SUBSTEP=" "Reports/ci_local_fail.txt" 2>/dev/null | tail -n 1 || true)
    CI_LOCAL_GUARDS_COUNTS_LINE=$(grep -E "^CI_LOCAL_GUARDS_COUNTS=" "Reports/ci_local_fail.txt" 2>/dev/null | tail -n 1 || true)
    CI_LOCAL_GUARDS_TOP10_LINE=$(grep -E "^CI_LOCAL_GUARDS_TOP10=" "Reports/ci_local_fail.txt" 2>/dev/null | tail -n 1 || true)
    CI_LOCAL_SCOPE_OK_LINE=$(grep -E "^CI_LOCAL_SCOPE_OK=" "Reports/ci_local_fail.txt" 2>/dev/null | tail -n 1 || true)
  fi
fi
if [ -n "${CI_LOCAL_REASON_LINE}" ] && echo "${CI_LOCAL_REASON_LINE}" | grep -q "GUARDS_FAIL"; then
  CI_LOCAL_SOFT_FAIL=1
  CI_LOCAL_SOFT_REASON="GUARDS_FAIL"
fi
if [ -n "${CI_LOCAL_REASON_LINE}" ] && echo "${CI_LOCAL_REASON_LINE}" | grep -q "SCOPE_VIOLATION"; then
  CI_LOCAL_SOFT_FAIL=1
  CI_LOCAL_SOFT_REASON="GUARDS_FAIL"
fi
if [ "${CI_LOCAL_RC}" -ne 0 ]; then
  check_shrink_guard_post
  if [ -n "${SHRINK_LINES:-}" ]; then
    FAIL_EXTRA_LINES="${FAIL_EXTRA_LINES:+${FAIL_EXTRA_LINES}"$'\n'"}${SHRINK_LINES}"
  fi
  if [ -f "${CI_LOG}" ]; then
    echo "CI_LOCAL_FAIL_LOG:"
    tail -n 120 "${CI_LOG}" || true
    echo "CI_LOCAL_FAIL tail_begin"
    tail -n 50 "${CI_LOG}" || true
    echo "CI_LOCAL_FAIL tail_end"
  fi
  if [ -f "${SUMMARY_FILE}" ]; then
    REASON_LINE=$(sed -n '2p' "${SUMMARY_FILE}" | sed 's/^Reason: //')
  fi
  if [ -z "${REASON_LINE:-}" ]; then
    LOG_REASON=$(grep -E "ERROR:" "${CI_LOG}" | tail -n 1 | sed 's/^ERROR: //')
    REASON_LINE="${LOG_REASON:-ci-local failed}"
  fi
  FAIL_STEP="ci_local"
  FAIL_RC="${CI_LOCAL_RC}"
  if [ -n "${CI_LOCAL_REASON_LINE}" ]; then
    FAIL_EXTRA_LINES="${CI_LOCAL_REASON_LINE}${CI_LOCAL_SUBSTEP_LINE:+$'\n'}${CI_LOCAL_SUBSTEP_LINE}"
    if [ -n "${CI_LOCAL_GUARDS_COUNTS_LINE}" ]; then
      FAIL_EXTRA_LINES="${FAIL_EXTRA_LINES}"$'\n'"${CI_LOCAL_GUARDS_COUNTS_LINE}"
    fi
    if [ -n "${CI_LOCAL_GUARDS_TOP10_LINE}" ]; then
      FAIL_EXTRA_LINES="${FAIL_EXTRA_LINES}"$'\n'"${CI_LOCAL_GUARDS_TOP10_LINE}"
    fi
    if [ -n "${CI_LOCAL_SCOPE_OK_LINE}" ]; then
      FAIL_EXTRA_LINES="${FAIL_EXTRA_LINES}"$'\n'"${CI_LOCAL_SCOPE_OK_LINE}"
    fi
    if [ "${CI_LOCAL_HARD_GUARDS}" = "1" ]; then
      fail_with_reason "${CI_LOCAL_REASON_LINE#CI_LOCAL_REASON=}"
    fi
  fi
  if [ "${CI_LOCAL_HARD_GUARDS}" = "1" ]; then
    fail_with_reason "${REASON_LINE}"
  fi
  CI_LOCAL_SOFT_FAIL=1
  CI_LOCAL_SOFT_REASON="${CI_LOCAL_REASON_LINE#CI_LOCAL_REASON=}"
  if [ -z "${CI_LOCAL_SOFT_REASON}" ]; then
    CI_LOCAL_SOFT_REASON="GUARDS_FAIL"
  fi
fi

WIKI_REFRESH_RAN=0
WIKI_OFFLINE_LINE=""
WIKI_REFRESH_ENABLE="${WIKI_REFRESH_ENABLE:-0}"
if [ "${NET_HEALTH_ONLINE}" = "1" ] && [ "${WIKI_REFRESH_ENABLE}" = "1" ]; then
  run_step "wiki_refresh" 180 "bash tools/sync/wiki_fetch.sh >>\"${PRE_LOG}\" 2>&1"
  WIKI_REFRESH_STATUS=$?
  if [ "${WIKI_REFRESH_STATUS}" -ne 0 ]; then
    fail_with_reason "wiki refresh failed"
  fi
  WIKI_REFRESH_RAN=1
else
  if [ "${ALLOW_WIKI_OFFLINE:-0}" = "1" ]; then
    WIKI_OFFLINE_LINE="OFFLINE: using cached wiki_db; refresh skipped"
  else
    WIKI_OFFLINE_LINE="WIKI_REFRESH: skipped reason=DISABLED"
  fi
fi
if [ "${NET_HEALTH_ONLINE}" = "1" ] || [ "${ALLOW_WIKI_OFFLINE:-0}" = "1" ]; then
run_step "wiki_sync_legality" 180 "bash tools/sync/wiki_sync_legality.sh >>\"${PRE_LOG}\" 2>&1"
run_step "notes_sections_backfill_post" 60 "bash tools/sync/wiki_notes_backfill.sh >>\"${PRE_LOG}\" 2>&1"
NOTES_LINKS_SMOKE_FILE="$(dirname "${REPORTS_FINAL}")/notes_links_smoke.txt"
run_step "notes_links_smoke" 30 "NOTES_LINKS_SMOKE_FILE=\"${NOTES_LINKS_SMOKE_FILE}\" REPORTS_FINAL=\"${REPORTS_FINAL}\" RUN_REPORT_FILE=\"${RUN_REPORT_FILE}\" NODE_BIN=\"${NODE_BIN}\" bash tools/pass_cycle_notes_links_smoke.sh >>\"${REPORTS_FINAL}\" 2>&1"
if [ -f "${NOTES_LINKS_SMOKE_FILE}" ]; then
  notes_links_line=$(grep -E "^NOTES_LINKS_SMOKE_OK=" "${NOTES_LINKS_SMOKE_FILE}" | tail -n 1 || true)
  if [ -n "${notes_links_line}" ]; then
    append_ci_line "${notes_links_line}"
  fi
fi
run_step "no_shrink_guard" 30 "NO_SHRINK_ALLOW=\"${NO_SHRINK_ALLOW:-0}\" NO_SHRINK_REASON=\"${NO_SHRINK_REASON:-}\" ${NODE_BIN} tools/no_shrink_guard.mjs >>\"${REPORTS_FINAL}\" 2>&1"
if [ "${OFFLINE_MODE}" = "1" ]; then
  run_step "offline_cache_smoke" 30 "${NODE_BIN} tools/offline_cache_smoke.mjs >>\"${REPORTS_FINAL}\" 2>&1"
fi
if [ "${NOTES_SHRINK_GUARD_PHASE}" != "pre" ]; then
  NOTES_SHRINK_ERR_TRAP="$(trap -p ERR || true)"
  trap - ERR
  set +e
  NOTES_SHRINK_OUTPUT=$(${NODE_BIN} tools/gates/notes_shrink_guard.mjs 2>&1)
  NOTES_SHRINK_RC=$?
  set -e
  if [ -n "${NOTES_SHRINK_ERR_TRAP}" ]; then
    eval "${NOTES_SHRINK_ERR_TRAP}"
  fi
  if [ -n "${NOTES_SHRINK_OUTPUT}" ]; then
    printf "%s\n" "${NOTES_SHRINK_OUTPUT}" >> "${PRE_LOG}"
  fi
  NOTES_SHRINK_GUARD_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_QUALITY_GUARD=" | tail -n 1 || true)
  NOTES_SHRINK_OK_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_ALLOW_SHRINK=" | tail -n 1 || true)
  NOTES_SHRINK_GUARD_REASON_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_SHRINK_REASON=" | tail -n 1 || true)
  NOTES_BASELINE_WITH_NOTES_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_BASELINE_WITH_NOTES=" | tail -n 1 || true)
  NOTES_CURRENT_WITH_NOTES_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_CURRENT_WITH_NOTES=" | tail -n 1 || true)
  NOTES_BASELINE_OK_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_BASELINE_OK=" | tail -n 1 || true)
  NOTES_CURRENT_OK_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_CURRENT_OK=" | tail -n 1 || true)
  NOTES_BASELINE_EMPTY_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_BASELINE_EMPTY=" | tail -n 1 || true)
  NOTES_CURRENT_EMPTY_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_CURRENT_EMPTY=" | tail -n 1 || true)
  NOTES_BASELINE_PLACEHOLDER_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_BASELINE_PLACEHOLDER=" | tail -n 1 || true)
  NOTES_CURRENT_PLACEHOLDER_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_CURRENT_PLACEHOLDER=" | tail -n 1 || true)
  NOTES_BASELINE_WEAK_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_BASELINE_WEAK=" | tail -n 1 || true)
  NOTES_CURRENT_WEAK_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_CURRENT_WEAK=" | tail -n 1 || true)
  NOTES_BASELINE_KIND_RICH_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_BASELINE_KIND_RICH=" | tail -n 1 || true)
  NOTES_CURRENT_KIND_RICH_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_CURRENT_KIND_RICH=" | tail -n 1 || true)
  NOTES_BASELINE_KIND_MIN_ONLY_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_BASELINE_KIND_MIN_ONLY=" | tail -n 1 || true)
  NOTES_CURRENT_KIND_MIN_ONLY_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_CURRENT_KIND_MIN_ONLY=" | tail -n 1 || true)
  NOTES_BASELINE_STRICT_WEAK_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_BASELINE_STRICT_WEAK=" | tail -n 1 || true)
  NOTES_CURRENT_STRICT_WEAK_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_CURRENT_STRICT_WEAK=" | tail -n 1 || true)
  NOTES_TOTAL_GEO_LINE=$(printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -E "^NOTES_TOTAL_GEO=" | tail -n 1 || true)
  if [ "${NOTES_SHRINK_RC}" -ne 0 ] || printf "%s\n" "${NOTES_SHRINK_OUTPUT}" | grep -q "NOTES_QUALITY_GUARD=FAIL"; then
    FAIL_EXTRA_LINES="${FAIL_EXTRA_LINES:+${FAIL_EXTRA_LINES}"$'\n'"}${NOTES_SHRINK_OUTPUT}"
    FAIL_STEP="notes_shrink_guard"
    FAIL_CMD="${NODE_BIN} tools/gates/notes_shrink_guard.mjs"
    fail_with_reason "NOTES_SHRINK"
  fi
fi
set +e
WIKI_SHRINK_OUTPUT=$(${NODE_BIN} tools/gates/wiki_shrink_guard.mjs 2>&1)
WIKI_SHRINK_RC=$?
set -e
if [ -n "${WIKI_SHRINK_OUTPUT}" ]; then
  printf "%s\n" "${WIKI_SHRINK_OUTPUT}" >> "${PRE_LOG}"
fi
WIKI_SHRINK_COUNTS_LINE=$(printf "%s\n" "${WIKI_SHRINK_OUTPUT}" | grep -E "^WIKI_COUNTS " | tail -n 1 || true)
WIKI_SHRINK_GUARD_LINE=$(printf "%s\n" "${WIKI_SHRINK_OUTPUT}" | grep -E "^WIKI_SHRINK_GUARD=" | tail -n 1 || true)
WIKI_SHRINK_OK_LINE=$(printf "%s\n" "${WIKI_SHRINK_OUTPUT}" | grep -E "^WIKI_SHRINK_OK=" | tail -n 1 || true)
WIKI_SHRINK_REASON_LINE=$(printf "%s\n" "${WIKI_SHRINK_OUTPUT}" | grep -E "^WIKI_SHRINK_REASON=" | tail -n 1 || true)
WIKI_SHRINK_BASELINE_PATH_LINE=$(printf "%s\n" "${WIKI_SHRINK_OUTPUT}" | grep -E "^WIKI_SHRINK_BASELINE_PATH=" | tail -n 1 || true)
if [ "${WIKI_SHRINK_RC}" -ne 0 ] || printf "%s\n" "${WIKI_SHRINK_OUTPUT}" | grep -q "^WIKI_SHRINK_GUARD=FAIL"; then
  FAIL_EXTRA_LINES="${FAIL_EXTRA_LINES:+${FAIL_EXTRA_LINES}"$'\n'"}${WIKI_SHRINK_OUTPUT}"
  FAIL_STEP="wiki_shrink_guard"
  FAIL_CMD="${NODE_BIN} tools/gates/wiki_shrink_guard.mjs"
  fail_with_reason "WIKI_SHRINK"
fi
set +e
LEGALITY_TABLE_OUTPUT=$(${NODE_BIN} tools/gates/legality_table_shrink_guard.mjs 2>&1)
LEGALITY_TABLE_RC=$?
set -e
if [ -n "${LEGALITY_TABLE_OUTPUT}" ]; then
  printf "%s\n" "${LEGALITY_TABLE_OUTPUT}" >> "${PRE_LOG}"
fi
LEGALITY_TABLE_ROWS_LINE=$(printf "%s\n" "${LEGALITY_TABLE_OUTPUT}" | grep -E "^LEGALITY_TABLE_ROWS=" | tail -n 1 || true)
LEGALITY_TABLE_BASELINE_LINE=$(printf "%s\n" "${LEGALITY_TABLE_OUTPUT}" | grep -E "^LEGALITY_TABLE_BASELINE=" | tail -n 1 || true)
LEGALITY_TABLE_DELTA_LINE=$(printf "%s\n" "${LEGALITY_TABLE_OUTPUT}" | grep -E "^LEGALITY_TABLE_DELTA=" | tail -n 1 || true)
LEGALITY_TABLE_GUARD_LINE=$(printf "%s\n" "${LEGALITY_TABLE_OUTPUT}" | grep -E "^LEGALITY_TABLE_GUARD=" | tail -n 1 || true)
LEGALITY_TABLE_ALLOW_SHRINK_LINE=$(printf "%s\n" "${LEGALITY_TABLE_OUTPUT}" | grep -E "^LEGALITY_TABLE_ALLOW_SHRINK=" | tail -n 1 || true)
LEGALITY_TABLE_SHRINK_REASON_LINE=$(printf "%s\n" "${LEGALITY_TABLE_OUTPUT}" | grep -E "^LEGALITY_TABLE_SHRINK_REASON=" | tail -n 1 || true)
if [ "${LEGALITY_TABLE_RC}" -ne 0 ] || printf "%s\n" "${LEGALITY_TABLE_OUTPUT}" | grep -q "^LEGALITY_TABLE_GUARD=FAIL"; then
  FAIL_EXTRA_LINES="${FAIL_EXTRA_LINES:+${FAIL_EXTRA_LINES}"$'\n'"}${LEGALITY_TABLE_OUTPUT}"
  FAIL_STEP="legality_table_guard"
  FAIL_CMD="${NODE_BIN} tools/gates/legality_table_shrink_guard.mjs"
  fail_with_reason "LEGALITY_TABLE_SHRINK"
fi

WIKI_COVERAGE_OUTPUT=$(${NODE_BIN} tools/gates/wiki_coverage_guard.mjs 2>&1)
WIKI_COVERAGE_RC=$?
if [ -n "${WIKI_COVERAGE_OUTPUT}" ]; then
  printf "%s\n" "${WIKI_COVERAGE_OUTPUT}" >> "${PRE_LOG}"
fi
WIKI_COVERAGE_ROWS_LINE=$(printf "%s\n" "${WIKI_COVERAGE_OUTPUT}" | grep -E "^WIKI_COVERAGE_LEGALITY_ROWS=" | tail -n 1 || true)
WIKI_COVERAGE_CLAIMS_LINE=$(printf "%s\n" "${WIKI_COVERAGE_OUTPUT}" | grep -E "^WIKI_COVERAGE_CLAIMS=" | tail -n 1 || true)
WIKI_COVERAGE_NOTES_LINE=$(printf "%s\n" "${WIKI_COVERAGE_OUTPUT}" | grep -E "^WIKI_COVERAGE_NOTES=" | tail -n 1 || true)
WIKI_COVERAGE_BASELINE_ROWS_LINE=$(printf "%s\n" "${WIKI_COVERAGE_OUTPUT}" | grep -E "^WIKI_COVERAGE_BASELINE_LEGALITY_ROWS=" | tail -n 1 || true)
WIKI_COVERAGE_BASELINE_CLAIMS_LINE=$(printf "%s\n" "${WIKI_COVERAGE_OUTPUT}" | grep -E "^WIKI_COVERAGE_BASELINE_CLAIMS=" | tail -n 1 || true)
WIKI_COVERAGE_BASELINE_NOTES_LINE=$(printf "%s\n" "${WIKI_COVERAGE_OUTPUT}" | grep -E "^WIKI_COVERAGE_BASELINE_NOTES=" | tail -n 1 || true)
WIKI_COVERAGE_GUARD_LINE=$(printf "%s\n" "${WIKI_COVERAGE_OUTPUT}" | grep -E "^WIKI_COVERAGE_GUARD=" | tail -n 1 || true)
WIKI_COVERAGE_ALLOW_LINE=$(printf "%s\n" "${WIKI_COVERAGE_OUTPUT}" | grep -E "^WIKI_COVERAGE_ALLOW_SHRINK=" | tail -n 1 || true)
WIKI_COVERAGE_REASON_LINE=$(printf "%s\n" "${WIKI_COVERAGE_OUTPUT}" | grep -E "^WIKI_COVERAGE_SHRINK_REASON=" | tail -n 1 || true)
if [ "${WIKI_COVERAGE_RC}" -ne 0 ] || printf "%s\n" "${WIKI_COVERAGE_OUTPUT}" | grep -q "^WIKI_COVERAGE_GUARD=FAIL"; then
  FAIL_EXTRA_LINES="${FAIL_EXTRA_LINES:+${FAIL_EXTRA_LINES}"$'\n'"}${WIKI_COVERAGE_OUTPUT}"
  FAIL_STEP="wiki_coverage_guard"
  FAIL_CMD="${NODE_BIN} tools/gates/wiki_coverage_guard.mjs"
  fail_with_reason "WIKI_COVERAGE_SHRINK"
fi
set +e
OFFICIAL_DOMAINS_GUARD_OUTPUT=$(${NODE_BIN} tools/gates/official_shrink_guard.mjs 2>&1)
OFFICIAL_DOMAINS_GUARD_RC=$?
set -e
printf "%s\n" "${OFFICIAL_DOMAINS_GUARD_OUTPUT}" >> "${PRE_LOG}"
OFFICIAL_DOMAINS_BASELINE_LINE=$(printf "%s\n" "${OFFICIAL_DOMAINS_GUARD_OUTPUT}" | grep -E "^OFFICIAL_DOMAINS_BASELINE=" | tail -n 1 || true)
OFFICIAL_DOMAINS_BASELINE_PATH_LINE=$(printf "%s\n" "${OFFICIAL_DOMAINS_GUARD_OUTPUT}" | grep -E "^OFFICIAL_DOMAINS_BASELINE_PATH=" | tail -n 1 || true)
OFFICIAL_DOMAINS_CURRENT_LINE=$(printf "%s\n" "${OFFICIAL_DOMAINS_GUARD_OUTPUT}" | grep -E "^OFFICIAL_DOMAINS_CURRENT=" | tail -n 1 || true)
OFFICIAL_DOMAINS_GUARD_LINE=$(printf "%s\n" "${OFFICIAL_DOMAINS_GUARD_OUTPUT}" | grep -E "^OFFICIAL_DOMAINS_GUARD=" | tail -n 1 || true)
OFFICIAL_DOMAINS_ALLOW_SHRINK_LINE=$(printf "%s\n" "${OFFICIAL_DOMAINS_GUARD_OUTPUT}" | grep -E "^OFFICIAL_DOMAINS_ALLOW_SHRINK=" | tail -n 1 || true)
OFFICIAL_DOMAINS_REASON_LINE=$(printf "%s\n" "${OFFICIAL_DOMAINS_GUARD_OUTPUT}" | grep -E "^OFFICIAL_DOMAINS_SHRINK_REASON=" | tail -n 1 || true)
OFFICIAL_SHRINK_OK_LINE=$(printf "%s\n" "${OFFICIAL_DOMAINS_GUARD_OUTPUT}" | grep -E "^OFFICIAL_SHRINK_OK=" | tail -n 1 || true)
OFFICIAL_BASELINE_COUNT_LINE_GUARD=$(printf "%s\n" "${OFFICIAL_DOMAINS_GUARD_OUTPUT}" | grep -E "^OFFICIAL_BASELINE_COUNT=" | tail -n 1 || true)
OFFICIAL_DOMAINS_SOURCE_COUNT_LINES=$(printf "%s\n" "${OFFICIAL_DOMAINS_GUARD_OUTPUT}" | grep -E "^OFFICIAL_DOMAINS_SOURCE_COUNT " || true)
OFFICIAL_DOMAINS_CURRENT_COUNT_LINE=""
OFFICIAL_ITEMS_PRESENT_LINE=""
OFFICIAL_BASELINE_COUNT_VALUE=""
if [ -n "${OFFICIAL_BASELINE_COUNT_LINE_GUARD}" ]; then
  OFFICIAL_BASELINE_COUNT_VALUE="${OFFICIAL_BASELINE_COUNT_LINE_GUARD#OFFICIAL_BASELINE_COUNT=}"
fi
if [ -n "${OFFICIAL_DOMAINS_CURRENT_LINE}" ]; then
  OFFICIAL_DOMAINS_CURRENT_COUNT_LINE="OFFICIAL_DOMAINS_CURRENT_COUNT=${OFFICIAL_DOMAINS_CURRENT_LINE#OFFICIAL_DOMAINS_CURRENT=}"
  OFFICIAL_ITEMS_PRESENT="${OFFICIAL_DOMAINS_CURRENT_LINE#OFFICIAL_DOMAINS_CURRENT=}"
  if printf "%s" "${OFFICIAL_ITEMS_PRESENT}" | grep -E "^[0-9]+$" >/dev/null 2>&1; then
    OFFICIAL_ITEMS_PRESENT_LINE="OFFICIAL_ITEMS_PRESENT=${OFFICIAL_ITEMS_PRESENT}"
    if [ -n "${OFFICIAL_BASELINE_COUNT_VALUE}" ] && [ "${OFFICIAL_ITEMS_PRESENT}" -ne "${OFFICIAL_BASELINE_COUNT_VALUE}" ]; then
      FAIL_EXTRA_LINES="${FAIL_EXTRA_LINES:+${FAIL_EXTRA_LINES}"$'\n'"}${OFFICIAL_ITEMS_PRESENT_LINE}"
      FAIL_STEP="official_domains_guard"
      FAIL_CMD="${NODE_BIN} tools/gates/official_shrink_guard.mjs"
      fail_with_reason "OFFICIAL_BASELINE_CHANGED"
    fi
  fi
fi
if printf "%s\n" "${OFFICIAL_DOMAINS_GUARD_OUTPUT}" | grep -q "OFFICIAL_BASELINE_CHANGED"; then
  FAIL_EXTRA_LINES="${OFFICIAL_DOMAINS_GUARD_OUTPUT}"
  FAIL_STEP="official_domains_guard"
  FAIL_CMD="${NODE_BIN} tools/gates/official_shrink_guard.mjs"
  fail_with_reason "OFFICIAL_BASELINE_CHANGED"
fi
if [ "${OFFICIAL_DOMAINS_GUARD_RC}" -ne 0 ] || printf "%s\n" "${OFFICIAL_DOMAINS_GUARD_OUTPUT}" | grep -q "OFFICIAL_DOMAINS_GUARD=FAIL"; then
  FAIL_EXTRA_LINES="${OFFICIAL_DOMAINS_GUARD_OUTPUT}"
  FAIL_STEP="official_domains_guard"
  FAIL_CMD="${NODE_BIN} tools/gates/official_shrink_guard.mjs"
  fail_with_reason "OFFICIAL_DOMAINS_SHRINK"
fi
set +e
OFFICIAL_DOMAINS_SHRINK_OUTPUT=$(${NODE_BIN} tools/gates/official_domains_shrink_guard.mjs 2>&1)
OFFICIAL_DOMAINS_SHRINK_RC=$?
set -e
if [ -n "${OFFICIAL_DOMAINS_SHRINK_OUTPUT}" ]; then
  printf "%s\n" "${OFFICIAL_DOMAINS_SHRINK_OUTPUT}" >> "${PRE_LOG}"
fi
OFFICIAL_DOMAINS_SHRINK_BASELINE_LINE=$(printf "%s\n" "${OFFICIAL_DOMAINS_SHRINK_OUTPUT}" | grep -E "^OFFICIAL_DOMAINS_BASELINE=" | tail -n 1 || true)
OFFICIAL_DOMAINS_SHRINK_CURRENT_LINE=$(printf "%s\n" "${OFFICIAL_DOMAINS_SHRINK_OUTPUT}" | grep -E "^OFFICIAL_DOMAINS_CURRENT=" | tail -n 1 || true)
OFFICIAL_DOMAINS_DELTA_LINE=$(printf "%s\n" "${OFFICIAL_DOMAINS_SHRINK_OUTPUT}" | grep -E "^OFFICIAL_DOMAINS_DELTA=" | tail -n 1 || true)
if printf "%s\n" "${OFFICIAL_DOMAINS_SHRINK_OUTPUT}" | grep -q "OFFICIAL_BASELINE_CHANGED"; then
  FAIL_EXTRA_LINES="${FAIL_EXTRA_LINES:+${FAIL_EXTRA_LINES}"$'\n'"}${OFFICIAL_DOMAINS_SHRINK_OUTPUT}"
  FAIL_STEP="official_domains_shrink_guard"
  FAIL_CMD="${NODE_BIN} tools/gates/official_domains_shrink_guard.mjs"
  fail_with_reason "OFFICIAL_BASELINE_CHANGED"
fi
if [ "${OFFICIAL_DOMAINS_SHRINK_RC}" -ne 0 ] || printf "%s\n" "${OFFICIAL_DOMAINS_SHRINK_OUTPUT}" | grep -q "REGRESS_OFFICIAL_DOMAINS_SHRINK"; then
  FAIL_EXTRA_LINES="${FAIL_EXTRA_LINES:+${FAIL_EXTRA_LINES}"$'\n'"}${OFFICIAL_DOMAINS_SHRINK_OUTPUT}"
  FAIL_STEP="official_domains_shrink_guard"
  FAIL_CMD="${NODE_BIN} tools/gates/official_domains_shrink_guard.mjs"
  fail_with_reason "REGRESS_OFFICIAL_DOMAINS_SHRINK"
fi
run_step "wiki_mark_official" 180 "bash tools/sync/mark_official_refs.sh >>\"${PRE_LOG}\" 2>&1"
fi
run_step "wiki_official_eval" 180 "npm run wiki:official_eval >>\"${PRE_LOG}\" 2>&1"
WIKI_EVAL_STATUS=$?
if [ "${WIKI_EVAL_STATUS}" -ne 0 ]; then
  fail_with_reason "wiki official eval failed"
fi
WIKI_SYNC_ALL_RC=1
WIKI_SYNC_MODE="ONLINE"
SSOT_GUARD_DONE=0
if [ "${NET_MODE}" = "DEGRADED_CACHE" ]; then
  WIKI_SYNC_MODE="CACHE_ONLY"
fi
if [ "${SSOT_WRITE}" = "1" ]; then
  run_step "official_allowlist_merge" 60 "${NODE_BIN} tools/sources/merge_official_allowlist.mjs >>\"${PRE_LOG}\" 2>&1"
fi
if [ "${WIKI_GATE_OK_FLAG}" = "1" ] && [ "${NET_MODE}" != "OFFLINE" ]; then
  run_step "wiki_sync_all" 600 "WIKI_SYNC_MODE=${WIKI_SYNC_MODE} bash tools/sync/wiki_sync_all.sh >>\"${PRE_LOG}\" 2>&1"
  WIKI_SYNC_ALL_RC=$?
  if [ "${WIKI_SYNC_ALL_RC}" -eq 0 ]; then
    REFRESH_SOURCE="online"
    if [ "${WIKI_SYNC_MODE}" = "CACHE_ONLY" ]; then
      REFRESH_SOURCE="offline-cache"
    fi
    REFRESH_SOURCE="${REFRESH_SOURCE}" python3 - <<'PY'
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import os
now = datetime.now(timezone.utc)
payload = {
    "last_refresh_ts": now.isoformat().replace("+00:00","Z"),
    "last_success_ts": now.isoformat().replace("+00:00","Z"),
    "source": os.environ.get("REFRESH_SOURCE","online")
}
path = Path("Reports/wiki_refresh.ssot.json")
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
print(f"LAST_REFRESH_TS={payload['last_refresh_ts']}")
print(f"LAST_SUCCESS_TS={payload['last_success_ts']}")
print(f"REFRESH_SOURCE={payload['source']}")
legacy = {
    "last_refresh_ts": payload["last_refresh_ts"],
    "next_refresh_ts": (now + timedelta(hours=4)).isoformat().replace("+00:00","Z")
}
Path("Reports/refresh_status.json").write_text(json.dumps(legacy, indent=2) + "\n", encoding="utf-8")
print(f"NEXT_REFRESH_TS={legacy['next_refresh_ts']}")
PY
  fi
  run_step "wiki_mark_official_all" 180 "${NODE_BIN} tools/wiki/mark_official_refs.mjs --all >>\"${PRE_LOG}\" 2>&1"
  run_step "wiki_official_eval_all" 60 "${NODE_BIN} tools/wiki/wiki_official_eval.mjs --print >>\"${PRE_LOG}\" 2>&1"
  set +e
  SSOT_GUARD_OUTPUT=$(${NODE_BIN} tools/wiki/ssot_shrink_guard.mjs --prev "${SSOT_GUARD_PREV}" 2>&1)
  SSOT_GUARD_RC=$?
  set -e
  if [ -n "${SSOT_GUARD_OUTPUT}" ]; then
    printf "%s\n" "${SSOT_GUARD_OUTPUT}" >> "${PRE_LOG}"
    SUMMARY_LINES+=(${SSOT_GUARD_OUTPUT//$'\n'/$'\n'})
  fi
  if [ "${SSOT_GUARD_RC}" -ne 0 ]; then
    FAIL_STEP="ssot_shrink_guard"
    FAIL_RC="${SSOT_GUARD_RC}"
    fail_with_reason "DATA_SHRINK_GUARD"
  fi
  SSOT_GUARD_DONE=1
fi
if [ "${SSOT_WRITE}" = "1" ] && [ "${SSOT_GUARD_DONE}" -eq 0 ]; then
  set +e
  SSOT_GUARD_OUTPUT=$(${NODE_BIN} tools/wiki/ssot_shrink_guard.mjs --prev "${SSOT_GUARD_PREV}" 2>&1)
  SSOT_GUARD_RC=$?
  set -e
  if [ -n "${SSOT_GUARD_OUTPUT}" ]; then
    printf "%s\n" "${SSOT_GUARD_OUTPUT}" >> "${PRE_LOG}"
    SUMMARY_LINES+=(${SSOT_GUARD_OUTPUT//$'\n'/$'\n'})
  fi
  if [ "${SSOT_GUARD_RC}" -ne 0 ]; then
    FAIL_STEP="ssot_shrink_guard"
    FAIL_RC="${SSOT_GUARD_RC}"
    fail_with_reason "DATA_SHRINK_GUARD"
  fi
fi

TRENDS_STATUS="skipped"
if [ "${SEO_TRENDS:-0}" = "1" ]; then
  set +e
  run_step "seo_trends" 180 "bash tools/seo/run_trends_top50.sh"
  TRENDS_RC=$?
  set -e
  if [ "${TRENDS_RC}" -eq 0 ]; then
    TRENDS_STATUS="ok rows=50"
  elif [ "${TRENDS_RC}" -eq 2 ]; then
    TRENDS_STATUS="pending(429)"
  else
    TRENDS_STATUS="pending(429)"
    if [ "${SEO_TRENDS_HARD:-0}" = "1" ]; then
      exit 1
    fi
  fi
fi

CHECKED_PATH="${ROOT}/Reports/checked/last_checked.json"
COVERAGE_PATH="${ROOT}/Reports/coverage/last_coverage.json"
if [ ! -f "${CHECKED_PATH}" ]; then
  fail_with_reason "missing artifact: ${CHECKED_PATH}"
fi
if [ ! -f "${COVERAGE_PATH}" ]; then
  if [ -f "${ROOT}/Reports/coverage/coverage.json" ]; then
    COVERAGE_PATH="${ROOT}/Reports/coverage/coverage.json"
  else
    fail_with_reason "missing artifact: Reports/coverage/last_coverage.json"
  fi
fi
if [ "${SEO_TRENDS:-0}" = "1" ] && [ ! -f "${ROOT}/Reports/trends/meta.json" ]; then
  fail_with_reason "missing artifact: Reports/trends/meta.json"
fi

bash tools/save_patch_checkpoint.sh >"${CHECKPOINT_LOG}" 2>&1

LATEST_CHECKPOINT=$(cat "${LATEST_FILE}" 2>/dev/null || true)
if [ -z "${LATEST_CHECKPOINT}" ]; then
  fail_with_reason "missing .checkpoints/LATEST"
fi

${NODE_BIN} tools/checked/format_last_checked.mjs >/dev/null || {
  fail_with_reason "invalid checked artifact";
}

CHECKED_SUMMARY=$(${NODE_BIN} tools/checked/render_checked_summary.mjs) || {
  fail_with_reason "invalid checked summary";
}
while IFS='=' read -r key value; do
  case "${key}" in
    checked_count) CHECKED_COUNT="${value}" ;;
    failed_count) VERIFY_FAIL="${value}" ;;
    verified_sources_count) VERIFIED_SOURCES_COUNT="${value}" ;;
    verified_sources_present) VERIFIED_SOURCES_PRESENT="${value}" ;;
    checked_top5) CHECKED_TOP5="${value}" ;;
    trace_top10) TRACE_TOP10="${value}" ;;
    checked_top10) CHECKED_TOP10="${value}" ;;
  esac
done <<< "${CHECKED_SUMMARY}"
VERIFY_SAMPLED="${CHECKED_COUNT}"
VERIFY_OK=$((VERIFY_SAMPLED - VERIFY_FAIL))
VERIFY_EXPECTED="${CHECKED_EXPECTED}"
if [ "${CHECK_VERIFY}" = "1" ]; then
  if [ "${VERIFY_EXPECTED}" -gt 0 ] && [ "${VERIFY_SAMPLED}" -lt "${VERIFY_EXPECTED}" ]; then
    echo "❌ VERIFY FAIL (sampled=${VERIFY_SAMPLED}, ok=${VERIFY_OK}, fail=${VERIFY_FAIL})"
    fail_with_reason "checked payload incomplete"
  fi
  if [ "${VERIFY_FAIL}" -gt 0 ]; then
    echo "❌ VERIFY FAIL (sampled=${VERIFY_SAMPLED}, ok=${VERIFY_OK}, fail=${VERIFY_FAIL})"
    fail_with_reason "checked payload failed"
  fi
fi
echo "🌿 VERIFY PASS (sampled=${VERIFY_SAMPLED}, ok=${VERIFY_OK}, fail=${VERIFY_FAIL})"

PASS_ICON="🌿"
if [ "${VERIFIED_SOURCES_PRESENT}" != "true" ]; then
  PASS_ICON="⚠️"
fi
PASS_LINE2="Checked: ${VERIFY_SAMPLED} (sources=${VERIFIED_SOURCES_COUNT}/${VERIFY_SAMPLED}; ${CHECKED_TOP5})"
PASS_LINE3="Trace top10: ${TRACE_TOP10}"
PASS_LINE4="Checked top10: ${CHECKED_TOP10}"
PASS_LINE5="Checked saved: Reports/checked/last_checked.json"
PASS_LINE6="Trends: ${TRENDS_STATUS}"
PASS_LINE7=$(${NODE_BIN} tools/metrics/render_coverage_line.mjs) || {
  fail_with_reason "invalid coverage artifact";
}
AUTO_SEED_LINE=""
if [ "${SSOT_DIFF:-0}" = "1" ]; then
  set +e
  ${NODE_BIN} tools/ssot/ssot_diff_run.mjs >>"${PRE_LOG}" 2>&1
  SSOT_STATUS=$?
  set -e
  if [ -f "${ROOT}/Reports/ssot-diff/last_run.json" ]; then
    SSOT_DIFF_LINE=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const data=JSON.parse(fs.readFileSync(process.env.ROOT_DIR+"/Reports/ssot-diff/last_run.json","utf8"));const status=data.status||"ok";const count=Number(data.changed_count||0);const report=data.report_md||data.report_json||"n/a";const label=status==="changed"?"changed("+count+")":status;console.log("SSOT Diff: "+label+", report="+report);')
  fi
  if [ "${SSOT_STATUS}" -eq 2 ] || [ "${SSOT_STATUS}" -eq 3 ]; then
    PASS_ICON="⚠️"
  fi
fi
if [ "${SSOT_SOURCES:-0}" = "1" ]; then
  set +e
  SSOT_SOURCES_STATUS=0
  ${NODE_BIN} tools/sources/official_catalog_autofill.mjs >>"${PRE_LOG}" 2>&1 || SSOT_SOURCES_STATUS=$?
  if [ "${SSOT_SOURCES_STATUS}" -eq 0 ]; then
    ${NODE_BIN} tools/sources/registry_from_catalog.mjs >>"${PRE_LOG}" 2>&1 || SSOT_SOURCES_STATUS=$?
  fi
  if [ "${SSOT_SOURCES_STATUS}" -eq 0 ]; then
    ${NODE_BIN} tools/sources/fetch_sources.mjs >>"${PRE_LOG}" 2>&1 || SSOT_SOURCES_STATUS=$?
  fi
  if [ "${SSOT_SOURCES_STATUS}" -eq 0 ]; then
    ${NODE_BIN} tools/sources/extract_skeleton_facts.mjs >>"${PRE_LOG}" 2>&1 || SSOT_SOURCES_STATUS=$?
  fi
  set -e
if [ "${SSOT_SOURCES_STATUS}" -ne 0 ]; then
    PASS_ICON="⚠️"
  fi
fi

SSOT_DIFF_LINE="SSOT Diff: skipped"
if [ "${OFFLINE_FALLBACK:-0}" = "1" ]; then
  ${NODE_BIN} tools/fallback/build_legal_fallback.mjs >>"${PRE_LOG}" 2>&1 || {
    PASS_ICON="⚠️"
  }
fi
if [ "${AUTO_LEARN:-0}" = "1" ]; then
  if [ "${NETWORK:-1}" != "0" ]; then
    ${NODE_BIN} tools/auto_learn/run_auto_learn.mjs >>"${PRE_LOG}" 2>&1 || {
      PASS_ICON="⚠️"
    }
  fi
fi

AUTO_VERIFY_LINE="AUTO_VERIFY: skipped (AUTO_VERIFY=0)"
AUTO_VERIFY_CHANGED=0
AUTO_VERIFY_EVIDENCE=0
AUTO_VERIFY_DEFER=0
if [ "${AUTO_VERIFY:-0}" = "1" ]; then
  if [ "${NETWORK:-1}" = "0" ]; then
    AUTO_VERIFY_LINE="AUTO_VERIFY: skipped (NETWORK=0)"
  else
    ${NODE_BIN} tools/auto_verify/run_auto_verify.mjs >>"${PRE_LOG}" 2>&1 || true
    if [ ! -f "${ROOT}/Reports/auto_verify/last_run.json" ]; then
      AUTO_VERIFY_LINE="AUTO_VERIFY: missing report"
    else
      AUTO_VERIFY_FRESH=$(ROOT_DIR="${ROOT}" RUN_STARTED_AT="${RUN_STARTED_AT}" ${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const report=path.join(process.env.ROOT_DIR,"Reports","auto_verify","last_run.json");const start=Number(process.env.RUN_STARTED_AT||0)||0;const stat=fs.statSync(report);let fresh=start?stat.mtimeMs>=start*1000:true;try{const data=JSON.parse(fs.readFileSync(report,"utf8"));if(data?.run_at&&start){const runAt=Date.parse(data.run_at);if(Number.isFinite(runAt)){fresh=runAt>=start*1000;}}}catch{}process.stdout.write(fresh?"1":"0");');
      if [ "${AUTO_VERIFY_FRESH}" != "1" ]; then
        fail_with_reason "auto verify stale report"
      fi
      AUTO_VERIFY_RUN_ID_MATCH=$(ROOT_DIR="${ROOT}" RUN_ID="${RUN_ID}" ${NODE_BIN} -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_verify/last_run.json";if(!fs.existsSync(report)){process.stdout.write("0");process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const current=String(process.env.RUN_ID||"");const reportId=String(data.run_id||"");if(!reportId){process.stdout.write("1");process.exit(0);}process.stdout.write(reportId===current?"1":"0");');
      if [ "${AUTO_VERIFY_RUN_ID_MATCH}" != "1" ]; then
        fail_with_reason "stale auto_verify report run_id mismatch"
      fi
      AUTO_VERIFY_LINE=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const report=path.join(process.env.ROOT_DIR,"Reports","auto_verify","last_run.json");const data=JSON.parse(fs.readFileSync(report,"utf8"));const tried=Number(data.tried||0)||0;const delta=Number(data.machine_verified_delta||0)||0;const evidence=Number(data.evidence_ok||0)||0;const topList=Array.isArray(data.evidence_ids)&&data.evidence_ids.length?data.evidence_ids:Array.isArray(data.changed_ids)&&data.changed_ids.length?data.changed_ids:[];const top=topList.slice(0,5).join(",")||"-";const deltaLabel=`${delta>=0?"+":""}${delta}`;let reasons="";if(delta===0){const items=[];const reportItems=Array.isArray(data.items)?data.items:[];for(const item of reportItems){if(item?.evidence_found) continue;const iso=item?.iso2||"-";const reason=item?.reason||"NO_EVIDENCE";items.push(`${iso}:${reason}`);}if(items.length===0){const errors=Array.isArray(data.errors)?data.errors:[];for(const entry of errors){const iso=entry?.iso2||"-";const reason=entry?.reason||"error";items.push(`${iso}:${reason}`);}}const topReasons=items.slice(0,3).join(",")||"OK";reasons=` reasons_top3=${topReasons}`;}console.log(`AUTO_VERIFY: tried=${tried} evidence_ok=${evidence} machine_verified_delta=${deltaLabel} top=${top}${reasons}`);');
      AUTO_VERIFY_CHANGED=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const report=path.join(process.env.ROOT_DIR,"Reports","auto_verify","last_run.json");const data=JSON.parse(fs.readFileSync(report,"utf8"));process.stdout.write(String(Number(data.changed||0)||0));');
      AUTO_VERIFY_EVIDENCE=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const report=path.join(process.env.ROOT_DIR,"Reports","auto_verify","last_run.json");const data=JSON.parse(fs.readFileSync(report,"utf8"));process.stdout.write(String(Number(data.evidence_ok||0)||0));');
    fi
  fi
fi
if [ "${AUTO_SEED:-0}" = "1" ]; then
  set +e
  ${NODE_BIN} tools/sources/auto_seed_official_catalog.mjs --limit "${AUTO_SEED_LIMIT:-60}" >>"${PRE_LOG}" 2>&1
  AUTO_SEED_STATUS=$?
  set -e
  if [ -f "${ROOT}/Reports/auto_seed/last_seed.json" ]; then
    AUTO_SEED_LINE=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const data=JSON.parse(fs.readFileSync(process.env.ROOT_DIR+"/Reports/auto_seed/last_seed.json","utf8"));const added=Number(data.added_count||0);const before=Number(data.before_count||0);const after=Number(data.after_count||0);console.log(`AUTO_SEED: added=${added} (before=${before} after=${after}) artifact=Reports/auto_seed/last_seed.json`);')
  fi
  if [ "${AUTO_SEED_STATUS}" -ne 0 ]; then
    PASS_ICON="⚠️"
  fi
fi
PASS_LINE8=$(AUTO_LEARN="${AUTO_LEARN:-0}" ${NODE_BIN} tools/metrics/render_missing_sources_line.mjs) || {
  fail_with_reason "invalid missing sources summary";
}
LAW_VERIFIED_STATS=$(${NODE_BIN} tools/law_verified/report_law_verified.mjs --stats) || {
  fail_with_reason "invalid law verified";
}
read -r LAW_KNOWN LAW_NEEDS_REVIEW LAW_PROVISIONAL_WITH LAW_PROVISIONAL_NO LAW_UNKNOWN <<< "${LAW_VERIFIED_STATS}"
LAW_MISSING="${LAW_UNKNOWN}"
PASS_LINE9=$(${NODE_BIN} tools/law_verified/report_law_verified.mjs) || {
  fail_with_reason "invalid law verified";
}
if [ "${LAW_KNOWN}" -eq 0 ]; then
  PASS_ICON="⚠️"
fi
if [ "${LAW_MISSING}" -gt 0 ]; then
  PASS_ICON="⚠️"
  if [ "${LAW_COVERAGE_HARD:-0}" = "1" ]; then
    fail_with_reason "Law knowledge missing sources"
  fi
fi
PROMOTION_LINE="PROMOTION: promoted=0 rejected=0"
PROMOTION_REPORT="${ROOT}/Reports/promotion/last_promotion.json"
if [ -f "${PROMOTION_REPORT}" ]; then
  PROMOTION_LINE=$(PROMO_REPORT="${PROMOTION_REPORT}" ${NODE_BIN} -e 'const fs=require("fs");const data=JSON.parse(fs.readFileSync(process.env.PROMO_REPORT,"utf8"));const p=Number(data.promoted_count||0);const r=Number(data.rejected_count||0);console.log("PROMOTION: promoted="+p+" rejected="+r);') || {
    fail_with_reason "invalid promotion report";
  }
fi
PASS_LINE1="${PASS_ICON} CI PASS (Checked ${VERIFY_SAMPLED}/${VERIFY_FAIL})"
AUTO_LEARN_LINE="AUTO_LEARN: skipped (AUTO_LEARN=0)"
AUTO_FACTS_LINE="AUTO_FACTS: skipped (AUTO_FACTS=0)"
AUTO_FACTS_RAN=0
REVIEW_BATCH_LINE=""
if [ "${AUTO_LEARN:-0}" = "1" ]; then
  if [ "${NETWORK:-1}" = "0" ]; then
    AUTO_LEARN_LINE="AUTO_LEARN: skipped (NETWORK=0)"
    AUTO_FACTS_LINE="AUTO_FACTS: skipped (NETWORK=0)"
  else
    if [ ! -f "${ROOT}/Reports/auto_learn/last_run.json" ]; then
      fail_with_reason "auto learn missing Reports/auto_learn/last_run.json"
    fi
    AUTO_LEARN_FRESH=$(ROOT_DIR="${ROOT}" RUN_STARTED_AT="${RUN_STARTED_AT}" ${NODE_BIN} -e 'const fs=require("fs");const path=process.env.ROOT_DIR+"/Reports/auto_learn/last_run.json";const start=Number(process.env.RUN_STARTED_AT||0)||0;const stat=fs.statSync(path);let fresh=start?stat.mtimeMs>=start*1000:true;try{const data=JSON.parse(fs.readFileSync(path,"utf8"));if(data?.run_at&&start){const runAt=Date.parse(data.run_at);if(Number.isFinite(runAt)){fresh=runAt>=start*1000;}}}catch{}process.stdout.write(fresh?"1":"0");');
    if [ "${AUTO_LEARN_FRESH}" != "1" ]; then
      fail_with_reason "auto learn stale report"
    fi
    AUTO_LEARN_RUN_ID_MATCH=$(ROOT_DIR="${ROOT}" RUN_ID="${RUN_ID}" ${NODE_BIN} -e 'const fs=require("fs");const path=process.env.ROOT_DIR+"/Reports/auto_learn/last_run.json";if(!fs.existsSync(path)){process.stdout.write("0");process.exit(0);}const data=JSON.parse(fs.readFileSync(path,"utf8"));const current=String(process.env.RUN_ID||"");const reportId=String(data.run_id||"");if(!reportId){process.stdout.write("1");process.exit(0);}process.stdout.write(reportId===current?"1":"0");');
    if [ "${AUTO_LEARN_RUN_ID_MATCH}" != "1" ]; then
      fail_with_reason "stale auto_learn report run_id mismatch"
    fi
    AUTO_LEARN_LINE=$(ROOT_DIR="${ROOT}" AUTO_LEARN_MIN="${AUTO_LEARN_MIN:-0}" ${NODE_BIN} -e 'const fs=require("fs");const path=process.env.ROOT_DIR+"/Reports/auto_learn/last_run.json";const data=JSON.parse(fs.readFileSync(path,"utf8"));const discovered=Number(data.discovered||0)||0;const validated=Number(data.validated_ok||0)||0;const snapshots=Number(data.snapshots||0)||0;const delta=Number(data.catalog_added??data.sources_added??0)||0;const deltaLabel=`${delta>=0?"+":""}${delta}`;let learned="n/a";if(delta>0&&Array.isArray(data.learned_iso)&&data.learned_iso.length){learned=data.learned_iso.join(",");}const reasons=Array.isArray(data.reasons)?data.reasons:[];const top=reasons.slice(0,10).map((entry)=>{const iso=(entry&&entry.iso2)||"";const code=entry?.code||entry?.reason||"unknown";let host="";try{host=new URL(String(entry?.url||"")).hostname||"";}catch{host="";}const suffix=host?`@${host}`:"";return iso?`${iso}:${code}${suffix}`:`${code}${suffix}`;}).join(",")||"-";const firstUrl=String(data.first_snapshot_url||"-");const firstReason=String(data.first_snapshot_reason||"-").replace(/\\s+/g,"_");const minMode=process.env.AUTO_LEARN_MIN==="1";if(minMode&&delta<=0){console.log(`AUTO_LEARN_MIN: 0 progress reasons_top10=${top}`);process.exit(0);}const label=minMode?"AUTO_LEARN_MIN":"AUTO_LEARN";console.log(`${label}: discovered=${discovered} validated_ok=${validated} snapshots=${snapshots} first_snapshot_url=${firstUrl} first_snapshot_reason=${firstReason} catalog_delta=${deltaLabel} learned_iso=${learned} reasons_top10=${top}`);');
    if [ -z "${AUTO_LEARN_LINE}" ]; then
      fail_with_reason "auto learn summary missing"
    fi
    AUTO_LEARN_META=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const path=process.env.ROOT_DIR+"/Reports/auto_learn/last_run.json";const data=JSON.parse(fs.readFileSync(path,"utf8"));const delta=Number(data.catalog_added ?? data.sources_added ?? 0)||0;const snaps=Number(data.snapshots ?? 0)||0;const reason=data.reason||"unknown";console.log(delta+"|"+snaps+"|"+reason);')
    AUTO_LEARN_DELTA_VALUE="${AUTO_LEARN_META%%|*}"
    AUTO_LEARN_META_REST="${AUTO_LEARN_META#*|}"
    AUTO_LEARN_SNAPS="${AUTO_LEARN_META_REST%%|*}"
    AUTO_LEARN_REASON="${AUTO_LEARN_META_REST#*|}"
    AUTO_LEARN_SOURCES="${AUTO_LEARN_DELTA_VALUE}"
    if [ "${AUTO_LEARN_MIN_PROVISIONAL:-0}" != "1" ] && [ "${AUTO_LEARN_MIN:-0}" != "1" ] && [ "${AUTO_LEARN_MIN_SOURCES:-0}" != "1" ] && [ "${AUTO_LEARN_MODE:-}" != "scale" ]; then
      if [ "${AUTO_LEARN_SOURCES}" -lt 1 ] || [ "${AUTO_LEARN_SNAPS}" -lt 1 ]; then
        fail_with_reason "AUTO_LEARN incomplete iso=${AUTO_LEARN_ISO:-n/a} sources_added=${AUTO_LEARN_SOURCES} snapshots=${AUTO_LEARN_SNAPS} reason=${AUTO_LEARN_REASON}"
      fi
    fi
    if [ "${AUTO_FACTS:-0}" = "1" ]; then
      AUTO_FACTS_STATS=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_facts/last_run.json";if(!fs.existsSync(report)){console.log("n/a|0|0|NO_REPORT");process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const iso=data.iso2||"n/a";const extracted=Number(data.extracted||0)||0;const evidence=Number(data.evidence_count||0)||0;const reason=data.reason||"unknown";console.log([iso,extracted,evidence,reason].join("|"));')
      AUTO_FACTS_ISO="${AUTO_FACTS_STATS%%|*}"
      AUTO_FACTS_REST="${AUTO_FACTS_STATS#*|}"
      AUTO_FACTS_EXTRACTED="${AUTO_FACTS_REST%%|*}"
      AUTO_FACTS_REST="${AUTO_FACTS_REST#*|}"
      AUTO_FACTS_EVIDENCE="${AUTO_FACTS_REST%%|*}"
      AUTO_FACTS_REASON="${AUTO_FACTS_REST#*|}"
      AUTO_FACTS_EARLY_MATCH=$(ROOT_DIR="${ROOT}" RUN_ID="${RUN_ID}" ${NODE_BIN} -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_facts/last_run.json";if(!fs.existsSync(report)){process.stdout.write("0");process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const current=String(process.env.RUN_ID||"");const reportId=String(data.run_id||"");if(!reportId){process.stdout.write("0");process.exit(0);}process.stdout.write(reportId===current?"1":"0");')
    if [ "${AUTO_FACTS_EXTRACTED}" -lt 1 ] && [ "${AUTO_FACTS_EARLY_MATCH}" = "1" ]; then
      case "${AUTO_FACTS_REASON}" in
        NO_EVIDENCE|NOT_LAW_PAGE|NO_LAW_PAGE|NO_ANCHOR|NO_QUOTE|NOT_OFFICIAL|SNAPSHOT_MISSING|NO_MARKER|NO_CANDIDATES|NO_ENTRYPOINTS|NO_STATUS_PATTERN|NO_CANNABIS_BOUND_STATUS)
          ;;
        *)
          fail_with_reason "AUTO_FACTS incomplete iso=${AUTO_FACTS_ISO} extracted=${AUTO_FACTS_EXTRACTED} evidence=${AUTO_FACTS_EVIDENCE} reason=${AUTO_FACTS_REASON}"
          ;;
      esac
    fi
    fi
    if [ "${AUTO_VERIFY:-0}" = "1" ] && [ "${AUTO_FACTS:-0}" = "1" ]; then
      if [ "${NETWORK:-1}" = "0" ]; then
        AUTO_VERIFY_LINE="AUTO_VERIFY: skipped (NETWORK=0)"
      else
        ${NODE_BIN} tools/auto_verify/run_auto_verify.mjs >>"${PRE_LOG}" 2>&1 || true
        if [ ! -f "${ROOT}/Reports/auto_verify/last_run.json" ]; then
          AUTO_VERIFY_LINE="AUTO_VERIFY: missing report"
        else
          AUTO_VERIFY_FRESH=$(ROOT_DIR="${ROOT}" RUN_STARTED_AT="${RUN_STARTED_AT}" ${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const report=path.join(process.env.ROOT_DIR,"Reports","auto_verify","last_run.json");const start=Number(process.env.RUN_STARTED_AT||0)||0;const stat=fs.statSync(report);let fresh=start?stat.mtimeMs>=start*1000:true;try{const data=JSON.parse(fs.readFileSync(report,"utf8"));if(data?.run_at&&start){const runAt=Date.parse(data.run_at);if(Number.isFinite(runAt)){fresh=runAt>=start*1000;}}}catch{}process.stdout.write(fresh?"1":"0");');
          if [ "${AUTO_VERIFY_FRESH}" != "1" ]; then
            fail_with_reason "auto verify stale report"
          fi
          AUTO_VERIFY_LINE=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const report=path.join(process.env.ROOT_DIR,"Reports","auto_verify","last_run.json");const data=JSON.parse(fs.readFileSync(report,"utf8"));const tried=Number(data.tried||0)||0;const delta=Number(data.machine_verified_delta||0)||0;const evidence=Number(data.evidence_ok||0)||0;const topList=Array.isArray(data.evidence_ids)&&data.evidence_ids.length?data.evidence_ids:Array.isArray(data.changed_ids)&&data.changed_ids.length?data.changed_ids:[];const top=topList.slice(0,5).join(",")||"-";const deltaLabel=`${delta>=0?"+":""}${delta}`;let reasons="";if(delta===0){const items=[];const perItems=Array.isArray(data.items)?data.items:[];for(const entry of perItems){const iso=entry?.iso2||"-";const evidenceFound=Boolean(entry?.evidence_found);if(!evidenceFound){const reason=entry?.reason||"NO_EVIDENCE";items.push(`${iso}:${reason}`);}}if(items.length===0){const errors=Array.isArray(data.errors)?data.errors:[];for(const entry of errors){const iso=entry?.iso2||"-";const reason=entry?.reason||"error";items.push(`${iso}:${reason}`);}}const topReasons=items.slice(0,3).join(",")||"OK";reasons=` reasons_top3=${topReasons}`;}console.log(`AUTO_VERIFY: tried=${tried} evidence_ok=${evidence} machine_verified_delta=${deltaLabel} top=${top}${reasons}`);');
          AUTO_VERIFY_CHANGED=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const report=path.join(process.env.ROOT_DIR,"Reports","auto_verify","last_run.json");const data=JSON.parse(fs.readFileSync(report,"utf8"));process.stdout.write(String(Number(data.changed||0)||0));');
          AUTO_VERIFY_EVIDENCE=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const report=path.join(process.env.ROOT_DIR,"Reports","auto_verify","last_run.json");const data=JSON.parse(fs.readFileSync(report,"utf8"));process.stdout.write(String(Number(data.evidence_ok||0)||0));');
        fi
      fi
    fi
    if [ "${AUTO_VERIFY_HARD:-0}" = "1" ] && [ "${AUTO_VERIFY_CHANGED}" -gt 0 ] && [ "${AUTO_VERIFY_EVIDENCE}" -eq 0 ]; then
      fail_with_reason "AUTO_VERIFY_HARD no evidence"
    fi
  fi
fi

if [ "${AUTO_FACTS:-0}" = "1" ]; then
  AUTO_FACTS_RUN_ARGS=()
  if [ -n "${AUTO_FACTS_PIPELINE:-}" ]; then
    AUTO_FACTS_RUN_ARGS+=(--pipeline "${AUTO_FACTS_PIPELINE}")
  fi
  if [ -n "${TARGET_ISO:-}" ]; then
    AUTO_FACTS_ISO=$(printf "%s" "${TARGET_ISO}" | tr '[:lower:]' '[:upper:]')
    FETCH_NETWORK="${FETCH_NETWORK}" ${NODE_BIN} tools/auto_facts/run_auto_facts.mjs \
      --iso2 "${AUTO_FACTS_ISO}" \
      "${AUTO_FACTS_RUN_ARGS[@]}" >>"${PRE_LOG}" 2>&1 || true
    AUTO_FACTS_RAN=1
  elif [ -f "${ROOT}/Reports/auto_learn/last_run.json" ]; then
    AUTO_FACTS_META=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const data=JSON.parse(fs.readFileSync(process.env.ROOT_DIR+"/Reports/auto_learn/last_run.json","utf8"));const picked=Array.isArray(data.picked)&&data.picked.length?data.picked[0]:"";const iso=data.iso||data.iso2||picked||"";const snapshot=data.law_page_snapshot_path||"";const url=data.law_page_url||data.final_url||data.url||"";const snapshots=Array.isArray(data.law_page_snapshot_paths)?data.law_page_snapshot_paths.length:0;process.stdout.write([iso,snapshot,url,snapshots].join("|"));');
    AUTO_FACTS_ISO="${AUTO_FACTS_META%%|*}"
    AUTO_FACTS_REST="${AUTO_FACTS_META#*|}"
    AUTO_FACTS_SNAPSHOT="${AUTO_FACTS_REST%%|*}"
    AUTO_FACTS_REST="${AUTO_FACTS_REST#*|}"
    AUTO_FACTS_URL="${AUTO_FACTS_REST%%|*}"
    AUTO_FACTS_SNAPSHOT_COUNT="${AUTO_FACTS_REST#*|}"
    if [ "${AUTO_FACTS_SNAPSHOT_COUNT:-0}" -gt 0 ] || [ "${FETCH_NETWORK:-0}" != "0" ]; then
      run_step "auto_facts" 180 "FETCH_NETWORK=${FETCH_NETWORK} ${NODE_BIN} tools/auto_facts/run_auto_facts.mjs ${AUTO_FACTS_RUN_ARGS[*]} >>\"${PRE_LOG}\" 2>&1" || true
      AUTO_FACTS_RAN=1
    elif [ -n "${AUTO_FACTS_ISO}" ] && [ -n "${AUTO_FACTS_SNAPSHOT}" ] && [ -n "${AUTO_FACTS_URL}" ]; then
      run_step "auto_facts" 180 "${NODE_BIN} tools/auto_facts/run_auto_facts.mjs --iso2 \"${AUTO_FACTS_ISO}\" --snapshot \"${AUTO_FACTS_SNAPSHOT}\" --url \"${AUTO_FACTS_URL}\" ${AUTO_FACTS_RUN_ARGS[*]} >>\"${PRE_LOG}\" 2>&1" || true
      AUTO_FACTS_RAN=1
    else
      ROOT_DIR="${ROOT}" RUN_ID="${RUN_ID}" AUTO_FACTS_ISO="${AUTO_FACTS_ISO:-n/a}" ${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const root=process.env.ROOT_DIR;const iso2=String(process.env.AUTO_FACTS_ISO||"n/a");const payload={run_id:String(process.env.RUN_ID||""),run_at:new Date().toISOString(),iso2,extracted:0,confidence:"low",evidence_count:0,evidence_ok:0,law_pages:0,machine_verified_delta:0,candidate_facts_delta:0,mv_before:0,mv_after:0,mv_added:0,mv_removed:0,mv_wrote:false,mv_write_reason:"EMPTY_WRITE_GUARD",reason:"NO_LAW_PAGE",items:[]};const out=path.join(root,"Reports","auto_facts","last_run.json");fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(payload,null,2)+"\n");'
    fi
  else
    ROOT_DIR="${ROOT}" RUN_ID="${RUN_ID}" AUTO_FACTS_ISO="n/a" ${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const root=process.env.ROOT_DIR;const iso2=String(process.env.AUTO_FACTS_ISO||"n/a");const payload={run_id:String(process.env.RUN_ID||""),run_at:new Date().toISOString(),iso2,extracted:0,confidence:"low",evidence_count:0,evidence_ok:0,law_pages:0,machine_verified_delta:0,candidate_facts_delta:0,mv_before:0,mv_after:0,mv_added:0,mv_removed:0,mv_wrote:false,mv_write_reason:"EMPTY_WRITE_GUARD",reason:"NO_LAW_PAGE",items:[]};const out=path.join(root,"Reports","auto_facts","last_run.json");fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(payload,null,2)+"\n");'
  fi
  AUTO_FACTS_LINE=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_facts/last_run.json";if(!fs.existsSync(report)){console.log("AUTO_FACTS: iso=n/a pages_checked=0 extracted=0 evidence=0 top_marker_hits=[-] reason=NO_REPORT");process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const iso=String(data.iso2||"n/a").toUpperCase();const extracted=Number(data.extracted||0)||0;const evidence=Number(data.evidence_count||0)||0;const pages=Number(data.pages_checked||0)||0;const markers=Array.isArray(data.marker_hits_top)?data.marker_hits_top:[];const top=markers.length?markers.join(","):"-";const reason=String(data.reason||"unknown").replace(/\\s+/g,"_");console.log(`AUTO_FACTS: iso=${iso} pages_checked=${pages} extracted=${extracted} evidence=${evidence} top_marker_hits=[${top}] reason=${reason}`);');
  AUTO_FACTS_RUN_ID_MATCH=$(ROOT_DIR="${ROOT}" RUN_ID="${RUN_ID}" ${NODE_BIN} -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_facts/last_run.json";if(!fs.existsSync(report)){process.stdout.write("1");process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const current=String(process.env.RUN_ID||"");const reportId=String(data.run_id||"");if(!reportId){process.stdout.write("1");process.exit(0);}process.stdout.write(reportId===current?"1":"0");');
  if [ "${AUTO_FACTS_RUN_ID_MATCH}" != "1" ]; then
    fail_with_reason "stale auto_facts report run_id mismatch"
  fi
else
  AUTO_FACTS_LINE="AUTO_FACTS: skipped (AUTO_FACTS=0)"
fi

CHECKED_VERIFY_LINE="CHECKED_VERIFY: skipped (CHECKED_VERIFY=0)"
CHECKED_VERIFY_REPORT="${ROOT}/Reports/auto_facts/checked_summary.json"
if [ "${CHECKED_VERIFY:-0}" = "1" ]; then
  run_step "checked_verify" 180 "CHECKED_VERIFY_EXTRA_ISO=${CHECKED_VERIFY_EXTRA_ISO:-RU,TH,US-CA,XK} CHECKED_VERIFY_LIMIT=${CHECKED_VERIFY_LIMIT:-8} ${NODE_BIN} tools/auto_facts/run_checked_verify.mjs >>\"${PRE_LOG}\" 2>&1" || true
  if [ -f "${CHECKED_VERIFY_REPORT}" ]; then
    CHECKED_VERIFY_LINE=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_facts/checked_summary.json";if(!fs.existsSync(report)){console.log("CHECKED_VERIFY: missing report");process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const count=Array.isArray(data.checked)?data.checked.length:0;const reason=String(data.reason||"OK").replace(/\\s+/g,"_");console.log(`CHECKED_VERIFY: isos=${count} reason=${reason}`);');
    set +e
    CHECKED_VERIFY_GUARD=$(ROOT_DIR="${ROOT}" RU_BLOCKED="${RU_BLOCKED}" FETCH_NETWORK="${FETCH_NETWORK:-0}" ${NODE_BIN} -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_facts/checked_summary.json";if(!fs.existsSync(report)){process.exit(0);}const fetchNetwork=process.env.FETCH_NETWORK==="1";if(!fetchNetwork){process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const items=Array.isArray(data.items)?data.items:[];const targets=new Set(["RU","TH"]);const errors=[];const ruBlocked=process.env.RU_BLOCKED==="1";for(const item of items){const iso=String(item.iso2||"").toUpperCase();if(!targets.has(iso)) continue;if(iso==="RU"&&ruBlocked) continue;const attempt=item.snapshot_attempt||{};const reason=String(attempt.reason||"");const okAttempt=reason==="OK"||reason==="NOT_MODIFIED"||reason==="CACHE_HIT";const candidates=Number(item.law_page_candidates_total||0)||0;if(!okAttempt){errors.push(`${iso}:SNAPSHOT_${reason||"FAIL"}`);continue;}if(candidates<1){errors.push(`${iso}:NO_CANDIDATES`);} }if(errors.length){process.stdout.write(errors.join(","));process.exit(12);}');
    CHECKED_VERIFY_GUARD_STATUS=$?
    set -e
    if [ "${CHECKED_VERIFY_GUARD_STATUS}" -ne 0 ]; then
      fail_with_reason "CHECKED_VERIFY guard failed ${CHECKED_VERIFY_GUARD}"
    fi
  else
    CHECKED_VERIFY_LINE="CHECKED_VERIFY: missing report"
  fi
fi

ABORTED_LINE=0
if [ -f "${PRE_LOG}" ] && grep -q "operation was aborted" "${PRE_LOG}"; then
  ABORTED_LINE=1
fi
if [ -f "${CI_LOG}" ] && grep -q "operation was aborted" "${CI_LOG}"; then
  ABORTED_LINE=1
fi
INCOMPLETE=0
if [ "${AUTO_LEARN:-0}" = "1" ] || [ "${AUTO_VERIFY:-0}" = "1" ]; then
  if [ ! -f "${ROOT}/Reports/auto_learn/last_run.json" ]; then
    INCOMPLETE=1
  fi
  if [ "${AUTO_FACTS:-0}" = "1" ] && [ ! -f "${ROOT}/Reports/auto_facts/last_run.json" ]; then
    INCOMPLETE=1
  fi
  if [ "${AUTO_VERIFY:-0}" = "1" ] && [ ! -f "${ROOT}/Reports/auto_verify/last_run.json" ]; then
    INCOMPLETE=1
  fi
  if [ ! -d "${ROOT}/data/source_snapshots" ]; then
    INCOMPLETE=1
  fi
  if [ ! -f "${ROOT}/data/legal_ssot/machine_verified.json" ]; then
    INCOMPLETE=1
  fi
fi
if [ "${ABORTED_LINE}" -eq 1 ] || [ "${INCOMPLETE}" -eq 1 ]; then
  printf "❌ VERIFY FAILED (aborted/incomplete)\n" > "${STDOUT_FILE}"
  cp "${STDOUT_FILE}" "${RUN_REPORT_FILE}" 2>/dev/null || true
  cat "${STDOUT_FILE}" >&${OUTPUT_FD}
  exit 2
fi

UI_LINE=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const root=process.env.ROOT_DIR;const lastPath=path.join(root,"Reports","auto_learn","last_run.json");if(!fs.existsSync(lastPath)){console.log("UI: candidate_badge=off verify_links=0");process.exit(0);}const data=JSON.parse(fs.readFileSync(lastPath,"utf8"));const picked=Array.isArray(data.picked)&&data.picked.length?data.picked[0]:"";const iso=String((data.iso||data.iso2||picked||"")).toUpperCase();let verifyLinks=0;const factsPath=path.join(root,"Reports","auto_facts","last_run.json");if(fs.existsSync(factsPath)){const facts=JSON.parse(fs.readFileSync(factsPath,"utf8"));const items=Array.isArray(facts.items)?facts.items:[];const ranked=[...items].sort((a,b)=>Number(b?.evidence_ok||0)-Number(a?.evidence_ok||0));verifyLinks=ranked.slice(0,5).reduce((sum,item)=>{const count=Number(item?.evidence_count||0)||0;return sum+count;},0);}if(verifyLinks===0){const machinePath=path.join(root,"data","legal_ssot","machine_verified.json");let entryCount=0;if(fs.existsSync(machinePath)){const payload=JSON.parse(fs.readFileSync(machinePath,"utf8"));const entries=payload&&payload.entries&&typeof payload.entries==="object"?payload.entries:payload;entryCount=entries&&typeof entries==="object"?Object.keys(entries).length:0;if(entries&&iso&&entries[iso]){verifyLinks=Array.isArray(entries[iso]?.evidence)?entries[iso].evidence.length:0;}if(verifyLinks===0&&entries&&typeof entries==="object"){for(const entry of Object.values(entries)){const count=Array.isArray(entry?.evidence)?entry.evidence.length:0;if(count>0){verifyLinks=count;break;}}}if(verifyLinks===0&&entryCount>0){verifyLinks=1;}}}const lawsPathWorld=path.join(root,"data","laws","world",`${iso}.json`);const lawsPathEu=path.join(root,"data","laws","eu",`${iso}.json`);let reviewStatus="";if(fs.existsSync(lawsPathWorld)){reviewStatus=JSON.parse(fs.readFileSync(lawsPathWorld,"utf8")).review_status||"";}else if(fs.existsSync(lawsPathEu)){reviewStatus=JSON.parse(fs.readFileSync(lawsPathEu,"utf8")).review_status||"";}const badge=String(reviewStatus).toLowerCase()==="needs_review"?"on":"off";console.log(`UI: candidate_badge=${badge} verify_links=${verifyLinks}`);')

if [ "${FETCH_NETWORK}" != "${INITIAL_FETCH_NETWORK}" ]; then
  echo "NETWORK_FLIP initial=${INITIAL_FETCH_NETWORK} current=${FETCH_NETWORK}"
  echo "NETWORK_FLIP_HINT=pass_cycle"
  fail_with_reason "NETWORK_FLIP"
fi

set +e
GEO_GATE_OUTPUT=$(${NODE_BIN} tools/gates/geo_gate.mjs 2>&1)
GEO_GATE_RC=$?
GEO_GATE_OK=0
if printf "%s\n" "${GEO_GATE_OUTPUT}" | grep -q "^GEO_GATE_OK=1"; then
  GEO_GATE_OK=1
fi
set -e
if [ -n "${GEO_GATE_OUTPUT}" ]; then
  printf "%s\n" "${GEO_GATE_OUTPUT}" >> "${PRE_LOG}"
fi
if [ "${GEO_GATE_RC}" -ne 0 ] || [ "${GEO_GATE_OK}" -ne 1 ]; then
  FAIL_EXTRA_LINES="${FAIL_EXTRA_LINES:+${FAIL_EXTRA_LINES}"$'\n'"}${GEO_GATE_OUTPUT}"
  FAIL_STEP="geo_gate"
  FAIL_CMD="${NODE_BIN} tools/gates/geo_gate.mjs"
  if [ "${GEO_GATE_RC}" -ne 0 ]; then
    FAIL_RC="${GEO_GATE_RC}"
  else
    FAIL_RC=1
  fi
  fail_with_reason "GEO_GATE_FAIL"
fi

SMOKE_TOTAL="$(grep -E '^SMOKE_TOTAL=' "${REPORTS_FINAL}" | head -n1 | cut -d= -f2 || true)"
SMOKE_OK="$(grep -E '^SMOKE_OK=' "${REPORTS_FINAL}" | head -n1 | cut -d= -f2 || true)"
SMOKE_FAIL="$(grep -E '^SMOKE_FAIL=' "${REPORTS_FINAL}" | head -n1 | cut -d= -f2 || true)"
if [ -z "${SMOKE_OK}" ] || [ -z "${SMOKE_FAIL}" ]; then
  UI_SMOKE_LINE="$(grep -E '^UI_SMOKE_OK=' "${REPORTS_FINAL}" | head -n1 || true)"
  if [ -n "${UI_SMOKE_LINE}" ]; then
    SMOKE_OK="${SMOKE_OK:-$(printf "%s" "${UI_SMOKE_LINE}" | sed -nE 's/.*\\bok=([0-9]+).*/\\1/p')}"
    SMOKE_FAIL="${SMOKE_FAIL:-$(printf "%s" "${UI_SMOKE_LINE}" | sed -nE 's/.*\\bfail=([0-9]+).*/\\1/p')}"
  fi
fi
SMOKE_LABEL="Smoke ${SMOKE_OK:-?}/${SMOKE_FAIL:-?} (total ${SMOKE_TOTAL:-?})"
if [ -f "${REPORTS_FINAL}" ]; then
  if ! grep -E "^PROBE_OK=" "${REPORTS_FINAL}" >/dev/null 2>&1; then
    probe_line=$(grep -E "^ONLINE_BY_TRUTH_PROBES=" "${REPORTS_FINAL}" | tail -n 1 || true)
    probe_val="${probe_line#ONLINE_BY_TRUTH_PROBES=}"
    probe_val="${probe_val%% *}"
    if [ "${probe_val}" = "1" ]; then
      append_ci_line "PROBE_OK=1"
    else
      append_ci_line "PROBE_OK=0"
    fi
  fi
  if ! grep -E "^WIKI_DB_GATE_OK=" "${REPORTS_FINAL}" >/dev/null 2>&1; then
    wiki_gate_line=$(grep -E "^WIKI_GATE_OK=" "${REPORTS_FINAL}" | tail -n 1 || true)
    wiki_gate_val="${wiki_gate_line#WIKI_GATE_OK=}"
    wiki_gate_val="${wiki_gate_val%% *}"
    if [ "${wiki_gate_val}" = "1" ]; then
      append_ci_line "WIKI_DB_GATE_OK=1"
    else
      append_ci_line "WIKI_DB_GATE_OK=0"
    fi
  fi
  if ! grep -E "^OFFICIAL_SHRINK_OK=" "${REPORTS_FINAL}" >/dev/null 2>&1; then
    off_guard_line=$(grep -E "^OFFICIAL_DOMAINS_GUARD=" "${REPORTS_FINAL}" | tail -n 1 || true)
    off_guard_val="${off_guard_line#OFFICIAL_DOMAINS_GUARD=}"
    off_guard_val="${off_guard_val%% *}"
    off_items_line=$(grep -E "^OFFICIAL_ITEMS_PRESENT=" "${REPORTS_FINAL}" | tail -n 1 || true)
    off_items_val="${off_items_line#OFFICIAL_ITEMS_PRESENT=}"
    off_items_val="${off_items_val%% *}"
    off_base_line=$(grep -E "^OFFICIAL_BASELINE_COUNT=" "${REPORTS_FINAL}" | tail -n 1 || true)
    off_base_val="${off_base_line#OFFICIAL_BASELINE_COUNT=}"
    off_base_val="${off_base_val%% *}"
    if [ "${off_guard_val}" = "PASS" ] && [ -n "${off_base_val}" ] && [ "${off_items_val}" = "${off_base_val}" ]; then
      append_ci_line "OFFICIAL_SHRINK_OK=1"
    else
      append_ci_line "OFFICIAL_SHRINK_OK=0"
    fi
  fi
fi
