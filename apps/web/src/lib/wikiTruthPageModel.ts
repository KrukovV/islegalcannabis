import fs from "node:fs";
import path from "node:path";
import { cache } from "react";
import { buildOfficialLinkOwnershipIndex, readOfficialLinkOwnership } from "@/lib/officialSources/officialLinkOwnership";
import { readOfficialRegistrySummary } from "@/lib/officialSources/registry";
import { readSsotDiffCache } from "@/lib/ssotDiff/ssotDiffRegistry";
import { findRepoRoot } from "@/lib/ssotDiff/ssotSnapshotStore";
import { buildWikiTruthAudit } from "@/lib/wikiTruthAudit";
import { buildExpectedWikiPageByIso } from "@/lib/wikiTruthNormalization";
import { getStatusSnapshotMeta } from "@/lib/mapData";

const ROOT = findRepoRoot(process.cwd());

function readJson(filePath: string): unknown {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function readCoverageSummary(root: string) {
  const file = path.join(root, "Reports", "coverage.txt");
  if (!fs.existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    out[line.slice(0, idx)] = line.slice(idx + 1);
  }
  return out;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export const buildWikiTruthPageModel = cache(() => {
  const legalityPayload = (readJson(path.join(ROOT, "data", "wiki", "ssot_legality_table.json")) || {}) as {
    generated_at?: string;
    rows?: unknown[];
  };
  const claimsPayload = (readJson(path.join(ROOT, "data", "wiki", "wiki_claims_map.json")) || {}) as {
    items?: Record<string, unknown>;
  };
  const officialPayload = (readJson(path.join(ROOT, "data", "wiki", "wiki_official_eval.json")) || {}) as {
    items?: Record<string, unknown>;
  };
  const officialBadgesPayload = (readJson(path.join(ROOT, "data", "wiki", "wiki_official_badges.json")) || {}) as {
    items?: Record<string, unknown>;
  };
  const enrichedPayload = (readJson(path.join(ROOT, "data", "wiki", "wiki_claims_enriched.json")) || {}) as {
    items?: Record<string, unknown>;
  };
  const wikiUniversePayload = (readJson(path.join(ROOT, "data", "ssot", "wiki_pages_universe.json")) || {}) as {
    items?: Array<{ iso2?: string; expected_wiki_url?: string }>;
  };
  const usStatesPayload = (readJson(path.join(ROOT, "data", "ssot", "us_states_wiki.json")) || {}) as {
    items?: Array<{ geo?: string }>;
  };
  const expectedWikiPageByIso = buildExpectedWikiPageByIso({
    wikiUniverseItems: Array.isArray(wikiUniversePayload.items) ? wikiUniversePayload.items : [],
    claimsItems: readRecord(claimsPayload.items) as Parameters<typeof buildExpectedWikiPageByIso>[0]["claimsItems"]
  });
  const usStatesWikiKeys = (Array.isArray(usStatesPayload.items) ? usStatesPayload.items : [])
    .map((row) => String(row?.geo || "").toUpperCase())
    .filter((geo) => /^US-[A-Z]{2}$/.test(geo));
  const officialRegistrySummary = readOfficialRegistrySummary(ROOT);
  const officialOwnershipDataset = readOfficialLinkOwnership(ROOT);
  const officialOwnershipIndex = buildOfficialLinkOwnershipIndex(officialOwnershipDataset);
  return {
    root: ROOT,
    generatedAt: String(legalityPayload.generated_at || "-"),
    snapshot: getStatusSnapshotMeta(),
    diffCache: readSsotDiffCache(ROOT),
    audit: buildWikiTruthAudit({
      legalityRows: (Array.isArray(legalityPayload.rows) ? legalityPayload.rows : []) as Parameters<typeof buildWikiTruthAudit>[0]["legalityRows"],
      claimsItems: readRecord(claimsPayload.items) as Parameters<typeof buildWikiTruthAudit>[0]["claimsItems"],
      officialItems: readRecord(officialPayload.items) as Parameters<typeof buildWikiTruthAudit>[0]["officialItems"],
      officialBadgeItems: readRecord(officialBadgesPayload.items) as Parameters<typeof buildWikiTruthAudit>[0]["officialBadgeItems"],
      enrichedItems: readRecord(enrichedPayload.items) as Parameters<typeof buildWikiTruthAudit>[0]["enrichedItems"],
      coverageSummary: readCoverageSummary(ROOT),
      expectedWikiPageByIso,
      usStatesWikiKeys,
      officialRegistrySummary,
      officialOwnershipIndex,
      officialOwnershipDataset
    })
  };
});
