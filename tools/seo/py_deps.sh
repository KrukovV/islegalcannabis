#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
TARGET="$ROOT/.cache/pytrends_site"

mkdir -p "$TARGET"
python3 -c 'import sys; sys.exit(0)'
if ! python3 -m pip --version >/dev/null 2>&1; then
  python3 -m ensurepip --upgrade >/dev/null 2>&1 || true
fi
if ! python3 -m pip --version >/dev/null 2>&1; then
  echo "pip unavailable: run python3 -m ensurepip or install pip"
  exit 1
fi

if [ -f "$TARGET/.installed" ]; then
  if ! PYTHONPATH="$TARGET" python3 -c "import pytrends,pandas" >/dev/null 2>&1; then
    rm -f "$TARGET/.installed"
  fi
fi

if [ ! -f "$TARGET/.installed" ]; then
  python3 -m pip install --disable-pip-version-check --no-warn-script-location \
    --upgrade --upgrade-strategy only-if-needed --target "$TARGET" \
    pytrends pandas >/dev/null
  date -u +"%Y-%m-%dT%H:%M:%SZ" > "$TARGET/.installed"
fi

if ! PYTHONPATH="$TARGET" python3 -c "import pytrends,pandas" >/dev/null 2>&1; then
  echo "pytrends or pandas import failed after install"
  exit 1
fi

echo "$TARGET"
