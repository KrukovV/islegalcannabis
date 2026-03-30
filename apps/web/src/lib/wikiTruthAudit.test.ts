import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildOfficialLinkOwnershipIndex,
  matchesOfficialGeoOwnership,
  readOfficialLinkOwnership
} from "@/lib/officialSources/officialLinkOwnership";
import { readOfficialRegistrySummary } from "@/lib/officialSources/registry";
import { buildWikiTruthAudit } from "./wikiTruthAudit";
import { buildExpectedWikiPageByIso } from "./wikiTruthNormalization";

function findRepoRoot(start: string): string {
  let current = start;
  for (let i = 0; i < 6; i += 1) {
    if (fs.existsSync(path.join(current, "data", "wiki", "ssot_legality_table.json"))) return current;
    const parent = path.dirname(current);
    if (!parent || parent === current) break;
    current = parent;
  }
  return start;
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readCoverageSummary(root: string) {
  const file = path.join(root, "Reports", "coverage.txt");
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    out[line.slice(0, idx)] = line.slice(idx + 1);
  }
  return out;
}

function buildAudit() {
  const root = findRepoRoot(process.cwd());
  const legalityPayload = readJson(path.join(root, "data", "wiki", "ssot_legality_table.json")) as { rows?: unknown[] };
  const claimsPayload = readJson(path.join(root, "data", "wiki", "wiki_claims_map.json")) as {
    items?: Record<string, unknown>;
  };
  const officialPayload = readJson(path.join(root, "data", "wiki", "wiki_official_eval.json")) as {
    items?: Record<string, unknown>;
  };
  const officialBadgesPayload = readJson(path.join(root, "data", "wiki", "wiki_official_badges.json")) as {
    items?: Record<string, unknown>;
  };
  const enrichedPayload = readJson(path.join(root, "data", "wiki", "wiki_claims_enriched.json")) as {
    items?: Record<string, unknown>;
  };
  const wikiUniversePayload = readJson(path.join(root, "data", "ssot", "wiki_pages_universe.json")) as {
    items?: Array<{ iso2?: string; expected_wiki_url?: string }>;
  };
  const usStatesPayload = readJson(path.join(root, "data", "ssot", "us_states_wiki.json")) as {
    items?: Array<{ geo?: string }>;
  };

  const officialOwnershipDataset = readOfficialLinkOwnership(root);
  return buildWikiTruthAudit({
    legalityRows: Array.isArray(legalityPayload.rows) ? legalityPayload.rows : [],
    claimsItems: claimsPayload.items && typeof claimsPayload.items === "object" ? claimsPayload.items : {},
    officialItems: officialPayload.items && typeof officialPayload.items === "object" ? officialPayload.items : {},
    officialBadgeItems:
      officialBadgesPayload.items && typeof officialBadgesPayload.items === "object" ? officialBadgesPayload.items : {},
    enrichedItems: enrichedPayload.items && typeof enrichedPayload.items === "object" ? enrichedPayload.items : {},
    coverageSummary: readCoverageSummary(root),
    expectedWikiPageByIso: buildExpectedWikiPageByIso({
      wikiUniverseItems: Array.isArray(wikiUniversePayload.items) ? wikiUniversePayload.items : [],
      claimsItems: claimsPayload.items && typeof claimsPayload.items === "object" ? claimsPayload.items : {}
    }),
    officialRegistrySummary: readOfficialRegistrySummary(root),
    officialOwnershipIndex: buildOfficialLinkOwnershipIndex(officialOwnershipDataset),
    officialOwnershipDataset,
    usStatesWikiKeys: (Array.isArray(usStatesPayload.items) ? usStatesPayload.items : [])
      .map((row) => String(row?.geo || "").toUpperCase())
      .filter((geo) => /^US-[A-Z]{2}$/.test(geo))
  });
}

describe("buildWikiTruthAudit", () => {
  it("filters garbage rows out of main results and keeps them in diagnostics", () => {
    const audit = buildAudit();
    expect(audit.mainRows.some((row) => row.country === "Country/Territory")).toBe(false);
    expect(audit.diagnostics.garbageRows.some((row) => row.country === "Country/Territory")).toBe(true);
  });

  it("keeps universe totals separated and deterministic", () => {
    const audit = buildAudit();
    const wiki = audit.summaryCards.find((card) => card.id === "WIKI_COUNTRIES");
    const iso = audit.summaryCards.find((card) => card.id === "ISO_COUNTRIES");
    const ref = audit.summaryCards.find((card) => card.id === "REF_SSOT");
    expect(wiki?.total).toBeTruthy();
    expect(iso?.total).toBeTruthy();
    expect(ref?.total).toBeTruthy();
    expect(new Set([wiki?.total, iso?.total, ref?.total]).size).toBeGreaterThan(1);
    expect(iso?.total).toBeGreaterThanOrEqual(wiki?.covered || 0);
    expect(ref?.total).toBeGreaterThanOrEqual(iso?.total || 0);
    expect(wiki?.covered).toBe(202);
    expect(wiki?.total).toBe(202);
  });

  it("normalizes broken expected wiki titles into clean alias diagnostics", () => {
    const audit = buildAudit();
    expect(audit.diagnostics.unresolvedAliases.length).toBeLessThanOrEqual(10);
  });

  it("does not leak pseudo wiki URLs into expected pages", () => {
    const audit = buildAudit();
    const broken = audit.uncoveredCountries
      .map((row) => row.expectedWikiUrl)
      .filter((url) =>
        /\/wiki\/(?:land|Cura_ao|St_Barth_lemy|U_S_Virgin_Is|BQ|CC|GF|RE|YT)(?:$|[?#])/i.test(String(url || ""))
      );
    expect(broken).toEqual([]);
  });

  it("keeps missing wiki rows out of main audit rows and reports them separately", () => {
    const audit = buildAudit();
    expect(audit.mainRows.some((row) => row.country === "Country/Territory")).toBe(false);
    expect(audit.diagnostics.missingWikiRows.length).toBe(0);
  });

  it("does not shrink official coverage below audited country rows", () => {
    const audit = buildAudit();
    const registry = audit.summaryCards.find((card) => card.id === "OFFICIAL_REGISTRY");
    const geoCoverage = audit.summaryCards.find((card) => card.id === "OFFICIAL_GEO_COVERAGE");
    expect(registry?.title).toBe("Official registry");
    expect(registry?.covered).toBe(418);
    expect(registry?.covered).toBe(registry?.total);
    expect(geoCoverage?.title).toBe("Official geo coverage");
    expect((geoCoverage?.covered || 0) + (geoCoverage?.missing || 0)).toBe(geoCoverage?.total);
    expect(geoCoverage?.total).toBeGreaterThanOrEqual(audit.mainRows.length);
    expect(registry?.total).not.toBe(geoCoverage?.total);
    expect(geoCoverage?.covered || 0).toBeGreaterThan(0);
  });

  it("keeps wikipedia and books.google out of official sources", () => {
    const audit = buildAudit();
    const polluted = audit.allRows.flatMap((row) =>
      row.officialSources
        .map((source) => String(source.url || ""))
        .filter((url) => /(wikipedia\.org|books\.google\.|archive\.org|web\.archive\.org)/i.test(url))
    );
    expect(polluted).toEqual([]);
  });

  it("renders official sources only from owner-matched official ownership", () => {
    const audit = buildAudit();
    const root = findRepoRoot(process.cwd());
    const index = buildOfficialLinkOwnershipIndex(readOfficialLinkOwnership(root));
    const mismatched = audit.allRows.flatMap((row) =>
      row.officialSources
        .map((source) => String(source.url || ""))
        .filter(Boolean)
        .filter((url) => !matchesOfficialGeoOwnership(url, row.geoKey, index))
        .map((url) => `${row.geoKey}:${url}`)
    );
    expect(mismatched).toEqual([]);
  });
});
