#!/usr/bin/env node
import fs from "node:fs";
import { SSOT_OFFICIAL_PATH } from "./ssot_paths.mjs";

if (!fs.existsSync(SSOT_OFFICIAL_PATH)) {
  console.log(`SSOT_OFFICIAL_OK=0 reason=missing path=${SSOT_OFFICIAL_PATH}`);
  process.exit(1);
}
let payload;
try {
  payload = JSON.parse(fs.readFileSync(SSOT_OFFICIAL_PATH, "utf8"));
} catch {
  console.log("SSOT_OFFICIAL_OK=0 reason=invalid_json");
  process.exit(1);
}
const domains = Array.isArray(payload?.domains) ? payload.domains : null;
if (!domains) {
  console.log("SSOT_OFFICIAL_OK=0 reason=missing_domains");
  process.exit(1);
}
const count = domains.length;
console.log(`SSOT_OFFICIAL_OK=1 count=${count}`);
