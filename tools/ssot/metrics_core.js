const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");

const ROOT = process.cwd();
const REPORTS_DIR = path.join(ROOT, "Reports");

const OFFICIAL_PATH = path.join(ROOT, "data", "official", "official_domains.ssot.json");
const WIKI_CLAIMS_PATH = path.join(ROOT, "data", "wiki", "wiki_claims_map.json");
const LEGALITY_PATH = path.join(ROOT, "data", "wiki", "ssot_legality_table.json");
const OFFICIAL_EVAL_PATH = path.join(ROOT, "data", "wiki", "wiki_official_eval.json");
const OFFICIAL_BADGES_PATH = path.join(ROOT, "data", "wiki", "wiki_official_badges.json");
const ENRICHED_PATH = path.join(ROOT, "data", "wiki", "wiki_claims_enriched.json");
const OFFICIAL_OWNERSHIP_PATH = path.join(ROOT, "data", "ssot", "official_link_ownership.json");
const US_STATES_WIKI_PATH = path.join(ROOT, "data", "ssot", "us_states_wiki.json");
const ALL_GEO_PATH = path.join(ROOT, "apps", "web", "src", "lib", "geo", "allGeo.ts");
const COVERAGE_PATH = path.join(REPORTS_DIR, "coverage.txt");
const COVERAGE_SNAPSHOT_PATH = path.join(REPORTS_DIR, "coverage.snapshot.json");

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function loadAllGeo() {
  if (!fs.existsSync(ALL_GEO_PATH)) return [];
  const raw = fs.readFileSync(ALL_GEO_PATH, "utf8");
  const match = raw.match(/ALL_GEO\s*:\s*string\[\]\s*=\s*\[([\s\S]*?)\]\s*;/);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => token.replace(/^['"]|['"]$/g, ""))
    .filter(Boolean)
    .map((geo) => String(geo).toUpperCase());
}

function isState(geo) {
  return /^US-/.test(String(geo || "").toUpperCase());
}

function hasStatus(claim) {
  if (!claim || typeof claim !== "object") return false;
  const fields = [
    claim.wiki_rec,
    claim.wiki_med,
    claim.recreational_status,
    claim.medical_status,
    claim.rec_status,
    claim.med_status
  ];
  return fields.some((v) => String(v || "").trim().length > 0);
}

function hasWikiNotes(claim) {
  if (!claim || typeof claim !== "object") return false;
  const notes = String(claim.notes_text || "").trim();
  return notes.length > 0;
}

function sourceCountFromClaim(claim) {
  if (!claim || typeof claim !== "object") return 0;
  const raw = Array.isArray(claim.sources)
    ? claim.sources
    : Array.isArray(claim.main_articles)
      ? claim.main_articles
      : [];
  const seen = new Set();
  let count = 0;
  for (const item of raw) {
    const title = String(item?.title || "").trim();
    const url = String(item?.url || "").trim();
    if (!title && !url) continue;
    const key = `${title}|${url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    count += 1;
  }
  if (count === 0) {
    const fallbackUrl = String(claim.source_url || claim.wiki_row_url || "").trim();
    const fallbackPage = String(claim.source_page || "").trim();
    if (fallbackUrl || fallbackPage) count = 1;
  }
  return count;
}

function filterOfficialDomains(domains) {
  if (!Array.isArray(domains)) return [];
  return domains.filter((domain) => {
    const value = String(domain || "").toLowerCase();
    return value && !value.endsWith("wikipedia.org");
  });
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function computeWorktreeDirty() {
  try {
    const out = childProcess.execSync("git status --porcelain", { encoding: "utf8" });
    const lines = out.split(/\r?\n/).filter(Boolean);
    const ignored = [
      "QUARANTINE/",
      "Reports/",
      ".checkpoints/",
      "apps/web/public/ssot/",
      "data/wiki/ssot_legality_table.json"
    ];
    const filtered = lines.filter((line) => {
      const file = line.slice(3).trim();
      return !ignored.some((prefix) => file.startsWith(prefix));
    });
    return filtered.length > 0 ? 1 : 0;
  } catch {
    return 0;
  }
}

function expectedSourceHint(geo) {
  if (isState(geo)) return "US_JURISDICTION";
  return "WIKI_COUNTRIES";
}

function normalizeCountryName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function writeCoverageReport(data) {
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const lines = [
    `COUNTRY_UNIVERSE_TOTAL=${data.COUNTRY_UNIVERSE_TOTAL}`,
    `REF_UNIVERSE_TOTAL=${data.REF_UNIVERSE_TOTAL}`,
    `ALL_GEO_TOTAL=${data.ALL_GEO_TOTAL}`,
    `WIKI_TABLE_ROWS=${data.WIKI_TABLE_ROWS}`,
    `WIKI_COUNTRY_ROWS=${data.WIKI_COUNTRY_ROWS}`,
    `WIKI_COUNTRY_ROWS_MATCHED_ISO=${data.WIKI_COUNTRY_ROWS_MATCHED_ISO}`,
    `WIKI_COUNTRY_MISSING=${data.WIKI_COUNTRY_MISSING}`,
    `COUNTRY_WIKI_ROWS=${data.COUNTRY_WIKI_ROWS}`,
    `COUNTRY_NOTES_WIKI_TOTAL=${data.COUNTRY_NOTES_WIKI_TOTAL}`,
    `COUNTRY_MISSING_TOTAL=${data.COUNTRY_MISSING_TOTAL}`,
    `COUNTRIES_ISO_TOTAL=${data.COUNTRIES_ISO_TOTAL}`,
    `COUNTRIES_WIKI_COVERED=${data.COUNTRIES_WIKI_COVERED}`,
    `COUNTRIES_MISSING=${data.COUNTRIES_MISSING}`,
    `NOTES_WIKI_COVERED=${data.NOTES_WIKI_COVERED}`,
    `US_STATES_TOTAL=${data.US_STATES_TOTAL}`,
    `US_STATES_COVERED_TOTAL=${data.US_STATES_COVERED_TOTAL}`,
    `US_STATES_MISSING_TOTAL=${data.US_STATES_MISSING_TOTAL}`,
    `US_STATES_COVERED=${data.US_STATES_COVERED}`,
    `US_STATES_MISSING=${data.US_STATES_MISSING}`,
    `US_STATES_MISSING_LIST=${Array.isArray(data.US_STATES_MISSING_LIST) ? data.US_STATES_MISSING_LIST.join(",") : "-"}`,
    `ISO_MISSING_LEGALITY=${data.ISO_MISSING_LEGALITY}`,
    `ISO_MISSING_LEGALITY_LIST=${data.ISO_MISSING_LEGALITY_LIST || "-"}`,
    `MISSING_ISO2_LIST=${Array.isArray(data.MISSING_ISO2_LIST) ? data.MISSING_ISO2_LIST.join(",") : "-"}`,
    `MISSING_REASON_MAP=${JSON.stringify(data.MISSING_REASON_MAP || {})}`,
    `WIKI_COUNTRY_ROWS_EMPTY_ISO=${data.WIKI_COUNTRY_ROWS_EMPTY_ISO}`,
    `WIKI_COUNTRY_ROWS_NON_ISO=${data.WIKI_COUNTRY_ROWS_NON_ISO}`,
    `WIKI_COUNTRY_ROWS_DUPLICATES=${data.WIKI_COUNTRY_ROWS_DUPLICATES}`,
    `WIKI_COVERED_TOTAL=${data.WIKI_COVERED_TOTAL}`,
    `WIKI_MISSING_TOTAL=${data.WIKI_MISSING_TOTAL}`,
    `LEGALITY_COVERED_TOTAL=${data.LEGALITY_COVERED_TOTAL}`,
    `LEGALITY_MISSING_TOTAL=${data.LEGALITY_MISSING_TOTAL}`,
    `SSOT_REF_COVERED=${data.SSOT_REF_COVERED}`,
    `SSOT_REF_MISSING=${data.SSOT_REF_MISSING}`,
    `STATUS_RECORD_COVERED_TOTAL=${data.STATUS_RECORD_COVERED_TOTAL}`,
    `STATUS_RECORD_MISSING_TOTAL=${data.STATUS_RECORD_MISSING_TOTAL}`,
    `COVERAGE_SOURCE_WIKI=${data.COVERAGE_SOURCE_WIKI}`,
    `COVERAGE_SOURCE_OFFICIAL=${data.COVERAGE_SOURCE_OFFICIAL}`,
    `COVERAGE_SOURCE_US_JURISDICTION=${data.COVERAGE_SOURCE_US_JURISDICTION}`,
    `COVERAGE_SOURCE_UNKNOWN=${data.COVERAGE_SOURCE_UNKNOWN}`,
    `OFFICIAL_REGISTRY_TOTAL=${data.OFFICIAL_REGISTRY_TOTAL}`,
    `OFFICIAL_GEO_ROWS_COVERED=${data.OFFICIAL_GEO_ROWS_COVERED}`,
    `OFFICIAL_GEO_ROWS_TOTAL=${data.OFFICIAL_GEO_ROWS_TOTAL}`,
    `OFFICIAL_GEO_ROWS_MISSING=${data.OFFICIAL_GEO_ROWS_MISSING}`,
    `NOTES_WIKI_NONEMPTY=${data.NOTES_WIKI_NONEMPTY}`,
    `NOTES_WIKI_EMPTY=${data.NOTES_WIKI_EMPTY}`,
    `NOTES_WIKI_TOTAL=${data.NOTES_WIKI_TOTAL}`,
    `WIKI_ONLY_TOTAL=${data.WIKI_ONLY_TOTAL}`,
    `WIKI_ONLY_EMPTY_SOURCES=${data.WIKI_ONLY_EMPTY_SOURCES}`,
    `OFFICIAL_LINKS_TOTAL=${data.OFFICIAL_LINKS_TOTAL}`,
    `SNAPSHOT_USED=${data.SNAPSHOT_USED}`,
    `SNAPSHOT_REASON=${data.SNAPSHOT_REASON}`,
    `CHANGE_REASON=${data.CHANGE_REASON}`
  ];
  if (data.STATUS_RECORD_MISSING_ITEMS.length > 0) {
    lines.push(`MISSING_LIST=${data.STATUS_RECORD_MISSING_ITEMS.map((item) => item.geo).join(",")}`);
    for (const item of data.STATUS_RECORD_MISSING_ITEMS.slice(0, 200)) {
      lines.push(
        `MISSING_ITEM=${item.geo}|${item.type}|${item.expectedSourceHint}|${item.missingReason}`
      );
    }
  } else {
    lines.push("MISSING_LIST=none");
  }
  lines.push(
    `INVARIANT=ALL_GEO_TOTAL(${data.ALL_GEO_TOTAL})=STATUS_RECORD_COVERED_TOTAL(${data.STATUS_RECORD_COVERED_TOTAL})+STATUS_RECORD_MISSING_TOTAL(${data.STATUS_RECORD_MISSING_TOTAL})`
  );
  fs.writeFileSync(COVERAGE_PATH, `${lines.join("\n")}\n`, "utf8");
}

function loadCoverageSnapshot() {
  const snapshot = readJson(COVERAGE_SNAPSHOT_PATH);
  return snapshot && typeof snapshot === "object" ? snapshot : null;
}

function saveCoverageSnapshot(data) {
  const snapshot = {
    ALL_GEO_TOTAL: data.ALL_GEO_TOTAL,
    WIKI_TABLE_ROWS: data.WIKI_TABLE_ROWS,
    WIKI_COUNTRY_ROWS: data.WIKI_COUNTRY_ROWS,
    WIKI_COUNTRY_MISSING: data.WIKI_COUNTRY_MISSING,
    LEGALITY_COVERED_TOTAL: data.LEGALITY_COVERED_TOTAL,
    LEGALITY_MISSING_TOTAL: data.LEGALITY_MISSING_TOTAL,
    STATUS_RECORD_COVERED_TOTAL: data.STATUS_RECORD_COVERED_TOTAL,
    STATUS_RECORD_MISSING_TOTAL: data.STATUS_RECORD_MISSING_TOTAL,
    NOTES_WIKI_EMPTY: data.NOTES_WIKI_EMPTY,
    NOTES_WIKI_TOTAL: data.NOTES_WIKI_TOTAL,
    WIKI_ONLY_TOTAL: data.WIKI_ONLY_TOTAL,
    WIKI_ONLY_EMPTY_SOURCES: data.WIKI_ONLY_EMPTY_SOURCES,
    COVERAGE_SOURCE_WIKI: data.COVERAGE_SOURCE_WIKI,
    COVERAGE_SOURCE_OFFICIAL: data.COVERAGE_SOURCE_OFFICIAL,
    COVERAGE_SOURCE_US_JURISDICTION: data.COVERAGE_SOURCE_US_JURISDICTION,
    COVERAGE_SOURCE_UNKNOWN: data.COVERAGE_SOURCE_UNKNOWN,
    saved_at: new Date().toISOString()
  };
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(COVERAGE_SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

function computeMetrics() {
  const officialPayload = readJson(OFFICIAL_PATH);
  if (!officialPayload || !Array.isArray(officialPayload.domains)) {
    return { ok: false, reason: "OFFICIAL_SSOT_MISSING" };
  }
  const wiki = readJson(WIKI_CLAIMS_PATH);
  if (!wiki || typeof wiki.items !== "object") {
    return { ok: false, reason: "WIKI_SSOT_MISSING" };
  }
  const allGeoKeys = loadAllGeo();
  if (!allGeoKeys.length) {
    return { ok: false, reason: "ALL_GEO_MISSING" };
  }
  const legality = readJson(LEGALITY_PATH);
  const officialEval = readJson(OFFICIAL_EVAL_PATH);
  const officialBadges = readJson(OFFICIAL_BADGES_PATH);
  const enriched = readJson(ENRICHED_PATH);
  const officialOwnership = readJson(OFFICIAL_OWNERSHIP_PATH);
  const usStatesWiki = readJson(US_STATES_WIKI_PATH);
  const officialEvalItems =
    officialEval && typeof officialEval.items === "object" ? officialEval.items : {};
  const officialBadgeItems =
    officialBadges && typeof officialBadges.items === "object" ? officialBadges.items : {};
  const enrichedItems =
    enriched && typeof enriched.items === "object" ? enriched.items : {};
  const effectiveOwnershipCountrySet = new Set(
    (Array.isArray(officialOwnership?.items) ? officialOwnership.items : [])
      .filter((item) => {
        if (!item?.effective) return false;
        if (!["country", "state", "multi_geo"].includes(String(item.owner_scope || ""))) return false;
        if (!["STRONG_OFFICIAL", "WEAK_OFFICIAL"].includes(String(item.ownership_quality || ""))) return false;
        if (String(item.exclusion_reason || "none") !== "none") return false;
        return true;
      })
      .flatMap((item) => (Array.isArray(item.owner_geos) ? item.owner_geos : []))
      .map((geo) => String(geo || "").toUpperCase())
      .filter((geo) => /^[A-Z]{2}$/.test(geo))
  );

  const wikiItems = wiki.items || {};
  const wikiSet = Object.keys(wikiItems).map((key) => String(key).toUpperCase());
  const legalityRows = Array.isArray(legality?.rows) ? legality.rows : [];
  const legalitySet = new Set(
    legalityRows
      .map((row) => String(row?.iso2 || "").toUpperCase())
      .filter(Boolean)
  );

  const allCountries = allGeoKeys.filter((geo) => !isState(geo) && geo !== "US");
  const allCountriesSet = new Set(allCountries);
  const allStates = allGeoKeys.filter((geo) => isState(geo));
  const usStatesSet = new Set(
    (Array.isArray(usStatesWiki?.items) ? usStatesWiki.items : [])
      .map((row) => String(row?.geo || "").toUpperCase())
      .filter((geo) => /^US-[A-Z]{2}$/.test(geo))
  );
  const legalityCountries = allCountries.filter((geo) => legalitySet.has(geo));
  const legalityStates = allStates.filter((geo) => legalitySet.has(geo));
  const countryIsoCounts = new Map();
  const countryNameToIso = new Map();
  for (const [geo, claim] of Object.entries(wikiItems || {})) {
    const iso = String(geo || "").toUpperCase();
    if (!/^[A-Z]{2}$/.test(iso) || iso === "US") continue;
    const normalized = normalizeCountryName(
      claim?.country || claim?.name || claim?.geo_name || ""
    );
    if (!normalized || countryNameToIso.has(normalized)) continue;
    countryNameToIso.set(normalized, iso);
  }
  let wikiCountryRowsEmptyIso = 0;
  let wikiCountryRowsNonIso = 0;
  const noIsoMatchSet = new Set();
  for (const row of legalityRows) {
    const iso = String(row?.iso2 || "").toUpperCase();
    const countryName = normalizeCountryName(row?.country || "");
    const matchedIsoByName = countryNameToIso.get(countryName) || "";
    if (!iso) {
      wikiCountryRowsEmptyIso += 1;
      if (matchedIsoByName) noIsoMatchSet.add(matchedIsoByName);
      continue;
    }
    if (isState(iso) || iso === "US") continue;
    if (!allCountriesSet.has(iso)) {
      wikiCountryRowsNonIso += 1;
      if (matchedIsoByName) noIsoMatchSet.add(matchedIsoByName);
      continue;
    }
    countryIsoCounts.set(iso, (countryIsoCounts.get(iso) || 0) + 1);
  }
  let wikiCountryRowsDuplicates = 0;
  for (const count of countryIsoCounts.values()) {
    if (count > 1) wikiCountryRowsDuplicates += count - 1;
  }
  for (const iso of noIsoMatchSet) {
    if (legalitySet.has(iso)) noIsoMatchSet.delete(iso);
  }

  const sourceCounts = { WIKI: 0, OFFICIAL: 0, US_JURISDICTION: 0, UNKNOWN: 0 };
  const statusMissingItems = [];
  let notesWikiTotal = 0;
  let wikiOnlyTotal = 0;
  let wikiOnlyEmptySources = 0;
  let officialGeoCoverageRowsCovered = 0;
  let officialGeoCoverageRowsTotal = 0;

  const validWikiCountryRows = legalityRows.filter((row) => {
    const iso = String(row?.iso2 || "").toUpperCase();
    return /^[A-Z]{2}$/.test(iso);
  });

  for (const row of validWikiCountryRows) {
    const iso = String(row?.iso2 || "").toUpperCase();
    const geoKey = String(iso).toUpperCase();
    officialGeoCoverageRowsTotal += 1;
    if (effectiveOwnershipCountrySet.has(geoKey)) officialGeoCoverageRowsCovered += 1;
  }

  for (const geo of allGeoKeys) {
    const claim = wikiItems[geo];
    const primary = String(claim?.primary_source || claim?.source_type || "").toUpperCase();
    const officialForGeo = Number(officialEvalItems?.[geo]?.sources_official || 0) > 0;
    const sourcePresent = Boolean(claim) || officialForGeo;
    const statusPresent = hasStatus(claim);
    const shapePresent = true;
    const missingReason = !sourcePresent
      ? "NO_SOURCE"
      : !statusPresent
        ? "NO_STATUS"
        : !shapePresent
          ? "NO_SHAPE"
          : "";

    if (missingReason) {
      statusMissingItems.push({
        geo,
        name: String(claim?.country || claim?.name || claim?.geo_name || geo),
        type: geo === "US" ? "us" : isState(geo) ? "state" : "country",
        expectedSourceHint: expectedSourceHint(geo),
        missingReason
      });
      sourceCounts.UNKNOWN += 1;
      continue;
    }

    if (primary === "WIKI_US_JURISDICTION") {
      sourceCounts.US_JURISDICTION += 1;
    } else if (officialForGeo) {
      sourceCounts.OFFICIAL += 1;
    } else if (claim) {
      sourceCounts.WIKI += 1;
    } else {
      sourceCounts.UNKNOWN += 1;
    }

    if (legalitySet.has(geo) && !isState(geo) && geo !== "US" && hasWikiNotes(claim)) {
      notesWikiTotal += 1;
    }
    const sourceFlag = String(claim?.source || "").toLowerCase();
    const wikiOnly =
      Boolean(claim) &&
      !officialForGeo &&
      hasStatus(claim) &&
      (primary.includes("WIKI") || sourceFlag === "countries" || sourceFlag === "states");
    if (wikiOnly) {
      wikiOnlyTotal += 1;
      if (sourceCountFromClaim(claim) === 0) {
        wikiOnlyEmptySources += 1;
      }
    }
  }

  statusMissingItems.sort((a, b) => {
    const rank = (row) => (row.type === "state" ? 1 : 0);
    const rankDiff = rank(a) - rank(b);
    if (rankDiff !== 0) return rankDiff;
    return a.geo.localeCompare(b.geo);
  });

  const officialDomainsFiltered = filterOfficialDomains(officialPayload.domains);
  const ALL_GEO_TOTAL = allGeoKeys.length;
  const WIKI_SET_TOTAL = wikiSet.length;
  const WIKI_COUNTRY_TOTAL = wikiSet.filter((geo) => !isState(geo) && geo !== "US").length;
  const WIKI_STATES_TOTAL = wikiSet.filter((geo) => isState(geo)).length;
  const LEGALITY_TABLE_ROWS = legalityRows.length;
  const LEGALITY_COVERED_TOTAL = legalityCountries.length + legalityStates.length;
  const LEGALITY_MISSING_COUNTRIES_TOTAL = allCountries.length - legalityCountries.length;
  const LEGALITY_MISSING_STATES_TOTAL = allStates.length - legalityStates.length;
  const LEGALITY_MISSING_TOTAL = LEGALITY_MISSING_COUNTRIES_TOTAL + LEGALITY_MISSING_STATES_TOTAL;
  const STATUS_RECORD_COVERED_TOTAL = ALL_GEO_TOTAL - statusMissingItems.length;
  const STATUS_RECORD_MISSING_TOTAL = statusMissingItems.length;
  const COUNTRY_UNIVERSE_TOTAL = allCountries.length;
  const REF_UNIVERSE_TOTAL = ALL_GEO_TOTAL;
  const WIKI_COUNTRY_ROWS_MATCHED_ISO = legalityCountries.length;
  const WIKI_COUNTRY_ROWS = LEGALITY_TABLE_ROWS;
  const WIKI_COUNTRY_MISSING = COUNTRY_UNIVERSE_TOTAL - WIKI_COUNTRY_ROWS_MATCHED_ISO;
  const ISO_MISSING_LEGALITY = WIKI_COUNTRY_MISSING;
  const missingIso2List = allCountries
    .filter((geo) => !legalitySet.has(geo))
    .sort();
  const ISO_MISSING_LEGALITY_LIST = missingIso2List.join(",");
  const missingReasonMap = Object.fromEntries(
    missingIso2List.map((iso) => [
      iso,
      noIsoMatchSet.has(iso) ? "NO_ISO_MATCH" : "NO_WIKI_ROW"
    ])
  );
  const WIKI_COVERED_TOTAL = WIKI_COUNTRY_ROWS_MATCHED_ISO;
  const WIKI_MISSING_TOTAL = WIKI_COUNTRY_MISSING;
  const NOTES_WIKI_NONEMPTY = notesWikiTotal;
  const NOTES_WIKI_EMPTY = Math.max(0, WIKI_COUNTRY_ROWS - NOTES_WIKI_NONEMPTY);
  const NOTES_WIKI_TOTAL = WIKI_COUNTRY_ROWS;
  const COUNTRY_WIKI_ROWS = WIKI_COUNTRY_ROWS;
  const COUNTRY_NOTES_WIKI_TOTAL = NOTES_WIKI_NONEMPTY;
  const COUNTRY_MISSING_TOTAL = WIKI_COUNTRY_MISSING;
  const US_STATES_TOTAL = allStates.length;
  const US_STATES_COVERED_TOTAL = allStates.filter((geo) => usStatesSet.has(geo)).length;
  const US_STATES_MISSING_TOTAL = US_STATES_TOTAL - US_STATES_COVERED_TOTAL;
  const US_STATES_MISSING_LIST = allStates.filter((geo) => !usStatesSet.has(geo)).sort();
  const SSOT_REF_COVERED = STATUS_RECORD_COVERED_TOTAL;
  const SSOT_REF_MISSING = STATUS_RECORD_MISSING_TOTAL;
  const OFFICIAL_LINKS_TOTAL = officialDomainsFiltered.length;
  const OFFICIAL_REGISTRY_TOTAL = Array.isArray(officialPayload.domains) ? officialPayload.domains.length : 0;
  const CHANGE_REASON = process.env.SSOT_CHANGE_REASON || "UNSPECIFIED";

  const metrics = {
    GEO_TOTAL: ALL_GEO_TOTAL,
    ALL_GEO_TOTAL,
    COUNTRY_UNIVERSE_TOTAL,
    REF_UNIVERSE_TOTAL,
    ALL_COUNTRIES_TOTAL: allCountries.length,
    STATES_TOTAL: allStates.length,
    HAS_USA: allGeoKeys.includes("US") ? 1 : 0,
    GEO_TOTAL_RENDERABLE: ALL_GEO_TOTAL,
    WIKI_SET_TOTAL,
    WIKI_COUNTRY_TOTAL,
    WIKI_STATES_TOTAL,
    WIKI_NOTES_NONEMPTY: NOTES_WIKI_NONEMPTY,
    WIKI_NOTES_EMPTY: NOTES_WIKI_EMPTY,
    NOTES_WIKI_NONEMPTY,
    NOTES_WIKI_EMPTY,
    NOTES_WIKI_TOTAL,
    WIKI_ONLY_TOTAL: wikiOnlyTotal,
    WIKI_ONLY_EMPTY_SOURCES: wikiOnlyEmptySources,
    LEGALITY_TABLE_ROWS,
    LEGALITY_COVERED_TOTAL,
    LEGALITY_MISSING_TOTAL,
    WIKI_COUNTRY_ROWS,
    WIKI_COUNTRY_ROWS_MATCHED_ISO,
    WIKI_COUNTRY_MISSING,
    COUNTRY_WIKI_ROWS,
    COUNTRY_NOTES_WIKI_TOTAL,
    COUNTRY_MISSING_TOTAL,
    COUNTRIES_ISO_TOTAL: COUNTRY_UNIVERSE_TOTAL,
    COUNTRIES_WIKI_COVERED: WIKI_COUNTRY_ROWS_MATCHED_ISO,
    COUNTRIES_MISSING: WIKI_COUNTRY_MISSING,
    NOTES_WIKI_COVERED: NOTES_WIKI_NONEMPTY,
    ISO_MISSING_LEGALITY,
    ISO_MISSING_LEGALITY_LIST,
    MISSING_ISO2_LIST: missingIso2List,
    MISSING_REASON_MAP: missingReasonMap,
    WIKI_COUNTRY_ROWS_EMPTY_ISO: wikiCountryRowsEmptyIso,
    WIKI_COUNTRY_ROWS_NON_ISO: wikiCountryRowsNonIso,
    WIKI_COUNTRY_ROWS_DUPLICATES: wikiCountryRowsDuplicates,
    WIKI_COVERED_TOTAL,
    WIKI_MISSING_TOTAL,
    US_STATES_TOTAL,
    US_STATES_COVERED_TOTAL,
    US_STATES_MISSING_TOTAL,
    US_STATES_COVERED: US_STATES_COVERED_TOTAL,
    US_STATES_MISSING: US_STATES_MISSING_TOTAL,
    US_STATES_MISSING_LIST,
    LEGALITY_MISSING_COUNTRIES_TOTAL,
    LEGALITY_MISSING_STATES_TOTAL,
    WIKI_TABLE_ROWS: LEGALITY_TABLE_ROWS,
    WIKI_TABLE_MISSING_COUNTRIES_TOTAL: LEGALITY_MISSING_COUNTRIES_TOTAL,
    WIKI_TABLE_MISSING_STATES_TOTAL: LEGALITY_MISSING_STATES_TOTAL,
    STATUS_RECORD_COVERED_TOTAL,
    STATUS_RECORD_MISSING_TOTAL,
    SSOT_REF_COVERED,
    SSOT_REF_MISSING,
    SSOT_COVERED_TOTAL: SSOT_REF_COVERED,
    SSOT_MISSING_TOTAL: SSOT_REF_MISSING,
    STATUS_RECORD_MISSING_ITEMS: statusMissingItems,
    COVERAGE_SOURCE_WIKI: sourceCounts.WIKI,
    COVERAGE_SOURCE_OFFICIAL: sourceCounts.OFFICIAL,
    COVERAGE_SOURCE_US_JURISDICTION: sourceCounts.US_JURISDICTION,
    COVERAGE_SOURCE_UNKNOWN: sourceCounts.UNKNOWN,
    OFFICIAL_LINKS_TOTAL,
    OFFICIAL_REGISTRY_TOTAL,
    OFFICIAL_GEO_ROWS_TOTAL: officialGeoCoverageRowsTotal,
    OFFICIAL_GEO_ROWS_COVERED: officialGeoCoverageRowsCovered,
    OFFICIAL_GEO_ROWS_MISSING: Math.max(0, officialGeoCoverageRowsTotal - officialGeoCoverageRowsCovered),
    CHANGE_REASON,
    SNAPSHOT_USED: 0,
    SNAPSHOT_REASON: "-"
  };

  const snapshot = loadCoverageSnapshot();
  const allowShrink =
    CHANGE_REASON === "STATUS_CHANGED" ||
    CHANGE_REASON === "RESET" ||
    CHANGE_REASON === "REBUILD";
  const snapshotReasons = [];
  if (snapshot && !allowShrink) {
    const watched = [
      "WIKI_COUNTRY_ROWS",
      "NOTES_WIKI_TOTAL",
      "SSOT_REF_COVERED"
    ];
    for (const key of watched) {
      const snapValue = Number(snapshot[key] || 0);
      const curValue = Number(metrics[key] || 0);
      if (curValue < snapValue) {
        metrics[key] = snapValue;
        snapshotReasons.push(`${key}:${curValue}->${snapValue}`);
      }
    }
  }
  if (snapshotReasons.length > 0) {
    metrics.SNAPSHOT_USED = 1;
    metrics.SNAPSHOT_REASON = snapshotReasons.join(",");
    metrics.STATUS_RECORD_MISSING_TOTAL = Math.max(
      0,
      metrics.ALL_GEO_TOTAL - metrics.STATUS_RECORD_COVERED_TOTAL
    );
  } else {
    saveCoverageSnapshot(metrics);
  }

  writeCoverageReport(metrics);

  const geoOk = metrics.GEO_TOTAL === 300;
  const officialOk = Number(metrics.OFFICIAL_LINKS_TOTAL || 0) >= 418;
  const wikiSourcesOk = Number(metrics.WIKI_ONLY_EMPTY_SOURCES || 0) === 0;
  const shrinkDetected = geoOk && officialOk ? 0 : 1;
  const metricsOk = shrinkDetected === 0 && geoOk && officialOk && wikiSourcesOk;
  const worktreeDirty = computeWorktreeDirty();

  return {
    ok: true,
    ...metrics,
    SHRINK_DETECTED: shrinkDetected,
    SSOT_METRICS_OK: metricsOk ? 1 : 0,
    WORKTREE_DIRTY: worktreeDirty
  };
}

module.exports = { computeMetrics };
