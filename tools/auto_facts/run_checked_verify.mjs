import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { readWikiClaim } from "../wiki/wiki_claims_store.mjs";
import { officialScopeForIso } from "../sources/validate_official_url.mjs";

const ROOT = process.cwd();
const CHECKED_PATH = path.join(ROOT, "Reports", "checked", "last_checked.json");
const OUT_DIR = path.join(ROOT, "Reports", "auto_facts", "checked");
const SUMMARY_PATH = path.join(ROOT, "Reports", "auto_facts", "checked_summary.json");
const RUN_SCRIPT = path.join(ROOT, "tools", "wiki", "verify_from_wiki.mjs");
const FETCH_NETWORK = process.env.FETCH_NETWORK ?? process.env.NETWORK ?? "0";
const RU_BLOCKED = process.env.RU_BLOCKED === "1";
const RU_BLOCKED_REASON = "ENV_BLOCKED_RU";

function reportPathForIso(iso2) {
  return path.join(ROOT, "Reports", "on_demand", iso2, "last_run.json");
}

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

function entryId(entry) {
  if (!entry || typeof entry !== "object") return "";
  if (typeof entry.id === "string" && entry.id.trim()) return entry.id.trim().toUpperCase();
  const country = String(entry.country || "").trim().toUpperCase();
  const region = String(entry.region || "").trim().toUpperCase();
  if (!country) return "";
  return `${country}${region ? `-${region}` : ""}`;
}

function buildIsoList(payload) {
  const items = Array.isArray(payload) ? payload : [];
  const seen = new Set();
  const list = [];
  for (const entry of items) {
    const id = entryId(entry);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    list.push(id);
  }
  return list;
}

function applyExtraIso(list) {
  const extraRaw = String(process.env.CHECKED_VERIFY_EXTRA_ISO || "");
  if (!extraRaw) return list;
  const extra = extraRaw
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
  if (!extra.length) return list;
  const seen = new Set();
  const next = [];
  for (const iso of extra) {
    if (seen.has(iso)) continue;
    seen.add(iso);
    next.push(iso);
  }
  for (const iso of list) {
    if (seen.has(iso)) continue;
    seen.add(iso);
    next.push(iso);
  }
  return next;
}

function normalizeReason(reason) {
  return String(reason || "").replace(/\s+/g, "_");
}

function normalizeStatusClaim(claim) {
  const type = String(claim?.type || "UNKNOWN");
  const scope = Array.isArray(claim?.scope) ? claim.scope : claim?.scope ? [claim.scope] : [];
  const conditions = String(claim?.conditions || "");
  return { type, scope, conditions };
}

function getRootDomain(host) {
  const cleaned = String(host || "").toLowerCase().replace(/^www\./, "");
  const parts = cleaned.split(".").filter(Boolean);
  if (parts.length <= 2) return cleaned;
  const suffix = parts[parts.length - 2];
  const needsThird = ["gov", "gouv", "gob", "govt", "go", "gv", "government"].includes(
    suffix
  );
  if (needsThird && parts.length >= 3) {
    return parts.slice(-3).join(".");
  }
  return parts.slice(-2).join(".");
}


function buildSkippedReport(iso2, runAt, reason, wikiClaim) {
  return {
    iso: iso2,
    iso2,
    run_at: runAt,
    reason,
    wiki_claim: wikiClaim || null,
    wiki_refs: null,
    snapshots: 0,
    snapshot_reports: [],
    ocr_ran: 0,
    status_claim: { type: "UNKNOWN", scope: [], conditions: "-" },
    mv_written: 0,
    candidates: []
  };
}

function buildSummaryItem(report, iso2, runAt) {
  const claim = normalizeStatusClaim(report?.status_claim);
  const wikiClaim = report?.wiki_claim || null;
  const wikiRefs = report?.wiki_refs?.counts || { total: 0, official: 0, supporting: 0 };
  const wikiRefsDetail = report?.wiki_refs || {};
  const topHosts = Array.isArray(wikiRefsDetail?.top_hosts)
    ? wikiRefsDetail.top_hosts
    : [];
  const denyReasons = Array.isArray(wikiRefsDetail?.deny_reasons)
    ? wikiRefsDetail.deny_reasons
    : [];
  const deniedSamples = Array.isArray(wikiRefsDetail?.denied_samples)
    ? wikiRefsDetail.denied_samples
    : [];
  const officialCandidates = Array.isArray(wikiRefsDetail?.official_candidates)
    ? wikiRefsDetail.official_candidates
    : [];
  const hostSet = new Set();
  const rootSet = new Set();
  const baseScope = officialScopeForIso(iso2);
  const scopeHosts = Array.isArray(baseScope?.hosts) ? baseScope.hosts : [];
  const scopeRoots = Array.isArray(baseScope?.roots) ? baseScope.roots : [];
  for (const host of scopeHosts) {
    if (!host) continue;
    const cleaned = String(host).toLowerCase().replace(/^www\./, "");
    if (!cleaned) continue;
    hostSet.add(cleaned);
    const root = getRootDomain(cleaned);
    if (root) rootSet.add(root);
  }
  for (const root of scopeRoots) {
    const cleaned = String(root).toLowerCase().replace(/^www\./, "");
    if (!cleaned) continue;
    rootSet.add(cleaned);
  }
  for (const ref of officialCandidates) {
    const host = String(ref?.host || "").trim();
    let parsedHost = host;
    if (!parsedHost && ref?.url) {
      try {
        parsedHost = new URL(ref.url).hostname;
      } catch {
        parsedHost = "";
      }
    }
    if (!parsedHost) continue;
    const cleaned = parsedHost.toLowerCase().replace(/^www\./, "");
    hostSet.add(cleaned);
    const root = getRootDomain(cleaned);
    if (root) rootSet.add(root);
  }
  const rec = wikiClaim?.recreational_status || "Unknown";
  const med = wikiClaim?.medical_status || "Unknown";
  const mainArticles = Array.isArray(wikiClaim?.notes_main_articles)
    ? wikiClaim.notes_main_articles.length
    : 0;
  const snapshots = Number(report?.snapshots || 0) || 0;
  const snapshotReports = Array.isArray(report?.snapshot_reports)
    ? report.snapshot_reports
    : [];
  const firstSnapshot = snapshotReports[0] || null;
  const snapshotAttempt = {
    url: String(firstSnapshot?.url || "-"),
    status: Number(firstSnapshot?.status || 0) || 0,
    bytes: Number(firstSnapshot?.bytes || 0) || 0,
    reason: String(firstSnapshot?.reason || (snapshots > 0 ? "OK" : "NO_SNAPSHOT"))
  };
  const candidateCount = Array.isArray(report?.candidates)
    ? report.candidates.length
    : Number(wikiRefs.official || 0) || 0;
  const ocrRan = Number(report?.ocr_ran || 0) || 0;
  const mvWritten = Number(report?.mv_written || 0) > 0 ? 1 : 0;
  const reason = normalizeReason(report?.reason || "UNKNOWN");
  return {
    iso2,
    run_at: runAt,
    wiki: {
      rec,
      med,
      main_articles: mainArticles,
      official_refs: Number(wikiRefs.official || 0) || 0,
      non_official_refs: Number(wikiRefs.supporting || 0) || 0,
      top_hosts: topHosts,
      deny_reasons: denyReasons,
      denied_samples: deniedSamples
    },
    verify: {
      snapshots,
      snapshot_attempt: snapshotAttempt,
      law_page_candidates_total: candidateCount,
      ocr_ran: ocrRan,
      status_claim: claim,
      mv_written: mvWritten,
      reason,
      pages_checked: snapshots
    },
    official_scope: {
      roots: Array.from(rootSet),
      allowed_hosts_count: hostSet.size
    },
    status_claim: claim,
    snapshot_attempt: snapshotAttempt,
    law_page_candidates_total: candidateCount,
    mv_written: mvWritten,
    mv_blocked_reason: mvWritten ? "MV_OK" : reason
  };
}

function runWikiVerify(geoKey) {
  const args = [RUN_SCRIPT, "--geo", geoKey];
  const res = spawnSync(process.execPath, args, {
    stdio: "inherit",
    env: {
      ...process.env,
      FETCH_NETWORK
    }
  });
  return res.status === 0;
}

function main() {
  const checked = readJson(CHECKED_PATH, []);
  const isoList = applyExtraIso(buildIsoList(checked));
  const limit = Math.max(1, Number(process.env.CHECKED_VERIFY_LIMIT || isoList.length) || 1);
  const runAt = new Date().toISOString();
  const items = [];

  if (!isoList.length) {
    writeJson(SUMMARY_PATH, {
      run_at: runAt,
      checked: [],
      items,
      reason: "NO_CHECKED_ISO"
    });
    return;
  }

  const selected = isoList.slice(0, limit);
  for (const iso2 of selected) {
    let ok = true;
    let report = {};
    if (iso2 === "RU" && RU_BLOCKED) {
      ok = false;
      report = buildSkippedReport(iso2, runAt, RU_BLOCKED_REASON, readWikiClaim(iso2));
      console.log(
        `WIKI: geo=${iso2} rec=Unknown med=Unknown main_articles=0 official_refs=0 non_official=0 top_hosts=[-]`
      );
      console.log(
        `VERIFY: geo=${iso2} snapshots=0 ocr_ran=0 status_claim=UNKNOWN mv_written=0 reason=${RU_BLOCKED_REASON}`
      );
    } else {
      ok = runWikiVerify(iso2);
      report = readJson(reportPathForIso(iso2), {});
    }
    const runId = String(report?.run_id || "");
    const snapshot = {
      iso2,
      run_at: runAt,
      ok,
      run_id: runId || "",
      report
    };
    fs.mkdirSync(OUT_DIR, { recursive: true });
    writeJson(path.join(OUT_DIR, `${iso2}.json`), snapshot);
    items.push(buildSummaryItem(report, iso2, runAt));
  }

  writeJson(SUMMARY_PATH, {
    run_at: runAt,
    checked: selected,
    items,
    reason: "OK",
    ru_blocked: RU_BLOCKED,
    ru_blocked_reason: RU_BLOCKED ? RU_BLOCKED_REASON : "-"
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
