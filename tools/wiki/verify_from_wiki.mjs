import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { resolveWikiGeo } from "./wiki_geo_resolver.mjs";
import { fetchWikiClaim } from "./wiki_claim_fetcher.mjs";
import { extractWikiRefs } from "./wiki_refs.mjs";
import { readWikiClaim } from "./wiki_claims_store.mjs";
import { collectOfficialUrls } from "../sources/catalog_utils.mjs";
import { classifyOfficialUrl } from "../sources/validate_official_url.mjs";
import { validateCandidateUrl } from "../sources/validate_url.mjs";

const ROOT = process.cwd();
const SNAPSHOT_FETCHER = path.join(ROOT, "tools", "sources", "fetch_snapshot.mjs");
const EXTRACT_SCRIPT = path.join(ROOT, "tools", "auto_facts", "extract_from_snapshot.mjs");

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + "\n");
}

function hostForUrl(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function loadCachedWikiRefs(geoKey) {
  const refsPaths = [
    path.join(ROOT, "data", "wiki", "wiki_refs.json"),
    path.join(ROOT, "data", "wiki_ssot", "wiki_refs.json")
  ];
  for (const refsPath of refsPaths) {
    if (!fs.existsSync(refsPath)) continue;
    const payload = readJson(refsPath, null);
    if (!payload || typeof payload !== "object") continue;
    const items = payload.items;
    if (items && typeof items === "object" && !Array.isArray(items)) {
      const entry = items[geoKey.toUpperCase()];
      if (Array.isArray(entry)) return entry;
      return [];
    }
    const list = Array.isArray(items) ? items : Array.isArray(payload) ? payload : [];
    for (const item of list) {
      const key = String(item?.geo_key || item?.geo || item?.geo_id || "").toUpperCase();
      if (!key || key !== geoKey.toUpperCase()) continue;
      return Array.isArray(item?.refs) ? item.refs : [];
    }
  }
  return [];
}

function summarizeCachedRefs(refs, iso2) {
  const official = [];
  const supporting = [];
  const hostCounts = new Map();
  for (const ref of refs) {
    const url = String(ref?.url || "").trim();
    if (!url) continue;
    const host = hostForUrl(url);
    const classified = classifyOfficialUrl(url, undefined, { iso2 });
    if (classified.ok) {
      official.push({
        url,
        host,
        title: String(ref?.title_hint || ref?.title || ""),
        source: "cached_refs",
        reason: String(classified.matched_rule || "gov_allowlist")
      });
      if (host) hostCounts.set(host, (hostCounts.get(host) || 0) + 1);
    } else {
      supporting.push({
        url,
        host,
        title: String(ref?.title_hint || ref?.title || ""),
        deny_reason: String(classified.reason || "not_official")
      });
    }
  }
  const topHosts = Array.from(hostCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([host]) => host);
  return {
    official,
    supporting,
    top_hosts: topHosts
  };
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function sleep(ms) {
  if (!ms) return;
  const buffer = new SharedArrayBuffer(4);
  const view = new Int32Array(buffer);
  Atomics.wait(view, 0, 0, ms);
}

function readArgs() {
  const args = process.argv.slice(2);
  const options = {
    geo: "",
    iso: "",
    maxCandidates: 20,
    maxValid: 5,
    maxSnapshots: 3,
    timeoutMs: 12000
  };
  for (let i = 0; i < args.length; i += 1) {
    const value = args[i + 1];
    if (args[i] === "--geo" && value) options.geo = value.toUpperCase();
    if (args[i] === "--iso" && value) options.iso = value.toUpperCase();
    if (args[i].startsWith("--geo=")) options.geo = args[i].slice(6).toUpperCase();
    if (args[i].startsWith("--iso=")) options.iso = args[i].slice(6).toUpperCase();
    if (args[i] === "--max_candidates" && value) options.maxCandidates = Number(value || 0);
    if (args[i] === "--max_valid" && value) options.maxValid = Number(value || 0);
    if (args[i] === "--max_snapshots" && value) options.maxSnapshots = Number(value || 0);
    if (args[i] === "--timeout_ms" && value) options.timeoutMs = Number(value || 0);
  }
  return options;
}

function updateSnapshotMeta(snapshotPath, updates = {}) {
  if (!snapshotPath) return;
  const metaPath = path.join(path.dirname(snapshotPath), "meta.json");
  if (!fs.existsSync(metaPath)) return;
  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  } catch {
    return;
  }
  const items = Array.isArray(meta?.items) ? meta.items : [];
  const match = items.find((item) => item?.snapshot === snapshotPath);
  if (!match) return;
  let changed = false;
  for (const [key, value] of Object.entries(updates)) {
    if (typeof value === "undefined" || value === null) continue;
    if (match[key] !== value) {
      match[key] = value;
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");
  }
}

function guessPublisher(ref) {
  if (ref?.publisher) return String(ref.publisher);
  try {
    const parsed = new URL(ref.url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function runFetchSnapshot(iso2, url, reportPath) {
  const result = spawnSync(process.execPath, [
    SNAPSHOT_FETCHER,
    "--iso2",
    iso2,
    "--url",
    url,
    "--report",
    reportPath
  ], {
    encoding: "utf8",
    timeout: 15000
  });
  const payload = readJson(reportPath, null);
  return { status: result.status ?? 1, report: payload };
}

function runExtract(iso2, snapshotPath, url, reportPath) {
  const result = spawnSync(process.execPath, [
    EXTRACT_SCRIPT,
    "--iso2",
    iso2,
    "--snapshot",
    snapshotPath,
    "--url",
    url,
    "--out",
    reportPath
  ], {
    encoding: "utf8",
    timeout: 15000
  });
  const payload = readJson(reportPath, null);
  return { status: result.status ?? 1, report: payload };
}

async function ensureWikiClaim(resolved) {
  if (!resolved?.geoKey) return null;
  const cached = readWikiClaim(resolved.geoKey);
  if (cached) return cached;
  const result = await fetchWikiClaim(resolved.geoKey, {});
  if (!result.ok) return null;
  return result.payload;
}

function buildFallbackCandidates(iso2) {
  const catalogPath = path.join(ROOT, "data", "sources", "official_catalog.json");
  const catalog = readJson(catalogPath, {});
  const entry = catalog?.[iso2] || null;
  const urls = collectOfficialUrls(entry || {});
  return urls.map((url) => ({
    url,
    title: "Official catalog",
    publisher: "",
    context_snippet: "",
    source_kind: "official_catalog_fallback"
  }));
}

function normalizeStatusClaim(statusClaim) {
  const type = String(statusClaim?.type || "UNKNOWN");
  const scope = Array.isArray(statusClaim?.scope)
    ? statusClaim.scope
    : statusClaim?.scope
      ? [statusClaim.scope]
      : [];
  const conditions = String(statusClaim?.conditions || "");
  return { type, scope, conditions };
}

async function main() {
  const options = readArgs();
  const geoKey = options.geo || options.iso;
  if (!geoKey) {
    console.error("ERROR: missing --geo");
    process.exit(1);
  }
  const resolved = resolveWikiGeo(geoKey, {});
  const runAt = new Date().toISOString();
  const reportDir = path.join(ROOT, "Reports", "on_demand", resolved.geoKey);
  const reportPath = path.join(reportDir, "last_run.json");
  const fixturesEnabled = Boolean(process.env.WIKI_FIXTURE_DIR || process.env.WIKI_FIXTURE_PATH);
  const cachedClaim = readWikiClaim(resolved.geoKey);
  if (process.env.NETWORK !== "1" && !fixturesEnabled) {
    const cachedRefs = loadCachedWikiRefs(resolved.geoKey);
    const cachedSummary = summarizeCachedRefs(cachedRefs, resolved.iso2);
    const cachedOfficial = cachedSummary.official || [];
    const cachedSupporting = cachedSummary.supporting || [];
    writeJson(reportPath, {
      iso: resolved.geoKey,
      iso2: resolved.iso2,
      run_at: runAt,
      reason: "OFFLINE",
      wiki_claim: cachedClaim,
      wiki_refs: {
        counts: {
          total: cachedOfficial.length + cachedSupporting.length,
          official: cachedOfficial.length,
          supporting: cachedSupporting.length
        },
        official_candidates: cachedOfficial,
        supporting_refs: cachedSupporting,
        top_hosts: cachedSummary.top_hosts || [],
        deny_reasons: [],
        denied_samples: []
      },
      snapshots: 0,
      ocr_ran: 0,
      status_claim: { type: "UNKNOWN", scope: [], conditions: "" },
      mv_written: 0
    });
    const offlineRec = cachedClaim?.recreational_status || "Unknown";
    const offlineMed = cachedClaim?.medical_status || "Unknown";
    const offlineArticles = Array.isArray(cachedClaim?.notes_main_articles)
      ? cachedClaim.notes_main_articles.length
      : 0;
    const offlineOfficial = cachedOfficial.length;
    const offlineNonOfficial = cachedSupporting.length;
    const topHosts = Array.isArray(cachedSummary.top_hosts)
      ? cachedSummary.top_hosts
      : [];
    console.log(
      `WIKI: geo=${resolved.geoKey} rec=${offlineRec} med=${offlineMed} main_articles=${offlineArticles} official_refs=${offlineOfficial} non_official=${offlineNonOfficial} top_hosts=[${topHosts.join(",") || "-"}]`
    );
    console.log(`VERIFY: geo=${resolved.geoKey} snapshots=0 ocr_ran=0 status_claim=UNKNOWN mv_written=0 reason=OFFLINE`);
    console.log(`OCR: geo=${resolved.geoKey} ran=0 pages=0 text_len=0 reason=OFFLINE`);
    console.log(`STATUS_CLAIM: geo=${resolved.geoKey} type=UNKNOWN scope=- conditions=-`);
    console.log(`STATUS_CLAIM_SOURCE: url=- -`);
    console.log(`MV_BLOCKED_REASON: geo=${resolved.geoKey} reason=OFFLINE`);
    process.exit(2);
  }
  const claim = await ensureWikiClaim(resolved);
  if (!claim) {
    writeJson(reportPath, {
      iso: resolved.geoKey,
      iso2: resolved.iso2,
      run_at: runAt,
      reason: "NO_WIKI_CLAIM",
      wiki_claim: null,
      wiki_refs: null,
      snapshots: 0,
      ocr_ran: 0,
      status_claim: { type: "UNKNOWN", scope: [], conditions: "" },
      mv_written: 0
    });
    console.log(
      `WIKI: geo=${resolved.geoKey} rec=Unknown med=Unknown main_articles=0 official_refs=0 non_official=0 top_hosts=[-]`
    );
    console.log(`VERIFY: geo=${resolved.geoKey} snapshots=0 ocr_ran=0 status_claim=UNKNOWN mv_written=0 reason=NO_WIKI_CLAIM`);
    process.exit(2);
  }
  const wikiArticles = Array.isArray(claim?.notes_main_articles)
    ? claim.notes_main_articles
    : [];
  if (wikiArticles.length === 0) {
    writeJson(reportPath, {
      iso: resolved.geoKey,
      iso2: resolved.iso2,
      run_at: runAt,
      reason: "NO_MAIN_ARTICLES",
      wiki_claim: claim,
      wiki_refs: null,
      snapshots: 0,
      ocr_ran: 0,
      status_claim: { type: "UNKNOWN", scope: [], conditions: "" },
      mv_written: 0
    });
    console.log(
      `WIKI: geo=${resolved.geoKey} rec=${claim.recreational_status} med=${claim.medical_status} main_articles=0 official_refs=0 non_official=0 top_hosts=[-]`
    );
    console.log(`VERIFY: geo=${resolved.geoKey} snapshots=0 ocr_ran=0 status_claim=UNKNOWN mv_written=0 reason=NO_MAIN_ARTICLES`);
    process.exit(2);
  }
  const refsPath = path.join(ROOT, "Reports", "wiki_refs", `${resolved.geoKey}.json`);
  const refsPayload = await extractWikiRefs({
    geoKey: resolved.geoKey,
    iso2: resolved.iso2,
    articles: wikiArticles,
    reportPath: refsPath
  });
  const officialRefs = Array.isArray(refsPayload?.official_candidates)
    ? refsPayload.official_candidates
    : [];
  const supportingRefs = Array.isArray(refsPayload?.supporting_refs)
    ? refsPayload.supporting_refs
    : [];
  let candidates = officialRefs.map((ref) => ({
    ...ref,
    source_kind: "wiki_official_ref"
  }));
  const supportingCandidates = supportingRefs.map((ref) => ({
    ...ref,
    source_kind: "wiki_supporting_ref"
  }));
  let usedSupportingFallback = false;
  let usedCatalogFallback = false;
  if (candidates.length === 0 && supportingCandidates.length > 0) {
    candidates = supportingCandidates;
    usedSupportingFallback = true;
  }
  if (candidates.length === 0) {
    candidates = buildFallbackCandidates(resolved.iso2);
    usedCatalogFallback = true;
  }
  let usedFallback = usedSupportingFallback || usedCatalogFallback;

  const validated = [];
  const validateBatch = async (list) => {
    for (const ref of list) {
      if (validated.length >= options.maxValid) break;
      if (!ref?.url) continue;
      const result = await validateCandidateUrl(ref.url, {
        timeoutMs: options.timeoutMs,
        requireOfficial: ref.source_kind !== "wiki_supporting_ref"
      });
      if (result.ok) {
        validated.push({
          url: ref.url,
          final_url: result.finalUrl || ref.url,
          ref_context: ref.context_snippet || "",
          publisher_guess: guessPublisher(ref),
          source_kind: ref.source_kind
        });
      }
      sleep(200);
    }
  };
  await validateBatch(candidates);
  if (validated.length === 0 && !usedCatalogFallback) {
    const fallbackCandidates = buildFallbackCandidates(resolved.iso2);
    if (fallbackCandidates.length > 0) {
      usedCatalogFallback = true;
      usedFallback = true;
      candidates = fallbackCandidates;
      await validateBatch(candidates);
    }
  }

  const snapshotReports = [];
  const extractReports = [];
  let ocrRan = 0;
  let statusClaim = { type: "UNKNOWN", scope: [], conditions: "" };
  let mvWritten = 0;
  let reason = "NO_SNAPSHOT";
  for (const entry of validated) {
    if (snapshotReports.length >= options.maxSnapshots) break;
    const reportFile = path.join(reportDir, `snapshot_${snapshotReports.length + 1}.json`);
    const snap = runFetchSnapshot(resolved.iso2, entry.final_url || entry.url, reportFile);
    snapshotReports.push(snap.report || { url: entry.url, ok: false, reason: "FETCH_FAILED" });
    if (!snap.report?.ok || !snap.report?.snapshot_path) continue;
    updateSnapshotMeta(snap.report.snapshot_path, {
      source_kind: entry.source_kind,
      ref_context: entry.ref_context,
      publisher_guess: entry.publisher_guess,
      source_url: entry.url
    });
    const extractFile = path.join(reportDir, `extract_${extractReports.length + 1}.json`);
    const extract = runExtract(resolved.iso2, snap.report.snapshot_path, entry.final_url || entry.url, extractFile);
    extractReports.push(extract.report || { reason: "EXTRACT_FAILED" });
    const claim = extract.report?.status_claim || {};
    statusClaim = normalizeStatusClaim(claim);
    if (extract.report?.ocr_ran) ocrRan += 1;
    if (extract.report?.extracted) {
      mvWritten = 1;
      reason = "MV_OK";
      break;
    }
    reason = String(extract.report?.reason || reason);
  }

  if (validated.length === 0) {
    if (usedSupportingFallback) {
      reason = "NO_SUPPORTING_VALIDATED";
    } else if (usedCatalogFallback) {
      reason = "NO_OFFICIAL_FROM_FALLBACK";
    } else {
      reason = "NO_OFFICIAL_FROM_WIKI";
    }
  }

  const output = {
    iso: resolved.geoKey,
    iso2: resolved.iso2,
    run_at: runAt,
    reason,
    wiki_claim: claim,
    wiki_refs: {
      counts: refsPayload?.counts || { total: 0, official: 0, supporting: 0 },
      official_candidates: officialRefs,
      supporting_refs: supportingRefs,
      top_hosts: Array.isArray(refsPayload?.top_hosts) ? refsPayload.top_hosts : [],
      deny_reasons: Array.isArray(refsPayload?.deny_reasons) ? refsPayload.deny_reasons : [],
      denied_samples: Array.isArray(refsPayload?.denied_samples) ? refsPayload.denied_samples : []
    },
    candidates: candidates.slice(0, options.maxCandidates),
    validated,
    snapshots: snapshotReports.length,
    snapshot_reports: snapshotReports,
    extract_reports: extractReports,
    ocr_ran: ocrRan,
    status_claim: statusClaim,
    mv_written: mvWritten,
    used_fallback: usedFallback
  };
  writeJson(reportPath, output);

  const rec = claim.recreational_status || "Unknown";
  const med = claim.medical_status || "Unknown";
  const officialCount = Number(refsPayload?.counts?.official || 0) || 0;
  const nonOfficialCount = Number(refsPayload?.counts?.supporting || 0) || 0;
  const topHosts = Array.isArray(refsPayload?.top_hosts)
    ? refsPayload.top_hosts
    : [];
  console.log(
    `WIKI: geo=${resolved.geoKey} rec=${rec} med=${med} main_articles=${wikiArticles.length} official_refs=${officialCount} non_official=${nonOfficialCount} top_hosts=[${topHosts.join(",") || "-"}]`
  );
  if (officialCount === 0) {
    const denyReasons = Array.isArray(refsPayload?.deny_reasons)
      ? refsPayload.deny_reasons
      : [];
    const denySamples = Array.isArray(refsPayload?.denied_samples)
      ? refsPayload.denied_samples
      : [];
    const reasonsLabel = denyReasons.length
      ? denyReasons.map((entry) => `${entry.reason}:${entry.count}`).join(",")
      : "-";
    const samplesLabel = denySamples.length
      ? denySamples.map((entry) => `${entry.url}|${entry.reason}`).join(",")
      : "-";
    console.log(`TOP_DENY_REASONS: geo=${resolved.geoKey} reasons=[${reasonsLabel}]`);
    console.log(`DENIED_SAMPLES: geo=${resolved.geoKey} samples=[${samplesLabel}]`);
  }
  console.log(
    `VERIFY: geo=${resolved.geoKey} snapshots=${snapshotReports.length} ocr_ran=${ocrRan} status_claim=${statusClaim.type} mv_written=${mvWritten} reason=${reason}`
  );
  const ocrSample = extractReports.find((entry) => entry?.ocr_ran) || {};
  const ocrPages = Array.isArray(ocrSample?.ocr_pages) ? ocrSample.ocr_pages.length : 0;
  const ocrTextLen = Number(ocrSample?.ocr_text_len || 0) || 0;
  const ocrReason = String(ocrSample?.ocr_reason || "-");
  console.log(
    `OCR: geo=${resolved.geoKey} ran=${ocrRan} pages=${ocrPages} text_len=${ocrTextLen} reason=${ocrRan > 0 ? "-" : ocrReason}`
  );
  const locator = extractReports[0]?.evidence?.[0]?.anchor
    ? `anchor=${extractReports[0].evidence[0].anchor}`
    : extractReports[0]?.evidence?.[0]?.page
      ? `page=${extractReports[0].evidence[0].page}`
      : "-";
  const sourceUrl = extractReports[0]?.source_url || validated[0]?.url || "-";
  console.log(`STATUS_CLAIM: geo=${resolved.geoKey} type=${statusClaim.type} scope=${statusClaim.scope.join(",") || "-"} conditions=${statusClaim.conditions || "-"}`);
  console.log(`STATUS_CLAIM_SOURCE: url=${sourceUrl} ${locator}`);
  const mvReason = mvWritten ? "MV_OK" : reason || "UNKNOWN";
  console.log(`MV_BLOCKED_REASON: geo=${resolved.geoKey} reason=${mvReason}`);

  process.exit(mvWritten ? 0 : 2);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
