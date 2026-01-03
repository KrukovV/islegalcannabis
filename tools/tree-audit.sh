#!/usr/bin/env bash
set -euo pipefail

root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "${root}"

echo "Top 20 largest files/dirs (excluding node_modules/.next/.git):"
du -x -a . \
  | rg -v "/node_modules($|/)|/.next($|/)|/.git($|/)" \
  | sort -nr \
  | head -20

echo
echo "Large binary candidates (>5MB):"
matches="$(find . \
  -path "./.git" -prune -o \
  -path "./node_modules" -prune -o \
  -path "./apps/web/node_modules" -prune -o \
  -path "./.next" -prune -o \
  -path "./apps/web/.next" -prune -o \
  -type f \( -name "*.zip" -o -name "*.dmg" -o -name "*.png" -o -name "*.jpg" -o -name "*.jpeg" -o -name "*.gif" -o -name "*.mp4" -o -name "*.mov" -o -name "*.avi" -o -name "*.pdf" \) \
  -size +5M -print)"

if [[ -n "${matches}" ]]; then
  echo "WARNING: large binary files detected:"
  echo "${matches}"
  exit 1
fi

echo "No large binary files found."
