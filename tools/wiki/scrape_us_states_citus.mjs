#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const CLAIMS_PATH = path.join(ROOT, "data", "wiki", "wiki_claims_map.json");
const OUTPUT_PATH = path.join(ROOT, "data", "ssot", "us_states.json");
const SOURCE_URL = "https://en.wikipedia.org/wiki/Cannabis_in_the_United_States";

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function mapStatus(value) {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return "UNKNOWN";
  if (v === "legal" || v === "allowed") return "LEGAL";
  if (v === "decriminalized" || v === "decrim") return "DECRIM";
  if (v === "limited" || v === "restricted") return "LIMITED";
  if (v === "illegal" || v === "banned" || v === "prohibited") return "ILLEGAL";
  if (v === "unenforced") return "LIMITED";
  return "UNKNOWN";
}

function buildStates(claimsItems) {
  const states = Object.entries(claimsItems || {})
    .filter(([geo]) => /^US-[A-Z]{2}$/.test(String(geo || "").toUpperCase()))
    .map(([geo, entry]) => {
      const rec = mapStatus(entry?.wiki_rec ?? entry?.recreational_status ?? entry?.rec_status);
      const med = mapStatus(entry?.wiki_med ?? entry?.medical_status ?? entry?.med_status);
      return {
        geo: String(geo).toUpperCase(),
        state: String(geo).toUpperCase().slice(3),
        name: String(entry?.name || entry?.geo_name || geo),
        rec_status: rec,
        med_status: med,
        reason_code: "WIKI_US_JURISDICTION",
        source_hint: "WIKI_US_JURISDICTION",
        source_url: SOURCE_URL,
        wiki_page_url: String(entry?.wiki_row_url || ""),
        primary_source: "WIKI_US_JURISDICTION",
        source_page: "Cannabis_in_the_United_States",
        source_table: "states",
        source_revision: null
      };
    })
    .sort((a, b) => a.geo.localeCompare(b.geo));
  return states;
}

function main() {
  const claims = readJson(CLAIMS_PATH);
  if (!claims?.items || typeof claims.items !== "object") {
    console.log("US_STATES_SYNC_OK=0");
    console.log("US_STATES_SYNC_REASON=MISSING_WIKI_CLAIMS");
    process.exit(2);
  }

  const states = buildStates(claims.items);
  const payload = {
    source_url: SOURCE_URL,
    source_page: "Cannabis_in_the_United_States",
    fetched_ts: new Date().toISOString(),
    fetched_at: new Date().toISOString(),
    sha: crypto
      .createHash("sha256")
      .update(
        JSON.stringify({
          sourceUrl: SOURCE_URL,
          digestPayload: states.map((row) => ({
            geo: row.geo,
            rec_status: row.rec_status,
            med_status: row.med_status,
            source_url: row.source_url
          }))
        })
      )
      .digest("hex"),
    total: states.length,
    items: states
  };

  const readOnly = process.env.READONLY_CI === "1";
  const canWrite = process.env.UPDATE_MODE === "1" && process.env.SSOT_WRITE === "1" && !readOnly;

  if (!canWrite) {
    console.log("US_STATES_SYNC_MODE=CHECK");
    console.log(`US_STATES_TOTAL=${states.length}`);
    console.log("US_STATES_SYNC_OK=1");
    return;
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log("US_STATES_SYNC_MODE=WRITE");
  console.log(`US_STATES_TOTAL=${states.length}`);
  console.log(`US_STATES_OUTPUT=${OUTPUT_PATH}`);
  console.log("US_STATES_SYNC_OK=1");
}

main();
