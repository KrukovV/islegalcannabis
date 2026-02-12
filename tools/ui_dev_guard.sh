#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
URL="http://127.0.0.1:3000/wiki-truth"
LOCK_PATH="${ROOT}/apps/web/.next/dev/lock"

http_status="0"
if command -v curl >/dev/null 2>&1; then
  http_status="$(curl -s -L -o /dev/null -w "%{http_code}" "${URL}" || echo 0)"
else
  http_status="$(
    node - <<'NODE'
const http = require("node:http");
const req = http.get("http://127.0.0.1:3000/wiki-truth", { timeout: 2000 }, (res) => {
  res.resume();
  console.log(String(res.statusCode || 0));
});
req.on("error", () => console.log("0"));
req.on("timeout", () => {
  req.destroy();
  console.log("0");
});
NODE
  )"
fi

http_ok=0
if [ "${http_status}" -ge 200 ] && [ "${http_status}" -lt 400 ]; then
  http_ok=1
fi

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

if [ "${http_ok}" -eq 1 ] || [ "${lock_exists}" -eq 1 ] || [ "${port_busy}" -eq 1 ] || [ "${proc_busy}" -eq 1 ]; then
  echo "UI_ALREADY_RUNNING url=${URL}"
  exit 0
fi

cd "${ROOT}"
npm -w apps/web run dev
