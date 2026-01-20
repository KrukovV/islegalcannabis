#!/usr/bin/env bash
set -euo pipefail

node tools/wiki/sync_legality.mjs --once
node tools/wiki/mark_official_refs.mjs --once
