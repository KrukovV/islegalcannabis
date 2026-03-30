#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const INPUT_PATH = path.join(ROOT, "data", "ssot", "wiki_pages_universe.json");
const BAD_PATTERN =
  /\/wiki\/(?:BQ|CC|GF|RE|YT|land|Cura_ao|St_Barth_lemy|U_S_Virgin_Is)(?:$|[?#])/i;

function fail(reason, extra = "") {
  console.log(`PSEUDO_URL_GUARD=FAIL reason=${reason}`);
  if (extra) console.log(extra);
  process.exit(1);
}

const payload = fs.existsSync(INPUT_PATH) ? JSON.parse(fs.readFileSync(INPUT_PATH, "utf8")) : null;
const items = Array.isArray(payload?.items) ? payload.items : [];
const bad = items
  .map((row) => ({
    iso2: String(row?.iso2 || "").toUpperCase(),
    url: String(row?.expected_wiki_page_url || row?.expected_wiki_url || "")
  }))
  .filter((row) => BAD_PATTERN.test(row.url));

console.log(`PSEUDO_URL_COUNT=${bad.length}`);

if (bad.length > 0) {
  fail("PSEUDO_URLS_PRESENT", `PSEUDO_URL_SAMPLE=${bad.slice(0, 10).map((row) => `${row.iso2}:${row.url}`).join(",")}`);
}

console.log("PSEUDO_URL_GUARD=PASS");
