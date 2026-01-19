import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { collectOfficialUrls } from "../sources/catalog_utils.mjs";
import { validateOfficialUrl } from "../sources/validate_official_url.mjs";
import { validateCandidateUrl } from "../sources/validate_url.mjs";
import { discoverLawPage } from "./law_page_discovery.mjs";

const ROOT = process.env.AUTO_LEARN_TEST_ROOT || process.cwd();
const ISO_PATH = path.join(ROOT, "data", "iso3166", "iso3166-1.json");
const CATALOG_PATH = path.join(ROOT, "data", "sources", "official_catalog.json");
const CANDIDATES_PATH = path.join(
  ROOT,
  "data",
  "sources",
  "wikidata_candidates.json"
);
const CANDIDATES_REPORT_PATH = path.join(
  ROOT,
  "Reports",
  "auto_learn",
  "candidates.json"
);
const REGISTRY_PATH = path.join(ROOT, "data", "sources", "sources_registry.json");
const ALLOWLIST_PATH = path.join(
  ROOT,
  "data",
  "sources",
  "allowlist_domains.json"
);
const FALLBACK_ALLOWLIST_PATH = path.join(
  ROOT,
  "data",
  "sources",
  "official_domains_whitelist.json"
);
const DENYLIST_PATH = path.join(ROOT, "data", "sources", "domain_denylist.json");
const ALLOW_DOMAINS_PATH = path.join(ROOT, "data", "sources", "allow_domains.json");
const MISSING_SOURCES_PATH = path.join(ROOT, "Reports", "law_verified_dump.json");
const OUTPUT_PATH = path.join(ROOT, "Reports", "auto_learn", "last_run.json");
const SNAPSHOT_ROOT = path.join(ROOT, "data", "source_snapshots");
const LAWS_DIR = path.join(ROOT, "data", "laws");
const FETCH_SOURCES = path.join(ROOT, "tools", "sources", "fetch_sources.mjs");
const LAW_TRACE_DIR = path.join(ROOT, "Reports", "auto_learn_law");
const LAW_PAGE_LAST_RUN = path.join(ROOT, "Reports", "auto_learn_law", "last_run.json");
const LAW_PAGE_DISCOVERY_REPORT = path.join(
  ROOT,
  "Reports",
  "law_page_discovery",
  "last_run.json"
);
const TARGET_LIMIT = Number(process.env.AUTO_LEARN_TARGET_LIMIT || 5);
const AUTO_LEARN_MIN = process.env.AUTO_LEARN_MIN === "1";
const AUTO_LEARN_MIN_SOURCES = process.env.AUTO_LEARN_MIN_SOURCES === "1";
const TRACE_ISO = String(process.env.TRACE_ISO || "").toUpperCase();
const FORCE_ISO = process.env.AUTO_LEARN_TEST_ROOT
  ? ""
  : String(process.env.AUTO_LEARN_FORCE_ISO || "").toUpperCase();

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + "\n");
}

function writeLawPageReport(report, payload) {
  const data = {
    run_id: report.run_id || "",
    run_at: new Date().toISOString(),
    iso2: String(payload?.iso2 || "").toUpperCase(),
    candidates: Array.isArray(payload?.candidates) ? payload.candidates : [],
    llm_votes: Array.isArray(payload?.llm_votes) ? payload.llm_votes : [],
    law_page_ok_url: payload?.law_page_ok_url || "",
    law_page_ok_reason: payload?.law_page_ok_reason || "",
    ocr_ran: Boolean(payload?.ocr_ran),
    ocr_text_len: Number(payload?.ocr_text_len || 0) || 0
  };
  writeJson(LAW_PAGE_LAST_RUN, data);
}

function writeLawPageDiscoveryReport(report, payload) {
  const topUrls = Array.isArray(payload?.candidates)
    ? payload.candidates
      .slice(0, 5)
      .map((item) => item?.url)
      .filter(Boolean)
    : [];
  const data = {
    run_id: report.run_id || "",
    run_at: new Date().toISOString(),
    iso2: String(payload?.iso2 || "").toUpperCase(),
    tried: Number(payload?.tried || 0) || 0,
    candidates: Array.isArray(payload?.candidates) ? payload.candidates : [],
    ok: Boolean(payload?.ok),
    law_pages: payload?.ok ? 1 : 0,
    top_urls: topUrls,
    reason: payload?.reason || "",
    law_page_url: payload?.law_page_url || ""
  };
  writeJson(LAW_PAGE_DISCOVERY_REPORT, data);
}

function shuffleArray(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function recordReason(report, entry, limitOverride) {
  if (!Array.isArray(report.reasons)) report.reasons = [];
  const limit =
    typeof limitOverride === "number"
      ? limitOverride
      : AUTO_LEARN_MIN || report?.mode === "scale"
        ? 10
        : 5;
  if (report.reasons.length >= limit) return;
  report.reasons.push(entry);
}

function runNode(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], {
    stdio: "inherit"
  });
  return result.status ?? 1;
}

function sleepMs(durationMs) {
  const buffer = new SharedArrayBuffer(4);
  const view = new Int32Array(buffer);
  Atomics.wait(view, 0, 0, Math.max(0, durationMs));
}

function loadIsoList() {
  const payload = readJson(ISO_PATH);
  const raw = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.entries)
      ? payload.entries
      : [];
  const base = raw
    .map((entry) => String(entry?.alpha2 || "").toUpperCase())
    .filter((code) => code.length === 2);
  const catalog = readJson(CATALOG_PATH) || {};
  const extra = Object.keys(catalog).filter((code) => code.length === 2);
  return Array.from(new Set([...base, ...extra])).sort();
}

function loadProfiles() {
  const profiles = new Map();
  const listJson = (dir) => {
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((file) => file.endsWith(".json"))
      .map((file) => path.join(dir, file));
  };
  const world = listJson(path.join(LAWS_DIR, "world"));
  const eu = listJson(path.join(LAWS_DIR, "eu"));
  for (const file of [...world, ...eu]) {
    try {
      const payload = JSON.parse(fs.readFileSync(file, "utf8"));
      const id = String(payload?.id || path.basename(file, ".json")).toUpperCase();
      if (!id) continue;
      if (!profiles.has(id)) profiles.set(id, { payload, path: file });
    } catch {
      continue;
    }
  }
  return profiles;
}

function loadDiscoveryCandidates() {
  const payload = readJson(CANDIDATES_PATH) || {};
  const candidates = payload.candidates || {};
  const map = new Map();
  for (const [iso2, items] of Object.entries(candidates)) {
    if (!Array.isArray(items) || items.length === 0) continue;
    const urls = items
      .map((entry) => (entry && typeof entry === "object" ? entry.url : entry))
      .filter((url) => typeof url === "string" && url.length > 0);
    if (urls.length === 0) continue;
    map.set(iso2.toUpperCase(), urls);
  }
  const allowDomains = readJson(ALLOW_DOMAINS_PATH);
  const countryAllow = allowDomains?.country_allow_domains || {};
  for (const [iso2, domains] of Object.entries(countryAllow)) {
    if (!Array.isArray(domains) || domains.length === 0) continue;
    const urls = domains
      .filter((domain) => typeof domain === "string" && domain.trim())
      .map((domain) => `https://${domain.trim().replace(/^https?:\/\//, "")}/`);
    if (urls.length === 0) continue;
    const key = iso2.toUpperCase();
    const existing = map.get(key) || [];
    const merged = Array.from(new Set([...existing, ...urls]));
    map.set(key, merged);
  }
  const catalog = readJson(CATALOG_PATH) || {};
  for (const [iso2, entry] of Object.entries(catalog)) {
    const portals = Array.isArray(entry?.government_portal)
      ? entry.government_portal
      : [];
    if (portals.length === 0) continue;
    const urls = portals
      .filter((url) => typeof url === "string" && url.trim())
      .map((url) => url.trim());
    if (urls.length === 0) continue;
    const key = iso2.toUpperCase();
    const existing = map.get(key) || [];
    const merged = Array.from(new Set([...existing, ...urls]));
    map.set(key, merged);
  }
  return map;
}

function loadMissingSourcesList() {
  if (!fs.existsSync(MISSING_SOURCES_PATH)) return [];
  try {
    const payload = JSON.parse(fs.readFileSync(MISSING_SOURCES_PATH, "utf8"));
    const list = Array.isArray(payload?.missing_sources_ids)
      ? payload.missing_sources_ids
      : [];
    return list.map((iso2) => String(iso2 || "").toUpperCase()).filter(Boolean);
  } catch {
    return [];
  }
}

function buildLawSeeds(iso2) {
  const upper = String(iso2 || "").toUpperCase();
  if (upper === "XK") {
    return [
      "https://rks-gov.net/",
      "https://rks-gov.net/en/",
      "https://rks-gov.net/sq/",
      "https://gzk.rks-gov.net/",
      "https://gzk.rks-gov.net/ActsOftheConstitutionalCourtList.aspx",
      "https://gzk.rks-gov.net/ActsByCategoryInst.aspx?Index=3&InstID=302&CatID=111",
      "https://gzk.rks-gov.net/ActsList.aspx",
      "https://gzk.rks-gov.net/ActDetail.aspx",
      "https://gzk.rks-gov.net/ActDocumentDetail.aspx",
      "https://gazetazyrtare.rks-gov.net/",
      "https://rks-gov.net/en/legislation/",
      "https://rks-gov.net/en/laws/",
      "https://rks-gov.net/en/acts/",
      "https://rks-gov.net/en/regulation/",
      "https://rks-gov.net/en/gazette/",
      "https://rks-gov.net/en/official-gazette/",
      "https://rks-gov.net/en/drug-law/",
      "https://rks-gov.net/en/drugs/",
      "https://rks-gov.net/en/narcotics/",
      "https://rks-gov.net/en/cannabis/",
      "https://rks-gov.net/sq/ligje/",
      "https://rks-gov.net/sq/ligj/",
      "https://rks-gov.net/sq/akte/",
      "https://rks-gov.net/sq/regullore/",
      "https://rks-gov.net/sq/gazeta-zyrtare/",
      "https://rks-gov.net/sq/droga/",
      "https://rks-gov.net/sq/narkotike/"
    ];
  }
  return [];
}

function writeCandidatesReport(discoveryCandidates) {
  const list = [];
  for (const [iso2, urls] of discoveryCandidates.entries()) {
    for (const url of urls) {
      list.push({ iso2, url, source: "wikidata" });
    }
  }
  writeJson(CANDIDATES_REPORT_PATH, list);
}


function listStringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

function listDayDirs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((entry) => fs.statSync(path.join(dir, entry)).isDirectory())
    .sort();
}

function snapshotExists(iso2) {
  const isoPath = path.join(SNAPSHOT_ROOT, iso2);
  const dayDirs = listDayDirs(isoPath);
  if (dayDirs.length === 0) return false;
  const latest = dayDirs[dayDirs.length - 1];
  const metaPath = path.join(isoPath, latest, "meta.json");
  if (!fs.existsSync(metaPath)) return false;
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    const items = Array.isArray(meta?.items) ? meta.items : [];
    return items.some((item) => {
      const snapshot = String(item?.snapshot || "");
      if (!snapshot || !fs.existsSync(snapshot)) return false;
      try {
        return fs.statSync(snapshot).size > 0;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

function updateCatalogAfterSnapshot(catalog, iso2, url, options = {}) {
  const current = catalog?.[iso2] && typeof catalog[iso2] === "object"
    ? { ...catalog[iso2] }
    : {};
  const medical = listStringArray(current.medical);
  const recreational = listStringArray(current.recreational);
  if (medical.length === 0) {
    medical.push(url);
  } else if (!recreational.includes(url) && !medical.includes(url)) {
    recreational.push(url);
  }
  const note = "auto_seeded";
  const notes = options.addAutoSeedNote
    ? String(current.notes || "")
    : String(current.notes || "");
  const nextNotes = options.addAutoSeedNote
    ? notes.includes(note)
      ? notes
      : notes
        ? `${notes} ${note}`
        : note
    : notes;
  return {
    ...current,
    medical: Array.from(new Set(medical)),
    recreational: Array.from(new Set(recreational)),
    notes: nextNotes,
    missing_official: false
  };
}

function markLearnedIso(report, iso2) {
  const upper = String(iso2 || "").toUpperCase();
  if (!upper) return;
  if (!report.learned_iso.includes(upper)) {
    report.learned_iso.push(upper);
  }
}

function upsertReportEntry(report, entry) {
  const iso2 = String(entry?.iso2 || "").toUpperCase();
  const finalUrl = String(entry?.final_url || "");
  if (!iso2 || !finalUrl) return;
  const idx = report.entries.findIndex(
    (item) => String(item?.iso2 || "").toUpperCase() === iso2 && item?.final_url === finalUrl
  );
  if (idx >= 0) {
    report.entries[idx] = { ...report.entries[idx], ...entry };
  } else {
    report.entries.push(entry);
  }
}

function selectMissingIso2(
  isoList,
  catalog,
  registry,
  discoveryCandidates,
  limit,
  excluded = new Set(),
  missingSources = new Set()
) {
  const targets = [];
  for (const iso2 of [...isoList].sort()) {
    if (excluded.has(iso2)) continue;
    if (missingSources.size > 0 && !missingSources.has(iso2)) continue;
    const entry = catalog?.[iso2];
    const missingOfficial =
      entry?.missing_official === true || collectOfficialUrls(entry).length === 0;
    const needsSources = missingSources.size > 0 ? missingSources.has(iso2) : missingOfficial;
    if (!needsSources) continue;
    const candidates = discoveryCandidates.get(iso2) || [];
    const hasAllowedCandidate = candidates.some(
      (candidate) => validateOfficialUrl(candidate, undefined, { iso2 }).ok
    );
    if (!hasAllowedCandidate) continue;
    targets.push(iso2);
    if (targets.length >= limit) break;
  }
  return targets;
}

function setFirstSnapshot(report, url, reason) {
  if (!report.first_snapshot_url) {
    report.first_snapshot_url = url || "";
    report.first_snapshot_reason = reason || "";
  }
}

function buildTempRegistry(iso2, url) {
  const payload = {
    ssot_sources: [
      {
        iso2,
        kind: "medical",
        type: "candidate",
        url,
        final_url: url,
        fixed_name: "source_0"
      }
    ]
  };
  const registryPath = path.join(ROOT, "Reports", "auto_learn", "registry_temp.json");
  writeJson(registryPath, payload);
  return registryPath;
}

function findSnapshotMeta(url, dayDir) {
  const metaPath = path.join(dayDir, "meta.json");
  if (!fs.existsSync(metaPath)) return null;
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    const items = Array.isArray(meta?.items) ? meta.items : [];
    const match = items
      .filter((item) => item?.url === url || item?.final_url === url)
      .filter((item) => typeof item?.snapshot === "string")
      .pop();
    return match || null;
  } catch {
    return null;
  }
}

function todayCompact() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function visibleTextLength(html) {
  const cleaned = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length;
}

function snapshotMeetsMinimum(snapshotPath, contentType = "") {
  if (!snapshotPath || !fs.existsSync(snapshotPath)) return false;
  const size = fs.statSync(snapshotPath).size;
  if (size < 1) return false;
  const minBytes = 4096;
  const isPdf = String(contentType).toLowerCase().includes("application/pdf");
  if (isPdf) {
    return size >= minBytes;
  }
  if (size >= minBytes) return true;
  try {
    const textLength = visibleTextLength(fs.readFileSync(snapshotPath, "utf8"));
    return textLength >= 500;
  } catch {
    return false;
  }
}

async function fetchSnapshot(iso2, url, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 10000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; islegalcannabis/auto_learn; +https://islegalcannabis.com)",
        accept: "text/html,application/pdf;q=0.9,*/*;q=0.8"
      }
    });
    const status = Number(response?.status || 0);
    if (status < 200 || status >= 400) {
      return { ok: false, reason: `STATUS_${status}`, status };
    }
    const contentType = response?.headers?.get("content-type") || "";
    const isPdf = contentType.toLowerCase().includes("application/pdf");
    const isHtml =
      contentType.toLowerCase().includes("text/html") ||
      contentType.toLowerCase().includes("text/plain");
    if (!isPdf && !isHtml) {
      return { ok: false, reason: "BAD_CONTENT_TYPE", status, contentType };
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 1) {
      return { ok: false, reason: "EMPTY_BODY", status, contentType };
    }
    const minBytes = 4096;
    const hash = sha256(buffer);
    const finalUrl = response?.url || url;
    const ext = isPdf || url.toLowerCase().endsWith(".pdf") ? "pdf" : "html";
    if (isPdf && buffer.length < minBytes) {
      return { ok: false, reason: "SMALL_SNAPSHOT", status, contentType };
    }
    if (!isPdf) {
      const textLength = visibleTextLength(buffer.toString("utf8"));
      if (buffer.length < minBytes && textLength < 500) {
        return { ok: false, reason: "SMALL_SNAPSHOT", status, contentType };
      }
    }
    const dayDir = path.join(SNAPSHOT_ROOT, iso2, todayCompact());
    fs.mkdirSync(dayDir, { recursive: true });
    const snapshotPath = path.join(dayDir, `${hash}.${ext}`);
    fs.writeFileSync(snapshotPath, buffer);

    const metaPath = path.join(dayDir, "meta.json");
    const retrievedAt = new Date().toISOString();
    const meta = fs.existsSync(metaPath)
      ? JSON.parse(fs.readFileSync(metaPath, "utf8"))
      : { generated_at: retrievedAt, items: [] };
    meta.iso2 = iso2;
    meta.run_id = process.env.RUN_ID || meta.run_id || "";
    meta.url = url;
    meta.final_url = finalUrl;
    meta.status = status;
    meta.content_hash = hash;
    meta.bytes = buffer.length;
    meta.content_type = contentType || "unknown";
    meta.retrieved_at = retrievedAt;
    meta.fetched_at = retrievedAt;
    meta.items = Array.isArray(meta.items) ? meta.items : [];
    meta.items.push({
      iso2,
      url,
      final_url: finalUrl,
      status,
      sha256: hash,
      content_hash: hash,
      snapshot: snapshotPath,
      bytes: buffer.length,
      content_type: contentType || "unknown",
      retrieved_at: retrievedAt,
      fetched_at: retrievedAt,
      run_id: process.env.RUN_ID || ""
    });
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");

    return {
      ok: true,
      snapshotPath,
      status,
      contentHash: hash,
      retrievedAt,
      finalUrl,
      contentType
    };
  } catch (error) {
    return {
      ok: false,
      reason: error?.name === "AbortError" ? "TIMEOUT" : "FETCH_ERROR"
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSnapshotWithRetry(iso2, url, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 10000);
  const retries = Number(options.retries || 1);
  let snapshot = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    snapshot = await fetchSnapshot(iso2, url, { timeoutMs });
    if (snapshot?.ok) return snapshot;
    if (attempt < retries) {
      const reason = String(snapshot?.reason || "");
      const isRetryStatus =
        reason === "STATUS_403" || reason === "STATUS_429" || reason === "FETCH_ERROR";
      const base = attempt === 0 ? 300 : 900;
      const backoff = isRetryStatus ? base * 2 : base;
      sleepMs(backoff);
    }
  }
  return snapshot || { ok: false, reason: "SNAPSHOT_FAIL" };
}


export async function runAutoLearn() {
  const mode = String(process.env.AUTO_LEARN_MODE || "min_sources").toLowerCase();
  const minProvisional =
    process.env.AUTO_LEARN_MIN_PROVISIONAL === "1" ||
    process.env.AUTO_LEARN_MIN === "1";
  const isoList = loadIsoList();
  const allowlistPath = fs.existsSync(ALLOWLIST_PATH)
    ? ALLOWLIST_PATH
    : FALLBACK_ALLOWLIST_PATH;
  const profiles = loadProfiles();
  const catalog = readJson(CATALOG_PATH) || {};
  const registry = readJson(REGISTRY_PATH) || {};
  const runId =
    process.env.RUN_ID ||
    (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

  const report = {
    run_at: new Date().toISOString(),
    run_id: runId,
    mode,
    picked: [],
    learned_iso: [],
    entries: [],
    validated_urls: [],
    snapshot_paths: [],
    law_page_urls: [],
    law_page_snapshot_paths: [],
    law_page_url: "",
    law_page_snapshot_path: "",
    law_page_markers: null,
    discovered: 0,
    catalog_added: 0,
    machine_verified_added: 0,
    targets: 0,
    reasons: [],
    iso: "",
    iso2: "",
    candidates: 0,
    validated_ok: 0,
    url: "",
    final_url: "",
    snapshot_path: "",
    first_snapshot_url: "",
    first_snapshot_reason: "",
    http_status: 0,
    content_hash: "",
    catalog_written: false,
    provisional_with_sources_delta: 0,
    sources_added: 0,
    snapshots: 0,
    law_pages: 0,
    law_page_reason: "",
    reason: ""
  };
  const previousRun = readJson(OUTPUT_PATH) || {};
  const alreadyChecked = new Set();
  if (
    Number(previousRun.validated_ok || 0) === 0 &&
    Number(previousRun.snapshots || 0) === 0
  ) {
    const picked = Array.isArray(previousRun.picked) ? previousRun.picked : [];
    for (const iso2 of picked) {
      const upper = String(iso2 || "").toUpperCase();
      if (upper) alreadyChecked.add(upper);
    }
  }
  const missingSourcesList = loadMissingSourcesList();
  const missingSourcesFiltered = missingSourcesList
    .map((iso2) => String(iso2 || "").toUpperCase())
    .filter((iso2) => {
      if (!iso2) return false;
      const profileEntry = profiles?.get(iso2);
      const reviewStatus = String(profileEntry?.payload?.review_status || "").toLowerCase();
      return reviewStatus !== "needs_review";
    });
  const missingSourcesSet = new Set(missingSourcesFiltered);

  if (process.env.NETWORK !== "1") {
    report.reason = "NETWORK_OFF";
    writeJson(OUTPUT_PATH, report);
    process.exit(mode === "scale" ? 0 : 2);
  }

  if (mode !== "min_sources" && mode !== "scale") {
    report.reason = "UNSUPPORTED_MODE";
    writeJson(OUTPUT_PATH, report);
    process.exit(2);
  }

  const candidatesFresh = (() => {
    if (!fs.existsSync(CANDIDATES_PATH)) return false;
    const ageMs = Date.now() - fs.statSync(CANDIDATES_PATH).mtimeMs;
    return ageMs < 6 * 60 * 60 * 1000;
  })();
  const candidatesPayload = readJson(CANDIDATES_PATH) || {};
  const candidatesEmpty =
    !candidatesPayload.candidates || Object.keys(candidatesPayload.candidates).length === 0;
  if (!candidatesFresh || candidatesEmpty) {
    const seedLimit = Number(
      process.env.AUTO_SEED_LIMIT || (mode === "scale" ? 200 : 60)
    );
    runNode(
      path.join(ROOT, "tools", "auto_learn", "wikidata_discovery.mjs"),
      ["--limit", String(seedLimit)]
    );
  }

  const discoveryCandidates = loadDiscoveryCandidates();
  report.discovered = Array.from(discoveryCandidates.values()).reduce(
    (sum, urls) => sum + urls.length,
    0
  );
  writeCandidatesReport(discoveryCandidates);
  let foundCandidates = false;
  let foundValidated = false;

  if (FORCE_ISO) {
    report.mode = "force_iso";
    report.targets = 1;
    report.iso2 = FORCE_ISO;
    report.iso = FORCE_ISO;
    report.picked = [FORCE_ISO];
    const forceCandidates = discoveryCandidates.get(FORCE_ISO) || [];
    if (forceCandidates.length === 0 && FORCE_ISO === "XK") {
      forceCandidates.push("https://rks-gov.net/");
    }
    report.candidates = forceCandidates.length;
    if (forceCandidates.length === 0) {
      report.reason = "NO_CANDIDATES";
      recordReason(report, { iso2: FORCE_ISO, code: "NO_CANDIDATES", msg: "no candidates" });
      writeJson(OUTPUT_PATH, report);
      process.exit(0);
    }
    foundCandidates = true;
    let finalUrl = "";
    for (const candidate of forceCandidates) {
      const validation = await validateCandidateUrl(candidate, {
        allowlistPath,
        denylistPath: DENYLIST_PATH,
        timeoutMs: 10000,
        iso2: FORCE_ISO
      });
      if (validation.ok) {
        finalUrl = validation.finalUrl || candidate;
        break;
      }
      recordReason(report, {
        iso2: FORCE_ISO,
        code: validation.reason || "VALIDATION_FAIL",
        msg: validation.reason || "validation failed",
        url: candidate
      });
    }
    if (!finalUrl) {
      report.reason = "VALIDATION_FAIL";
      recordReason(report, {
        iso2: FORCE_ISO,
        code: "VALIDATION_FAIL",
        msg: "no validated candidates"
      });
      writeJson(OUTPUT_PATH, report);
      process.exit(0);
    }
    foundValidated = true;
    report.final_url = finalUrl;
    report.url = finalUrl;
    const snapshot = await fetchSnapshotWithRetry(FORCE_ISO, finalUrl, {
      timeoutMs: 10000,
      retries: 1
    });
    if (!snapshot || !snapshot.ok || !snapshot.snapshotPath || !fs.existsSync(snapshot.snapshotPath)) {
      setFirstSnapshot(report, finalUrl, snapshot?.reason || "SNAPSHOT_FAIL");
      recordReason(report, {
        iso2: FORCE_ISO,
        code: "SNAPSHOT_FAIL",
        msg: snapshot?.reason || "snapshot failed",
        url: finalUrl
      });
      report.reason = "SNAPSHOT_FAIL";
      writeJson(OUTPUT_PATH, report);
      process.exit(0);
    }
    setFirstSnapshot(report, finalUrl, "OK");
    report.validated_ok = 1;
    report.snapshots = 1;
    report.snapshot_paths.push(snapshot.snapshotPath);
    report.snapshot_path = snapshot.snapshotPath;
    report.validated_urls.push(finalUrl);
    const beforeEntry = catalog?.[FORCE_ISO];
    const beforeCount = collectOfficialUrls(beforeEntry).length;
    const beforeMissingOfficial = beforeEntry?.missing_official === true;
    catalog[FORCE_ISO] = updateCatalogAfterSnapshot(catalog, FORCE_ISO, finalUrl, {
      addAutoSeedNote: true
    });
    const afterCount = collectOfficialUrls(catalog?.[FORCE_ISO]).length;
    const catalogAdded = afterCount > beforeCount || beforeMissingOfficial;
    if (catalogAdded) {
      report.catalog_added += 1;
      report.sources_added += 1;
      markLearnedIso(report, FORCE_ISO);
    }
    const lawSeeds = buildLawSeeds(FORCE_ISO);
    const lawPage = await discoverLawPage({
      iso2: FORCE_ISO,
      baseUrl: finalUrl,
      snapshot,
      fetchSnapshot: fetchSnapshotWithRetry,
      timeoutMs: 12000,
      retries: 1,
      maxPages: 25,
      traceIso: TRACE_ISO,
      traceDir: LAW_TRACE_DIR,
      seedUrls: lawSeeds,
      allowSubdomains: true
    });
    writeLawPageReport(report, {
      iso2: FORCE_ISO,
      candidates: lawPage.candidates,
      llm_votes: lawPage.llm_votes,
      law_page_ok_url: lawPage.ok ? lawPage.url : "",
      law_page_ok_reason: lawPage.reason || "NO_LAW_PAGE",
      ocr_ran: lawPage.ocr_ran,
      ocr_text_len: lawPage.ocr_text_len
    });
    writeLawPageDiscoveryReport(report, {
      iso2: FORCE_ISO,
      tried: lawPage.pages_scanned || 0,
      candidates: lawPage.candidates,
      ok: lawPage.ok,
      reason: lawPage.reason || "NO_LAW_PAGE",
      law_page_url: lawPage.ok ? lawPage.url : ""
    });
    if (lawPage.ok && lawPage.snapshotPath) {
      report.law_pages = 1;
      report.law_page_reason = "OK";
      report.law_page_url = lawPage.url;
      report.law_page_snapshot_path = lawPage.snapshotPath;
      report.law_page_urls.push(lawPage.url);
      report.law_page_snapshot_paths.push(lawPage.snapshotPath);
      report.law_page_markers = lawPage.markers || null;
      if (lawPage.snapshotPath !== snapshot.snapshotPath) {
        report.snapshots += 1;
        report.snapshot_paths.push(lawPage.snapshotPath);
      }
    } else {
      report.law_page_reason = lawPage.reason || "NO_LAW_PAGE";
    }
    const sortedCatalog = Object.fromEntries(
      Object.entries(catalog).sort(([a], [b]) => a.localeCompare(b))
    );
    writeJson(CATALOG_PATH, sortedCatalog);
    runNode(path.join(ROOT, "tools", "sources", "registry_from_catalog.mjs"));
    report.reason = report.law_pages > 0 ? "OK" : report.law_page_reason || "NO_LAW_PAGE";
    writeJson(OUTPUT_PATH, report);
    process.exit(0);
  }

  if (AUTO_LEARN_MIN_SOURCES) {
    report.mode = "min_sources";
    const minSourcesPerRun = Math.max(
      1,
      Number(process.env.MIN_SOURCES_PER_RUN || 3) || 3
    );
    const maxTries = Math.max(1, Number(process.env.AUTO_LEARN_MAX_TRIES || 25) || 25);
    const pool = missingSourcesFiltered.length
      ? [...missingSourcesFiltered, ...shuffleArray(isoList)]
      : shuffleArray(isoList);
    const attempts = [];
    report.targets = Math.min(pool.length, maxTries);
    for (const iso2 of pool) {
      if (attempts.length >= maxTries) break;
      if (alreadyChecked.has(iso2)) continue;
      if (missingSourcesSet.size > 0 && !missingSourcesSet.has(iso2)) continue;
      const profileEntry = profiles?.get(iso2);
      const reviewStatus = String(profileEntry?.payload?.review_status || "").toLowerCase();
      if (reviewStatus === "needs_review") {
        continue;
      }
      const candidates = discoveryCandidates.get(iso2) || [];
      attempts.push(iso2);
      report.picked.push(iso2);
      report.candidates += candidates.length;
      if (candidates.length === 0) {
        recordReason(report, {
          iso2,
          code: "NO_CANDIDATES",
          msg: "no candidates"
        });
        continue;
      }
      foundCandidates = true;

      let finalUrl = "";
      for (const candidate of candidates) {
        const validation = await validateCandidateUrl(candidate, {
          allowlistPath,
          denylistPath: DENYLIST_PATH,
          timeoutMs: 10000,
          iso2
        });
        if (validation.ok) {
          finalUrl = validation.finalUrl || candidate;
          break;
        }
        recordReason(report, {
          iso2,
          code: validation.reason || "VALIDATION_FAIL",
          msg: validation.reason || "validation failed",
          url: candidate
        });
      }

      if (!finalUrl) {
        recordReason(report, {
          iso2,
          code: "VALIDATION_FAIL",
          msg: "no validated candidates"
        });
        continue;
      }
      foundValidated = true;
      report.final_url = finalUrl;
      report.url = finalUrl;

      const snapshot = await fetchSnapshotWithRetry(iso2, finalUrl, {
        timeoutMs: 10000,
        retries: 1
      });

      if (!snapshot || !snapshot.ok || !snapshot.snapshotPath || !fs.existsSync(snapshot.snapshotPath)) {
        setFirstSnapshot(report, finalUrl, snapshot?.reason || "SNAPSHOT_FAIL");
        recordReason(report, {
          iso2,
          code: "SNAPSHOT_FAIL",
          msg: snapshot?.reason || "snapshot failed",
          url: finalUrl
        });
        continue;
      }
      setFirstSnapshot(report, finalUrl, "OK");

      report.validated_ok += 1;
      report.validated_urls.push(finalUrl);
      report.snapshots += 1;
      report.snapshot_paths.push(snapshot.snapshotPath);
      const beforeEntry = catalog?.[iso2];
      const beforeCount = collectOfficialUrls(beforeEntry).length;
      const beforeMissingOfficial = beforeEntry?.missing_official === true;
      catalog[iso2] = updateCatalogAfterSnapshot(catalog, iso2, finalUrl, {
        addAutoSeedNote: true
      });
      const afterCount = collectOfficialUrls(catalog?.[iso2]).length;
      const catalogAdded = afterCount > beforeCount || beforeMissingOfficial;
      if (catalogAdded) {
        report.catalog_added += 1;
        report.sources_added += 1;
        markLearnedIso(report, iso2);
        upsertReportEntry(report, {
          iso2,
          final_url: finalUrl,
          snapshot_path: snapshot.snapshotPath,
          law_page_url: "",
          law_page_score: 0,
          law_page_markers: null,
          law_page_snapshot_path: ""
        });
      }

      const lawPage = await discoverLawPage({
        iso2,
        baseUrl: finalUrl,
        snapshot,
        fetchSnapshot: fetchSnapshotWithRetry,
        timeoutMs: 10000,
        retries: 1,
        maxPages: 30,
        traceIso: TRACE_ISO,
        traceDir: LAW_TRACE_DIR,
        seedUrls: buildLawSeeds(iso2),
        allowSubdomains: true
      });
      writeLawPageReport(report, {
        iso2,
        candidates: lawPage.candidates,
        llm_votes: lawPage.llm_votes,
        law_page_ok_url: lawPage.ok ? lawPage.url : "",
        law_page_ok_reason: lawPage.reason || "NO_LAW_PAGE",
        ocr_ran: lawPage.ocr_ran,
        ocr_text_len: lawPage.ocr_text_len
      });
      writeLawPageDiscoveryReport(report, {
        iso2,
        tried: lawPage.pages_scanned || 0,
        candidates: lawPage.candidates,
        ok: lawPage.ok,
        reason: lawPage.reason || "NO_LAW_PAGE",
        law_page_url: lawPage.ok ? lawPage.url : ""
      });
      if (!lawPage.ok || !lawPage.snapshotPath) {
        report.law_page_reason = lawPage.reason || "NO_LAW_PAGE";
        recordReason(report, {
          iso2,
          code: "NO_LAW_PAGE",
          msg: lawPage.reason || "no law page found",
          url: finalUrl
        });
        if (Array.isArray(lawPage.entrypoints) && lawPage.entrypoints.length > 0) {
          upsertReportEntry(report, {
            iso2,
            final_url: finalUrl,
            entrypoints: lawPage.entrypoints
          });
        }
        if (report.sources_added >= minSourcesPerRun) {
          const sortedCatalog = Object.fromEntries(
            Object.entries(catalog).sort(([a], [b]) => a.localeCompare(b))
          );
          writeJson(CATALOG_PATH, sortedCatalog);
          runNode(path.join(ROOT, "tools", "sources", "registry_from_catalog.mjs"));
          report.reason = "OK";
          writeJson(OUTPUT_PATH, report);
          process.exit(0);
        }
        continue;
      }
      report.law_page_reason = "OK";

      report.snapshot_path = lawPage.snapshotPath;
      if (lawPage.snapshotPath !== snapshot.snapshotPath) {
        report.snapshots += 1;
        report.snapshot_paths.push(lawPage.snapshotPath);
      }
      report.law_page_url = lawPage.url;
      report.law_page_snapshot_path = lawPage.snapshotPath;
      report.law_page_urls.push(lawPage.url);
      report.law_page_snapshot_paths.push(lawPage.snapshotPath);
      report.law_page_markers = lawPage.markers || null;
      report.law_page_score = Number.isFinite(lawPage.score) ? lawPage.score : 0;
      report.law_pages += 1;
      report.http_status = lawPage.status || snapshot.status || 0;
      report.content_hash = lawPage.contentHash || snapshot.contentHash || "";

      const sortedCatalog = Object.fromEntries(
        Object.entries(catalog).sort(([a], [b]) => a.localeCompare(b))
      );
      writeJson(CATALOG_PATH, sortedCatalog);
      runNode(path.join(ROOT, "tools", "sources", "registry_from_catalog.mjs"));

      report.catalog_written = true;
      report.provisional_with_sources_delta += 1;
      report.reason = "OK";
      recordReason(report, { iso2, code: "OK", msg: "ok" });
      upsertReportEntry(report, {
        iso2,
        final_url: finalUrl,
        law_page_url: lawPage.url,
        law_page_score: Number.isFinite(lawPage.score) ? lawPage.score : 0,
        law_page_markers: lawPage.markers || null,
        host: (() => {
          try {
            return new URL(lawPage.url).hostname;
          } catch {
            return "";
          }
        })(),
        snapshot_path: lawPage.snapshotPath,
        law_page_snapshot_path: lawPage.snapshotPath,
        entrypoints: Array.isArray(lawPage.entrypoints) ? lawPage.entrypoints : []
      });
      if (report.sources_added >= minSourcesPerRun) {
        writeJson(OUTPUT_PATH, report);
        process.exit(0);
      }
    }

    if (!foundCandidates) {
      report.reason = "WARN_NO_CANDIDATES";
      recordReason(report, { iso2: null, code: "NO_CANDIDATES", msg: "no candidates" });
    } else if (!foundValidated) {
      report.reason = "WARN_ALLOWLIST_TOO_STRICT";
      recordReason(report, { iso2: null, code: "ALLOWLIST_TOO_STRICT", msg: "no validated urls" });
    } else {
      report.reason = "WARN_MAX_TRIES_EXHAUSTED";
      recordReason(report, { iso2: null, code: "MAX_TRIES_EXHAUSTED", msg: "min_sources 0 progress" });
    }
    writeJson(OUTPUT_PATH, report);
    process.exit(0);
  }

  if (mode === "scale") {
    const batchLimit = Math.max(1, Number(process.env.AUTO_LEARN_BATCH || 120) || 120);
    const minValidated = Math.max(1, Number(process.env.AUTO_LEARN_MIN_VALIDATED || 10) || 10);
    const maxTargets = Math.max(
      batchLimit,
      Number(process.env.AUTO_LEARN_MAX_TARGETS || 120) || 120
    );
    const parallel = Math.max(1, Number(process.env.AUTO_LEARN_PARALLEL || 8) || 8);
    const timeoutMs = Math.max(2000, Number(process.env.AUTO_LEARN_TIMEOUT_MS || 12000) || 12000);
    const retries = Math.max(0, Number(process.env.AUTO_LEARN_RETRIES || 2) || 2);
    const buildTargets = () => {
      const list = [];
      for (const iso2 of [...isoList].sort()) {
        if (alreadyChecked.has(iso2)) continue;
        if (missingSourcesSet.size > 0 && !missingSourcesSet.has(iso2)) continue;
        const entry = catalog?.[iso2];
        const missingOfficial =
          entry?.missing_official === true || collectOfficialUrls(entry).length === 0;
        const needsSources = missingSourcesSet.size > 0
          ? missingSourcesSet.has(iso2)
          : missingOfficial;
        if (!needsSources) continue;
        const profileEntry = profiles?.get(iso2);
        const reviewStatus = String(profileEntry?.payload?.review_status || "").toLowerCase();
        if (reviewStatus === "needs_review") continue;
        if (reviewStatus === "known") continue;
        const candidates = discoveryCandidates.get(iso2) || [];
        if (candidates.length === 0) continue;
        const allowedCandidates = candidates.filter(
          (candidate) => validateOfficialUrl(candidate).ok
        );
        if (allowedCandidates.length === 0) continue;
        list.push({ iso2, candidates: allowedCandidates });
        if (list.length >= maxTargets) break;
      }
      return list;
    };

    const targets = buildTargets();

    report.targets = targets.length;
    report.picked = targets.map((target) => target.iso2);
    if (targets.length === 0) {
      report.reason = "NO_OFFICIAL";
      recordReason(report, { iso2: null, code: "NO_OFFICIAL", msg: "no candidates" });
      writeJson(OUTPUT_PATH, report);
      process.exit(0);
    }

    const queue = [...targets];
    const catalogUpdates = [];
    const catalogUpdateSet = new Set();
    const processTarget = async (target) => {
      const selectedIso = target.iso2;
      const selectedCandidates = target.candidates;
      foundCandidates = true;
      report.iso2 = selectedIso;
      report.iso = selectedIso;
      report.candidates += selectedCandidates.length;

      let finalUrl = "";
      for (const candidate of selectedCandidates) {
        const validation = await validateCandidateUrl(candidate, {
          allowlistPath,
          denylistPath: DENYLIST_PATH,
          timeoutMs,
          iso2: selectedIso
        });
        if (validation.ok) {
          finalUrl = validation.finalUrl || candidate;
          break;
        }
        recordReason(report, {
          iso2: selectedIso,
          code: validation.reason || "VALIDATION_FAIL",
          msg: validation.reason || "validation failed",
          url: candidate
        });
      }

      if (!finalUrl) {
        recordReason(report, {
          iso2: selectedIso,
          code: "VALIDATION_FAIL",
          msg: "no validated candidates"
        });
        return;
      }
      foundValidated = true;
      report.final_url = finalUrl;
      report.url = finalUrl;

      const snapshot = await fetchSnapshotWithRetry(selectedIso, finalUrl, {
        timeoutMs,
        retries
      });
      if (!snapshot?.ok || !snapshot.snapshotPath || !fs.existsSync(snapshot.snapshotPath)) {
        setFirstSnapshot(report, finalUrl, snapshot?.reason || "SNAPSHOT_FAIL");
        recordReason(report, {
          iso2: selectedIso,
          code: "SNAPSHOT_FAIL",
          msg: snapshot?.reason || "snapshot failed",
          url: finalUrl
        });
        return;
      }
      setFirstSnapshot(report, finalUrl, "OK");

      report.validated_ok += 1;
      report.validated_urls.push(finalUrl);
      report.snapshots += 1;
      report.snapshot_paths.push(snapshot.snapshotPath);
      if (!catalogUpdateSet.has(selectedIso)) {
        catalogUpdates.push({ iso2: selectedIso, url: finalUrl });
        catalogUpdateSet.add(selectedIso);
      }
      upsertReportEntry(report, {
        iso2: selectedIso,
        final_url: finalUrl,
        snapshot_path: snapshot.snapshotPath,
        law_page_url: "",
        law_page_score: 0,
        law_page_markers: null,
        law_page_snapshot_path: ""
      });

      const lawPage = await discoverLawPage({
        iso2: selectedIso,
        baseUrl: finalUrl,
        snapshot,
        fetchSnapshot: fetchSnapshotWithRetry,
        timeoutMs,
        retries,
        maxPages: 30,
        traceIso: TRACE_ISO,
        traceDir: LAW_TRACE_DIR,
        seedUrls: buildLawSeeds(selectedIso),
        allowSubdomains: true
      });
      writeLawPageReport(report, {
        iso2: selectedIso,
        candidates: lawPage.candidates,
        llm_votes: lawPage.llm_votes,
        law_page_ok_url: lawPage.ok ? lawPage.url : "",
        law_page_ok_reason: lawPage.reason || "NO_LAW_PAGE",
        ocr_ran: lawPage.ocr_ran,
        ocr_text_len: lawPage.ocr_text_len
      });
      writeLawPageDiscoveryReport(report, {
        iso2: selectedIso,
        tried: lawPage.pages_scanned || 0,
        candidates: lawPage.candidates,
        ok: lawPage.ok,
        reason: lawPage.reason || "NO_LAW_PAGE",
        law_page_url: lawPage.ok ? lawPage.url : ""
      });
      if (!lawPage.ok || !lawPage.snapshotPath) {
        report.law_page_reason = lawPage.reason || "NO_LAW_PAGE";
        recordReason(report, {
          iso2: selectedIso,
          code: "NO_LAW_PAGE",
          msg: lawPage.reason || "no law page found",
          url: finalUrl
        });
        if (Array.isArray(lawPage.entrypoints) && lawPage.entrypoints.length > 0) {
          upsertReportEntry(report, {
            iso2: selectedIso,
            final_url: finalUrl,
            entrypoints: lawPage.entrypoints
          });
        }
        return;
      }
      report.law_page_reason = "OK";

      if (lawPage.snapshotPath !== snapshot.snapshotPath) {
        report.snapshots += 1;
        report.snapshot_paths.push(lawPage.snapshotPath);
      }
      report.law_page_urls.push(lawPage.url);
      report.law_page_snapshot_paths.push(lawPage.snapshotPath);
      report.law_page_markers = lawPage.markers || null;
      report.law_page_score = Number.isFinite(lawPage.score) ? lawPage.score : 0;
      report.law_pages += 1;
      report.http_status = lawPage.status || snapshot.status || 0;
      report.content_hash = lawPage.contentHash || snapshot.contentHash || "";

      upsertReportEntry(report, {
        iso2: selectedIso,
        final_url: finalUrl,
        law_page_url: lawPage.url,
        law_page_score: Number.isFinite(lawPage.score) ? lawPage.score : 0,
        law_page_markers: lawPage.markers || null,
        host: (() => {
          try {
            return new URL(lawPage.url).hostname;
          } catch {
            return "";
          }
        })(),
        snapshot_path: lawPage.snapshotPath,
        law_page_snapshot_path: lawPage.snapshotPath,
        entrypoints: Array.isArray(lawPage.entrypoints) ? lawPage.entrypoints : []
      });
    };

    const workers = Array.from({ length: Math.min(parallel, queue.length) }, async () => {
      while (queue.length > 0) {
        const target = queue.shift();
        if (target) {
          await processTarget(target);
        }
      }
    });
    await Promise.all(workers);

    if (report.validated_ok < minValidated && targets.length < maxTargets) {
      recordReason(report, {
        iso2: null,
        code: "LOW_VALIDATED",
        msg: `validated_ok=${report.validated_ok} < ${minValidated}`
      });
    }

    if (catalogUpdates.length > 0) {
      for (const update of catalogUpdates) {
        const beforeEntry = catalog?.[update.iso2];
        const beforeCount = collectOfficialUrls(beforeEntry).length;
        const beforeMissingOfficial = beforeEntry?.missing_official === true;
        catalog[update.iso2] = updateCatalogAfterSnapshot(
          catalog,
          update.iso2,
          update.url,
          { addAutoSeedNote: true }
        );
        const afterCount = collectOfficialUrls(catalog?.[update.iso2]).length;
        const catalogAdded = afterCount > beforeCount || beforeMissingOfficial;
        if (catalogAdded) {
          report.catalog_added += 1;
          report.sources_added += 1;
          markLearnedIso(report, update.iso2);
        }
      }
      const sortedCatalog = Object.fromEntries(
        Object.entries(catalog).sort(([a], [b]) => a.localeCompare(b))
      );
      writeJson(CATALOG_PATH, sortedCatalog);
      runNode(path.join(ROOT, "tools", "sources", "registry_from_catalog.mjs"));
    }

    if (report.catalog_added > 0) {
      report.reason = "OK";
    } else if (!foundCandidates) {
      report.reason = "NO_OFFICIAL";
    } else if (!foundValidated) {
      report.reason = "ALLOWLIST_TOO_STRICT";
    } else {
      report.reason = "BLOCKED";
    }
    writeJson(OUTPUT_PATH, report);
    process.exit(0);
  }

  if (minProvisional) {
    const targets = [];
    for (const iso2 of [...isoList].sort()) {
      if (alreadyChecked.has(iso2)) continue;
      if (missingSourcesSet.size > 0 && !missingSourcesSet.has(iso2)) continue;
      const entry = catalog?.[iso2];
      const missingOfficial =
        entry?.missing_official === true || collectOfficialUrls(entry).length === 0;
      const needsSources = missingSourcesSet.size > 0
        ? missingSourcesSet.has(iso2)
        : missingOfficial;
      const hasOfficial = collectOfficialUrls(entry).length > 0;
      const registrySources = Array.isArray(registry?.[iso2]) ? registry[iso2] : [];
      const registryMissing = registrySources.length === 0;
      const hasSnapshot = snapshotExists(iso2);
      if (!needsSources && !registryMissing && hasOfficial && hasSnapshot) continue;
      const profileEntry = profiles?.get(iso2);
      const reviewStatus = String(profileEntry?.payload?.review_status || "").toLowerCase();
      if (reviewStatus === "needs_review") {
        continue;
      }
      const candidates = discoveryCandidates.get(iso2) || [];
      const allowedCandidates = candidates.filter(
        (candidate) => validateOfficialUrl(candidate).ok
      );
      if (allowedCandidates.length === 0) continue;
      targets.push({ iso2, candidates: allowedCandidates });
      if (targets.length >= TARGET_LIMIT) break;
    }
    if (targets.length === 0) {
      report.reason = "NO_OFFICIAL";
      recordReason(report, { iso2: null, code: "NO_OFFICIAL", msg: "no candidates" });
      writeJson(OUTPUT_PATH, report);
      process.exit(AUTO_LEARN_MIN ? 0 : 2);
    }
    for (const target of targets) {
      const selectedIso = target.iso2;
      const selectedCandidates = target.candidates;
      report.iso2 = selectedIso;
      report.iso = selectedIso;
      report.picked.push(selectedIso);
      report.candidates = selectedCandidates.length;
      report.url = selectedCandidates[0] || "";

      if (selectedCandidates.length === 0) {
        recordReason(report, {
          iso2: selectedIso,
          code: "NO_OFFICIAL",
          msg: "empty candidates"
        });
        continue;
      }
      foundCandidates = true;

      let finalUrl = "";
      for (const candidate of selectedCandidates) {
        const validation = await validateCandidateUrl(candidate, {
          allowlistPath,
          denylistPath: DENYLIST_PATH,
          timeoutMs: 10000
        });
        if (validation.ok) {
          finalUrl = validation.finalUrl || candidate;
          break;
        }
        recordReason(report, {
          iso2: selectedIso,
          code: validation.reason || "VALIDATION_FAIL",
          msg: validation.reason || "validation failed",
          url: candidate
        });
      }

      if (!finalUrl) {
        recordReason(report, {
          iso2: selectedIso,
          code: "VALIDATION_FAIL",
          msg: "no validated candidates"
        });
        continue;
      }
      foundValidated = true;
      report.final_url = finalUrl;
      report.url = finalUrl;

      const snapshot = await fetchSnapshotWithRetry(selectedIso, report.final_url, {
        timeoutMs: 10000,
        retries: 1
      });
      if (!snapshot.ok || !snapshot.snapshotPath || !fs.existsSync(snapshot.snapshotPath)) {
        setFirstSnapshot(report, report.final_url, snapshot?.reason || "SNAPSHOT_FAIL");
        recordReason(report, {
          iso2: selectedIso,
          code: "SNAPSHOT_FAIL",
          msg: snapshot.reason || "snapshot failed",
          url: report.final_url
        });
        continue;
      }
      setFirstSnapshot(report, report.final_url, "OK");

      report.validated_ok += 1;
      report.validated_urls.push(finalUrl);
      report.snapshots += 1;
      report.snapshot_paths.push(snapshot.snapshotPath);
      const beforeEntry = catalog?.[selectedIso];
      const beforeCount = collectOfficialUrls(beforeEntry).length;
      const beforeMissingOfficial = beforeEntry?.missing_official === true;
      catalog[selectedIso] = updateCatalogAfterSnapshot(catalog, selectedIso, report.final_url, {
        addAutoSeedNote: true
      });
      const afterCount = collectOfficialUrls(catalog?.[selectedIso]).length;
      const catalogAdded = afterCount > beforeCount || beforeMissingOfficial;
      if (catalogAdded) {
        report.catalog_added = 1;
        report.sources_added = 1;
        markLearnedIso(report, selectedIso);
        upsertReportEntry(report, {
          iso2: selectedIso,
          final_url: finalUrl,
          snapshot_path: snapshot.snapshotPath,
          law_page_url: "",
          law_page_score: 0,
          law_page_markers: null,
          law_page_snapshot_path: ""
        });
      }

      const lawPage = await discoverLawPage({
        iso2: selectedIso,
        baseUrl: report.final_url,
        snapshot,
        fetchSnapshot: fetchSnapshotWithRetry,
        timeoutMs: 10000,
        retries: 1,
        maxPages: 30,
        traceIso: TRACE_ISO,
        traceDir: LAW_TRACE_DIR,
        seedUrls: buildLawSeeds(selectedIso),
        allowSubdomains: true
      });
      writeLawPageReport(report, {
        iso2: selectedIso,
        candidates: lawPage.candidates,
        llm_votes: lawPage.llm_votes,
        law_page_ok_url: lawPage.ok ? lawPage.url : "",
        law_page_ok_reason: lawPage.reason || "NO_LAW_PAGE",
        ocr_ran: lawPage.ocr_ran,
        ocr_text_len: lawPage.ocr_text_len
      });
      if (!lawPage.ok || !lawPage.snapshotPath) {
        report.law_page_reason = lawPage.reason || "NO_LAW_PAGE";
        recordReason(report, {
          iso2: selectedIso,
          code: "NO_LAW_PAGE",
          msg: lawPage.reason || "no law page found",
          url: report.final_url
        });
        if (Array.isArray(lawPage.entrypoints) && lawPage.entrypoints.length > 0) {
          upsertReportEntry(report, {
            iso2: selectedIso,
            final_url: report.final_url,
            entrypoints: lawPage.entrypoints
          });
        }
        const sortedCatalog = Object.fromEntries(
          Object.entries(catalog).sort(([a], [b]) => a.localeCompare(b))
        );
        writeJson(CATALOG_PATH, sortedCatalog);
        runNode(path.join(ROOT, "tools", "sources", "registry_from_catalog.mjs"));
        report.catalog_written = report.catalog_added > 0;
        report.provisional_with_sources_delta = report.catalog_added > 0 ? 1 : 0;
        report.reason = report.catalog_added > 0 ? "OK" : "NO_LAW_PAGE";
        writeJson(OUTPUT_PATH, report);
        return;
      }
      report.law_page_reason = "OK";

      report.snapshot_path = lawPage.snapshotPath;
      if (lawPage.snapshotPath !== snapshot.snapshotPath) {
        report.snapshots += 1;
        report.snapshot_paths.push(lawPage.snapshotPath);
      }
      report.law_page_url = lawPage.url;
      report.law_page_snapshot_path = lawPage.snapshotPath;
      report.law_page_urls.push(lawPage.url);
      report.law_page_snapshot_paths.push(lawPage.snapshotPath);
      report.law_page_markers = lawPage.markers || null;
      report.law_page_score = Number.isFinite(lawPage.score) ? lawPage.score : 0;
      report.law_pages += 1;
      report.http_status = lawPage.status || snapshot.status || 0;
      report.content_hash = lawPage.contentHash || snapshot.contentHash || "";

      const sortedCatalog = Object.fromEntries(
        Object.entries(catalog).sort(([a], [b]) => a.localeCompare(b))
      );
      writeJson(CATALOG_PATH, sortedCatalog);
      runNode(path.join(ROOT, "tools", "sources", "registry_from_catalog.mjs"));

      report.catalog_written = true;
      report.provisional_with_sources_delta = 1;
      report.reason = "OK";
      recordReason(report, { iso2: selectedIso, code: "OK", msg: "ok" });
      upsertReportEntry(report, {
        iso2: selectedIso,
        final_url: finalUrl,
        law_page_url: lawPage.url,
        law_page_score: Number.isFinite(lawPage.score) ? lawPage.score : 0,
        law_page_markers: lawPage.markers || null,
        host: (() => {
          try {
            return new URL(lawPage.url).hostname;
          } catch {
            return "";
          }
        })(),
        snapshot_path: lawPage.snapshotPath,
        law_page_snapshot_path: lawPage.snapshotPath,
        entrypoints: Array.isArray(lawPage.entrypoints) ? lawPage.entrypoints : []
      });
      writeJson(OUTPUT_PATH, report);
      return;
    }

    if (!foundCandidates) {
      report.reason = "NO_OFFICIAL";
      recordReason(report, { iso2: null, code: "NO_OFFICIAL", msg: "no candidates" });
    } else if (!foundValidated) {
      report.reason = "ALLOWLIST_TOO_STRICT";
    } else {
      report.reason = "BLOCKED";
    }
    writeJson(OUTPUT_PATH, report);
    process.exit(AUTO_LEARN_MIN ? 0 : 2);
  }

  const tryRun = async () => {
    const targets = selectMissingIso2(
      isoList,
      catalog,
      registry,
      discoveryCandidates,
      TARGET_LIMIT,
      alreadyChecked,
      missingSourcesSet
    );
    for (const iso2 of targets) {
      const entry = catalog?.[iso2];
      const missingOfficial = entry?.missing_official === true;
      const hasOfficial = collectOfficialUrls(entry).length > 0;
      if (!missingOfficial && hasOfficial) continue;
      const profileEntry = profiles?.get(iso2);
      const reviewStatus = String(profileEntry?.payload?.review_status || "").toLowerCase();
      if (reviewStatus === "needs_review") continue;
      const candidates = discoveryCandidates.get(iso2) || [];
      if (candidates.length === 0) continue;
      foundCandidates = true;
      report.iso2 = iso2;
      report.iso = iso2;
      if (report.picked.length === 0) report.picked.push(iso2);
      report.candidates = candidates.length;

      let finalUrl = "";
      for (const candidate of candidates) {
        const validation = await validateCandidateUrl(candidate, {
          allowlistPath,
          denylistPath: DENYLIST_PATH,
          timeoutMs: 10000
        });
        if (validation.ok) {
          finalUrl = validation.finalUrl || candidate;
          break;
        }
        recordReason(report, {
          iso2,
          code: validation.reason || "VALIDATION_FAIL",
          msg: validation.reason || "validation failed",
          url: candidate
        });
      }

      if (!finalUrl) {
        recordReason(report, {
          iso2,
          code: "VALIDATION_FAIL",
          msg: "no validated candidates"
        });
        continue;
      }

      foundValidated = true;
      report.final_url = finalUrl;
      report.url = finalUrl;
      report.iso = iso2;
      const registryPath = buildTempRegistry(iso2, finalUrl);
      runNode(FETCH_SOURCES, ["--registry", registryPath, "--limit", "1"]);

      const today = new Date().toISOString().slice(0, 10);
      const dayDir = path.join(SNAPSHOT_ROOT, iso2, today);
      const snapshotMeta = findSnapshotMeta(finalUrl, dayDir);
      const snapshotPath = snapshotMeta?.snapshot || "";
      if (!snapshotMeta || !snapshotPath || !fs.existsSync(snapshotPath)) {
        setFirstSnapshot(report, finalUrl, "SNAPSHOT_FAIL");
        recordReason(report, {
          iso2,
          code: "SNAPSHOT_FAIL",
          msg: "snapshot missing",
          url: finalUrl
        });
        continue;
      }
      const contentType = String(snapshotMeta?.content_type || "");
      if (!snapshotMeetsMinimum(snapshotPath, contentType)) {
        setFirstSnapshot(report, finalUrl, "SNAPSHOT_FAIL");
        recordReason(report, {
          iso2,
          code: "SNAPSHOT_FAIL",
          msg: "snapshot too small",
          url: finalUrl
        });
        continue;
      }
      setFirstSnapshot(report, finalUrl, "OK");

      report.validated_ok += 1;
      report.validated_urls.push(finalUrl);
      report.snapshot_path = snapshotPath;
      report.snapshot_paths.push(snapshotPath);
      report.http_status = Number(snapshotMeta.http_status || snapshotMeta.status || 0) || 0;
      report.content_hash = String(snapshotMeta.sha256 || snapshotMeta.hash || "");
      report.snapshots += 1;
      const beforeEntry = catalog?.[iso2];
      const beforeCount = collectOfficialUrls(beforeEntry).length;
      const beforeMissingOfficial = beforeEntry?.missing_official === true;
      catalog[iso2] = updateCatalogAfterSnapshot(catalog, iso2, finalUrl);
      const afterCount = collectOfficialUrls(catalog?.[iso2]).length;
      const catalogAdded = afterCount > beforeCount || beforeMissingOfficial;
      if (catalogAdded) {
        report.catalog_added += 1;
        report.sources_added += 1;
        markLearnedIso(report, iso2);
        upsertReportEntry(report, {
          iso2,
          final_url: finalUrl,
          snapshot_path: snapshotPath,
          law_page_url: "",
          law_page_score: 0,
          law_page_markers: null,
          law_page_snapshot_path: ""
        });
      }

      const baseSnapshot = {
        snapshotPath,
        contentHash: report.content_hash,
        status: report.http_status
      };
      const lawPage = await discoverLawPage({
        iso2,
        baseUrl: finalUrl,
        snapshot: baseSnapshot,
        fetchSnapshot: fetchSnapshotWithRetry,
        timeoutMs: 10000,
        retries: 1,
        maxPages: 30,
        traceIso: TRACE_ISO,
        traceDir: LAW_TRACE_DIR,
        seedUrls: buildLawSeeds(iso2),
        allowSubdomains: true
      });
      writeLawPageReport(report, {
        iso2,
        candidates: lawPage.candidates,
        llm_votes: lawPage.llm_votes,
        law_page_ok_url: lawPage.ok ? lawPage.url : "",
        law_page_ok_reason: lawPage.reason || "NO_LAW_PAGE",
        ocr_ran: lawPage.ocr_ran,
        ocr_text_len: lawPage.ocr_text_len
      });
      if (!lawPage.ok || !lawPage.snapshotPath) {
        report.law_page_reason = lawPage.reason || "NO_LAW_PAGE";
        recordReason(report, {
          iso2,
          code: "NO_LAW_PAGE",
          msg: lawPage.reason || "no law page found",
          url: finalUrl
        });
        if (Array.isArray(lawPage.entrypoints) && lawPage.entrypoints.length > 0) {
          upsertReportEntry(report, {
            iso2,
            final_url: finalUrl,
            entrypoints: lawPage.entrypoints
          });
        }
        const sortedCatalog = Object.fromEntries(
          Object.entries(catalog).sort(([a], [b]) => a.localeCompare(b))
        );
        writeJson(CATALOG_PATH, sortedCatalog);
        runNode(path.join(ROOT, "tools", "sources", "registry_from_catalog.mjs"));
        report.catalog_written = report.catalog_added > 0;
        report.provisional_with_sources_delta = report.catalog_added > 0 ? 1 : 0;
        report.reason = report.catalog_added > 0 ? "OK" : "NO_LAW_PAGE";
        writeJson(OUTPUT_PATH, report);
        return true;
      }
      report.law_page_reason = "OK";

      report.snapshot_path = lawPage.snapshotPath;
      if (lawPage.snapshotPath !== snapshotPath) {
        report.snapshots += 1;
        report.snapshot_paths.push(lawPage.snapshotPath);
      }
      report.law_page_url = lawPage.url;
      report.law_page_snapshot_path = lawPage.snapshotPath;
      report.law_page_urls = [lawPage.url];
      report.law_page_snapshot_paths = [lawPage.snapshotPath];
      report.law_page_markers = lawPage.markers || null;
      report.law_page_score = Number.isFinite(lawPage.score) ? lawPage.score : 0;
      report.law_pages = 1;
      report.http_status = lawPage.status || report.http_status;
      report.content_hash = lawPage.contentHash || report.content_hash;

      const sortedCatalog = Object.fromEntries(
        Object.entries(catalog).sort(([a], [b]) => a.localeCompare(b))
      );
      writeJson(CATALOG_PATH, sortedCatalog);
      runNode(path.join(ROOT, "tools", "sources", "registry_from_catalog.mjs"));

      report.catalog_written = true;
      report.provisional_with_sources_delta = 1;
      report.reason = "OK";
      recordReason(report, { iso2, code: "OK", msg: "ok" });
      upsertReportEntry(report, {
        iso2,
        final_url: finalUrl,
        law_page_url: lawPage.url,
        law_page_score: Number.isFinite(lawPage.score) ? lawPage.score : 0,
        law_page_markers: lawPage.markers || null,
        host: (() => {
          try {
            return new URL(lawPage.url).hostname;
          } catch {
            return "";
          }
        })(),
        snapshot_path: lawPage.snapshotPath,
        law_page_snapshot_path: lawPage.snapshotPath,
        entrypoints: Array.isArray(lawPage.entrypoints) ? lawPage.entrypoints : []
      });
      writeJson(OUTPUT_PATH, report);
      return true;
    }
    return false;
  };

  const ok = await tryRun();

  if (report.reason === "OK") {
    return;
  }

  if (!foundCandidates) {
    report.reason = "NO_OFFICIAL";
    recordReason(report, { iso2: null, code: "NO_CANDIDATES", msg: "no candidates" });
  } else if (!foundValidated) {
    report.reason = "ALLOWLIST_TOO_STRICT";
    if (report.iso2) {
      recordReason(report, {
        iso2: report.iso2,
        code: "VALIDATION_FAIL",
        msg: "no validated candidates"
      });
    }
  } else {
    report.reason = "BLOCKED";
    if (report.iso2) {
      recordReason(report, {
        iso2: report.iso2,
        code: "SNAPSHOT_FAIL",
        msg: "snapshot failed"
      });
    }
  }
  writeJson(OUTPUT_PATH, report);
  process.exit(2);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAutoLearn().catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  });
}
