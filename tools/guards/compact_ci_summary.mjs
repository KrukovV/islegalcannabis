#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function readArg(name, fallback = "") {
  const idx = process.argv.indexOf(name);
  if (idx !== -1) return process.argv[idx + 1] ?? fallback;
  const prefixed = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (prefixed) return prefixed.slice(name.length + 1);
  return fallback;
}

const orderedRules = [
  ["headline", (line) => /\bCI (?:PASS|PASS_DEGRADED|FAIL)\b/u.test(line), "first"],
  ["Smoke", (line) => line.startsWith("Smoke "), "last"],
  ["SMOKE_STATUS", (line) => line.startsWith("SMOKE_STATUS="), "last"],
  ["SMOKE_TOTAL", (line) => line.startsWith("SMOKE_TOTAL="), "last"],
  ["SMOKE_PASSED", (line) => line.startsWith("SMOKE_PASSED="), "last"],
  ["SMOKE_FAILED", (line) => line.startsWith("SMOKE_FAILED="), "last"],
  ["CI_STATUS", (line) => line.startsWith("CI_STATUS="), "last"],
  ["CI_QUALITY", (line) => line.startsWith("CI_QUALITY="), "last"],
  ["CI_RESULT", (line) => line.startsWith("CI_RESULT "), "last"],
  ["STOP_REASON", (line) => line.startsWith("STOP_REASON="), "last"],
  ["PIPELINE_RC", (line) => line.startsWith("PIPELINE_RC="), "last"],
  ["FAIL_REASON", (line) => line.startsWith("FAIL_REASON="), "last"],
  ["GEO_LOC", (line) => line.startsWith("GEO_LOC "), "last"],
  ["GEO_SOURCE_COUNTS", (line) => line.startsWith("GEO_SOURCE_COUNTS"), "last"],
  ["GEO_SOURCE", (line) => line.startsWith("GEO_SOURCE="), "last"],
  ["GEO_REASON_CODE", (line) => line.startsWith("GEO_REASON_CODE="), "last"],
  ["GEO_GATE_OK", (line) => line.startsWith("GEO_GATE_OK="), "last"],
  ["EGRESS_TRUTH", (line) => line.startsWith("EGRESS_TRUTH "), "last"],
  ["ONLINE_POLICY", (line) => line.startsWith("ONLINE_POLICY"), "last"],
  ["ONLINE_REASON", (line) => line.startsWith("ONLINE_REASON"), "last"],
  ["DNS_DIAGNOSTIC_ONLY", (line) => line.startsWith("DNS_DIAGNOSTIC_ONLY="), "last"],
  ["ONLINE_BY_TRUTH_PROBES", (line) => line.startsWith("ONLINE_BY_TRUTH_PROBES="), "last"],
  ["WIKI_GATE_OK", (line) => line.startsWith("WIKI_GATE_OK="), "last"],
  ["WIKI_SYNC_ALL", (line) => line.startsWith("WIKI_SYNC_ALL "), "last"],
  ["LAST_REFRESH_TS", (line) => line.startsWith("LAST_REFRESH_TS="), "last"],
  ["LAST_SUCCESS_TS", (line) => line.startsWith("LAST_SUCCESS_TS="), "last"],
  ["REFRESH_SOURCE", (line) => line.startsWith("REFRESH_SOURCE="), "last"],
  ["REFRESH_AGE_H", (line) => line.startsWith("REFRESH_AGE_H="), "last"],
  ["REFRESH_GUARD", (line) => line.startsWith("REFRESH_GUARD="), "last"],
  ["UPDATE_DID_RUN", (line) => line.startsWith("UPDATE_DID_RUN="), "last"],
  ["SUMMARY_CORE", (line) => line.startsWith("SUMMARY_CORE "), "last"],
  ["OFFICIAL_DOMAINS_TOTAL", (line) => line.startsWith("OFFICIAL_DOMAINS_TOTAL "), "last"],
  ["OFFICIAL_ALLOWLIST_SIZE", (line) => line.startsWith("OFFICIAL_ALLOWLIST_SIZE"), "last"],
  ["OFFICIAL_SSOT_SHA12", (line) => line.startsWith("OFFICIAL_SSOT_SHA12="), "last"],
  ["OFFICIAL_BASELINE_COUNT", (line) => line.startsWith("OFFICIAL_BASELINE_COUNT="), "last"],
  ["OFFICIAL_DOMAINS_GUARD", (line) => line.startsWith("OFFICIAL_DOMAINS_GUARD="), "last"],
  ["OFFICIAL_DOMAINS_ALLOW_SHRINK", (line) => line.startsWith("OFFICIAL_DOMAINS_ALLOW_SHRINK="), "last"],
  ["OFFICIAL_SHRINK_OK", (line) => line.startsWith("OFFICIAL_SHRINK_OK="), "last"],
  ["OFFICIAL_DIFF_SUMMARY", (line) => line.startsWith("OFFICIAL_DIFF_SUMMARY "), "last"],
  ["OFFICIAL_COVERAGE", (line) => line.startsWith("OFFICIAL_COVERAGE "), "last"],
  ["NOTES_BASELINE_COVERED", (line) => line.startsWith("NOTES_BASELINE_COVERED="), "last"],
  ["NOTES_CURRENT_COVERED", (line) => line.startsWith("NOTES_CURRENT_COVERED="), "last"],
  ["NOTES_GUARD", (line) => line.startsWith("NOTES_GUARD="), "last"],
  ["NOTES_TOTAL", (line) => line.startsWith("NOTES_TOTAL "), "last"],
  ["NOTES5_STRICT_RESULT", (line) => line.startsWith("NOTES5_STRICT_RESULT "), "last"],
  ["NOTESALL_STRICT_RESULT", (line) => line.startsWith("NOTESALL_STRICT_RESULT "), "last"],
  ["NOTES_COVERAGE", (line) => line.startsWith("NOTES_COVERAGE"), "last"],
  ["NOTES_OK", (line) => line.startsWith("NOTES_OK="), "last"],
  ["NOTES_PLACEHOLDER", (line) => line.startsWith("NOTES_PLACEHOLDER="), "last"],
  ["NOTES_WEAK_COUNT", (line) => line.startsWith("NOTES_WEAK_COUNT="), "last"],
  ["NOTES_QUALITY_GUARD", (line) => line.startsWith("NOTES_QUALITY_GUARD="), "last"],
  ["RUN_LINT", (line) => line.startsWith("RUN_LINT="), "last"],
  ["LINT_OK", (line) => line.startsWith("LINT_OK="), "last"],
  ["SSOT_PROOF_SMOKE_PRESENT", (line) => line.startsWith("SSOT_PROOF_SMOKE_PRESENT="), "last"],
  ["SSOT_PROOF_FILTER_MATCH", (line) => line.startsWith("SSOT_PROOF_FILTER_MATCH="), "last"],
  ["SSOT_PROOF_REASON", (line) => line.startsWith("SSOT_PROOF_REASON="), "last"],
  ["INFOGRAPH_STATUS", (line) => line.startsWith("INFOGRAPH_STATUS="), "last"],
  ["INFOGRAPH_STAGE_LAST", (line) => line.startsWith("INFOGRAPH_STAGE_LAST="), "last"],
  ["INFOGRAPH_STAGE_DONE", (line) => line.startsWith("INFOGRAPH_STAGE_DONE="), "last"],
  ["INFOGRAPH_STAGE_TOTAL", (line) => line.startsWith("INFOGRAPH_STAGE_TOTAL="), "last"],
  ["POST_CHECKS_OK", (line) => line.startsWith("POST_CHECKS_OK="), "last"],
  ["HUB_STAGE_REPORT_OK", (line) => line.startsWith("HUB_STAGE_REPORT_OK="), "last"],
  ["INFOGRAPH_BADGES", (line) => line.startsWith("INFOGRAPH_BADGES="), "last"],
  ["FINAL_SSOT_BLOCK", (line) => line.startsWith("FINAL_SSOT_BLOCK="), "last"],
  ["STAGE_LAST", (line) => line.startsWith("STAGE_LAST="), "last"],
  ["STAGE_DONE", (line) => line.startsWith("STAGE_DONE="), "last"],
  ["STAGE_TOTAL", (line) => line.startsWith("STAGE_TOTAL="), "last"],
  ["STAGE_ORDER_GUARD", (line) => line.startsWith("STAGE_ORDER_GUARD="), "last"],
  ["STAGE_ORDER", (line) => line.startsWith("STAGE_ORDER="), "last"],
  ["STAGE_OK_1", (line) => line.startsWith("STAGE_OK_1="), "last"],
  ["STAGE_OK_2", (line) => line.startsWith("STAGE_OK_2="), "last"],
  ["STAGE_OK_3", (line) => line.startsWith("STAGE_OK_3="), "last"],
  ["STAGE_OK_4", (line) => line.startsWith("STAGE_OK_4="), "last"],
];

function normalizeLines(text) {
  return text
    .replace(/\n+$/u, "")
    .split(/\r?\n/u)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
}

function pickRule(lines, matcher, mode) {
  if (mode === "first") {
    return lines.find(matcher) || null;
  }
  for (let idx = lines.length - 1; idx >= 0; idx -= 1) {
    if (matcher(lines[idx])) return lines[idx];
  }
  return null;
}

function compactStageLines(lines) {
  const byName = new Map();
  for (const line of lines) {
    const match = line.match(/^[^\w]*\s*(STAGE_[A-Z0-9_]+ \[[^\n]+)$/u);
    if (match) byName.set(match[1].split(/\s+/u)[0], line);
  }
  return [...byName.values()].slice(-8);
}

export function compactCiSummary(text, options = {}) {
  const maxLines = Number(options.maxLines || 60);
  const lines = normalizeLines(text);
  const picked = [];
  const seen = new Set();

  for (const [key, matcher, mode] of orderedRules) {
    const line = pickRule(lines, matcher, mode);
    if (line && !seen.has(line)) {
      picked.push(line);
      seen.add(line);
    }
  }

  for (const line of compactStageLines(lines)) {
    if (!seen.has(line)) {
      picked.push(line);
      seen.add(line);
    }
  }

  const required = [
    /^EGRESS_TRUTH /u,
    /^WIKI_GATE_OK=/u,
    /^WIKI_SYNC_ALL /u,
    /^NOTES_TOTAL /u,
    /^NOTES5_STRICT_RESULT /u,
    /^NOTESALL_STRICT_RESULT /u,
    /^OFFICIAL_DOMAINS_TOTAL /u,
    /^OFFICIAL_COVERAGE /u,
  ];
  const missingRequired = required.some((pattern) => !picked.some((line) => pattern.test(line)));
  if (missingRequired) {
    return `${lines.join("\n")}\n`;
  }

  const compacted = picked.slice(0, maxLines);
  return `${compacted.join("\n")}\n`;
}

function main() {
  const file = readArg("--file", "");
  const maxLines = Number(readArg("--max-lines", "60"));
  if (file) {
    const next = compactCiSummary(fs.readFileSync(file, "utf8"), { maxLines });
    fs.writeFileSync(file, next);
    return;
  }
  if (process.stdin.isTTY) {
    return;
  }
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    input += chunk;
  });
  process.stdin.on("end", () => {
    process.stdout.write(compactCiSummary(input, { maxLines }));
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
