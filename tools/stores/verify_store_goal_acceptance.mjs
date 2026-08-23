#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PATH_TO_REPORT = path.join(ROOT, "data", "reviews", "wiki-truth-307-goal-acceptance.json");

function assert(condition, message) {
  if (!condition) throw new Error(`GOAL_ACCEPTANCE_INVALID:${message}`);
}

const report = JSON.parse(fs.readFileSync(PATH_TO_REPORT, "utf8"));
const requirements = Array.isArray(report.requirements) ? report.requirements : [];
const blockers = Array.isArray(report.completion_blockers) ? report.completion_blockers : [];
assert(report.local_only === true && report.non_mutating === true, "LOCAL_ONLY_OR_NON_MUTATING");
assert(report.legal?.TOTAL_GEO === 307 && report.legal?.PROCESSED_GEO === 307 && report.legal?.CANONICAL_TRUTH_ROWS === 307, "LEGAL_UNIVERSE_NOT_307");
assert(report.store?.STORE_GEO_CHECKED === 307, "STORE_UNIVERSE_NOT_307");
assert(report.map?.LOW_ZOOM_MARKER_COUNT === 0, "LOW_ZOOM_MARKERS_PRESENT");
assert(report.production?.PRODUCTION_TOUCHED === false && report.production?.PRODUCTION_DEPLOYED === false, "PRODUCTION_BOUNDARY_BROKEN");
assert(requirements.length >= 13, "REQUIREMENTS_INCOMPLETE");
assert(blockers.length === requirements.filter((item) => item.status !== "PROVEN").length, "BLOCKER_REQUIREMENT_DRIFT");
assert(report.GOAL_ACHIEVED === (blockers.length === 0), "GOAL_FLAG_DRIFT");
if (report.GOAL_ACHIEVED === true) {
  assert(report.legal?.TRUTH_RECONCILED === 307, "GOAL_WITHOUT_LEGAL_RECONCILIATION");
  assert(report.store?.STORE_SOURCES_VALIDATED >= 0, "GOAL_STORE_SOURCE_COUNT_INVALID");
  assert(report.map?.VISUAL_MAP_AUDIT_PASS === true, "GOAL_WITHOUT_VISUAL_MAP_AUDIT");
}
console.log(`GOAL_ACCEPTANCE_OK legal=${report.legal.TRUTH_RECONCILED}/307 store=${report.store.STORE_GEO_CHECKED}/307 blockers=${blockers.length} achieved=${report.GOAL_ACHIEVED}`);
