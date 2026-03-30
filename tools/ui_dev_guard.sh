#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
URL="http://127.0.0.1:3000/wiki-truth"
LOCK_PATH="${ROOT}/apps/web/.next/dev/lock"
ROOT_URL="http://127.0.0.1:3000/"

check_http() {
  local status="0"
  if command -v curl >/dev/null 2>&1; then
    status="$(curl -s -L -o /dev/null -w "%{http_code}" "${ROOT_URL}" || echo 0)"
    if [ "${status}" -lt 200 ] || [ "${status}" -ge 400 ]; then
      status="$(curl -s -L -o /dev/null -w "%{http_code}" "${URL}" || echo 0)"
    fi
  else
    status="$(
      node - <<'NODE'
const http = require("node:http");
const urls = ["http://127.0.0.1:3000/", "http://127.0.0.1:3000/wiki-truth"];
let idx = 0;
const next = () => {
  if (idx >= urls.length) return console.log("0");
  const req = http.get(urls[idx++], { timeout: 2000 }, (res) => {
    res.resume();
    const code = Number(res.statusCode || 0);
    if (code >= 200 && code < 400) return console.log(String(code));
    next();
  });
  req.on("error", next);
  req.on("timeout", () => {
    req.destroy();
    next();
  });
};
next();
NODE
    )"
  fi
  [ "${status}" -ge 200 ] && [ "${status}" -lt 400 ]
}

lock_exists=0
if [ -f "${LOCK_PATH}" ]; then
  lock_exists=1
fi

has_lsof=0
if command -v lsof >/dev/null 2>&1; then
  has_lsof=1
fi

port_busy=0
if [ "${has_lsof}" -eq 1 ]; then
  if lsof -nP -iTCP:3000 -sTCP:LISTEN 2>/dev/null | rg -q "node|next"; then
    port_busy=1
  fi
fi

proc_busy=0
if ps aux | rg -q "next dev.*apps/web|apps/web.*next dev|next dev -p 3000"; then
  proc_busy=1
fi

if [ "${lock_exists}" -eq 1 ] || [ "${port_busy}" -eq 1 ] || [ "${proc_busy}" -eq 1 ]; then
  if check_http; then
    echo "UI_ALREADY_RUNNING url=${URL}"
    exit 0
  fi
fi

cd "${ROOT}"
NEXT_DISABLE_TURBOPACK=1 npm -w apps/web run dev
