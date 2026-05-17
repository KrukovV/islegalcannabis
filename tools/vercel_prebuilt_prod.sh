#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=8192}"

npx -y vercel build --prod --yes
npx -y vercel deploy --prebuilt --prod --yes --logs
