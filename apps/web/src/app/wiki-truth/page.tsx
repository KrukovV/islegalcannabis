import fs from "node:fs";
import path from "node:path";
import WikiTruthTable, { type WikiTruthRow } from "./WikiTruthTable";
import { deriveStatusFromNotes } from "@/lib/mapData";
import { computeWikiCoverageMetrics } from "@/lib/ssot/metrics";

function findRepoRoot(start: string): string {
  let current = start;
  for (let i = 0; i < 6; i += 1) {
    const ssotPath = path.join(current, "data", "wiki", "ssot_legality_table.json");
    const claimsPath = path.join(current, "data", "wiki", "wiki_claims_map.json");
    if (fs.existsSync(ssotPath) || fs.existsSync(claimsPath)) {
      return current;
    }
    const parent = path.dirname(current);
    if (!parent || parent === current) break;
    current = parent;
  }
  return start;
}

const ROOT = findRepoRoot(process.cwd());

type LegalityRow = {
  country?: string;
  iso2?: string;
  rec_status?: string;
  med_status?: string;
  wiki_notes_hint?: string;
};

type ClaimRow = {
  geo_id?: string;
  geo_key?: string;
  iso2?: string;
  country?: string;
  name?: string;
  geo_name?: string;
  notes_text?: string;
  notes_kind?: string;
  rec_status?: string;
  med_status?: string;
  wiki_rec?: string;
  wiki_med?: string;
  recreational_status?: string;
  medical_status?: string;
  wiki_row_url?: string;
  sources?: Array<{ title?: string; url?: string }>;
  main_articles?: Array<{ title?: string; url?: string }>;
};

type OfficialEvalRow = {
  sources_total?: number;
  sources_official?: number;
};

type EnrichedRef = {
  url?: string;
  official?: boolean;
};

function readJson(filePath: string): unknown {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function normalizeCountryKey(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function hasExtraAfterMain(text: string): boolean {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  if (!/^Main article:/i.test(normalized)) return true;
  const remainder = normalized.replace(/^Main article:[^.]*\.?/i, "").trim();
  return remainder.length > 0;
}

function classifyNotes(text: string, kind?: string): string {
  const trimmed = String(text || "").trim();
  const upperKind = String(kind || "").toUpperCase();
  if (!trimmed) return "EMPTY";
  if (/^See also:/i.test(trimmed) || /^Further information:/i.test(trimmed)) return "PLACEHOLDER";
  if (upperKind) return upperKind;
  if (/^Main article:/i.test(trimmed) && !hasExtraAfterMain(trimmed)) return "MIN_ONLY";
  if (trimmed.length < 80) return "WEAK";
  return "RICH";
}

function isHttpUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

function isWikipediaUrl(value: string): boolean {
  try {
    return new URL(value).hostname.toLowerCase().endsWith("wikipedia.org");
  } catch {
    return false;
  }
}

export default function WikiTruthPage() {
  const legalityPath = path.join(ROOT, "data", "wiki", "ssot_legality_table.json");
  const claimsPath = path.join(ROOT, "data", "wiki", "wiki_claims_map.json");
  const officialPath = path.join(ROOT, "data", "wiki", "wiki_official_eval.json");
  const officialDomainsPath = path.join(ROOT, "data", "official", "official_domains.ssot.json");
  const officialBadgesPath = path.join(ROOT, "data", "wiki", "wiki_official_badges.json");
  const enrichedPath = path.join(ROOT, "data", "wiki", "wiki_claims_enriched.json");

  const legalityPayload = readJson(legalityPath) || {};
  const legalityRows: LegalityRow[] = Array.isArray(legalityPayload?.rows)
    ? legalityPayload.rows
    : [];
  const dataTs = String(legalityPayload?.generated_at || "-");
  const rowsTotal = Number(legalityPayload?.row_count || legalityRows.length || 0);

  const claimsPayload = readJson(claimsPath) || {};
  const claimsItems: Record<string, ClaimRow> =
    claimsPayload?.items && typeof claimsPayload.items === "object"
      ? claimsPayload.items
      : {};
  const wikiMetrics = computeWikiCoverageMetrics(claimsItems);

  const officialPayload = readJson(officialPath) || {};
  const officialItems: Record<string, OfficialEvalRow> =
    officialPayload?.items && typeof officialPayload.items === "object"
      ? officialPayload.items
      : {};
  const officialDomainsPayload = readJson(officialDomainsPath) || {};
  const officialBadgesPayload = readJson(officialBadgesPath) || {};
  const officialItemsTotal = Array.isArray(officialDomainsPayload?.domains)
    ? officialDomainsPayload.domains.length
    : 0;
  const officialResolvedInView = Number(officialBadgesPayload?.totals?.official || 0);
  const officialCoverage = (() => {
    let total = 0;
    let countries = 0;
    let states = 0;
    for (const [geo, entry] of Object.entries(officialItems)) {
      const officialCount = Number(entry?.sources_official ?? entry?.official ?? 0) || 0;
      if (officialCount <= 0) continue;
      total += 1;
      if (/^[A-Z]{2}-/.test(geo)) {
        states += 1;
      } else {
        countries += 1;
      }
    }
    return { total, countries, states };
  })();

  const enrichedPayload = readJson(enrichedPath) || {};
  const enrichedItems: Record<string, EnrichedRef[]> =
    enrichedPayload?.items && typeof enrichedPayload.items === "object"
      ? enrichedPayload.items
      : {};

  const claimsByIso2 = new Map<string, ClaimRow>();
  const claimsByName = new Map<string, ClaimRow>();
  for (const claim of Object.values(claimsItems)) {
    const iso2 = String(claim.iso2 || "").toUpperCase();
    const geoKey = String(claim.geo_id || claim.geo_key || "").toUpperCase();
    const key = iso2 || (geoKey.length === 2 ? geoKey : "");
    if (key) claimsByIso2.set(key, claim);
    const name = normalizeCountryKey(claim.country || claim.name || claim.geo_name || "");
    if (name) claimsByName.set(name, claim);
  }

  if (!legalityRows.length) {
    return (
      <main className="p-6">
        <h1 className="text-2xl font-semibold">Wiki Truth View</h1>
        <p className="text-sm text-red-600">SSOT_MISSING</p>
      </main>
    );
  }

  const tableRows: WikiTruthRow[] = legalityRows.map((row) => {
    const iso2 = String(row.iso2 || "").toUpperCase();
    const country = String(row.country || "");
    const claim =
      (iso2 && claimsByIso2.get(iso2)) ||
      (country && claimsByName.get(normalizeCountryKey(country))) ||
      undefined;
    const geoKey = String(claim?.geo_id || claim?.geo_key || iso2 || "");
    const recWiki = String(row.rec_status || "Unknown");
    const medWiki = String(row.med_status || "Unknown");
    const notesText = String(claim?.notes_text || "");
    const notesWikiRaw = String(row.wiki_notes_hint || "");
    const notesWiki = notesWikiRaw || "-";
    const notesCombined = `${notesText} ${notesWikiRaw}`.trim();
    const derivedRec = recWiki !== "Unknown"
      ? recWiki
      : deriveStatusFromNotes(notesCombined, "rec");
    const derivedMed = medWiki !== "Unknown"
      ? medWiki
      : deriveStatusFromNotes(notesCombined, "med");
    const recOur = derivedRec;
    const medOur = derivedMed;
    const notesQuality = classifyNotes(notesText, claim?.notes_kind);
    const notesLen = notesText.length;
    const wikiPageUrl = String(claim?.wiki_row_url || "");
    const sourcesRaw = Array.isArray(claim?.sources)
      ? claim?.sources
      : Array.isArray(claim?.main_articles)
        ? claim?.main_articles
        : [];
    const officialRefs = Array.isArray(enrichedItems[geoKey])
      ? enrichedItems[geoKey]
      : [];
    const officialUrlSet = new Set(
      officialRefs
        .filter((entry) => entry?.official && entry?.url)
        .map((entry) => String(entry.url))
        .filter((url) => !isWikipediaUrl(url))
    );
    const sourcesSeen = new Set<string>();
    const sources = sourcesRaw
      .map((entry) => ({
        url: String(entry?.url || ""),
        title: String(entry?.title || ""),
        isOfficial: officialUrlSet.has(String(entry?.url || "")),
      }))
      .filter((entry) => entry.url || entry.title)
      .filter((entry) => {
        const key = entry.url || entry.title;
        if (sourcesSeen.has(key)) return false;
        sourcesSeen.add(key);
        return true;
      });
    const sourcesTruncated = sources.length > 20;
    const sourcesSafe = sources.slice(0, 20);
    const officialSeen = new Set<string>();
    const officialSources = officialRefs
      .filter((entry) => entry?.official && entry?.url)
      .map((entry) => ({
        url: String(entry?.url || ""),
        title: "",
        isOfficial: true,
      }))
      .filter((entry) => entry.url && !isWikipediaUrl(entry.url))
      .filter((entry) => {
        const key = entry.url || entry.title;
        if (officialSeen.has(key)) return false;
        officialSeen.add(key);
        return true;
      });
    const officialSourcesTruncated = officialSources.length > 20;
    const officialSourcesSafe = officialSources.slice(0, 20);
    const hasInvalidSourceUrl =
      sourcesSafe.some((entry) => entry.url && !isHttpUrl(entry.url)) ||
      officialSourcesSafe.some((entry) => entry.url && !isHttpUrl(entry.url));
    const official = (officialItems[geoKey]?.sources_official ?? 0) > 0 ? "yes" : "no";
    const flags: string[] = [];
    if (!claim) flags.push("NO_OUR_ROW");
    if (claim && recWiki !== "Unknown" && recOur !== "Unknown" && recWiki !== recOur) {
      flags.push("STATUS_MISMATCH");
    }
    if (claim && medWiki !== "Unknown" && medOur !== "Unknown" && medWiki !== medOur) {
      flags.push("STATUS_MISMATCH");
    }
    if (!notesText) flags.push("NOTES_MISSING");
    if (!notesWikiRaw) flags.push("WIKI_NOTES_MISSING");
    if (!wikiPageUrl) flags.push("WIKI_PAGE_MISSING");
    if (notesQuality === "WEAK") flags.push("NOTES_WEAK");
    if (notesQuality === "PLACEHOLDER") flags.push("NOTES_PLACEHOLDER");
    if (!sourcesSafe.length) flags.push("SOURCES_MISSING");
    if (!officialSourcesSafe.length) flags.push("OFFICIAL_SOURCES_MISSING");
    if (sourcesTruncated) flags.push("SOURCES_TRUNCATED");
    if (officialSourcesTruncated) flags.push("OFFICIAL_SOURCES_TRUNCATED");
    if (hasInvalidSourceUrl) flags.push("SOURCE_URL_INVALID");
    const deltaParts: string[] = [];
    if (recWiki !== "Unknown" && recOur !== "Unknown" && recWiki !== recOur) {
      deltaParts.push(`Rec: ${recWiki}→${recOur}`);
    }
    if (medWiki !== "Unknown" && medOur !== "Unknown" && medWiki !== medOur) {
      deltaParts.push(`Med: ${medWiki}→${medOur}`);
    }
    const delta = deltaParts.length ? deltaParts.join("; ") : "-";
    const uniqFlags = Array.from(new Set(flags.filter(Boolean)));
    uniqFlags.sort();
    return {
      geoKey: geoKey || "-",
      country: country || "-",
      recWiki,
      medWiki,
      recOur,
      medOur,
      notesWiki,
      notesOur: notesText || "-",
      notesLen,
      notesQuality,
      wikiPageUrl: wikiPageUrl || "-",
      sources: sourcesSafe,
      officialSources: officialSourcesSafe,
      sourcesTruncated,
      officialSourcesTruncated,
      official,
      delta,
      flags: uniqFlags,
    };
  });

  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold">Wiki Truth View</h1>
      <p className="text-sm text-neutral-500">
        Source: {legalityPayload?.source_url || "unknown"}
      </p>
      <p className="text-sm text-neutral-500">
        DATA_TS: {dataTs} · ROWS_TOTAL: {rowsTotal}
      </p>
      <p className="text-sm text-neutral-600">
        Official covered geos: {officialCoverage.total} · Countries:{" "}
        {officialCoverage.countries} · States: {officialCoverage.states}
      </p>
      <p className="text-sm text-neutral-600">
        Total official items: {officialItemsTotal} · Resolved in this view:{" "}
        {officialResolvedInView} · {officialResolvedInView} ≤ {officialItemsTotal} (not shrink)
      </p>
      <WikiTruthTable rows={tableRows} />
      {wikiMetrics.WIKI_MISSING_TOTAL > 0 ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Не покрыто Wiki</h2>
          <p className="text-sm text-neutral-600">
            GEO_TOTAL: {wikiMetrics.GEO_TOTAL} · WIKI_MISSING_TOTAL:{" "}
            {wikiMetrics.WIKI_MISSING_TOTAL}
          </p>
          <table className="mt-3 w-full border border-neutral-200 text-sm">
            <thead>
              <tr className="bg-neutral-50 text-left">
                <th className="px-3 py-2">ISO/Geo</th>
              </tr>
            </thead>
            <tbody>
              {wikiMetrics.WIKI_MISSING.map((geo) => (
                <tr key={geo} className="border-t border-neutral-200">
                  <td className="px-3 py-2 font-mono">{geo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </main>
  );
}
