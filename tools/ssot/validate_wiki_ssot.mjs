#!/usr/bin/env node
import fs from "node:fs";
import { SSOT_WIKI_PATH } from "./ssot_paths.mjs";

if (!fs.existsSync(SSOT_WIKI_PATH)) {
  console.log(`SSOT_WIKI_OK=0 reason=missing path=${SSOT_WIKI_PATH}`);
  process.exit(1);
}
let payload;
try {
  payload = JSON.parse(fs.readFileSync(SSOT_WIKI_PATH, "utf8"));
} catch {
  console.log("SSOT_WIKI_OK=0 reason=invalid_json");
  process.exit(1);
}
const items = payload?.items && typeof payload.items === "object" ? payload.items : null;
if (!items) {
  console.log("SSOT_WIKI_OK=0 reason=missing_items");
  process.exit(1);
}
const count = Object.keys(items).length;
console.log(`SSOT_WIKI_OK=1 count=${count}`);
