import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const args = process.argv.slice(2);
let prevPath = null;
let verifySourcesMeta = false;
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--prev") {
    prevPath = args[i + 1] || null;
    i += 1;
  }
  if (args[i] === "--verify-sources-meta") {
    verifySourcesMeta = true;
  }
}

const CLAIMS_PATH = path.join(ROOT, "data", "wiki_ssot", "wiki_claims.json");
const REFS_PATH = path.join(ROOT, "data", "wiki_ssot", "wiki_refs.json");
const MAP_PATH = path.join(ROOT, "data", "wiki", "wiki_claims_map.json");
const ALLOWLIST_PATH = path.join(ROOT, "data", "sources", "official_allowlist.json");
const ALLOWLIST_DOMAINS_PATH = path.join(ROOT, "data", "sources", "allowlist_domains.json");
const ALLOW_DOMAINS_PATH = path.join(ROOT, "data", "sources", "allow_domains.json");
const OFFICIAL_DOMAINS_WHITELIST_PATH = path.join(
  ROOT,
  "data",
  "sources",
  "official_domains_whitelist.json"
);
const OFFICIAL_CATALOG_PATH = path.join(ROOT, "data", "sources", "official_catalog.json");
const ENRICHED_PATH = path.join(ROOT, "data", "wiki", "wiki_claims_enriched.json");
const OFFICIAL_REGISTRY_PATH = path.join(ROOT, "data", "sources", "official_registry.json");
const SOURCES_REGISTRY_PATH = path.join(ROOT, "data", "sources", "sources_registry.json");
const WIKIDATA_CANDIDATES_PATH = path.join(ROOT, "data", "sources", "wikidata_candidates.json");
const WIKIDATA_VALIDATED_PATH = path.join(ROOT, "data", "sources", "wikidata_validated.json");

const requiredFiles = [
  CLAIMS_PATH,
  REFS_PATH,
  MAP_PATH,
  ALLOWLIST_PATH,
  ALLOWLIST_DOMAINS_PATH,
  ALLOW_DOMAINS_PATH,
  OFFICIAL_DOMAINS_WHITELIST_PATH,
  OFFICIAL_CATALOG_PATH,
  OFFICIAL_REGISTRY_PATH,
  SOURCES_REGISTRY_PATH,
  WIKIDATA_CANDIDATES_PATH,
  WIKIDATA_VALIDATED_PATH
];

function readJsonStrict(file) {
  if (!fs.existsSync(file)) {
    return { ok: false, reason: `MISSING:${path.basename(file)}` };
  }
  try {
    const raw = fs.readFileSync(file, "utf8");
    return { ok: true, data: JSON.parse(raw) };
  } catch (err) {
    return { ok: false, reason: `INVALID_JSON:${path.basename(file)}` };
  }
}

function collectMtimeMs(file) {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function countClaims(payload) {
  if (!payload) return 0;
  if (Array.isArray(payload)) return payload.length;
  if (Array.isArray(payload.countries) || Array.isArray(payload.states)) {
    return (payload.countries?.length || 0) + (payload.states?.length || 0);
  }
  if (payload.items && typeof payload.items === "object") {
    return Object.keys(payload.items).length;
  }
  return 0;
}

function countRefs(payload) {
  const items = payload?.items || payload;
  if (!items || typeof items !== "object") return 0;
  if (Array.isArray(items)) {
    return items.reduce((sum, entry) => sum + (Array.isArray(entry?.refs) ? entry.refs.length : 0), 0);
  }
  let total = 0;
  for (const value of Object.values(items)) {
    if (Array.isArray(value)) total += value.length;
    else if (Array.isArray(value?.refs)) total += value.refs.length;
  }
  return total;
}

function countOfficialLinks(payload) {
  const items = payload?.items || payload;
  if (!items || typeof items !== "object") return 0;
  let total = 0;
  for (const list of Object.values(items)) {
    const entries = Array.isArray(list) ? list : [];
    for (const entry of entries) {
      if (entry?.official === true) total += 1;
    }
  }
  return total;
}

function countMap(payload) {
  const items = payload?.items || payload;
  if (!items || typeof items !== "object") return 0;
  return Object.keys(items).length;
}

function countAllowlist(payload) {
  if (!payload || typeof payload !== "object") return 0;
  if (Array.isArray(payload)) return payload.length;
  if (Array.isArray(payload.domains)) return payload.domains.length;
  return 0;
}

function hashAllowlist(payload) {
  const domains = Array.isArray(payload?.domains)
    ? payload.domains
    : Array.isArray(payload)
      ? payload
      : [];
  const normalized = domains.map((value) => String(value || "").trim()).filter(Boolean).join("\n");
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

function normalizeDomain(raw) {
  let value = String(raw || "").trim();
  if (!value) return "";
  value = value.replace(/^[a-z]+:\/\//i, "");
  value = value.replace(/\/.*$/, "");
  value = value.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  if (!value.includes(".")) return "";
  return value;
}

function extractDomainList(payload) {
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.domains)) return payload.domains;
  if (Array.isArray(payload.allowed)) return payload.allowed;
  if (Array.isArray(payload.allow_suffixes)) return payload.allow_suffixes;
  if (payload.country_allow_domains && typeof payload.country_allow_domains === "object") {
    return Object.values(payload.country_allow_domains).flat();
  }
  return [];
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => JSON.stringify(key) + ":" + stableStringify(value[key])).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashPayload(payload) {
  return crypto.createHash("sha256").update(stableStringify(payload)).digest("hex");
}

function countWikidataCandidates(payload) {
  const candidates = payload?.candidates && typeof payload.candidates === "object" ? payload.candidates : {};
  let total = 0;
  for (const list of Object.values(candidates)) {
    if (Array.isArray(list)) total += list.length;
  }
  return total;
}

function computeSourceMeta(filePath, kind) {
  const payload = readJson(filePath, null);
  if (!payload) return { count: 0, hash: "0" };
  if (kind === "domains") {
    const domains = extractDomainList(payload).map(normalizeDomain).filter(Boolean);
    const unique = Array.from(new Set(domains)).sort();
    const hash = crypto.createHash("sha256").update(unique.join("\n")).digest("hex");
    return { count: unique.length, hash };
  }
  if (kind === "wikidata") {
    return { count: countWikidataCandidates(payload), hash: hashPayload(payload) };
  }
  return { count: countRegistry(payload), hash: hashPayload(payload) };
}

function countRegistry(payload) {
  if (!payload) return 0;
  if (Array.isArray(payload)) return payload.length;
  if (payload.items && typeof payload.items === "object") {
    return Object.keys(payload.items).length;
  }
  if (payload.domains && typeof payload.domains === "object") {
    return Array.isArray(payload.domains) ? payload.domains.length : Object.keys(payload.domains).length;
  }
  if (payload.records && typeof payload.records === "object") {
    return Object.keys(payload.records).length;
  }
  if (typeof payload === "object") return Object.keys(payload).length;
  return 0;
}

function countNotesNonEmpty(payload) {
  const items = payload?.items || payload;
  if (!items) return 0;
  const list = Array.isArray(items) ? items : Object.values(items);
  let total = 0;
  for (const entry of list) {
    const text = typeof entry?.notes_text === "string" ? entry.notes_text.trim() : "";
    if (text.length > 0) total += 1;
  }
  return total;
}

function countNotesRows(payload) {
  const items = payload?.items || payload;
  if (!items) return 0;
  const list = Array.isArray(items) ? items : Object.values(items);
  let total = 0;
  for (const entry of list) {
    if (entry && Object.prototype.hasOwnProperty.call(entry, "notes_text")) {
      total += 1;
    }
  }
  return total;
}

function countNotesWeak(payload) {
  const items = payload?.items || payload;
  if (!items) return 0;
  const list = Array.isArray(items) ? items : Object.values(items);
  let total = 0;
  for (const entry of list) {
    const text = typeof entry?.notes_text === "string" ? entry.notes_text.trim() : "";
    const main =
      Array.isArray(entry?.notes_main_articles)
        ? entry.notes_main_articles
        : Array.isArray(entry?.main_articles)
          ? entry.main_articles
          : entry?.notes_main_article
            ? [entry.notes_main_article]
            : [];
    if (!text && main.length > 0) total += 1;
  }
  return total;
}

function parseNotesCoverageLine(line) {
  if (!line) return null;
  const match = (key) => {
    const m = line.match(new RegExp(`${key}=([0-9]+)`));
    return m ? Number(m[1]) : null;
  };
  return {
    total: match("total_geo"),
    withNotes: match("with_notes"),
    empty: match("empty"),
    placeholder: match("placeholder"),
    weak: match("weak")
  };
}

function readNotesCoverage(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const line = raw.split("\n").find((entry) => entry.startsWith("NOTES_COVERAGE "));
    return parseNotesCoverageLine(line);
  } catch {
    return null;
  }
}

const GOLDEN_BASELINE_PATH = path.join(ROOT, "data", "baselines", "ssot_prev_snapshot.json");
const REPORT_SNAPSHOT_PATH = path.join(ROOT, "Reports", "ssot_snapshot.json");

function resolvePrevPath() {
  if (fs.existsSync(GOLDEN_BASELINE_PATH)) return GOLDEN_BASELINE_PATH;
  if (prevPath && fs.existsSync(prevPath)) return prevPath;
  if (fs.existsSync(REPORT_SNAPSHOT_PATH)) return REPORT_SNAPSHOT_PATH;
  return prevPath || null;
}

const resolvedPrevPath = resolvePrevPath();
const prevPayload = resolvedPrevPath ? readJson(resolvedPrevPath, null) : null;
const baselineMissing = !resolvedPrevPath || !prevPayload;
const prevClaims = prevPayload?.claims ?? null;
const prevRefs = prevPayload?.refs ?? null;
const prevMap = prevPayload?.map ?? null;
const prevAllowlist = prevPayload?.allowlist ?? null;
const prevOfficialRegistry = prevPayload?.officialRegistry ?? null;
const prevSourcesRegistry = prevPayload?.sourcesRegistry ?? null;
const prevWikidataCandidates = prevPayload?.wikidataCandidates ?? null;
const prevSourcesMeta = prevPayload?.sources_meta ?? null;
const notesCoveragePath = path.join(ROOT, "Reports", "notes-coverage.txt");
const currentNotesCoverage = readNotesCoverage(notesCoveragePath);
const prevNotesCoverage = prevPayload?.notes_coverage ?? prevPayload?.notesCoverage ?? null;
const prevReportSnapshot = readJson(REPORT_SNAPSHOT_PATH, null);
const prevNotesWithNotes = Number.isFinite(Number(prevNotesCoverage?.withNotes))
  ? Number(prevNotesCoverage.withNotes)
  : -1;
const prevNotesEmpty = Number.isFinite(Number(prevNotesCoverage?.empty))
  ? Number(prevNotesCoverage.empty)
  : -1;
const prevNotesPlaceholder = Number.isFinite(Number(prevNotesCoverage?.placeholder))
  ? Number(prevNotesCoverage.placeholder)
  : -1;
const prevNotesWeakCoverage = Number.isFinite(Number(prevNotesCoverage?.weak))
  ? Number(prevNotesCoverage.weak)
  : -1;
const newNotesWithNotes = Number.isFinite(Number(currentNotesCoverage?.withNotes))
  ? Number(currentNotesCoverage.withNotes)
  : -1;
const newNotesEmpty = Number.isFinite(Number(currentNotesCoverage?.empty))
  ? Number(currentNotesCoverage.empty)
  : -1;
const newNotesPlaceholder = Number.isFinite(Number(currentNotesCoverage?.placeholder))
  ? Number(currentNotesCoverage.placeholder)
  : -1;
const newNotesWeakCoverage = Number.isFinite(Number(currentNotesCoverage?.weak))
  ? Number(currentNotesCoverage.weak)
  : -1;

const validation = requiredFiles.map((file) => readJsonStrict(file));
const invalid = validation.find((entry) => !entry.ok);
const currentClaimsPayload = readJson(CLAIMS_PATH, null);
const currentRefsPayload = readJson(REFS_PATH, null);
const currentMapPayload = readJson(MAP_PATH, null);
const currentAllowlistPayload = readJson(ALLOWLIST_PATH, null);
const currentAllowlistDomainsPayload = readJson(ALLOWLIST_DOMAINS_PATH, null);
const currentAllowDomainsPayload = readJson(ALLOW_DOMAINS_PATH, null);
const currentOfficialDomainsWhitelistPayload = readJson(OFFICIAL_DOMAINS_WHITELIST_PATH, null);
const currentEnrichedPayload = readJson(ENRICHED_PATH, null);
const currentOfficialRegistryPayload = readJson(OFFICIAL_REGISTRY_PATH, null);
const currentSourcesRegistryPayload = readJson(SOURCES_REGISTRY_PATH, null);
const currentWikidataCandidatesPayload = readJson(WIKIDATA_CANDIDATES_PATH, null);
const currentWikidataValidatedPayload = readJson(WIKIDATA_VALIDATED_PATH, null);

const prevGeo = prevClaims ? countClaims(prevClaims) : 0;
const prevRefsCount = prevRefs ? countRefs(prevRefs) : 0;
const prevMapCount = prevMap ? countMap(prevMap) : 0;
const prevAllowCount = prevAllowlist ? countAllowlist(prevAllowlist) : 0;
const prevOfficialRegistryCount = prevOfficialRegistry ? countRegistry(prevOfficialRegistry) : 0;
const prevSourcesRegistryCount = prevSourcesRegistry ? countRegistry(prevSourcesRegistry) : 0;
const prevWikidataCandidatesCount = prevWikidataCandidates ? countRegistry(prevWikidataCandidates) : 0;
const prevNotesNonEmpty = prevClaims ? countNotesNonEmpty(prevClaims) : 0;
const prevNotesRows = prevClaims ? countNotesRows(prevClaims) : 0;
const prevNotesWeak = prevClaims ? countNotesWeak(prevClaims) : 0;

const newGeo = countClaims(currentClaimsPayload);
const newRefsCount = countRefs(currentRefsPayload);
const newMapCount = countMap(currentMapPayload);
const newAllowCount = countAllowlist(currentAllowlistPayload);
const newOfficialRegistryCount = countRegistry(currentOfficialRegistryPayload);
const newSourcesRegistryCount = countRegistry(currentSourcesRegistryPayload);
const newWikidataCandidatesCount = countRegistry(currentWikidataCandidatesPayload);
const newNotesNonEmpty = countNotesNonEmpty(currentClaimsPayload);
const newNotesRows = countNotesRows(currentClaimsPayload);
const newNotesWeak = countNotesWeak(currentClaimsPayload);
const prevOfficialLinksCount = Number.isFinite(Number(prevPayload?.official_links_count))
  ? Number(prevPayload.official_links_count)
  : Number.isFinite(Number(prevReportSnapshot?.official_links_count))
    ? Number(prevReportSnapshot.official_links_count)
    : -1;
const newOfficialLinksCount = countOfficialLinks(currentEnrichedPayload);

const allowShrink =
  String(process.env.ALLOW_SHRINK || "") === "1" ||
  String(process.env.ALLOW_DATA_SHRINK || "") === "1";
const shrinkReason = String(process.env.SHRINK_REASON || "").trim();
const allowNotesShrink = String(process.env.ALLOW_NOTES_SHRINK || "") === "1";
const guardLines = [];
const sourceFiles = [
  { key: "allowlist_domains", path: ALLOWLIST_DOMAINS_PATH, kind: "domains" },
  { key: "allow_domains", path: ALLOW_DOMAINS_PATH, kind: "domains" },
  { key: "official_domains_whitelist", path: OFFICIAL_DOMAINS_WHITELIST_PATH, kind: "domains" },
  { key: "official_catalog", path: OFFICIAL_CATALOG_PATH, kind: "registry" },
  { key: "official_allowlist", path: ALLOWLIST_PATH, kind: "domains" },
  { key: "official_registry", path: OFFICIAL_REGISTRY_PATH, kind: "registry" },
  { key: "sources_registry", path: SOURCES_REGISTRY_PATH, kind: "registry" },
  { key: "wikidata_candidates", path: WIKIDATA_CANDIDATES_PATH, kind: "wikidata" },
  { key: "wikidata_validated", path: WIKIDATA_VALIDATED_PATH, kind: "wikidata" }
];
const currentSourcesMeta = {};
for (const file of sourceFiles) {
  currentSourcesMeta[file.key] = computeSourceMeta(file.path, file.kind);
}
const prevSourcesMetaResolved = prevSourcesMeta && typeof prevSourcesMeta === "object"
  ? prevSourcesMeta
  : {};
const sourceShrink = [];
const sourceGuardLines = [];
for (const file of sourceFiles) {
  const prevMeta = prevSourcesMetaResolved[file.key];
  const prevCount = Number(prevMeta?.count || 0);
  const newMeta = currentSourcesMeta[file.key];
  const newCount = Number(newMeta?.count || 0);
  const relPath = path.relative(ROOT, file.path);
  let status = "PASS";
  if (prevCount > 0 && newCount < prevCount && !allowShrink) {
    sourceShrink.push(`${file.key}:${prevCount}->${newCount}`);
    status = "FAIL";
  }
  sourceGuardLines.push(
    `DATA_SHRINK_GUARD file=${relPath} prev=${prevCount} now=${newCount} status=${status} reason=${status === "FAIL" ? "SHRINK" : "OK"}`
  );
  guardLines.push(
    `SOURCES_META file=${file.key} prev_count=${prevCount} new_count=${newCount} prev_hash=${String(prevMeta?.hash || "0")} new_hash=${String(newMeta?.hash || "0")}`
  );
}
if (invalid) {
  guardLines.push(`SSOT_VALID=0 reason=${invalid.reason}`);
  guardLines.push(
    `DATA_SHRINK_GUARD kind=INVALID prev_geo=${prevGeo} new_geo=${newGeo} prev_refs=${prevRefsCount} new_refs=${newRefsCount} prev_map=${prevMapCount} new_map=${newMapCount} prev_notes=${prevNotesNonEmpty} new_notes=${newNotesNonEmpty} prev_weak=${prevNotesWeak} new_weak=${newNotesWeak} prev_allowlist=${prevAllowCount} new_allowlist=${newAllowCount} prev_official_registry=${prevOfficialRegistryCount} new_official_registry=${newOfficialRegistryCount} prev_sources_registry=${prevSourcesRegistryCount} new_sources_registry=${newSourcesRegistryCount} prev_wikidata_candidates=${prevWikidataCandidatesCount} new_wikidata_candidates=${newWikidataCandidatesCount} ok=0 reason=INVALID`
  );
  for (const line of guardLines) {
    console.log(line);
  }
  process.exit(1);
}
guardLines.push(`ALLOW_SHRINK=${allowShrink ? 1 : 0}`);
guardLines.push(`SHRINK_REASON=${shrinkReason || "-"}`);
if (resolvedPrevPath) {
  guardLines.push(`SSOT_GUARD_PREV_SOURCE=${path.basename(resolvedPrevPath)}`);
} else {
  guardLines.push("SSOT_GUARD_PREV_SOURCE=NONE");
}
guardLines.push("SSOT_VALID=1 reason=OK");
guardLines.push(...sourceGuardLines);

if (baselineMissing) {
  guardLines.push("SSOT_GUARD_OK=0 reason=SHRINK_BASELINE_MISSING");
  guardLines.push(
    `DATA_SHRINK_GUARD kind=SHRINK_BASELINE_MISSING prev_geo=${prevGeo} new_geo=${newGeo} prev_refs=${prevRefsCount} new_refs=${newRefsCount} prev_map=${prevMapCount} new_map=${newMapCount} prev_notes=${prevNotesNonEmpty} new_notes=${newNotesNonEmpty} prev_weak=${prevNotesWeak} new_weak=${newNotesWeak} prev_allowlist=${prevAllowCount} new_allowlist=${newAllowCount} prev_official_registry=${prevOfficialRegistryCount} new_official_registry=${newOfficialRegistryCount} prev_sources_registry=${prevSourcesRegistryCount} new_sources_registry=${newSourcesRegistryCount} prev_wikidata_candidates=${prevWikidataCandidatesCount} new_wikidata_candidates=${newWikidataCandidatesCount} ok=0 reason=SHRINK_BASELINE_MISSING`
  );
  for (const line of guardLines) {
    console.log(line);
  }
  process.exit(1);
}

if (resolvedPrevPath === prevPath && prevPath && !fs.existsSync(prevPath)) {
  const sources_meta = {
    allowlist_domains: computeSourceMeta(ALLOWLIST_DOMAINS_PATH, "domains"),
    allow_domains: computeSourceMeta(ALLOW_DOMAINS_PATH, "domains"),
    official_domains_whitelist: computeSourceMeta(OFFICIAL_DOMAINS_WHITELIST_PATH, "domains"),
    official_catalog: computeSourceMeta(OFFICIAL_CATALOG_PATH, "registry"),
    official_allowlist: computeSourceMeta(ALLOWLIST_PATH, "domains"),
    official_registry: computeSourceMeta(OFFICIAL_REGISTRY_PATH, "registry"),
    sources_registry: computeSourceMeta(SOURCES_REGISTRY_PATH, "registry"),
    wikidata_candidates: computeSourceMeta(WIKIDATA_CANDIDATES_PATH, "wikidata"),
    wikidata_validated: computeSourceMeta(WIKIDATA_VALIDATED_PATH, "wikidata")
  };
  const bootstrapPayload = {
    claims: currentClaimsPayload,
    refs: currentRefsPayload,
    map: currentMapPayload,
    allowlist: currentAllowlistPayload,
    officialRegistry: currentOfficialRegistryPayload,
    sourcesRegistry: currentSourcesRegistryPayload,
    wikidataCandidates: currentWikidataCandidatesPayload,
    official_links_count: newOfficialLinksCount,
    sources_meta
  };
  try {
    fs.mkdirSync(path.dirname(prevPath), { recursive: true });
    const tmpPath = `${prevPath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(bootstrapPayload));
    fs.renameSync(tmpPath, prevPath);
  } catch (err) {
    guardLines.push(`SSOT_GUARD_BOOTSTRAP=0 reason=WRITE_FAIL`);
    guardLines.push(
      `DATA_SHRINK_GUARD kind=BOOTSTRAP prev_geo=${prevGeo} new_geo=${newGeo} prev_refs=${prevRefsCount} new_refs=${newRefsCount} prev_map=${prevMapCount} new_map=${newMapCount} prev_notes=${prevNotesNonEmpty} new_notes=${newNotesNonEmpty} prev_weak=${prevNotesWeak} new_weak=${newNotesWeak} prev_allowlist=${prevAllowCount} new_allowlist=${newAllowCount} ok=0 reason=BOOTSTRAP_WRITE_FAIL`
    );
    for (const line of guardLines) {
      console.log(line);
    }
    process.exit(1);
  }
  guardLines.push("SSOT_GUARD_BOOTSTRAP=1");
  guardLines.push(
    `SSOT_GUARD prev_geo=${prevGeo} new_geo=${newGeo} prev_refs=${prevRefsCount} new_refs=${newRefsCount} prev_map=${prevMapCount} new_map=${newMapCount} prev_notes=${prevNotesNonEmpty} new_notes=${newNotesNonEmpty} prev_weak=${prevNotesWeak} new_weak=${newNotesWeak} prev_allowlist=${prevAllowCount} new_allowlist=${newAllowCount} prev_official_registry=${prevOfficialRegistryCount} new_official_registry=${newOfficialRegistryCount} prev_sources_registry=${prevSourcesRegistryCount} new_sources_registry=${newSourcesRegistryCount} prev_wikidata_candidates=${prevWikidataCandidatesCount} new_wikidata_candidates=${newWikidataCandidatesCount}`
  );
  guardLines.push(`SSOT_GUARD_OK=1 reason=BOOTSTRAP`);
  guardLines.push(
    `DATA_SHRINK_GUARD kind=BOOTSTRAP prev_geo=${prevGeo} new_geo=${newGeo} prev_refs=${prevRefsCount} new_refs=${newRefsCount} prev_map=${prevMapCount} new_map=${newMapCount} prev_notes=${prevNotesNonEmpty} new_notes=${newNotesNonEmpty} prev_weak=${prevNotesWeak} new_weak=${newNotesWeak} prev_allowlist=${prevAllowCount} new_allowlist=${newAllowCount} prev_official_registry=${prevOfficialRegistryCount} new_official_registry=${newOfficialRegistryCount} prev_sources_registry=${prevSourcesRegistryCount} new_sources_registry=${newSourcesRegistryCount} prev_wikidata_candidates=${prevWikidataCandidatesCount} new_wikidata_candidates=${newWikidataCandidatesCount} ok=1 reason=BOOTSTRAP`
  );
  for (const line of guardLines) {
    console.log(line);
  }
  process.exit(0);
}

const runStartedAt = Number(process.env.RUN_STARTED_AT || 0);
if (Number.isFinite(runStartedAt) && runStartedAt > 0 && String(process.env.SSOT_WRITE || "") === "1") {
  const thresholdMs = (runStartedAt - 120) * 1000;
  const stale = requiredFiles.find((file) => collectMtimeMs(file) < thresholdMs);
  if (stale) {
    guardLines.push(`STALE_SSOT=1 reason=${path.basename(stale)}`);
  }
}

let refsBad = 0;
let refsTotal = 0;
const refsItems = currentRefsPayload?.items || currentRefsPayload;
const refsList = Array.isArray(refsItems) ? refsItems : Object.values(refsItems || {});
for (const entry of refsList) {
  const refs = Array.isArray(entry?.refs) ? entry.refs : [];
  for (const ref of refs) {
    refsTotal += 1;
    const url = typeof ref === "string" ? ref : ref?.url || ref?.href || ref?.link || "";
    if (!url || typeof url !== "string") {
      refsBad += 1;
      continue;
    }
    if (!/^https?:/i.test(url)) {
      refsBad += 1;
      continue;
    }
    try {
      const host = new URL(url).hostname || "";
      if (!host) refsBad += 1;
    } catch {
      refsBad += 1;
    }
  }
}
const refsBadRatio = refsTotal > 0 ? refsBad / refsTotal : 0;
guardLines.push(`REFS_BAD_URL total=${refsTotal} bad=${refsBad} ratio=${refsBadRatio.toFixed(4)}`);
guardLines.push(
  `SSOT_COUNTS prev_geo=${prevGeo} new_geo=${newGeo} prev_refs=${prevRefsCount} new_refs=${newRefsCount} prev_map=${prevMapCount} new_map=${newMapCount} prev_notes_rows=${prevNotesRows} new_notes_rows=${newNotesRows} prev_notes=${prevNotesNonEmpty} new_notes=${newNotesNonEmpty} prev_weak=${prevNotesWeak} new_weak=${newNotesWeak} prev_notes_with=${prevNotesWithNotes} new_notes_with=${newNotesWithNotes} prev_notes_empty=${prevNotesEmpty} new_notes_empty=${newNotesEmpty} prev_notes_placeholder=${prevNotesPlaceholder} new_notes_placeholder=${newNotesPlaceholder} prev_notes_weak=${prevNotesWeakCoverage} new_notes_weak=${newNotesWeakCoverage} prev_official_links=${prevOfficialLinksCount} new_official_links=${newOfficialLinksCount} prev_allowlist=${prevAllowCount} new_allowlist=${newAllowCount} prev_official_registry=${prevOfficialRegistryCount} new_official_registry=${newOfficialRegistryCount} prev_sources_registry=${prevSourcesRegistryCount} new_sources_registry=${newSourcesRegistryCount} prev_wikidata_candidates=${prevWikidataCandidatesCount} new_wikidata_candidates=${newWikidataCandidatesCount}`
);
guardLines.push(
  `SSOT_GUARD prev_geo=${prevGeo} new_geo=${newGeo} prev_refs=${prevRefsCount} new_refs=${newRefsCount} prev_map=${prevMapCount} new_map=${newMapCount} prev_notes_rows=${prevNotesRows} new_notes_rows=${newNotesRows} prev_notes=${prevNotesNonEmpty} new_notes=${newNotesNonEmpty} prev_weak=${prevNotesWeak} new_weak=${newNotesWeak} prev_notes_with=${prevNotesWithNotes} new_notes_with=${newNotesWithNotes} prev_notes_empty=${prevNotesEmpty} new_notes_empty=${newNotesEmpty} prev_notes_placeholder=${prevNotesPlaceholder} new_notes_placeholder=${newNotesPlaceholder} prev_notes_weak=${prevNotesWeakCoverage} new_notes_weak=${newNotesWeakCoverage} prev_official_links=${prevOfficialLinksCount} new_official_links=${newOfficialLinksCount} prev_allowlist=${prevAllowCount} new_allowlist=${newAllowCount} prev_official_registry=${prevOfficialRegistryCount} new_official_registry=${newOfficialRegistryCount} prev_sources_registry=${prevSourcesRegistryCount} new_sources_registry=${newSourcesRegistryCount} prev_wikidata_candidates=${prevWikidataCandidatesCount} new_wikidata_candidates=${newWikidataCandidatesCount}`
);
guardLines.push(
  `GEO_COUNT_EXPLAIN geo=${newGeo} meaning=claims_rows`
);
if (newGeo >= 300) {
  const coverageStatus = newNotesRows >= newGeo ? "OK" : "FAIL";
  const coverageReason = coverageStatus === "OK" ? "OK" : "NOTES_ROWS_MISSING";
  guardLines.push(
    `SSOT_COVERAGE wiki_total=${newGeo} notes_rows=${newNotesRows} status=${coverageStatus} reason=${coverageReason}`
  );
}
const prevAllowHash = prevAllowlist ? hashAllowlist(prevAllowlist) : hashAllowlist(currentAllowlistPayload);
const newAllowHash = hashAllowlist(currentAllowlistPayload);
const allowlistOk = allowShrink || newAllowCount >= prevAllowCount;
const allowlistReason = newAllowCount < 50 ? "ALLOWLIST_TOO_SMALL" : (newAllowCount < prevAllowCount ? "ALLOWLIST_SHRUNK" : "OK");
guardLines.push(
  `OFFICIAL_ALLOWLIST_COUNT prev=${prevAllowCount} now=${newAllowCount} status=${allowlistOk ? "OK" : "FAIL"} reason=${allowlistReason}`
);
guardLines.push(`OFFICIAL_ALLOWLIST_HASH prev=${prevAllowHash} now=${newAllowHash}`);

const wikiShrinkKinds = [];
const sourceShrinkKinds = [];
const notesShrinkKinds = [];
if (prevGeo > 0 && newGeo < prevGeo) wikiShrinkKinds.push("GEO");
if (prevRefsCount > 0 && newRefsCount < prevRefsCount) wikiShrinkKinds.push("REFS");
if (prevMapCount > 0 && newMapCount < prevMapCount) wikiShrinkKinds.push("MAP");
if (prevNotesNonEmpty > 0 && newNotesNonEmpty < prevNotesNonEmpty) wikiShrinkKinds.push("NOTES");
if (prevNotesWeak > 0 && newNotesWeak < prevNotesWeak) wikiShrinkKinds.push("WEAK");
if (prevNotesWithNotes >= 0 && newNotesWithNotes >= 0 && newNotesWithNotes < prevNotesWithNotes) {
  wikiShrinkKinds.push("NOTES_WITH_NOTES");
  notesShrinkKinds.push("WITH_NOTES");
}
if (prevNotesEmpty >= 0 && newNotesEmpty >= 0 && newNotesEmpty > prevNotesEmpty) {
  wikiShrinkKinds.push("NOTES_EMPTY");
  notesShrinkKinds.push("EMPTY");
}
if (prevNotesPlaceholder >= 0 && newNotesPlaceholder >= 0 && newNotesPlaceholder > prevNotesPlaceholder) {
  wikiShrinkKinds.push("NOTES_PLACEHOLDER");
  notesShrinkKinds.push("PLACEHOLDER");
}
if (prevNotesWeakCoverage >= 0 && newNotesWeakCoverage >= 0 && newNotesWeakCoverage > prevNotesWeakCoverage) {
  notesShrinkKinds.push("WEAK");
}
if (prevOfficialLinksCount >= 0 && newOfficialLinksCount >= 0 && newOfficialLinksCount < prevOfficialLinksCount) {
  wikiShrinkKinds.push("OFFICIAL_LINKS");
}
if (newGeo >= 300 && newNotesRows < newGeo) {
  wikiShrinkKinds.push("NOTES_ROWS");
}
if (prevAllowCount > 0 && newAllowCount < prevAllowCount) sourceShrinkKinds.push("ALLOWLIST");
if (prevOfficialRegistryCount > 0 && newOfficialRegistryCount < prevOfficialRegistryCount) {
  sourceShrinkKinds.push("OFFICIAL_REGISTRY");
}
if (prevSourcesRegistryCount > 0 && newSourcesRegistryCount < prevSourcesRegistryCount) {
  sourceShrinkKinds.push("SOURCES_REGISTRY");
}
if (prevWikidataCandidatesCount > 0 && newWikidataCandidatesCount < prevWikidataCandidatesCount) {
  sourceShrinkKinds.push("WIKIDATA_CANDIDATES");
}
if (sourceShrink.length > 0) {
  sourceShrinkKinds.push(`SOURCES_FILES:${sourceShrink.join("|")}`);
}
const shrinkKinds = [...wikiShrinkKinds, ...sourceShrinkKinds];
guardLines.push(`WIKI_ROWS_TOTAL=${newGeo}`);
guardLines.push(`WIKI_SHRINK_COUNT=${wikiShrinkKinds.length}`);
guardLines.push(`NOTES_SHRINK_COUNT=${notesShrinkKinds.length}`);
if (prevNotesWithNotes >= 0 && newNotesWithNotes >= 0) {
  const notesStatus = notesShrinkKinds.length === 0 ? "OK" : "FAIL";
  const notesReason = notesShrinkKinds.length === 0 ? "OK" : `NOTES_SHRINK_${notesShrinkKinds.join(",")}`;
  guardLines.push(
    `NOTES_COVERAGE_GUARD prev_with_notes=${prevNotesWithNotes} new_with_notes=${newNotesWithNotes} prev_empty=${prevNotesEmpty} new_empty=${newNotesEmpty} prev_placeholder=${prevNotesPlaceholder} new_placeholder=${newNotesPlaceholder} prev_weak=${prevNotesWeakCoverage} new_weak=${newNotesWeakCoverage} status=${notesStatus} reason=${notesReason}`
  );
}
const wikiShrink = wikiShrinkKinds.length > 0;
guardLines.push(
  `WIKI_SHRINK_GUARD=${wikiShrink ? "FAIL" : "PASS"} reason=${wikiShrink ? "WIKI_SHRINK_GUARD_FAIL" : "OK"}${wikiShrink ? ` kinds=${wikiShrinkKinds.join(",")}` : ""}`
);

if (verifySourcesMeta) {
  for (const line of guardLines) {
    console.log(line);
  }
  if (sourceShrink.length > 0 && !allowShrink) {
    console.log(`SSOT_SOURCES_SHRINK_FAIL kind=${sourceShrink.join(",")}`);
    process.exit(1);
  }
  console.log("SSOT_SOURCES_META_OK=1");
  process.exit(0);
}

let ok = true;
let reason = "OK";
if (allowShrink && !shrinkReason) {
  ok = false;
  reason = "SHRINK_REASON_MISSING";
}
const netMode = String(process.env.NET_MODE || "");
if (ok && netMode === "OFFLINE" && (wikiShrinkKinds.length > 0 || notesShrinkKinds.length > 0 || sourceShrinkKinds.length > 0)) {
  ok = false;
  reason = "OFFLINE_SHRINK";
}
if (!allowShrink) {
  if (newAllowCount < 50) {
    ok = false;
    reason = "ALLOWLIST_TOO_SMALL";
  } else if (refsBadRatio > 0.01) {
    ok = false;
    reason = "REFS_BAD_URL";
  }
}
if (ok && newGeo >= 300 && newNotesRows < newGeo) {
  ok = false;
  reason = "NOTES_EMPTY_STRICT";
}
if (ok && notesShrinkKinds.length > 0 && !allowNotesShrink) {
  ok = false;
  reason = "NOTES_SHRINK";
}
if (ok && wikiShrinkKinds.length > 0 && !allowShrink) {
  ok = false;
  reason = "WIKI_SHRINK_GUARD_FAIL";
}
if (ok && sourceShrinkKinds.length > 0 && !allowShrink) {
  ok = false;
  reason = `SHRINK_${sourceShrinkKinds.join(",")}`;
}

guardLines.push(`SSOT_GUARD_OK=${ok ? 1 : 0} reason=${reason}`);
try {
  const reportPayload = {
    generated_at: new Date().toISOString(),
    counts: {
      prev_geo: prevGeo,
      new_geo: newGeo,
      prev_refs: prevRefsCount,
      new_refs: newRefsCount,
      prev_map: prevMapCount,
      new_map: newMapCount,
      prev_notes_rows: prevNotesRows,
      new_notes_rows: newNotesRows,
      prev_notes: prevNotesNonEmpty,
      new_notes: newNotesNonEmpty,
      prev_official_links: prevOfficialLinksCount,
      new_official_links: newOfficialLinksCount
    },
    notes_coverage: currentNotesCoverage || null,
    official_links_count: newOfficialLinksCount
  };
  fs.writeFileSync(REPORT_SNAPSHOT_PATH, JSON.stringify(reportPayload, null, 2) + "\n");
} catch {
  guardLines.push("SSOT_SNAPSHOT_WRITE=0 reason=WRITE_FAIL");
}
if (!ok) {
  const diagPath = path.join(ROOT, "Reports", "ssot_shrink_guard.json");
  try {
    const diagPayload = {
      generated_at: new Date().toISOString(),
      reason,
      shrink_kinds: shrinkKinds,
      counts: {
        prev_geo: prevGeo,
        new_geo: newGeo,
        prev_refs: prevRefsCount,
        new_refs: newRefsCount,
        prev_map: prevMapCount,
        new_map: newMapCount,
        prev_notes_rows: prevNotesRows,
        new_notes_rows: newNotesRows,
        prev_notes: prevNotesNonEmpty,
        new_notes: newNotesNonEmpty,
        prev_notes_with: prevNotesWithNotes,
        new_notes_with: newNotesWithNotes,
        prev_notes_empty: prevNotesEmpty,
        new_notes_empty: newNotesEmpty,
        prev_notes_placeholder: prevNotesPlaceholder,
        new_notes_placeholder: newNotesPlaceholder,
        prev_official_links: prevOfficialLinksCount,
        new_official_links: newOfficialLinksCount
      }
    };
    fs.mkdirSync(path.dirname(diagPath), { recursive: true });
    fs.writeFileSync(diagPath, JSON.stringify(diagPayload, null, 2) + "\n");
    guardLines.push(`SSOT_SHRINK_DIAG file=${path.relative(ROOT, diagPath)} reason=${reason}`);
  } catch {
    guardLines.push("SSOT_SHRINK_DIAG_WRITE=0 reason=WRITE_FAIL");
  }
  guardLines.push(
    `DATA_SHRINK_GUARD kind=${reason} prev_geo=${prevGeo} new_geo=${newGeo} prev_refs=${prevRefsCount} new_refs=${newRefsCount} prev_map=${prevMapCount} new_map=${newMapCount} prev_notes=${prevNotesNonEmpty} new_notes=${newNotesNonEmpty} prev_weak=${prevNotesWeak} new_weak=${newNotesWeak} prev_allowlist=${prevAllowCount} new_allowlist=${newAllowCount} prev_official_registry=${prevOfficialRegistryCount} new_official_registry=${newOfficialRegistryCount} prev_sources_registry=${prevSourcesRegistryCount} new_sources_registry=${newSourcesRegistryCount} prev_wikidata_candidates=${prevWikidataCandidatesCount} new_wikidata_candidates=${newWikidataCandidatesCount} ok=0 reason=${reason}`
  );
} else {
  guardLines.push(
    `DATA_SHRINK_GUARD kind=OK prev_geo=${prevGeo} new_geo=${newGeo} prev_refs=${prevRefsCount} new_refs=${newRefsCount} prev_map=${prevMapCount} new_map=${newMapCount} prev_notes=${prevNotesNonEmpty} new_notes=${newNotesNonEmpty} prev_weak=${prevNotesWeak} new_weak=${newNotesWeak} prev_allowlist=${prevAllowCount} new_allowlist=${newAllowCount} prev_official_registry=${prevOfficialRegistryCount} new_official_registry=${newOfficialRegistryCount} prev_sources_registry=${prevSourcesRegistryCount} new_sources_registry=${newSourcesRegistryCount} prev_wikidata_candidates=${prevWikidataCandidatesCount} new_wikidata_candidates=${newWikidataCandidatesCount} ok=1 reason=OK`
  );
}
for (const line of guardLines) {
  console.log(line);
}

if (!ok) process.exit(1);
