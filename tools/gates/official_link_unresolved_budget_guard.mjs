#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const dataPath = path.join(ROOT, "data", "ssot", "official_link_ownership.json");
const baselinePath = path.join(ROOT, "data", "baselines", "official_link_ownership_unknown.baseline.txt");

if (!fs.existsSync(dataPath) || !fs.existsSync(baselinePath)) {
  console.log("OFFICIAL_LINK_UNRESOLVED_BUDGET_GUARD=FAIL");
  console.log("OFFICIAL_LINK_UNRESOLVED_BUDGET_REASON=MISSING_INPUT");
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const baseline = Number(fs.readFileSync(baselinePath, "utf8").trim() || "0");
const current = Number(payload?.diagnostics?.unresolved_unknown_links || 0) || 0;

console.log(`OFFICIAL_LINK_UNRESOLVED_BASELINE=${baseline}`);
console.log(`OFFICIAL_LINK_UNRESOLVED_CURRENT=${current}`);

if (current > baseline) {
  console.log("OFFICIAL_LINK_UNRESOLVED_BUDGET_GUARD=FAIL");
  process.exit(1);
}

console.log("OFFICIAL_LINK_UNRESOLVED_BUDGET_GUARD=PASS");
