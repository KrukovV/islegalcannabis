#!/usr/bin/env bash
set -euo pipefail

bash tools/git-health.sh
npm run where
bash tools/guard-ssr.sh
ILC_FORCE_GREP=1 bash tools/guard-ssr.sh

scan_roots=(apps packages)
scan_globs=(
  "--glob"
  "apps/**/src/**/*.ts"
  "--glob"
  "apps/**/src/**/*.tsx"
  "--glob"
  "packages/**/src/**/*.ts"
  "--glob"
  "packages/**/src/**/*.tsx"
  "--glob"
  "!packages/shared/**"
  "--glob"
  "!**/__snapshots__/**"
  "--glob"
  "!**/node_modules/**"
  "--glob"
  "!**/.next/**"
  "--glob"
  "!**/dist/**"
  "--glob"
  "!**/build/**"
)

regex_types="(?m)^\\s*(export\\s+)?type\\s+ResultStatusLevel\\s*=|(?m)^\\s*type\\s+StatusLevel\\s*="
regex_union="(?s)(\"green\"|'green')[[:space:]]*\\|[[:space:]]*(\"yellow\"|'yellow')[[:space:]]*\\|[[:space:]]*(\"red\"|'red')([[:space:]]*\\|[[:space:]]*(\"gray\"|'gray'))?"
regex_union_ere="(\"green\"|'green')[[:space:]]*\\|[[:space:]]*(\"yellow\"|'yellow')[[:space:]]*\\|[[:space:]]*(\"red\"|'red')([[:space:]]*\\|[[:space:]]*(\"gray\"|'gray'))?"

if rg --version >/dev/null 2>&1 && rg -P "" /dev/null >/dev/null 2>&1; then
  if rg -n -P -U "$regex_types" "${scan_roots[@]}" "${scan_globs[@]}"; then
    echo "Не объявляйте ResultStatusLevel в apps/* — используйте импорт из packages/shared."
    exit 1
  fi
  if rg -n -P -U "$regex_union" "${scan_roots[@]}" "${scan_globs[@]}"; then
    echo "Не объявляйте локальные union-статусы — используйте ResultStatusLevel из packages/shared."
    exit 1
  fi
else
  if grep -R -n -z -E "$regex_types" apps --include="*.ts" --include="*.tsx" --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=build --exclude-dir=__snapshots__ >/dev/null 2>&1; then
    grep -R -n -z -E "$regex_types" apps --include="*.ts" --include="*.tsx" --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=build --exclude-dir=__snapshots__
    echo "Не объявляйте ResultStatusLevel в apps/* — используйте импорт из packages/shared."
    exit 1
  fi
  if grep -R -n -z -E "$regex_types" packages --include="*.ts" --include="*.tsx" --exclude-dir=shared --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=build --exclude-dir=__snapshots__ >/dev/null 2>&1; then
    grep -R -n -z -E "$regex_types" packages --include="*.ts" --include="*.tsx" --exclude-dir=shared --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=build --exclude-dir=__snapshots__
    echo "Не объявляйте ResultStatusLevel вне packages/shared."
    exit 1
  fi
  if grep -R -n -z -E "$regex_union_ere" apps --include="*.ts" --include="*.tsx" --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=build --exclude-dir=__snapshots__ >/dev/null 2>&1; then
    grep -R -n -z -E "$regex_union_ere" apps --include="*.ts" --include="*.tsx" --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=build --exclude-dir=__snapshots__
    echo "Не объявляйте локальные union-статусы — используйте ResultStatusLevel из packages/shared."
    exit 1
  fi
  if grep -R -n -z -E "$regex_union_ere" packages --include="*.ts" --include="*.tsx" --exclude-dir=shared --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=build --exclude-dir=__snapshots__ >/dev/null 2>&1; then
    grep -R -n -z -E "$regex_union_ere" packages --include="*.ts" --include="*.tsx" --exclude-dir=shared --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=build --exclude-dir=__snapshots__
    echo "Не объявляйте локальные union-статусы вне packages/shared."
    exit 1
  fi
fi

if rg --version >/dev/null 2>&1; then
  status_files=$(rg -l "ResultStatusLevel" apps/web/src --glob "*.ts" --glob "*.tsx" --glob "!**/__snapshots__/**" || true)
  for file in $status_files; do
    if ! rg -n "from\\s+['\"][^'\"]*shared[^'\"]*['\"]" "$file" >/dev/null; then
      echo "Missing shared import for ResultStatusLevel in ${file}."
      exit 1
    fi
  done
else
  status_files=$(grep -R -l -E "ResultStatusLevel" apps/web/src --include="*.ts" --include="*.tsx" --exclude-dir=__snapshots__ || true)
  for file in $status_files; do
    if ! grep -E "from[[:space:]]+['\"][^'\"]*shared[^'\"]*['\"]" "$file" >/dev/null 2>&1; then
      echo "Missing shared import for ResultStatusLevel in ${file}."
      exit 1
    fi
  done
fi

npm run audit
npm run lint
npm test
npm run web:build
npm run validate:laws
npm run validate:iso3166
npm run coverage
npm run smoke:mock
