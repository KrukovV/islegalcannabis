#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SNAPSHOT_DIR = path.join(ROOT, "data", "ssot_snapshots");
const LATEST_PATH = path.join(SNAPSHOT_DIR, "latest.json");
const STABLE_PATH = path.join(SNAPSHOT_DIR, "latest_stable.json");
const REGISTRY_PATH = path.join(ROOT, "data", "ssot_diffs.json");
const PENDING_PATH = path.join(ROOT, "cache", "ssot_diff_pending.json");
const CACHE_PATH = path.join(ROOT, "cache", "ssot_diff_cache.json");
const LOG_PATH = path.join(ROOT, "logs", "ssot_diff.log");
const KEEP_LAST = 50;

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function hashNotes(value) {
  return crypto.createHash("sha256").update(String(value || "").trim()).digest("hex").slice(0, 12);
}

function normalizeStatus(...values) {
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (normalized) return normalized;
  }
  return "Unknown";
}

function readGeoUniverse() {
  const raw = fs.readFileSync(path.join(ROOT, "apps", "web", "src", "lib", "geo", "allGeo.ts"), "utf8");
  return Array.from(raw.matchAll(/"([A-Z0-9-]+)"/g), (match) => match[1]);
}

function buildSnapshot(nowIso) {
  const claimsPayload = readJson(path.join(ROOT, "data", "wiki", "wiki_claims_map.json"), {});
  const enrichedPayload = readJson(path.join(ROOT, "data", "wiki", "wiki_claims_enriched.json"), {});
  const badgesPayload = readJson(path.join(ROOT, "data", "wiki", "wiki_official_badges.json"), {});
  const claimByGeo = new Map();
  for (const claim of Object.values(claimsPayload.items || {})) {
    const geo = String(claim?.geo_key || claim?.geo_id || claim?.iso2 || "").toUpperCase();
    if (geo) claimByGeo.set(geo, claim);
  }
  const rows = readGeoUniverse().map((geo) => {
    const claim = claimByGeo.get(geo);
    const official = new Set();
    for (const item of Array.isArray(enrichedPayload.items?.[geo]) ? enrichedPayload.items[geo] : []) {
      if (item?.official && item?.url) official.add(String(item.url).trim());
    }
    for (const item of Array.isArray(badgesPayload.items?.[geo]) ? badgesPayload.items[geo] : []) {
      if (item?.url) official.add(String(item.url).trim());
    }
    return {
      geo,
      rec_status: normalizeStatus(claim?.recreational_status, claim?.wiki_rec, claim?.rec_status),
      med_status: normalizeStatus(claim?.medical_status, claim?.wiki_med, claim?.med_status),
      notes_hash: hashNotes(claim?.notes_text || ""),
      official_sources: Array.from(official).filter(Boolean).sort(),
      wiki_page_url: String(claim?.wiki_row_url || "").trim() || null
    };
  });
  return { generated_at: nowIso, row_count: rows.length, rows };
}

function diffSnapshots(oldSnapshot, newSnapshot) {
  const oldByGeo = new Map((oldSnapshot.rows || []).map((row) => [row.geo, row]));
  const changes = [];
  const pushChange = (geo, type, oldValue, newValue) => {
    changes.push({
      geo,
      type,
      old_value: oldValue,
      new_value: newValue,
      ts: newSnapshot.generated_at,
      change_key: `${geo}|${type}|${oldValue || "-"}|${newValue || "-"}`
    });
  };
  for (const row of newSnapshot.rows || []) {
    const prev = oldByGeo.get(row.geo);
    if (!prev) continue;
    if (prev.rec_status !== row.rec_status) pushChange(row.geo, "STATUS_CHANGE", prev.rec_status, row.rec_status);
    if (prev.med_status !== row.med_status) pushChange(row.geo, "MED_STATUS_CHANGE", prev.med_status, row.med_status);
    if (prev.notes_hash !== row.notes_hash) pushChange(row.geo, "NOTES_UPDATE", prev.notes_hash, row.notes_hash);
    if ((prev.wiki_page_url || null) !== (row.wiki_page_url || null)) {
      pushChange(row.geo, "WIKI_PAGE_CHANGED", prev.wiki_page_url || null, row.wiki_page_url || null);
    }
    const prevSources = new Set(prev.official_sources || []);
    const nextSources = new Set(row.official_sources || []);
    for (const url of row.official_sources || []) if (!prevSources.has(url)) pushChange(row.geo, "OFFICIAL_SOURCE_ADDED", null, url);
    for (const url of prev.official_sources || []) if (!nextSources.has(url)) pushChange(row.geo, "OFFICIAL_SOURCE_REMOVED", url, null);
  }
  return changes.sort((a, b) => a.change_key.localeCompare(b.change_key));
}

function readRegistry() {
  return readJson(REGISTRY_PATH, { generated_at: new Date(0).toISOString(), changes: [] });
}

function writeCache(nowIso, registry, pending) {
  const now = Date.parse(nowIso);
  const within = (hours) =>
    (registry.changes || []).filter((entry) => Date.parse(entry.ts) >= now - hours * 60 * 60 * 1000);
  writeJson(CACHE_PATH, {
    generated_at: nowIso,
    last_24h: within(24),
    last_7d: within(24 * 7),
    pending
  });
}

function pruneSnapshots() {
  const files = fs.existsSync(SNAPSHOT_DIR)
    ? fs.readdirSync(SNAPSHOT_DIR).filter((name) => /^snapshot_\d{4}_\d{2}_\d{2}_\d{2}\.json$/.test(name)).sort()
    : [];
  const removable = files.slice(0, Math.max(0, files.length - KEEP_LAST));
  for (const name of removable) fs.unlinkSync(path.join(SNAPSHOT_DIR, name));
  return files.length - removable.length;
}

function timestampName(nowIso) {
  const stamp = nowIso.replace(/[-:TZ]/g, "").slice(0, 10);
  return `snapshot_${stamp.slice(0, 4)}_${stamp.slice(4, 6)}_${stamp.slice(6, 8)}_${stamp.slice(8, 10)}.json`;
}

const nowIso = new Date().toISOString();
const currentSnapshot = buildSnapshot(nowIso);
fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
writeJson(path.join(SNAPSHOT_DIR, timestampName(nowIso)), currentSnapshot);
writeJson(LATEST_PATH, currentSnapshot);
const stable = readJson(STABLE_PATH, null);
let registry = readRegistry();
let pending = readJson(PENDING_PATH, []);
let status = "baseline";
let confirmedCount = 0;

if (!stable) {
  writeJson(STABLE_PATH, currentSnapshot);
  pending = [];
  writeJson(PENDING_PATH, pending);
  writeCache(nowIso, registry, pending);
} else {
  const rawChanges = diffSnapshots(stable, currentSnapshot);
  if (!rawChanges.length) {
    status = "stable";
    pending = [];
    writeJson(STABLE_PATH, currentSnapshot);
    writeJson(PENDING_PATH, pending);
    writeCache(nowIso, registry, pending);
  } else {
    const previous = new Map(pending.map((entry) => [entry.change_key, entry]));
    pending = rawChanges.map((entry) => {
      const prev = previous.get(entry.change_key);
      return {
        change_key: entry.change_key,
        count: prev ? prev.count + 1 : 1,
        first_seen_at: prev?.first_seen_at || nowIso,
        last_seen_at: nowIso,
        entry: {
          geo: entry.geo,
          type: entry.type,
          old_value: entry.old_value,
          new_value: entry.new_value,
          change_key: entry.change_key
        }
      };
    });
    const confirmed = pending.every((entry) => entry.count >= 2) ? rawChanges.map((entry) => ({ ...entry, ts: nowIso })) : [];
    if (confirmed.length) {
      status = "changed";
      confirmedCount = confirmed.length;
      const existing = new Set((registry.changes || []).map((entry) => `${entry.change_key}|${entry.ts}`));
      registry = {
        generated_at: nowIso,
        changes: [...(registry.changes || []), ...confirmed.filter((entry) => !existing.has(`${entry.change_key}|${entry.ts}`))].sort(
          (a, b) => Date.parse(b.ts) - Date.parse(a.ts)
        )
      };
      writeJson(REGISTRY_PATH, registry);
      writeJson(STABLE_PATH, currentSnapshot);
      pending = [];
      fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
      fs.appendFileSync(
        LOG_PATH,
        `${confirmed.map((entry) => `${entry.ts} ${entry.type} ${entry.geo} ${entry.old_value || "-"} -> ${entry.new_value || "-"}`).join("\n")}\n`
      );
    } else {
      status = "pending";
    }
    writeJson(PENDING_PATH, pending);
    writeCache(nowIso, registry, pending);
  }
}

const snapshotCount = pruneSnapshots();
console.log(`SSOT_DIFF_ENGINE_OK=1`);
console.log(`SSOT_DIFF_STATUS=${status}`);
console.log(`SSOT_SNAPSHOT_ROWS=${currentSnapshot.row_count}`);
console.log(`SSOT_SNAPSHOT_COUNT=${snapshotCount}`);
console.log(`SSOT_DIFF_REGISTRY_COUNT=${(registry.changes || []).length}`);
console.log(`SSOT_DIFF_PENDING_COUNT=${pending.length}`);
console.log(`SSOT_DIFF_CONFIRMED_COUNT=${confirmedCount}`);
