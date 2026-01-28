import { getLawProfile, normalizeKey } from "@/lib/lawStore";
import { computeStatus, getIsoMeta, STATUS_BANNERS } from "@islegal/shared";
import type { JurisdictionLawProfile } from "@islegal/shared";
import { incrementCounter } from "@/lib/metrics";
import { createRequestId, errorResponse, okResponse } from "@/lib/api/response";
import { getCatalogEntry } from "@/lib/jurisdictionCatalog";
import { hashLawProfile } from "@/lib/profileHash";
import { verifyJurisdictionFreshness } from "@/lib/verification";
import { buildTripStatusCode } from "@/lib/tripStatus";
import { buildResultViewModel } from "@/lib/resultViewModel";
import {
  fromDetected,
  fromManual,
  fromQuery,
  type LocationContext
} from "@/lib/location/locationContext";
import { confidenceForLocation } from "@/lib/geo/locationResolution";
import { titleForJurisdiction } from "@/lib/jurisdictionTitle";
import { buildExtrasItems, extrasPreview } from "@/lib/extras";
import { findNearestLegalForProfile } from "@/lib/geo/nearestLegal";
import { findNearestBetterBorder } from "@/lib/geo/nearestBorder";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const CACHE_WINDOW_MINUTES = 120;
const US_ADM1_PATH = path.join(process.cwd(), "..", "..", "data", "centroids", "us_adm1.json");
let usAdm1NameMap: Record<string, string> | null = null;

function buildVerifyLinks(
  sources: Array<{ title: string; url: string }> | undefined,
  isoMeta?: ReturnType<typeof getIsoMeta> | null
) {
  const links = Array.isArray(sources) ? [...sources] : [];
  if (isoMeta) {
    links.push({ title: "ISO 3166-1", url: isoMeta.verify.isoObp });
    links.push({ title: "ISO 3166-1 alpha-2", url: isoMeta.verify.wiki });
  }
  return links;
}

function buildNeedsReviewStatus() {
  return {
    level: "gray" as const,
    label: STATUS_BANNERS.needs_review.title,
    icon: "⚠️"
  };
}

function buildProvisionalStatus() {
  return {
    level: "yellow" as const,
    label: STATUS_BANNERS.provisional.title,
    icon: "⚠️"
  };
}

function buildDisplayStatus(profile: { status: string }) {
  if (profile.status === "needs_review" || profile.status === "unknown") {
    return buildNeedsReviewStatus();
  }
  if (profile.status === "provisional") {
    return buildProvisionalStatus();
  }
  return computeStatus(profile as Parameters<typeof computeStatus>[0]);
}

function normalizeRegionName(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function loadUsAdm1NameMap() {
  if (usAdm1NameMap) return usAdm1NameMap;
  if (!fs.existsSync(US_ADM1_PATH)) return {};
  const payload = JSON.parse(fs.readFileSync(US_ADM1_PATH, "utf8"));
  const items = payload?.items ?? {};
  const map: Record<string, string> = {};
  for (const [key, entry] of Object.entries(items)) {
    const name = normalizeRegionName(String((entry as { name?: string }).name || ""));
    if (!name || !key.startsWith("US-")) continue;
    map[name] = key.slice(3);
  }
  usAdm1NameMap = map;
  return map;
}

function resolveUsRegion(country: string, region: string | undefined) {
  if (country.toUpperCase() !== "US" || !region) return { region };
  const cleaned = region.trim();
  const upper = cleaned.toUpperCase();
  if (upper.startsWith("US-")) return { region: upper.slice(3) };
  if (upper.startsWith("US_")) return { region: upper.slice(3) };
  if (upper.length === 2) return { region: upper };
  const map = loadUsAdm1NameMap();
  const normalized = normalizeRegionName(cleaned);
  const code = map[normalized];
  if (code) {
    return { region: code, source: "adm1" };
  }
  return { region: upper };
}

function loadSsotChangedIds() {
  const reportPath = path.join(process.cwd(), "Reports", "ssot-diff", "last_run.json");
  if (!fs.existsSync(reportPath)) return new Set<string>();
  try {
    const data = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    if (data?.status !== "changed") return new Set<string>();
    const ids = Array.isArray(data.changed_ids) ? data.changed_ids : [];
    return new Set(
      ids
        .map((id: unknown) => String(id || "").toUpperCase())
        .filter(Boolean)
    );
  } catch {
    return new Set<string>();
  }
}

const OFFLINE_FALLBACK_PATH = path.join(
  process.cwd(),
  "data",
  "fallback",
  "legal_fallback.json"
);
const AUTO_VERIFIED_PATH = path.join(
  process.cwd(),
  "data",
  "legal_ssot",
  "machine_verified.json"
);
const WIKI_CLAIM_DIR = path.join(
  process.cwd(),
  "data",
  "wiki",
  "wiki_claims"
);
const WIKI_SSOT_CLAIMS_PATH = path.join(
  process.cwd(),
  "data",
  "wiki",
  "wiki_claims_map.json"
);
const WIKI_SSOT_REFS_PATH = path.join(
  process.cwd(),
  "data",
  "wiki_ssot",
  "wiki_refs.json"
);
const WIKI_CLAIMS_SNAPSHOT = path.join(
  process.cwd(),
  "data",
  "wiki",
  "wiki_claims.json"
);
const WIKI_OFFICIAL_EVAL_PATH = path.join(
  process.cwd(),
  "data",
  "wiki",
  "wiki_official_eval.json"
);

function appendSsotLine(line: string) {
  const reportsPath = path.join(process.cwd(), "Reports", "ci-final.txt");
  const runId = process.env.RUN_ID;
  const runPath = runId
    ? path.join(process.cwd(), "Artifacts", "runs", runId, "ci-final.txt")
    : null;
  try {
    fs.mkdirSync(path.dirname(reportsPath), { recursive: true });
    fs.appendFileSync(reportsPath, `${line}\n`);
  } catch {
    // Ignore SSOT append failures.
  }
  if (runPath) {
    try {
      fs.mkdirSync(path.dirname(runPath), { recursive: true });
      fs.appendFileSync(runPath, `${line}\n`);
    } catch {
      // Ignore SSOT append failures.
    }
  }
}

function geoConfidenceScore(source: string, normalized: string | null) {
  if (source === "manual") return 1.0;
  if (source === "gps") return 0.9;
  if (source === "ip") return 0.6;
  if (normalized === "high") return 0.9;
  if (normalized === "medium") return 0.7;
  if (normalized === "low") return 0.5;
  return 0.0;
}

function writeGeoLocSsot(source: string, iso: string, state: string | undefined, confidence: number) {
  const isoCode = String(iso || "UNKNOWN").toUpperCase();
  const stateCode = state ? String(state).toUpperCase() : "-";
  const ts = new Date().toISOString();
  appendSsotLine(
    `GEO_LOC source=${source} iso=${isoCode} state=${stateCode} confidence=${confidence.toFixed(1)} ts=${ts}`
  );
}
let offlineFallbackCache: Record<string, unknown> | null = null;
let autoVerifiedCache: Record<string, unknown> | null = null;
let wikiClaimsCache: Record<string, unknown> | null = null;
let wikiSsotCache: Record<string, unknown> | null = null;
let wikiRefsCache: Record<string, unknown> | null = null;
let wikiOfficialCache: Record<string, unknown> | null = null;
let onDemandTouched = false;

function loadOfflineFallback() {
  if (offlineFallbackCache) return offlineFallbackCache;
  if (!fs.existsSync(OFFLINE_FALLBACK_PATH)) return null;
  try {
    offlineFallbackCache = JSON.parse(
      fs.readFileSync(OFFLINE_FALLBACK_PATH, "utf8")
    );
    return offlineFallbackCache;
  } catch {
    return null;
  }
}

function getOfflineFallbackEntry(country: string) {
  const payload = loadOfflineFallback();
  const countries = payload?.countries;
  if (!countries || typeof countries !== "object") return null;
  const map = countries as Record<string, unknown>;
  return map[country.toUpperCase()] ?? null;
}

function loadAutoVerified() {
  if (autoVerifiedCache && !onDemandTouched) return autoVerifiedCache;
  if (!fs.existsSync(AUTO_VERIFIED_PATH)) return null;
  try {
    const payload = JSON.parse(fs.readFileSync(AUTO_VERIFIED_PATH, "utf8"));
    const entries =
      payload?.entries && typeof payload.entries === "object"
        ? payload.entries
        : payload;
    autoVerifiedCache = entries ?? null;
    return autoVerifiedCache;
  } catch {
    return null;
  }
}

function getAutoVerifiedEntry(country: string) {
  const payload = loadAutoVerified();
  if (!payload || typeof payload !== "object") return null;
  return (payload as Record<string, unknown>)[country.toUpperCase()] ?? null;
}

function loadWikiClaim(geoKey: string) {
  if (!geoKey) return null;
  const key = geoKey.toUpperCase();
  if (wikiSsotCache && !onDemandTouched) {
    return wikiSsotCache[key] ?? null;
  }
  if (wikiClaimsCache && !onDemandTouched) {
    return wikiClaimsCache[key] ?? null;
  }
  const ssot = loadWikiSsotClaim(key);
  if (ssot) return ssot;
  if (fs.existsSync(WIKI_SSOT_CLAIMS_PATH)) {
    return null;
  }
  if (fs.existsSync(WIKI_CLAIMS_SNAPSHOT)) {
    try {
      const payload = JSON.parse(fs.readFileSync(WIKI_CLAIMS_SNAPSHOT, "utf8"));
      let items: unknown[] = [];
      if (Array.isArray(payload)) {
        items = payload;
      } else if (Array.isArray(payload?.items)) {
        items = payload.items;
      } else if (payload?.items && typeof payload.items === "object") {
        items = Object.values(payload.items);
      } else if (payload && typeof payload === "object") {
        items = Object.values(payload);
      }
      if (items.length) {
        const map: Record<string, unknown> = {};
        for (const entry of items) {
          if (!entry || typeof entry !== "object") continue;
          const normalized = normalizeWikiClaim(entry);
          const normalizedKey = String(normalized?.geo_key || "").toUpperCase();
          if (!normalizedKey) continue;
          map[normalizedKey] = normalized;
        }
        wikiClaimsCache = map;
        return map[key] ?? null;
      }
    } catch {
      wikiClaimsCache = null;
    }
  }
  const claimPath = path.join(WIKI_CLAIM_DIR, `${key}.json`);
  if (!fs.existsSync(claimPath)) return null;
  try {
    const payload = JSON.parse(fs.readFileSync(claimPath, "utf8"));
    return normalizeWikiClaim(payload);
  } catch {
    return null;
  }
}

function normalizeWikiClaim(entry: unknown) {
  if (!entry || typeof entry !== "object") return null;
  const payload = entry as Record<string, unknown>;
  const geo =
    payload.geo_key || payload.geoKey || payload.geo || payload.id || "";
  const mainArticles = Array.isArray(payload.main_articles)
    ? payload.main_articles
    : Array.isArray(payload.notes_main_articles)
      ? payload.notes_main_articles
      : [];
  const notesRaw =
    typeof payload.notes_raw === "string"
      ? payload.notes_raw
      : typeof payload.notes_text === "string"
        ? payload.notes_text
        : "";
  const wikiRec =
    payload.wiki_rec ||
    payload.rec_status ||
    payload.recreational_status ||
    "Unknown";
  const wikiMed =
    payload.wiki_med ||
    payload.med_status ||
    payload.medical_status ||
    "Unknown";
  return {
    ...payload,
    geo_key: String(geo || "").toUpperCase(),
    wiki_rec: wikiRec,
    wiki_med: wikiMed,
    notes_raw: notesRaw,
    main_articles: mainArticles,
    recreational_status: payload.recreational_status || wikiRec,
    medical_status: payload.medical_status || wikiMed,
    notes_main_articles: Array.isArray(payload.notes_main_articles)
      ? payload.notes_main_articles
      : mainArticles
  };
}

function loadWikiSsotClaim(geoKey: string) {
  if (!fs.existsSync(WIKI_SSOT_CLAIMS_PATH)) return null;
  try {
    const payload = JSON.parse(fs.readFileSync(WIKI_SSOT_CLAIMS_PATH, "utf8"));
    const map: Record<string, unknown> = {};
    if (Array.isArray(payload)) {
      for (const entry of payload) {
        const normalized = normalizeWikiClaim(entry);
        const key = String(normalized?.geo_key || "").toUpperCase();
        if (!key) continue;
        map[key] = normalized;
      }
    } else if (Array.isArray(payload?.items)) {
      for (const entry of payload.items) {
        const normalized = normalizeWikiClaim(entry);
        const key = String(normalized?.geo_key || "").toUpperCase();
        if (!key) continue;
        map[key] = normalized;
      }
    } else if (payload?.items && typeof payload.items === "object") {
      for (const [key, value] of Object.entries(payload.items)) {
        const normalized = normalizeWikiClaim(value);
        const normalizedKey = String(normalized?.geo_key || key || "").toUpperCase();
        if (!normalizedKey) continue;
        map[normalizedKey] = normalized;
      }
    } else if (payload && typeof payload === "object") {
      for (const [key, value] of Object.entries(payload)) {
        const normalized = normalizeWikiClaim(value);
        const normalizedKey = String(normalized?.geo_key || key || "").toUpperCase();
        if (!normalizedKey) continue;
        map[normalizedKey] = normalized;
      }
    }
    wikiSsotCache = map;
    return map[geoKey.toUpperCase()] ?? null;
  } catch {
    wikiSsotCache = null;
    return null;
  }
}

function loadWikiRefs(geoKey: string) {
  if (!geoKey) return [];
  const key = geoKey.toUpperCase();
  if (wikiRefsCache && !onDemandTouched) {
    const match = wikiRefsCache[key];
    return Array.isArray(match) ? match : [];
  }
  if (!fs.existsSync(WIKI_SSOT_REFS_PATH)) return [];
  try {
    const payload = JSON.parse(fs.readFileSync(WIKI_SSOT_REFS_PATH, "utf8"));
    const items = Array.isArray(payload) ? payload : payload?.items;
    if (!Array.isArray(items)) return [];
    const map: Record<string, unknown> = {};
    for (const entry of items) {
      if (!entry || typeof entry !== "object") continue;
      const item = entry as Record<string, unknown>;
      const geo = String(item.geo || item.geo_key || item.geoKey || "").toUpperCase();
      if (!geo) continue;
      map[geo] = Array.isArray(item.refs) ? item.refs : [];
    }
    wikiRefsCache = map;
    const match = map[key];
    return Array.isArray(match) ? match : [];
  } catch {
    wikiRefsCache = null;
    return [];
  }
}

function loadWikiOfficialEval(geoKey: string) {
  if (!geoKey) return null;
  if (wikiOfficialCache && !onDemandTouched) {
    return wikiOfficialCache[geoKey.toUpperCase()] ?? null;
  }
  if (fs.existsSync(WIKI_OFFICIAL_EVAL_PATH)) {
    try {
      const payload = JSON.parse(fs.readFileSync(WIKI_OFFICIAL_EVAL_PATH, "utf8"));
      const items = payload?.items && typeof payload.items === "object" ? payload.items : null;
      if (items && typeof items === "object") {
        wikiOfficialCache = items as Record<string, unknown>;
        return wikiOfficialCache[geoKey.toUpperCase()] ?? null;
      }
    } catch {
      wikiOfficialCache = null;
    }
  }
  return null;
}

function withWikiClaim<T extends { wiki_claim?: unknown; wiki_source?: string | null }>(
  profile: T,
  geoKey: string
) {
  if (!profile) return profile;
  const claim = loadWikiClaim(geoKey);
  if (!claim || typeof claim !== "object") return profile;
  const wikiRowUrl =
    typeof (claim as { wiki_row_url?: unknown }).wiki_row_url === "string"
      ? ((claim as { wiki_row_url?: string }).wiki_row_url ?? null)
      : null;
  const wikiSource = wikiRowUrl || profile.wiki_source;
  return { ...profile, wiki_claim: claim, wiki_source: wikiSource };
}

function buildWikiBlock(geoKey: string) {
  const claim = loadWikiClaim(geoKey);
  const wikiRefs = loadWikiRefs(geoKey);
  const rawRefs = (claim as { wiki_refs?: unknown[] } | null)?.wiki_refs;
  const fallbackRefs: unknown[] = Array.isArray(rawRefs) ? rawRefs : [];
  const mergedRefs = wikiRefs.length ? wikiRefs : fallbackRefs;
  const wikiClaim = claim
    ? {
        wiki_rec: (claim as { wiki_rec?: string }).wiki_rec ?? "Unknown",
        wiki_med: (claim as { wiki_med?: string }).wiki_med ?? "Unknown",
        notes_raw: (claim as { notes_raw?: string }).notes_raw ?? "",
        main_articles: Array.isArray((claim as { main_articles?: unknown[] }).main_articles)
          ? (claim as { main_articles?: unknown[] }).main_articles
          : Array.isArray((claim as { notes_main_articles?: unknown[] }).notes_main_articles)
            ? (claim as { notes_main_articles?: unknown[] }).notes_main_articles
            : [],
        wiki_row_url: (claim as { wiki_row_url?: string }).wiki_row_url ?? null,
        fetched_at: (claim as { fetched_at?: string }).fetched_at ?? null
      }
    : null;
  const officialEval = loadWikiOfficialEval(geoKey) as
    | {
        official_count?: number;
        non_official_count?: number;
        total_refs?: number;
        official_matches?: unknown[];
        non_official?: unknown[];
        last_checked_at?: string;
      }
    | null;
  const totalCount =
    Number(officialEval?.total_refs || 0) ||
    Number((officialEval?.official_count || 0) + (officialEval?.non_official_count || 0)) ||
    mergedRefs.length;
  const trust = {
    official_count: Number(officialEval?.official_count || 0) || 0,
    total_count: totalCount,
    official_matches: Array.isArray(officialEval?.official_matches)
      ? officialEval?.official_matches
      : [],
    non_official: Array.isArray(officialEval?.non_official) ? officialEval?.non_official : [],
    last_checked_at: officialEval?.last_checked_at ?? null
  };
  return { wiki_claim: wikiClaim, wiki_links: mergedRefs, links_trust: trust };
}

function isMachineVerifiedFresh(entry: Record<string, unknown> | null, ttlDays = 45) {
  if (!entry || ttlDays <= 0) return false;
  const ts =
    (entry as { verified_at?: string; retrieved_at?: string; generated_at?: string })
      .verified_at ||
    (entry as { retrieved_at?: string }).retrieved_at ||
    (entry as { generated_at?: string }).generated_at;
  if (!ts) return false;
  const ageMs = Date.now() - new Date(ts).getTime();
  if (!Number.isFinite(ageMs)) return false;
  return ageMs <= ttlDays * 24 * 60 * 60 * 1000;
}

function runOnDemandVerify(iso2: string) {
  const scriptPath = path.join(
    process.cwd(),
    "tools",
    "on_demand",
    "run_on_demand_verify.mjs"
  );
  if (!fs.existsSync(scriptPath)) {
    return { status: 2, reason: "NO_RUNNER" };
  }
  const result = spawnSync(
    process.execPath,
    [scriptPath, "--iso2", iso2],
    {
      encoding: "utf8",
      env: { ...process.env, NETWORK: process.env.NETWORK ?? "1" }
    }
  );
  const reportPath = path.join(process.cwd(), "Reports", "on_demand", "last_run.json");
  let reason = "PENDING";
  if (fs.existsSync(reportPath)) {
    try {
      const payload = JSON.parse(fs.readFileSync(reportPath, "utf8"));
      reason = String(payload?.reason || reason);
    } catch {
      reason = "PENDING";
    }
  }
  onDemandTouched = true;
  return { status: result.status ?? 2, reason };
}

function loadOnDemandReason(geoKey: string) {
  if (!geoKey) return null;
  const reportPath = path.join(process.cwd(), "Reports", "on_demand", geoKey, "last_run.json");
  if (!fs.existsSync(reportPath)) return null;
  try {
    const payload = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    return typeof payload?.reason === "string" ? payload.reason : null;
  } catch {
    return null;
  }
}

function withAutoVerified<T extends { auto_verified?: unknown }>(
  profile: T,
  country: string
) {
  const entry = getAutoVerifiedEntry(country);
  if (!entry || typeof entry !== "object") {
    return { ...profile, auto_verified: null, machine_verified: null };
  }
  return { ...profile, auto_verified: entry, machine_verified: entry };
}

function buildVerification(
  profile: JurisdictionLawProfile,
  isoMeta?: ReturnType<typeof getIsoMeta> | null
) {
  const entry = profile.machine_verified;
  const evidence = Array.isArray(entry?.evidence) ? entry.evidence : [];
  const evidenceCount = evidence.length;
  const evidenceKind =
    entry && (entry as { evidence_kind?: string }).evidence_kind === "law"
      ? "law"
      : "non_law";
  const snapshotDate =
    (typeof entry?.snapshot_path === "string" &&
      entry.snapshot_path.match(/\/(\d{4}-\d{2}-\d{2}|\d{8})\//)?.[1]) ||
    (typeof entry?.retrieved_at === "string" ? entry.retrieved_at.slice(0, 10) : null);
  if (entry && evidenceCount > 0 && evidenceKind === "law") {
    const verifyLinks = [];
    if (typeof entry.source_url === "string") {
      verifyLinks.push({ title: "Official source", url: entry.source_url });
      if (snapshotDate) {
        verifyLinks.push({
          title: `Snapshot ${snapshotDate}`,
          url: entry.source_url,
          ref: entry.snapshot_path ?? undefined
        });
      }
      for (const item of evidence.slice(0, 3)) {
        const kind = item?.type || item?.kind || "evidence";
        const ref = item?.anchor || item?.page || item?.ref || "";
        verifyLinks.push({
          title: `Evidence ${kind}`,
          url: entry.source_url,
          ref
        });
      }
    }
    return {
      level: "machine_verified",
      verify_links: verifyLinks,
      evidence_count: evidenceCount,
      snapshot_date: snapshotDate,
      evidence_kind: "law"
    };
  }
  if (entry && evidenceCount > 0 && evidenceKind !== "law") {
    return {
      level: "candidate",
      verify_links: buildVerifyLinks(profile.sources, isoMeta),
      evidence_count: evidenceCount,
      snapshot_date: snapshotDate,
      evidence_kind: evidenceKind
    };
  }
  if (profile.status === "needs_review" || profile.status === "provisional") {
    return {
      level: "candidate",
      verify_links: buildVerifyLinks(profile.sources, isoMeta),
      evidence_count: 0,
      snapshot_date: snapshotDate,
      evidence_kind: evidenceKind
    };
  }
  return {
    level: "unknown",
    verify_links: buildVerifyLinks(profile.sources, isoMeta),
    evidence_count: 0,
    snapshot_date: snapshotDate,
    evidence_kind: evidenceKind
  };
}

export const runtime = "nodejs";

function isPaidRequest(req: Request) {
  if (process.env.NODE_ENV === "production") return false;
  const url = new URL(req.url);
  if (url.searchParams.get("paid") === "1") return true;
  const cookie = req.headers.get("cookie") ?? "";
  return cookie.split(";").some((part) => part.trim() === "ilc_paid=1");
}

export async function GET(req: Request) {
  const requestId = createRequestId(req);
  const { searchParams } = new URL(req.url);
  const country = searchParams.get("country") ?? "";
  const regionInput = searchParams.get("region") ?? undefined;
  const resolvedRegion = resolveUsRegion(country, regionInput);
  const region = resolvedRegion.region;
  if (resolvedRegion.source && regionInput) {
    console.log(
      `GEO_RESOLVE: input="${regionInput}, ${country}" -> geo=US-${resolvedRegion.region} source=${resolvedRegion.source}`
    );
  }
  const method = searchParams.get("method") as "gps" | "ip" | "manual" | null;
  const confidence = searchParams.get("confidence");
  const cell = searchParams.get("cell");
  const cacheTs = searchParams.get("cacheTs");
  const cacheProfileHash = searchParams.get("cacheProfileHash");
  const cacheVerifiedAt = searchParams.get("cacheVerifiedAt");
  const cacheApproxCell = searchParams.get("cacheApproxCell");
  const approxLatRaw = searchParams.get("approxLat");
  const approxLonRaw = searchParams.get("approxLon");
  const approxLat =
    approxLatRaw === null ? null : Number(approxLatRaw);
  const approxLon =
    approxLonRaw === null ? null : Number(approxLonRaw);

  const withRequestId = (meta: Record<string, unknown>) => ({
    requestId,
    ...meta
  });
  const approxPoint =
    approxLat !== null &&
    approxLon !== null &&
    Number.isFinite(approxLat) &&
    Number.isFinite(approxLon)
      ? { lat: approxLat, lon: approxLon }
      : null;

  if (!country.trim()) {
    return errorResponse(
      requestId,
      400,
      "MISSING_COUNTRY",
      "Missing country.",
      "Provide country (and region for US)."
    );
  }

  const jurisdictionKey = normalizeKey({ country, region });
  const title = titleForJurisdiction({ country, region });
  const paid = isPaidRequest(req);
  const pro = searchParams.get("pro") === "1";
  const isoMeta = getIsoMeta(country);
  const ssotChangedIds = loadSsotChangedIds();
  const ssotChanged = ssotChangedIds.has(country.toUpperCase());
  const onDemandReason = jurisdictionKey ? loadOnDemandReason(jurisdictionKey) : null;
  const offlineMode = process.env.OFFLINE_FALLBACK === "1";
  const offlineEntry = offlineMode
    ? (getOfflineFallbackEntry(country) as { sources?: string[] } | null)
    : null;
  const normalizedConfidence =
    confidence === "high" || confidence === "medium" || confidence === "low"
      ? confidence
      : null;
  const locationContext: LocationContext = method
    ? method === "manual"
      ? fromManual(country, region)
      : fromDetected({
          country,
          region,
          method,
          confidence: normalizedConfidence ?? confidenceForLocation(method)
        })
    : fromQuery({ country, region });

  const geoSource = method ? method : "none";
  writeGeoLocSsot(
    geoSource,
    country,
    region,
    geoConfidenceScore(geoSource, normalizedConfidence)
  );
  appendSsotLine("MAP_READY=1");

  const baseViewModelMeta = {
    requestId,
    paid,
    paywallHint: !paid,
    ssotChanged,
    nowIso: new Date().toISOString(),
    verifyReason: onDemandReason ?? null
  };
  const offlineSources = Array.isArray(offlineEntry?.sources)
    ? offlineEntry.sources
        .map((url: string) => (typeof url === "string" ? url.trim() : ""))
        .filter((url: string) => url.startsWith("https://"))
        .map((url: string) => ({
          title: "Official source (offline)",
          url
        }))
    : [];
  const blockedFallbackHosts = ["wikipedia.org", "cannabusinessplans.com"];
  const hasVerifiedLegalSource = (profile: { legal_ssot?: { sources?: Array<{ url?: string }> } }) => {
    const legalSources = Array.isArray(profile?.legal_ssot?.sources)
      ? profile.legal_ssot.sources
      : [];
    return legalSources.some((source) => {
      const url = typeof source?.url === "string" ? source.url : "";
      if (!url.startsWith("https://")) return false;
      return !blockedFallbackHosts.some((host) => url.includes(host));
    });
  };
  const offlineNote = "Source: offline verified snapshot";
  const buildOfflineMeta = (profile: { sources?: unknown[] } | null) => {
    if (!offlineMode) return {};
    if (!offlineEntry) return { offlineMode: true };
    if (profile && hasVerifiedLegalSource(profile as { legal_ssot?: { sources?: Array<{ url?: string }> } })) {
      return { offlineMode: true };
    }
    if (offlineSources.length === 0) return { offlineMode: true };
    return {
      offlineMode: true,
      offlineFallback: true,
      offlineFallbackSources: offlineSources,
      offlineFallbackNote: offlineNote
    };
  };

  if (jurisdictionKey && cacheTs && cacheProfileHash) {
    const ageSec = Math.floor(
      (Date.now() - new Date(cacheTs).getTime()) / 1000
    );
    if (ageSec <= CACHE_WINDOW_MINUTES * 60) {
      const profile = getLawProfile({ country, region });
      const profileHash = profile ? hashLawProfile(profile) : null;
      if (profile && profileHash === cacheProfileHash) {
        const autoProfile: JurisdictionLawProfile = withAutoVerified(profile, country);
        const enrichedProfile = withWikiClaim(autoProfile, jurisdictionKey ?? autoProfile.id);
        const wikiBlock = buildWikiBlock(jurisdictionKey ?? autoProfile.id);
        if (method === "gps") {
          if (!cacheApproxCell || !cell || cacheApproxCell !== cell) {
            // skip mismatch
          } else {
            const verification = await verifyJurisdictionFreshness(
              jurisdictionKey,
              enrichedProfile?.sources ?? [],
              new Date(),
              undefined,
              cacheVerifiedAt ?? undefined
            );
            if (verification.needsReview) {
              const nearestLegal =
                approxPoint &&
                locationContext.mode === "detected" &&
                enrichedProfile?.status === "known" &&
                (computeStatus(enrichedProfile).level === "red" ||
                  enrichedProfile.risks.includes("border_crossing"))
                  ? findNearestLegalForProfile(enrichedProfile, approxPoint)
                  : null;
              const nearestBorder = pro
                ? findNearestBetterBorder({ country, region: region ?? undefined })
                : null;
              const offlineMeta = buildOfflineMeta(enrichedProfile);
              const viewModel = buildResultViewModel({
                profile: enrichedProfile,
                title,
                locationContext,
                meta: {
                  ...baseViewModelMeta,
                  ...offlineMeta,
                  cacheHit: true,
                  verifiedFresh: false,
                  needsReview: true
                },
                extrasPreview: paid
                  ? undefined
                  : extrasPreview(buildExtrasItems(enrichedProfile)),
                extrasFull: paid ? buildExtrasItems(enrichedProfile) : undefined,
                nearestLegal: nearestLegal ?? undefined,
                statusOverride: {
                  level: "gray",
                  title: STATUS_BANNERS.needs_review.title
                }
              });
              const verificationPayload = buildVerification(enrichedProfile, isoMeta);
              return okResponse(requestId, {
                status: buildNeedsReviewStatus(),
                profile: enrichedProfile,
                machine_verified: enrichedProfile.machine_verified ?? null,
                ...wikiBlock,
                viewModel,
                nearest: nearestBorder ?? undefined,
                iso_meta: isoMeta,
                verify_links: buildVerifyLinks(enrichedProfile?.sources, isoMeta),
                verification: verificationPayload,
                verification_level: verificationPayload.level,
                evidence_kind: verificationPayload.evidence_kind ?? "non_law",
                meta: withRequestId({
                  cacheHit: true,
                  cacheAgeSec: ageSec,
                  verifiedFresh: false,
                  needsReview: true,
                  ssotChanged
                })
              });
            }

            const nearestLegal =
              approxPoint &&
              locationContext.mode === "detected" &&
              enrichedProfile?.status === "known" &&
              (computeStatus(enrichedProfile).level === "red" ||
                enrichedProfile.risks.includes("border_crossing"))
                ? findNearestLegalForProfile(enrichedProfile, approxPoint)
                : null;
            const nearestBorder = pro
              ? findNearestBetterBorder({ country, region: region ?? undefined })
              : null;
            const offlineMeta = buildOfflineMeta(enrichedProfile);
            const viewModel = buildResultViewModel({
              profile: enrichedProfile,
              title,
              locationContext,
              meta: {
                ...baseViewModelMeta,
                ...offlineMeta,
                cacheHit: true,
                verifiedFresh: true
              },
              extrasPreview: paid
                ? undefined
                : extrasPreview(buildExtrasItems(enrichedProfile)),
              extrasFull: paid ? buildExtrasItems(enrichedProfile) : undefined,
              nearestLegal: nearestLegal ?? undefined
            });
            const verificationPayload = buildVerification(enrichedProfile, isoMeta);
            return okResponse(requestId, {
              status: buildDisplayStatus(enrichedProfile),
              profile: enrichedProfile,
              machine_verified: enrichedProfile.machine_verified ?? null,
              ...wikiBlock,
              viewModel,
              nearest: nearestBorder ?? undefined,
              iso_meta: isoMeta,
              verify_links: buildVerifyLinks(enrichedProfile?.sources, isoMeta),
              verification: verificationPayload,
                verification_level: verificationPayload.level,
                evidence_kind: verificationPayload.evidence_kind ?? "non_law",
                meta: withRequestId({
                cacheHit: true,
                cacheAgeSec: ageSec,
                verifiedFresh: true,
                ssotChanged
              })
            });
          }
        } else {
          const verification = await verifyJurisdictionFreshness(
            jurisdictionKey,
            enrichedProfile?.sources ?? [],
            new Date(),
            undefined,
            cacheVerifiedAt ?? undefined
          );
          if (verification.needsReview) {
            const nearestLegal =
              approxPoint &&
              locationContext.mode === "detected" &&
              enrichedProfile?.status === "known" &&
              (computeStatus(enrichedProfile).level === "red" ||
                enrichedProfile.risks.includes("border_crossing"))
                ? findNearestLegalForProfile(enrichedProfile, approxPoint)
                : null;
            const nearestBorder = pro
              ? findNearestBetterBorder({ country, region: region ?? undefined })
              : null;
            const offlineMeta = buildOfflineMeta(enrichedProfile);
            const viewModel = buildResultViewModel({
              profile: enrichedProfile,
              title,
              locationContext,
              meta: {
                ...baseViewModelMeta,
                ...offlineMeta,
                cacheHit: true,
                verifiedFresh: false,
                needsReview: true,
              },
              extrasPreview: paid
                ? undefined
                : extrasPreview(buildExtrasItems(enrichedProfile)),
              extrasFull: paid ? buildExtrasItems(enrichedProfile) : undefined,
              nearestLegal: nearestLegal ?? undefined,
              statusOverride: {
                level: "gray",
                title: STATUS_BANNERS.needs_review.title
              }
            });
            const verificationPayload = buildVerification(enrichedProfile, isoMeta);
            return okResponse(requestId, {
              status: buildNeedsReviewStatus(),
              profile: enrichedProfile,
              machine_verified: enrichedProfile.machine_verified ?? null,
              ...wikiBlock,
              viewModel,
              nearest: nearestBorder ?? undefined,
              iso_meta: isoMeta,
              verify_links: buildVerifyLinks(enrichedProfile?.sources, isoMeta),
              verification: verificationPayload,
                verification_level: verificationPayload.level,
                evidence_kind: verificationPayload.evidence_kind ?? "non_law",
                meta: withRequestId({
                cacheHit: true,
                cacheAgeSec: ageSec,
                verifiedFresh: false,
                needsReview: true,
                ssotChanged
              })
            });
          }

          const nearestLegal =
            approxPoint &&
            locationContext.mode === "detected" &&
            enrichedProfile?.status === "known" &&
            (computeStatus(enrichedProfile).level === "red" ||
              enrichedProfile.risks.includes("border_crossing"))
              ? findNearestLegalForProfile(enrichedProfile, approxPoint)
              : null;
          const nearestBorder = pro
            ? findNearestBetterBorder({ country, region: region ?? undefined })
            : null;
          const offlineMeta = buildOfflineMeta(enrichedProfile);
          const viewModel = buildResultViewModel({
            profile: enrichedProfile,
            title,
            locationContext,
            meta: {
              ...baseViewModelMeta,
              ...offlineMeta,
              cacheHit: true,
              verifiedFresh: true
            },
            extrasPreview: paid
              ? undefined
              : extrasPreview(buildExtrasItems(enrichedProfile)),
            extrasFull: paid ? buildExtrasItems(enrichedProfile) : undefined,
            nearestLegal: nearestLegal ?? undefined
          });
          const verificationPayload = buildVerification(enrichedProfile, isoMeta);
          return okResponse(requestId, {
            status: buildDisplayStatus(enrichedProfile),
            profile: enrichedProfile,
            machine_verified: enrichedProfile.machine_verified ?? null,
            ...wikiBlock,
            viewModel,
            nearest: nearestBorder ?? undefined,
            iso_meta: isoMeta,
            verify_links: buildVerifyLinks(enrichedProfile?.sources, isoMeta),
            verification: verificationPayload,
              verification_level: verificationPayload.level,
              evidence_kind: verificationPayload.evidence_kind ?? "non_law",
              meta: withRequestId({
              cacheHit: true,
              cacheAgeSec: ageSec,
              verifiedFresh: true,
              ssotChanged
            })
          });
        }
      }
    }
  }

  const profile = getLawProfile({ country, region });

  if (!profile) {
    const entry = getCatalogEntry(country);
    if (entry) {
      const wikiBlock = buildWikiBlock(jurisdictionKey || country);
      return okResponse(requestId, {
        status: {
          level: "gray",
          label: STATUS_BANNERS.needs_review.title,
          icon: "⚪"
        },
        profile: null,
        ...wikiBlock,
        iso_meta: isoMeta,
        verify_links: buildVerifyLinks(entry.sources, isoMeta),
        verification: {
          level: "unknown",
          verify_links: buildVerifyLinks(entry.sources, isoMeta),
          evidence_count: 0,
          snapshot_date: null,
          evidence_kind: "non_law"
        },
        verification_level: "unknown",
        evidence_kind: "non_law",
        actions: {
          open_sources_url: entry.sources?.[0]?.url ?? null
        },
        message: "No law profile yet. Use official sources or select manually.",
        meta: withRequestId({ ssotChanged })
      });
    }

    return errorResponse(
      requestId,
      400,
      "BAD_REQUEST",
      "Invalid country code.",
      "Provide ISO 3166-1 alpha-2 (and region for US)."
    );
  }

  let verifyStatus: "verified" | "pending" | undefined;
  let verifyReason: string | undefined;
  const existingMv = getAutoVerifiedEntry(country) as Record<string, unknown> | null;
  if (!isMachineVerifiedFresh(existingMv, 45)) {
    if (process.env.NETWORK === "1") {
      const result = runOnDemandVerify(country.toUpperCase());
      if (result.status === 0) {
        verifyStatus = "verified";
      } else {
        verifyStatus = "pending";
        verifyReason = result.reason;
      }
    } else {
      verifyStatus = "pending";
      verifyReason = "OFFLINE";
    }
  }

  const autoProfile = withAutoVerified(profile, country);
  const enrichedProfile = withWikiClaim(autoProfile, jurisdictionKey ?? autoProfile.id);
  const wikiBlock = buildWikiBlock(jurisdictionKey ?? autoProfile.id);

  incrementCounter("check_performed");
  console.info(`[${requestId}] check_performed`);

  const status = buildDisplayStatus(enrichedProfile);
  const statusCode = buildTripStatusCode(enrichedProfile);
  const nearestLegal =
    approxPoint &&
    locationContext.mode === "detected" &&
    enrichedProfile.status === "known" &&
    (status.level === "red" || enrichedProfile.risks.includes("border_crossing"))
      ? findNearestLegalForProfile(enrichedProfile, approxPoint)
      : null;
  const nearestBorder = pro
    ? findNearestBetterBorder({ country, region: region ?? undefined })
    : null;
  const offlineMeta = buildOfflineMeta(enrichedProfile);
  const viewModel = buildResultViewModel({
    profile: enrichedProfile,
    title,
    locationContext,
    meta: {
      ...baseViewModelMeta,
      ...offlineMeta,
      cacheHit: false,
      verifyReason: verifyReason ?? onDemandReason ?? null
    },
    extrasPreview: paid ? undefined : extrasPreview(buildExtrasItems(enrichedProfile)),
    extrasFull: paid ? buildExtrasItems(enrichedProfile) : undefined,
    nearestLegal: nearestLegal ?? undefined
  });

  const verificationPayload = buildVerification(enrichedProfile, isoMeta);
  return okResponse(requestId, {
    status,
    profile: enrichedProfile,
    machine_verified: enrichedProfile.machine_verified ?? null,
    ...wikiBlock,
    viewModel,
    nearest: nearestBorder ?? undefined,
    iso_meta: isoMeta,
    verify_links: buildVerifyLinks(enrichedProfile.sources, isoMeta),
    verification: verificationPayload,
    verification_level: verificationPayload.level,
    evidence_kind: verificationPayload.evidence_kind ?? "non_law",
    verify_status: verifyStatus ?? (verificationPayload.level === "machine_verified" ? "verified" : "pending"),
    verify_reason: verifyReason ?? null,
    meta: withRequestId({ cacheHit: false, statusCode, ssotChanged })
  });
}
