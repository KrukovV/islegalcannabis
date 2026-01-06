#!/usr/bin/env bash
set -euo pipefail

echo "Git health check"
ls -la .git/index .git/index.lock 2>/dev/null || true
ls -laOe .git .git/index 2>/dev/null || true

if [ -f ".git/index.lock" ]; then
  rm -f .git/index.lock
  echo "ERROR: .git/index.lock existed and was removed. Retry git after verifying no other git process."
  exit 1
fi

if ls -laOe .git .git/index 2>/dev/null | grep -E "uchg|schg|restricted" >/dev/null; then
  echo "ERROR: Immutable flags detected on .git. Remove flags and check Full Disk Access for Terminal."
  exit 1
fi

if ls -la .git .git/index 2>/dev/null | awk '{print $1}' | grep -q "+"; then
  echo "ERROR: ACLs detected on .git. Check Full Disk Access for Terminal and remove ACLs if needed."
  exit 1
fi

git fsck --no-progress --no-dangling || true
