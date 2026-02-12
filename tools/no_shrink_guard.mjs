import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const BASELINE_PATH = path.join(ROOT, "Reports", "no_shrink_baseline.json");
const CLAIMS_MAP = path.join(ROOT, "data", "wiki", "wiki_claims_map.json");
const CLAIMS_SNAPSHOT = path.join(ROOT, "data", "wiki", "wiki_claims.json");
const OFFICIAL_SSOT = path.join(ROOT, "data", "official", "official_domains.ssot.json");
const OFFICIAL_BADGES = path.join(ROOT, "data", "wiki", "wiki_official_badges.json");

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function coerceItems(payload) {
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.items)) return payload.items;
  if (payload.items && typeof payload.items === "object") return Object.values(payload.items);
  if (!payload.items) return Object.values(payload);
  return [];
}

function hashFile(file) {
  if (!fs.existsSync(file)) return "-";
  const data = fs.readFileSync(file);
  return crypto.createHash("sha256").update(data).digest("hex").slice(0, 12);
}

const claimsPayload = readJson(CLAIMS_MAP) || readJson(CLAIMS_SNAPSHOT);
const claimItems = coerceItems(claimsPayload);
const rowsTotal = claimItems.length;
const notesNonempty = claimItems.filter((entry) => {
  const text = String(entry?.notes_text || entry?.notes_raw || "").trim();
  return text.length > 0;
}).length;
const countriesCount = claimItems.filter((entry) => {
  const key = String(entry?.geo_id || entry?.geo_key || entry?.geo || "");
  return key && !/-/.test(key);
}).length;

const officialPayload = readJson(OFFICIAL_SSOT);
const officialDomainsCount = Array.isArray(officialPayload?.domains)
  ? officialPayload.domains.length
  : 0;

const badgesPayload = readJson(OFFICIAL_BADGES);
const officialLinksCount = Number(badgesPayload?.totals?.official || 0);

const hashes = {
  claims_map: hashFile(CLAIMS_MAP),
  claims_snapshot: hashFile(CLAIMS_SNAPSHOT),
  official_domains: hashFile(OFFICIAL_SSOT),
  official_badges: hashFile(OFFICIAL_BADGES)
};

const current = {
  rows_total: rowsTotal,
  countries_count: countriesCount,
  notes_nonempty_count: notesNonempty,
  official_domains_count: officialDomainsCount,
  official_links_count: officialLinksCount,
  hashes
};

const allowShrink = process.env.NO_SHRINK_ALLOW === "1";
const shrinkReason = String(process.env.NO_SHRINK_REASON || "");
const updateMode = process.env.UPDATE_MODE === "1";

function fail(reason, detail) {
  console.log(`NO_SHRINK_GUARD_OK=0 reason=${reason}${detail ? " " + detail : ""}`);
  process.exit(1);
}

if (updateMode) {
  fs.writeFileSync(
    BASELINE_PATH,
    JSON.stringify({ generated_at: new Date().toISOString(), baseline: current }, null, 2) + "\n"
  );
  console.log("NO_SHRINK_GUARD=REBASLINE");
  console.log("NO_SHRINK_GUARD_OK=1");
  process.exit(0);
}

if (!fs.existsSync(BASELINE_PATH)) {
  fs.writeFileSync(BASELINE_PATH, JSON.stringify({ generated_at: new Date().toISOString(), baseline: current }, null, 2) + "\n");
  console.log("NO_SHRINK_GUARD=BOOTSTRAP");
  console.log("NO_SHRINK_GUARD_OK=1");
  process.exit(0);
}

const baselinePayload = readJson(BASELINE_PATH);
const baseline = baselinePayload?.baseline || null;
if (!baseline) {
  fail("BASELINE_INVALID");
}

const shrink = {
  rows_total: current.rows_total < baseline.rows_total,
  countries_count: current.countries_count < baseline.countries_count,
  notes_nonempty_count: current.notes_nonempty_count < baseline.notes_nonempty_count,
  official_domains_count: current.official_domains_count < baseline.official_domains_count,
  official_links_count: current.official_links_count < baseline.official_links_count
};

const anyShrink = Object.values(shrink).some(Boolean);
if (anyShrink && (!allowShrink || !shrinkReason)) {
  const detail = `baseline_rows=${baseline.rows_total} current_rows=${current.rows_total} baseline_notes=${baseline.notes_nonempty_count} current_notes=${current.notes_nonempty_count} baseline_official_domains=${baseline.official_domains_count} current_official_domains=${current.official_domains_count} baseline_official_links=${baseline.official_links_count} current_official_links=${current.official_links_count}`;
  fail("DATA_SHRINK_GUARD", detail);
}

console.log("NO_SHRINK_GUARD_OK=1");
console.log(`NO_SHRINK_COUNTS rows=${current.rows_total} countries=${current.countries_count} notes_nonempty=${current.notes_nonempty_count} official_domains=${current.official_domains_count} official_links=${current.official_links_count}`);
console.log(`NO_SHRINK_HASH claims_map=${hashes.claims_map} claims_snapshot=${hashes.claims_snapshot} official_domains=${hashes.official_domains} official_badges=${hashes.official_badges}`);
