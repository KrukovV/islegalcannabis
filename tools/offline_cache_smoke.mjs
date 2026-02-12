import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const mapPath = path.join(root, "data", "wiki", "wiki_claims_map.json");
const snapshotPath = path.join(root, "data", "wiki", "wiki_claims.json");
const badgesPath = path.join(root, "data", "wiki", "wiki_official_badges.json");
const officialPath = path.join(root, "data", "official", "official_domains.ssot.json");
const baselinePath = path.join(root, "Reports", "no_shrink_baseline.json");

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

const mapPayload = readJson(mapPath);
const snapPayload = readJson(snapshotPath);
const items = coerceItems(mapPayload) || coerceItems(snapPayload);
const badgesPayload = readJson(badgesPath);
const officialPayload = readJson(officialPath);
const baselinePayload = readJson(baselinePath);

if (!items || items.length === 0) {
  console.log("OFFLINE_CACHE_SMOKE_OK=0 reason=NO_CACHE");
  process.exit(1);
}

const total = items.length;
const nonEmptyNotes = items.filter((entry) => {
  const text = String(entry?.notes_text || entry?.notes_raw || "").trim();
  return text.length > 0;
}).length;
const officialDomainsCount = Array.isArray(officialPayload?.domains) ? officialPayload.domains.length : 0;
const officialLinksCount = Number(badgesPayload?.totals?.official || 0);
const officialItemsTotal = officialDomainsCount;

if (!baselinePayload?.baseline) {
  console.log("OFFLINE_CACHE_SMOKE_OK=0 reason=NO_BASELINE");
  process.exit(1);
}
const baseline = baselinePayload.baseline;
if (total < baseline.rows_total) {
  console.log(`OFFLINE_CACHE_SMOKE_OK=0 reason=ROWS_SHRINK baseline=${baseline.rows_total} current=${total}`);
  process.exit(1);
}
if (nonEmptyNotes < baseline.notes_nonempty_count) {
  console.log(`OFFLINE_CACHE_SMOKE_OK=0 reason=NOTES_SHRINK baseline=${baseline.notes_nonempty_count} current=${nonEmptyNotes}`);
  process.exit(1);
}
if (officialDomainsCount < baseline.official_domains_count) {
  console.log(`OFFLINE_CACHE_SMOKE_OK=0 reason=OFFICIAL_DOMAINS_SHRINK baseline=${baseline.official_domains_count} current=${officialDomainsCount}`);
  process.exit(1);
}
if (officialLinksCount < baseline.official_links_count) {
  console.log(`OFFLINE_CACHE_SMOKE_OK=0 reason=OFFICIAL_LINKS_SHRINK baseline=${baseline.official_links_count} current=${officialLinksCount}`);
  process.exit(1);
}
if (officialLinksCount > officialItemsTotal) {
  console.log(`OFFLINE_CACHE_SMOKE_OK=0 reason=OFFICIAL_RESOLVE_OVERFLOW total=${officialItemsTotal} resolved=${officialLinksCount}`);
  process.exit(1);
}
if (nonEmptyNotes < 16) {
  console.log(`OFFLINE_CACHE_SMOKE_OK=0 reason=NOTES_SAMPLE_LT_16 nonempty=${nonEmptyNotes}`);
  process.exit(1);
}

console.log(`OFFLINE_CACHE_SMOKE_OK=1 total=${total} notes_nonempty=${nonEmptyNotes} official_domains=${officialDomainsCount} official_links=${officialLinksCount}`);
console.log(`OFFICIAL_ITEMS_TOTAL=${officialItemsTotal}`);
console.log(`OFFICIAL_LINKS_RESOLVED_IN_VIEW=${officialLinksCount}`);
