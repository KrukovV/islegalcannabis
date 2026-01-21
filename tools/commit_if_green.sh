#!/usr/bin/env bash
set -euo pipefail

DRY_RUN=0
TAG_NAME=""
PROD_TAG_NAME=""
PROD_TAG_REQUESTED=0
SKIP_GIT=0
GIT_BLOCKED_ARTIFACTS=""
GIT_HEALTH_REASON="UNKNOWN"

while [ "$#" -gt 0 ]; do
  case "$1" in
    -m|--message)
      COMMIT_SUBJECT="${2:-}"
      shift 2
      ;;
    --body)
      COMMIT_BODY="${2:-}"
      shift 2
      ;;
    --tag)
      TAG_NAME="${2:-}"
      shift 2
      ;;
    --prod-tag)
      PROD_TAG_NAME="${2:-}"
      PROD_TAG_REQUESTED=1
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    *)
      shift
      ;;
  esac
done

node tools/net/net_truth_gate.mjs
bash tools/quality_gate.sh

git_health() {
  local details="OK"
  local ok=1
  local reason="OK"
  local ls_out=""
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    ok=0
    reason="NO_REPO"
    details="not inside worktree"
  else
    if ! git status --porcelain >/dev/null 2> /tmp/git_health_err.$$; then
      if grep -qi "dubious ownership" /tmp/git_health_err.$$; then
        ok=0
        reason="SAFE_DIR"
        details="$(tr '\n' ' ' < /tmp/git_health_err.$$)"
      else
        ok=0
        reason="UNKNOWN"
        details="$(tr '\n' ' ' < /tmp/git_health_err.$$)"
      fi
    fi
  fi
  if [ "${ok}" -eq 1 ] && [ -e .git/index.lock ]; then
    if command -v lsof >/dev/null 2>&1; then
      ls_out=$(lsof -nP .git/index.lock 2>/dev/null | tail -n +2)
      if [ -n "${ls_out}" ]; then
        ok=0
        reason="LOCK"
        details="index.lock in use"
      fi
    fi
    if [ "${ok}" -eq 1 ]; then
      ok=0
      reason="LOCK"
      details="index.lock present"
    fi
  fi
  if [ "${ok}" -eq 1 ]; then
    if ! touch .git/.writetest 2>/tmp/git_health_write.$$; then
      ok=0
      if grep -qi "Operation not permitted" /tmp/git_health_write.$$; then
        reason="SANDBOX"
        details="Operation not permitted"
      else
        reason="PERM"
        details="$(tr '\n' ' ' < /tmp/git_health_write.$$)"
      fi
    else
      rm -f .git/.writetest 2>/dev/null || true
    fi
  fi
  rm -f /tmp/git_health_err.$$ /tmp/git_health_write.$$ 2>/dev/null || true
  echo "GIT_HEALTH ok=${ok} reason=${reason} details=${details}"
  append_ci_final "GIT_HEALTH ok=${ok} reason=${reason} details=${details}"
  GIT_HEALTH_REASON="${reason}"
  if [ "${ok}" -eq 1 ]; then
    return 0
  fi
  return 1
}

print_git_diag() {
  echo "pwd=$(pwd)"
  ls -ld .git
  ls -la .git | sed -n '1,80p'
  stat -f "%Su %Sg %Sp %N" .git .git/index 2>/dev/null || true
  id -un
  id -gn
  if [ -d .git ]; then
    if [ -w .git ]; then
      echo "GIT_DIR_WRITABLE=1"
      append_ci_final "GIT_DIR_WRITABLE=1"
    else
      echo "GIT_DIR_WRITABLE=0"
      append_ci_final "GIT_DIR_WRITABLE=0"
    fi
    if [ -e .git/index ]; then
      if [ -w .git/index ]; then
        echo "GIT_INDEX_WRITABLE=1"
        append_ci_final "GIT_INDEX_WRITABLE=1"
      else
        echo "GIT_INDEX_WRITABLE=0"
        append_ci_final "GIT_INDEX_WRITABLE=0"
      fi
    else
      echo "GIT_INDEX_WRITABLE=0"
      append_ci_final "GIT_INDEX_WRITABLE=0"
    fi
  fi
  find .git -maxdepth 1 -name "index.lock" -print -exec stat -f "%m %N" {} \; || true
}

print_fail_diag() {
  if [ -f Reports/ci-final.txt ]; then
    tail -n 80 Reports/ci-final.txt || true
  fi
  git status --porcelain || true
  ls -la .git/index* .git/*.lock 2>/dev/null || true
}

write_git_blocked_artifacts() {
  local ts
  local dir
  ts=$(date -u +%Y%m%d-%H%M%S)
  dir="Artifacts/git_blocked/${ts}"
  mkdir -p "${dir}"
  git status --porcelain > "${dir}/git_status.txt" 2>/dev/null || true
  git diff > "${dir}/diff.patch" 2>/dev/null || true
  git diff --name-only --cached > "${dir}/staged_files.txt" 2>/dev/null || true
  git tag --list "good/*" --sort=-creatordate | head -n 1 > "${dir}/last_good_tag.txt" 2>/dev/null || true
  printf "%s\n" "tools/**" "data/wiki/**" "README.md" "CONTINUITY.md" ".gitignore" > "${dir}/staged_allowlist.txt"
  GIT_BLOCKED_ARTIFACTS="${dir}"
  echo "GIT_BLOCKED_ARTIFACTS=${dir}"
  append_ci_final "GIT_BLOCKED_ARTIFACTS=${dir}"
}

write_git_bundle() {
  local bundle_id
  local bundle_dir
  local patch_path
  local status_path
  local script_path
  bundle_id="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
  bundle_dir="Artifacts/git_bundle/${bundle_id}"
  patch_path="${bundle_dir}/changes.patch"
  status_path="${bundle_dir}/status.txt"
  script_path="${bundle_dir}/APPLY_AND_PUSH.sh"
  mkdir -p "${bundle_dir}"
  git diff --binary > "${patch_path}" 2>/dev/null || true
  git status --porcelain > "${status_path}" 2>/dev/null || true
  cat > "${script_path}" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "$(pwd)"
git apply --binary "${patch_path}"
git add -- tools data/wiki README.md CONTINUITY.md .gitignore
git commit -m "${COMMIT_SUBJECT:-chore: apply git bundle}"
git tag -a -f good/now -m "green: $(date -u +%FT%TZ)"
git push origin HEAD
git push --force origin good/now
EOF
  chmod +x "${script_path}" 2>/dev/null || true
  echo "GIT_BUNDLE_READY path=${bundle_dir}"
  echo "GIT_BUNDLE_APPLY=./${script_path}"
  echo "GIT_BUNDLE_PATCH=./${patch_path}"
  append_ci_final "GIT_BUNDLE_READY path=${bundle_dir}"
  append_ci_final "GIT_BUNDLE_APPLY=./${script_path}"
  append_ci_final "GIT_BUNDLE_PATCH=./${patch_path}"
}

check_git_dir_writable() {
  if ! git_health; then
    if [ "${GIT_HEALTH_REASON}" = "SAFE_DIR" ]; then
      owner="$(stat -f "%Su" .git 2>/dev/null || echo "")"
      if [ "${owner}" = "$(id -un)" ]; then
        git config --global --add safe.directory "$(pwd)" 2>/dev/null || true
        git_health || true
      fi
    elif [ "${GIT_HEALTH_REASON}" = "LOCK" ]; then
      if command -v lsof >/dev/null 2>&1; then
        if [ -z "$(lsof -nP .git/index.lock 2>/dev/null | tail -n +2)" ]; then
          rm -f .git/index.lock 2>/dev/null || true
        fi
      else
        rm -f .git/index.lock 2>/dev/null || true
      fi
      git_health || true
    fi
  fi
  if [ "${GIT_HEALTH_REASON}" = "PERM" ] || [ "${GIT_HEALTH_REASON}" = "SANDBOX" ] || [ "${GIT_HEALTH_REASON}" = "NO_REPO" ] || [ "${GIT_HEALTH_REASON}" = "LOCK" ] || [ "${GIT_HEALTH_REASON}" = "SAFE_DIR" ]; then
    if [ "${GIT_HEALTH_REASON}" != "OK" ]; then
      echo "GIT_AUTOCOMMIT=0 reason=${GIT_HEALTH_REASON}"
      append_ci_final "GIT_AUTOCOMMIT=0 reason=${GIT_HEALTH_REASON}"
      append_ci_final "TAG_CREATED=0 reason=${GIT_HEALTH_REASON}"
      append_ci_final "TAG_PUSHED=0 reason=${GIT_HEALTH_REASON}"
      write_git_blocked_artifacts
      write_git_bundle
      SKIP_GIT=1
      return 0
    fi
  fi
  return 0
}

append_ci_final() {
  local line="$1"
  if [ -n "${line}" ] && [ -f Reports/ci-final.txt ]; then
    printf "%s\n" "${line}" >> Reports/ci-final.txt
  fi
}

run_git_with_timeout() {
  local cmd="$1"
  if command -v timeout >/dev/null 2>&1; then
    timeout 60s bash -lc "${cmd}"
  else
    bash -lc "${cmd}"
  fi
}

report_git_clean() {
  local status
  status=$(git status --porcelain | head -n 5 || true)
  if [ -z "${status}" ]; then
    echo "GIT_CLEAN=1"
    append_ci_final "GIT_CLEAN=1"
    echo "GIT_TREE_CLEAN=1"
    append_ci_final "GIT_TREE_CLEAN=1"
  else
    echo "GIT_CLEAN=0"
    append_ci_final "GIT_CLEAN=0"
    echo "GIT_TREE_CLEAN=0"
    append_ci_final "GIT_TREE_CLEAN=0"
    echo "${status}"
  fi
}

ensure_git_writable() {
  print_git_diag
  local lock_present=0
  if [ -e .git/index.lock ]; then
    lock_present=1
    lock_age_s=$(node -e 'const fs=require("fs");const stat=fs.statSync(".git/index.lock");const age=(Date.now()-stat.mtimeMs)/1000;console.log(Math.floor(age));')
    if [ "${lock_age_s}" -gt 600 ]; then
      rm -f .git/index.lock
      echo "GIT_LOCK_REMOVED=1 age_s=${lock_age_s}"
      append_ci_final "GIT_LOCK_REMOVED=1 age_s=${lock_age_s}"
    else
      echo "GIT_LOCK_PRESENT=1 age_s=${lock_age_s}"
      append_ci_final "GIT_LOCK_PRESENT=1 age_s=${lock_age_s}"
      echo "Not committing."
      print_fail_diag
      exit 1
    fi
  fi
  if [ "${lock_present}" -eq 1 ]; then
    echo "GIT_LOCK_PRESENT=1"
    append_ci_final "GIT_LOCK_PRESENT=1"
  else
    echo "GIT_LOCK_PRESENT=0"
    append_ci_final "GIT_LOCK_PRESENT=0"
  fi
  if [ ! -w .git ] || { [ -e .git/index ] && [ ! -w .git/index ]; }; then
    chmod -R u+rwX .git 2>/dev/null || true
  fi
  if [ ! -w .git ] || { [ -e .git/index ] && [ ! -w .git/index ]; }; then
    if [ "${ALLOW_GIT_ESCALATION:-0}" = "1" ]; then
      set +e
      sudo chown -R "$(id -un)":"$(id -gn)" .git
      SUDO_CHOWN_STATUS=$?
      sudo chmod -R u+rwX .git
      SUDO_CHMOD_STATUS=$?
      set -e
      if [ "${SUDO_CHOWN_STATUS}" -ne 0 ] || [ "${SUDO_CHMOD_STATUS}" -ne 0 ]; then
        echo "GIT_ESCALATION_FAILED=1"
        append_ci_final "GIT_ESCALATION_FAILED=1"
      else
        echo "GIT_ESCALATION_USED=1"
        append_ci_final "GIT_ESCALATION_USED=1"
      fi
    else
      echo "GIT_ESCALATION_SKIPPED=1"
      append_ci_final "GIT_ESCALATION_SKIPPED=1"
    fi
  fi
  if [ ! -w .git ] || { [ -e .git/index ] && [ ! -w .git/index ]; }; then
    echo "GIT_NOT_WRITABLE=1"
    append_ci_final "GIT_NOT_WRITABLE=1"
    echo "Not committing."
    print_fail_diag
    exit 1
  fi
}

check_git_dir_writable


if ! git check-ignore -q Artifacts/git_blocked/ 2>/dev/null && ! git check-ignore -q Artifacts/git_blocked 2>/dev/null; then
  echo "GIT_BLOCKED_PATH_NOT_IGNORED=1"
  append_ci_final "GIT_BLOCKED_PATH_NOT_IGNORED=1"
  exit 1
fi

if [ "${SKIP_GIT}" = "1" ]; then
  echo "GIT_AUTOCOMMIT=0 reason=GIT_WRITE_FAIL artifacts=${GIT_BLOCKED_ARTIFACTS:-Artifacts/git_blocked}"
  append_ci_final "GIT_AUTOCOMMIT=0 reason=GIT_WRITE_FAIL artifacts=${GIT_BLOCKED_ARTIFACTS:-Artifacts/git_blocked}"
  exit 1
fi

CI_FINAL="Reports/ci-final.txt"
if [ ! -f "${CI_FINAL}" ]; then
  echo "WIKI_GATE_MISSING: Reports/ci-final.txt not found. Not committing."
  print_fail_diag
  exit 1
fi
if ! grep -q "^WIKI_GATE geos=RU,TH,XK,US-CA,CA" "${CI_FINAL}"; then
  echo "Not committing."
  print_fail_diag
  exit 1
fi
if ! grep -q "^WIKI_GATE_OK=1" "${CI_FINAL}"; then
  echo "Not committing."
  print_fail_diag
  exit 1
fi
ok_count=$(grep -c "^🌿 WIKI_CLAIM_OK " "${CI_FINAL}" || true)
if [ "${ok_count}" -ne 5 ]; then
  echo "Not committing."
  print_fail_diag
  exit 1
fi
for geo in RU TH XK US-CA CA; do
  geo_count=$(grep -c "^🌿 WIKI_CLAIM_OK geo=${geo} " "${CI_FINAL}" || true)
  if [ "${geo_count}" -ne 1 ]; then
    echo "Not committing."
    print_fail_diag
    exit 1
  fi
done
if ! grep -q "STEP_END name=ci_local rc=0" "${CI_FINAL}"; then
  echo "Not committing."
  print_fail_diag
  exit 1
fi

ensure_git_writable

if [ "${DRY_RUN}" = "1" ]; then
  echo "DRY_RUN_OK=1"
  exit 0
fi

git add -- tools data/wiki README.md CONTINUITY.md .gitignore

if [ -z "$(git status --porcelain)" ]; then
  echo "NO_CHANGES"
else
  subject="${COMMIT_SUBJECT:-chore(prod): green run}"
  body="${COMMIT_BODY:-}"
  if [ -n "${body}" ]; then
    git commit -am "${subject}" -m "${body}"
  else
    git commit -am "${subject}"
  fi
fi
if [ -n "$(git status --porcelain)" ]; then
  append_ci_final "DIRTY_TREE_AFTER_GREEN=1"
  echo "DIRTY_TREE_AFTER_GREEN=1"
  report_git_clean
  exit 1
fi

timestamp="$(date -u +%Y%m%d-%H%M%S)"
tag="${TAG_NAME:-good/${timestamp}}"
if ! git tag -a -f "${tag}" -m "green: $(date -u +%FT%TZ)"; then
  echo "TAG_FAIL=1 Not committing."
  exit 1
fi
append_ci_final "TAG_CREATED name=${tag}"
echo "TAG_CREATED=1 name=${tag}"
if ! git show-ref --tags | grep -q "refs/tags/${tag}"; then
  echo "TAG_FAIL=1 Not committing."
  append_ci_final "TAG_FAIL=1"
  report_git_clean
  exit 1
fi

if [ "${PROD_TAG_REQUESTED}" = "1" ] || [ "${ENABLE_PROD_TAG:-0}" = "1" ]; then
  prod_tag="${PROD_TAG_NAME:-prod/${timestamp}}"
  if ! git tag -a -f "${prod_tag}" -m "prod: $(date -u +%FT%TZ)"; then
    echo "TAG_FAIL=1 Not committing."
    exit 1
  fi
  append_ci_final "TAG_CREATED name=${prod_tag}"
  echo "TAG_CREATED=1 name=${prod_tag}"
  if ! git show-ref --tags | grep -q "refs/tags/${prod_tag}"; then
    echo "TAG_FAIL=1 Not committing."
    append_ci_final "TAG_FAIL=1"
    report_git_clean
    exit 1
  fi
fi

set +e
REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "-")
append_ci_final "REMOTE_URL=${REMOTE_URL}"
node -e 'require("dns").lookup("github.com",(e,a)=>console.log(e?("DNS_GH=0 code="+e.code):("DNS_GH=1 addr="+a)))'
DNS_GH_OUTPUT=$(node -e 'require("dns").lookup("github.com",(e,a)=>{console.log(e?("DNS_GH=0 code="+e.code):("DNS_GH=1 addr="+a))})')
append_ci_final "${DNS_GH_OUTPUT}"
LS_REMOTE_OUTPUT=$(GIT_TERMINAL_PROMPT=0 GIT_ASKPASS=/usr/bin/true run_git_with_timeout "git ls-remote --heads origin" 2>&1)
REMOTE_STATUS=$?
set -e
if [ "${REMOTE_STATUS}" -ne 0 ]; then
  remote_reason="OTHER"
  if echo "${LS_REMOTE_OUTPUT}" | grep -qi "Could not resolve host"; then
    remote_reason="DNS"
  elif echo "${LS_REMOTE_OUTPUT}" | grep -qi "Authentication failed\|Permission denied"; then
    remote_reason="AUTH"
  elif echo "${LS_REMOTE_OUTPUT}" | grep -qi "Connection timed out\|Failed to connect"; then
    remote_reason="NETWORK_TIMEOUT"
  fi
  append_ci_final "REMOTE_REACHABLE=0 reason=${remote_reason}"
  append_ci_final "REMOTE_STDERR_LAST_BEGIN"
  printf "%s\n" "${LS_REMOTE_OUTPUT}" | tail -n 60 >> Reports/ci-final.txt
  append_ci_final "REMOTE_STDERR_LAST_END"
  if [ "${PUSH_REQUIRED:-0}" = "1" ]; then
  append_ci_final "PUSH_FAIL=1 reason=${remote_reason}"
  echo "PUSH_FAIL=1 reason=${remote_reason}"
  echo "TAG_PUSHED=0 reason=${remote_reason}"
    printf "%s\n" "${LS_REMOTE_OUTPUT}" | tail -n 60
    report_git_clean
    exit 1
  fi
  append_ci_final "PUSH_SKIPPED=1 reason=${remote_reason}"
  echo "PUSH_SKIPPED=1 reason=${remote_reason}"
  echo "TAG_PUSHED=0 reason=${remote_reason}"
  printf "%s\n" "${LS_REMOTE_OUTPUT}" | tail -n 60
  report_git_clean
  exit 0
fi
append_ci_final "REMOTE_REACHABLE=1 reason=OK"

set +e
PUSH_OUTPUT=$(GIT_TERMINAL_PROMPT=0 GIT_ASKPASS=/usr/bin/true run_git_with_timeout "git push --force origin refs/tags/${tag}" 2>&1)
PUSH_STATUS=$?
TAG_PUSH_STATUS=0
TAG_PUSH_OUTPUT=""
if [ -n "${prod_tag:-}" ]; then
  TAG_PUSH_OUTPUT=$(GIT_TERMINAL_PROMPT=0 GIT_ASKPASS=/usr/bin/true run_git_with_timeout "git push --force origin refs/tags/${prod_tag}" 2>&1)
  TAG_PUSH_STATUS=$?
fi
set -e
if [ "${PUSH_STATUS}" -ne 0 ] || [ "${TAG_PUSH_STATUS}" -ne 0 ]; then
  reason="OTHER"
  combined_output="${PUSH_OUTPUT}
${TAG_PUSH_OUTPUT}"
  if echo "${combined_output}" | grep -qi "Could not resolve host"; then
    reason="DNS"
  elif echo "${combined_output}" | grep -qi "Authentication failed\|Permission denied"; then
    reason="AUTH"
  elif echo "${combined_output}" | grep -qi "permission denied to update refs/tags"; then
    reason="PERMISSION"
  elif echo "${combined_output}" | grep -qi "non-fast-forward"; then
    reason="NON_FAST_FORWARD"
  elif echo "${combined_output}" | grep -qi "hook declined\|pre-receive hook declined"; then
    reason="HOOK_REJECT"
  elif echo "${combined_output}" | grep -qi "Connection timed out\|Failed to connect"; then
    reason="NETWORK_TIMEOUT"
  fi
  append_ci_final "PUSH_FAIL_REASON=${reason}"
  append_ci_final "PUSH_FAIL_CMD=git push --force origin refs/tags/${tag}"
  if [ -n "${prod_tag:-}" ]; then
    append_ci_final "PUSH_FAIL_CMD=git push --force origin refs/tags/${prod_tag}"
  fi
  append_ci_final "PUSH_STDERR_LAST_BEGIN"
  printf "%s\n" "${combined_output}" | tail -n 60 >> Reports/ci-final.txt
  append_ci_final "PUSH_STDERR_LAST_END"
  echo "PUSH_FAIL_REASON=${reason}"
  echo "TAG_PUSHED=0 reason=${reason}"
  printf "%s\n" "${combined_output}" | tail -n 60
  report_git_clean
  exit 1
fi

if ! git ls-remote --tags origin | grep -q "refs/tags/${tag}"; then
  echo "TAG_NOT_PUSHED=1 Not committing."
  append_ci_final "TAG_NOT_PUSHED=1"
  report_git_clean
  exit 1
fi
append_ci_final "TAG_PUSHED name=${tag}"
echo "TAG_PUSHED=1 name=${tag}"

if [ -n "${prod_tag:-}" ]; then
  if ! git ls-remote --tags origin | grep -q "refs/tags/${prod_tag}"; then
    echo "TAG_NOT_PUSHED=1 Not committing."
    append_ci_final "TAG_NOT_PUSHED=1"
    report_git_clean
    exit 1
  fi
  append_ci_final "TAG_PUSHED name=${prod_tag}"
  echo "TAG_PUSHED=1 name=${prod_tag}"
fi

report_git_clean
