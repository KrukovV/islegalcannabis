import crypto from "node:crypto";
import { ALL_GEO } from "@/lib/geo/allGeo";
import type { SsotDiffEntry, SsotDiffType, SsotSnapshot, SsotSnapshotRow } from "./ssotDiffTypes";

type ClaimRow = {
  geo_id?: string;
  geo_key?: string;
  iso2?: string;
  wiki_rec?: string;
  wiki_med?: string;
  recreational_status?: string;
  medical_status?: string;
  rec_status?: string;
  med_status?: string;
  notes_text?: string;
  wiki_row_url?: string;
};

type EnrichedRef = {
  url?: string;
  official?: boolean;
};

type OfficialBadge = {
  url?: string;
};

export type BuildSnapshotInput = {
  generatedAt?: string;
  claimsItems: Record<string, ClaimRow>;
  enrichedItems: Record<string, EnrichedRef[]>;
  officialBadgeItems: Record<string, OfficialBadge[]>;
  geoUniverse?: string[];
};

function hashNotes(value: string): string {
  return crypto.createHash("sha256").update(String(value || "").trim()).digest("hex").slice(0, 12);
}

function normalizeUrl(value: string): string {
  return String(value || "").trim();
}

function readStatus(...values: Array<string | undefined>): string {
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (normalized) return normalized;
  }
  return "Unknown";
}

function buildChangeKey(geo: string, type: SsotDiffType, oldValue: string | null, newValue: string | null): string {
  return `${geo}|${type}|${oldValue || "-"}|${newValue || "-"}`;
}

export function buildCurrentSsotSnapshot(input: BuildSnapshotInput): SsotSnapshot {
  const geoUniverse = (input.geoUniverse || ALL_GEO).map((geo) => String(geo).toUpperCase());
  const claimByGeo = new Map<string, ClaimRow>();
  for (const claim of Object.values(input.claimsItems || {})) {
    const geo = String(claim?.geo_key || claim?.geo_id || claim?.iso2 || "").toUpperCase();
    if (geo) claimByGeo.set(geo, claim);
  }

  const rows: SsotSnapshotRow[] = geoUniverse.map((geo) => {
    const claim = claimByGeo.get(geo);
    const officialUrls = new Set<string>();
    for (const ref of Array.isArray(input.enrichedItems?.[geo]) ? input.enrichedItems[geo] : []) {
      const url = normalizeUrl(ref?.url || "");
      if (ref?.official && url) officialUrls.add(url);
    }
    for (const badge of Array.isArray(input.officialBadgeItems?.[geo]) ? input.officialBadgeItems[geo] : []) {
      const url = normalizeUrl(badge?.url || "");
      if (url) officialUrls.add(url);
    }

    return {
      geo,
      rec_status: readStatus(claim?.recreational_status, claim?.wiki_rec, claim?.rec_status),
      med_status: readStatus(claim?.medical_status, claim?.wiki_med, claim?.med_status),
      notes_hash: hashNotes(String(claim?.notes_text || "")),
      official_sources: Array.from(officialUrls).sort(),
      wiki_page_url: normalizeUrl(String(claim?.wiki_row_url || "")) || null
    };
  });

  return {
    generated_at: input.generatedAt || new Date().toISOString(),
    row_count: rows.length,
    rows
  };
}

export function diffSnapshots(oldSnapshot: SsotSnapshot, newSnapshot: SsotSnapshot): SsotDiffEntry[] {
  const previous = new Map(oldSnapshot.rows.map((row) => [row.geo, row]));
  const changes: SsotDiffEntry[] = [];

  for (const current of newSnapshot.rows) {
    const oldRow = previous.get(current.geo);
    if (!oldRow) continue;

    if (oldRow.rec_status !== current.rec_status) {
      changes.push({
        geo: current.geo,
        type: "STATUS_CHANGE",
        old_value: oldRow.rec_status,
        new_value: current.rec_status,
        ts: newSnapshot.generated_at,
        change_key: buildChangeKey(current.geo, "STATUS_CHANGE", oldRow.rec_status, current.rec_status)
      });
    }
    if (oldRow.med_status !== current.med_status) {
      changes.push({
        geo: current.geo,
        type: "MED_STATUS_CHANGE",
        old_value: oldRow.med_status,
        new_value: current.med_status,
        ts: newSnapshot.generated_at,
        change_key: buildChangeKey(current.geo, "MED_STATUS_CHANGE", oldRow.med_status, current.med_status)
      });
    }
    if (oldRow.notes_hash !== current.notes_hash) {
      changes.push({
        geo: current.geo,
        type: "NOTES_UPDATE",
        old_value: oldRow.notes_hash,
        new_value: current.notes_hash,
        ts: newSnapshot.generated_at,
        change_key: buildChangeKey(current.geo, "NOTES_UPDATE", oldRow.notes_hash, current.notes_hash)
      });
    }
    if ((oldRow.wiki_page_url || null) !== (current.wiki_page_url || null)) {
      changes.push({
        geo: current.geo,
        type: "WIKI_PAGE_CHANGED",
        old_value: oldRow.wiki_page_url || null,
        new_value: current.wiki_page_url || null,
        ts: newSnapshot.generated_at,
        change_key: buildChangeKey(current.geo, "WIKI_PAGE_CHANGED", oldRow.wiki_page_url || null, current.wiki_page_url || null)
      });
    }

    const oldSources = new Set(oldRow.official_sources);
    const newSources = new Set(current.official_sources);
    for (const added of current.official_sources) {
      if (oldSources.has(added)) continue;
      changes.push({
        geo: current.geo,
        type: "OFFICIAL_SOURCE_ADDED",
        old_value: null,
        new_value: added,
        ts: newSnapshot.generated_at,
        change_key: buildChangeKey(current.geo, "OFFICIAL_SOURCE_ADDED", null, added)
      });
    }
    for (const removed of oldRow.official_sources) {
      if (newSources.has(removed)) continue;
      changes.push({
        geo: current.geo,
        type: "OFFICIAL_SOURCE_REMOVED",
        old_value: removed,
        new_value: null,
        ts: newSnapshot.generated_at,
        change_key: buildChangeKey(current.geo, "OFFICIAL_SOURCE_REMOVED", removed, null)
      });
    }
  }

  return changes.sort((a, b) => a.change_key.localeCompare(b.change_key));
}

export function filterChangesSince(changes: SsotDiffEntry[], nowIso: string, hours: number): SsotDiffEntry[] {
  const now = Date.parse(nowIso);
  const threshold = now - hours * 60 * 60 * 1000;
  return changes
    .filter((entry) => {
      const ts = Date.parse(entry.ts);
      return Number.isFinite(ts) && ts >= threshold;
    })
    .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
}
