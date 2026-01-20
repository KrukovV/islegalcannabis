#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const BASE_DIR =
  typeof import.meta.dirname === "string"
    ? import.meta.dirname
    : path.dirname(new URL(import.meta.url).pathname);
let ROOT = process.env.PROJECT_ROOT ?? path.resolve(BASE_DIR, "../../..");
if (!fs.existsSync(path.join(ROOT, "tools", "wiki"))) {
  ROOT = path.resolve(BASE_DIR, "../..");
}
if (!fs.existsSync(path.join(ROOT, "tools", "wiki"))) {
  console.error("FATAL: PROJECT_ROOT not resolved:", ROOT);
  process.exit(2);
}
if (process.cwd() !== ROOT) {
  console.warn(`WARN: cwd=${process.cwd()} root=${ROOT} (auto-chdir)`);
  process.chdir(ROOT);
}

const args = process.argv.slice(2);
const geos = [];
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--geo" && args[i + 1]) {
    geos.push(args[i + 1]);
    i += 1;
  }
}

const ssotPath = path.join(ROOT, "data", "wiki", "wiki_claims_map.json");
if (!fs.existsSync(ssotPath)) {
  console.error(`WIKI_SSOT_MISSING path=${ssotPath}`);
  process.exit(3);
}

const payload = JSON.parse(fs.readFileSync(ssotPath, "utf8"));
const entries = payload?.entries || payload?.items || {};
const list = geos.length ? geos : Object.keys(entries).slice(0, 5);
for (const geo of list) {
  const entry = entries[geo] || {};
  if (!entry || Object.keys(entry).length === 0) {
    console.log(`WIKI_CLAIM geo=${geo} reason=NO_ROW`);
    continue;
  }
  const rec = entry.recreational_status || entry.rec_status || entry.wiki_rec || "";
  const med = entry.medical_status || entry.med_status || entry.wiki_med || "";
  const rowRef = entry.row_ref || "-";
  const source =
    String(rowRef).startsWith("state:") ? "states" : String(rowRef).startsWith("country:") ? "countries" : "unknown";
  const revision = entry.wiki_revision_id || entry.revision_id || "-";
  const notes = entry.notes_text || entry.notes || "";
  const mainArticles = Array.isArray(entry.main_articles) ? entry.main_articles : [];
  const sources = mainArticles.map((article) => article?.url || article?.title).filter(Boolean);
  if (!rec || !med || rec === "Unknown" || med === "Unknown") {
    console.log(`WIKI_CLAIM geo=${geo} reason=PARSE_FAIL`);
    continue;
  }
  console.log(
    `WIKI_CLAIM geo=${geo} rec=${rec} med=${med} source=${source} revision=${revision} row_ref=${rowRef} notes_len=${String(notes).length} sources=${sources.length}`
  );
}
