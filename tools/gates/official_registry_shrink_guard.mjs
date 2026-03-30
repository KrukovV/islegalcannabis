#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const INPUT_PATH = path.join(ROOT, "data", "official", "official_domains.ssot.json");
const REGISTRY_FLOOR = 418;

function fail(reason, extra = "") {
  console.log(`OFFICIAL_REGISTRY_SHRINK_GUARD=FAIL reason=${reason}`);
  if (extra) console.log(extra);
  process.exit(1);
}

const payload = fs.existsSync(INPUT_PATH) ? JSON.parse(fs.readFileSync(INPUT_PATH, "utf8")) : null;
const domains = Array.isArray(payload?.domains) ? payload.domains : [];

console.log(`OFFICIAL_REGISTRY_TOTAL=${domains.length}`);
console.log(`OFFICIAL_REGISTRY_FLOOR=${REGISTRY_FLOOR}`);

if (domains.length < REGISTRY_FLOOR) {
  fail("REGISTRY_BELOW_FLOOR", `OFFICIAL_REGISTRY_ERROR=expected_min=${REGISTRY_FLOOR} got=${domains.length}`);
}

console.log("OFFICIAL_REGISTRY_SHRINK_GUARD=PASS");
