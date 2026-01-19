import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { collectOfficialUrls } from "../sources/catalog_utils.mjs";
import { isOfficialUrl } from "../sources/validate_official_url.mjs";
import { buildEvidenceFromFacts } from "../sources/extract_evidence.mjs";
import { writeMachineVerifiedEntries } from "../legal_ssot/write_machine_verified.mjs";

const ROOT = process.cwd();
const CATALOG_PATH = path.join(ROOT, "data", "sources", "official_catalog.json");
const SNAPSHOT_DIR = path.join(ROOT, "data", "source_snapshots");
const LEGAL_SSOT_PATH = path.join(ROOT, "data", "legal_ssot", "legal_ssot.json");
const MACHINE_VERIFIED_PATH = path.join(
  ROOT,
  "data",
  "legal_ssot",
  "machine_verified.json"
);
const REPORT_DIR = path.join(ROOT, "Reports", "auto_verify");
const LAST_RUN_PATH = path.join(REPORT_DIR, "last_run.json");
const CHANGES_PATH = path.join(REPORT_DIR, "changes.json");
const EXTRACT_DIR = path.join(REPORT_DIR, "extracted");
const OCR_SCRIPT = path.join(ROOT, "tools", "ocr", "ocr_pdf.sh");
const AI_EXTRACTOR = path.join(ROOT, "tools", "auto_verify", "ai_extract.mjs");
const SNAPSHOT_FETCHER = path.join(ROOT, "tools", "sources", "fetch_snapshot.mjs");
const PDF_TEXT_THRESHOLD = Number(process.env.OCR_TEXT_MIN || 200);
const AUTO_FACTS = process.env.AUTO_FACTS === "1";

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + "\n");
}

function listDayDirs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((entry) => fs.statSync(path.join(dir, entry)).isDirectory())
    .sort();
}

function snapshotMetaHasFile(metaPath) {
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

function snapshotExists(iso2) {
  const isoPath = path.join(SNAPSHOT_DIR, iso2);
  if (!fs.existsSync(isoPath)) return false;
  const candidates = fs
    .readdirSync(isoPath)
    .map((entry) => path.join(isoPath, entry))
    .filter((entry) => fs.statSync(entry).isDirectory());
  for (const entry of candidates) {
    const metaPath = path.join(entry, "meta.json");
    if (fs.existsSync(metaPath) && snapshotMetaHasFile(metaPath)) return true;
    const subdirs = fs
      .readdirSync(entry)
      .map((sub) => path.join(entry, sub))
      .filter((sub) => fs.statSync(sub).isDirectory());
    for (const sub of subdirs) {
      const subMeta = path.join(sub, "meta.json");
      if (fs.existsSync(subMeta) && snapshotMetaHasFile(subMeta)) return true;
    }
  }
  return false;
}

function loadMachineVerified() {
  const payload = readJson(MACHINE_VERIFIED_PATH);
  if (!payload || typeof payload !== "object") {
    return { generated_at: new Date().toISOString(), entries: {} };
  }
  if (payload.entries && typeof payload.entries === "object") {
    return payload;
  }
  return { generated_at: new Date().toISOString(), entries: payload };
}

function writeMachineVerified(payload) {
  const entries =
    payload?.entries && typeof payload.entries === "object" ? payload.entries : payload;
  return writeMachineVerifiedEntries({
    entries,
    outputPath: MACHINE_VERIFIED_PATH,
    runId: process.env.RUN_ID || "",
    reason: "AUTO_VERIFY_UPSERT"
  });
}

function countMachineVerifiedEntries() {
  const payload = readJson(MACHINE_VERIFIED_PATH);
  const entries =
    payload && payload.entries && typeof payload.entries === "object"
      ? payload.entries
      : payload;
  return entries && typeof entries === "object" ? Object.keys(entries).length : 0;
}

function loadLatestSnapshotHash(iso2, url) {
  const isoDir = path.join(SNAPSHOT_DIR, iso2);
  const dayDirs = listDayDirs(isoDir);
  for (let i = dayDirs.length - 1; i >= 0; i -= 1) {
    const metaPath = path.join(isoDir, dayDirs[i], "meta.json");
    if (!fs.existsSync(metaPath)) continue;
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
      const items = Array.isArray(meta.items) ? meta.items : [];
      const match = items
        .filter((item) => item?.url === url)
        .sort((a, b) => String(a.retrieved_at || "").localeCompare(String(b.retrieved_at || "")))
        .pop();
      if (match?.sha256) return match.sha256;
    } catch {
      continue;
    }
  }
  return "";
}

function runNode(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], {
    stdio: "inherit"
  });
  return result.status ?? 1;
}

function runShell(script, args = []) {
  const result = spawnSync(script, args, { encoding: "utf8" });
  return {
    status: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || ""
  };
}

function sleepMs(durationMs) {
  const buffer = new SharedArrayBuffer(4);
  const view = new Int32Array(buffer);
  Atomics.wait(view, 0, 0, Math.max(0, durationMs));
}

function commandExists(command) {
  const result = spawnSync("which", [command], { encoding: "utf8" });
  return result.status === 0;
}

function extractPdfText(snapshotPath) {
  if (!commandExists("pdftotext")) return "";
  const result = spawnSync("pdftotext", ["-layout", "-q", snapshotPath, "-"], {
    encoding: "utf8"
  });
  if (result.status !== 0) return "";
  return result.stdout || "";
}

function ensurePdfText(snapshotPath) {
  if (!snapshotPath.endsWith(".pdf")) {
    return { textPath: "", usedOcr: false, textLength: 0 };
  }
  const extracted = extractPdfText(snapshotPath);
  const textLength = extracted.trim().length;
  if (textLength >= PDF_TEXT_THRESHOLD && extracted) {
    const textPath = snapshotPath.replace(/\.pdf$/, ".txt");
    fs.writeFileSync(textPath, extracted);
    return { textPath, usedOcr: false, textLength };
  }
  const ocrPath = path.join(path.dirname(snapshotPath), "ocr.txt");
  if (!fs.existsSync(OCR_SCRIPT)) {
    return { textPath: "", usedOcr: false, textLength };
  }
  const res = runShell(OCR_SCRIPT, [snapshotPath, ocrPath]);
  if (res.status === 0 && fs.existsSync(ocrPath)) {
    return { textPath: ocrPath, usedOcr: true, textLength };
  }
  sleepMs(800);
  const retry = runShell(OCR_SCRIPT, [snapshotPath, ocrPath]);
  if (retry.status === 0 && fs.existsSync(ocrPath)) {
    return { textPath: ocrPath, usedOcr: true, textLength };
  }
  return { textPath: "", usedOcr: false, textLength };
}

function loadLatestSnapshotEntry(iso2, url) {
  const isoDir = path.join(SNAPSHOT_DIR, iso2);
  const dayDirs = listDayDirs(isoDir);
  for (let i = dayDirs.length - 1; i >= 0; i -= 1) {
    const metaPath = path.join(isoDir, dayDirs[i], "meta.json");
    if (!fs.existsSync(metaPath)) continue;
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
      const items = Array.isArray(meta.items) ? meta.items : [];
      const match = items
        .filter((item) => item?.url === url || item?.final_url === url)
        .sort((a, b) =>
          String(a.retrieved_at || "").localeCompare(String(b.retrieved_at || ""))
        )
        .pop();
      if (match?.snapshot && fs.existsSync(match.snapshot)) {
        return {
          snapshotPath: match.snapshot,
          sha256: match.sha256 || match.content_hash || "",
          retrievedAt: match.retrieved_at || ""
        };
      }
    } catch {
      continue;
    }
  }
  return null;
}

function fetchSnapshotWithRetry(iso2, url, reportFetchPath) {
  let fetchStatus = 1;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (fs.existsSync(reportFetchPath)) fs.rmSync(reportFetchPath);
    fetchStatus = runNode(SNAPSHOT_FETCHER, [
      "--iso2",
      iso2,
      "--url",
      url,
      "--report",
      reportFetchPath
    ]);
    if (fs.existsSync(reportFetchPath)) {
      const fetchReport = readJson(reportFetchPath) || {};
      if (fetchStatus === 0 && fetchReport.ok) {
        return { status: fetchStatus, report: fetchReport };
      }
    }
    sleepMs(600 * (attempt + 1));
  }
  const fetchReport = fs.existsSync(reportFetchPath)
    ? readJson(reportFetchPath) || {}
    : null;
  return { status: fetchStatus, report: fetchReport };
}


async function main() {
  if (process.env.AUTO_VERIFY !== "1" || process.env.NETWORK === "0") {
    return;
  }

  const limit = Number(process.env.AUTO_VERIFY_LIMIT || 10);
  let processed = 0;

  const catalog = readJson(CATALOG_PATH) || {};
  const ssotPayload = readJson(LEGAL_SSOT_PATH) || {};
  const ssotEntries =
    ssotPayload.entries && typeof ssotPayload.entries === "object"
      ? { ...ssotPayload.entries }
      : { ...ssotPayload };
  const report = {
    run_id: process.env.RUN_ID || "",
    run_at: new Date().toISOString(),
    tried: 0,
    changed: 0,
    updated_ssot: 0,
    evidence_ok: 0,
    no_evidence: 0,
    changed_ids: [],
    evidence_ids: [],
    no_evidence_ids: [],
    errors: [],
    items: [],
    machine_verified_delta: 0
  };
  const changes = [];
  const evidenceSet = new Set();
  const noEvidenceSet = new Set();
  const perIso = new Map();
  let autoVerifiedTouched = false;

  const autoFactsReportPath = path.join(ROOT, "Reports", "auto_facts", "last_run.json");
  if (AUTO_FACTS && fs.existsSync(autoFactsReportPath)) {
    const autoFactsReport = readJson(autoFactsReportPath) || {};
    const items = Array.isArray(autoFactsReport.items) ? autoFactsReport.items : [];
    let wroteCount = 0;
    for (const item of items) {
      const iso2 = String(item?.iso2 || "").toUpperCase();
      if (!iso2) continue;
      const evidenceOk = Number(item?.evidence_ok || 0) > 0;
      const wroteMachineVerified = Boolean(item?.machine_verified);
      const reason = evidenceOk ? "OK" : item?.reason || "NO_EVIDENCE";
      if (wroteMachineVerified) wroteCount += 1;
      report.tried += 1;
      report.changed_ids.push(iso2);
      if (evidenceOk) {
        evidenceSet.add(iso2);
        changes.push({
          iso2,
          url: item?.url || "",
          previous_hash: null,
          next_hash: item?.content_hash || ""
        });
      } else {
        noEvidenceSet.add(iso2);
        report.errors.push({
          iso2,
          url: item?.url || "",
          reason,
          content_type: item?.content_type || ""
        });
      }
      report.items.push({
        iso2,
        tried: true,
        evidence_found: evidenceOk,
        wrote_machine_verified: wroteMachineVerified,
        wrote_mv: wroteMachineVerified,
        reason,
        host: (() => {
          try {
            return new URL(String(item?.url || "")).hostname || "";
          } catch {
            return "";
          }
        })(),
        snapshot_ref: item?.snapshot_path || ""
      });
    }
    report.changed_ids = [...new Set(report.changed_ids)].sort();
    report.changed = report.changed_ids.length;
    report.evidence_ok = evidenceSet.size;
    report.no_evidence = noEvidenceSet.size;
    report.evidence_ids = [...evidenceSet].sort();
    report.no_evidence_ids = [...noEvidenceSet].sort();
    report.machine_verified_delta = Number(autoFactsReport.machine_verified_delta || 0) || 0;
    writeJson(LAST_RUN_PATH, report);
    writeJson(CHANGES_PATH, changes);
    return;
  }

  const reportFetchPath = path.join(REPORT_DIR, "fetch_snapshot.json");
  const autoVerifiedPayload = loadMachineVerified();
  const beforeCount = Object.keys(autoVerifiedPayload.entries || {}).length;
  for (const [iso2, entry] of Object.entries(catalog)) {
    if (!snapshotExists(iso2)) continue;
    const urls = collectOfficialUrls(entry);
    if (urls.length === 0) continue;
    let isoChanged = false;
    let isoHadEvidence = false;
    for (const url of urls) {
      if (processed >= limit) break;
      const previousHash = loadLatestSnapshotHash(iso2, url);
      let fetchReport = null;
      let nextHash = "";
      let snapshotPath = "";
      let retrievedAt = "";
      if (AUTO_FACTS) {
        const existing = loadLatestSnapshotEntry(iso2, url);
        if (!existing?.snapshotPath) {
          report.errors.push({ iso2, url, reason: "NO_SNAPSHOT" });
          continue;
        }
        fetchReport = {
          ok: true,
          sha256: existing.sha256 || "",
          snapshot_path: existing.snapshotPath,
          retrieved_at: existing.retrievedAt
        };
      } else {
        const fetched = fetchSnapshotWithRetry(iso2, url, reportFetchPath);
        fetchReport = fetched.report;
        if (!fetchReport) {
          report.errors.push({ iso2, url, reason: "SNAPSHOT_REPORT_MISSING" });
          continue;
        }
        if (fetched.status !== 0 || !fetchReport.ok) {
          report.errors.push({ iso2, url, reason: fetchReport.reason || "SNAPSHOT_FAIL" });
          continue;
        }
      }
      report.tried += 1;
      processed += 1;
      nextHash = String(fetchReport.sha256 || "");
      snapshotPath = String(fetchReport.snapshot_path || "");
      retrievedAt = String(fetchReport.retrieved_at || "");
      if (!nextHash) {
        report.errors.push({ iso2, url, reason: "EMPTY_HASH" });
        perIso.set(iso2, {
          evidence_found: false,
          wrote_machine_verified: false,
          reason: "EMPTY_HASH",
          host: (() => {
            try {
              return new URL(url).hostname || "";
            } catch {
              return "";
            }
          })(),
          snapshot_ref: ""
        });
        continue;
      }
      const changed = previousHash && nextHash !== previousHash;
      if (!previousHash || changed) {
        isoChanged = true;
        changes.push({
          iso2,
          url,
          previous_hash: previousHash || null,
          next_hash: nextHash
        });
        const { textPath, usedOcr } = ensurePdfText(snapshotPath);
        const extractOut = path.join(EXTRACT_DIR, `${iso2}.json`);
        const extractReport = path.join(EXTRACT_DIR, `${iso2}.report.json`);
        runNode(AI_EXTRACTOR, [
          "--iso2",
          iso2,
          "--url",
          url,
          "--snapshot",
          snapshotPath,
          "--text",
          textPath,
          "--out",
          extractOut,
          "--report",
          extractReport
        ]);
        const extractResult = readJson(extractReport) || {};
        if (Number(extractResult.facts_delta || 0) > 0) {
          const facts = readJson(extractOut) || {};
          const evidenceCount = Array.isArray(facts.evidence) ? facts.evidence.length : 0;
          const officialOk = isOfficialUrl(url).ok;
          const mappedEvidence = buildEvidenceFromFacts(facts, snapshotPath, nextHash);
          const machineEvidenceOk =
            officialOk && mappedEvidence.length > 0 && snapshotPath && nextHash;
          const existing = ssotEntries[iso2] && typeof ssotEntries[iso2] === "object"
            ? ssotEntries[iso2]
            : {};
          const existingOfficials = Array.isArray(existing.official_sources)
            ? existing.official_sources
            : [];
          ssotEntries[iso2] = {
            ...existing,
            status_recreational: facts.recreational_status,
            status_medical: facts.medical_status,
            official_sources: Array.from(new Set([...existingOfficials, url])),
            source_url: url,
            snapshot_path: snapshotPath,
            fetched_at: retrievedAt || new Date().toISOString(),
            content_hash: nextHash,
            extracted_facts: {
              recreational_status: facts.recreational_status,
              medical_status: facts.medical_status,
              effective_date: facts.effective_date ?? null
            },
            evidence: facts.evidence || [],
            evidence_count: evidenceCount,
            confidence: facts.confidence || "low",
            verified_sources_exist: officialOk,
            official_source_ok: officialOk,
            last_verified_at: new Date().toISOString(),
            verifier: "auto",
            ocr_used: usedOcr
          };
          if (machineEvidenceOk) {
            autoVerifiedPayload.entries[iso2] = {
              iso: iso2,
              iso2,
              recreational: facts.recreational_status,
              medical: facts.medical_status,
              status_recreational: facts.recreational_status,
              status_medical: facts.medical_status,
              medical_allowed: facts.medical_status === "allowed",
              confidence: "machine",
              evidence_kind: "law",
              evidence: mappedEvidence,
              official_source_ok: officialOk,
              verify_links: [url],
              sources: [url],
              source_url: url,
              snapshot_path: snapshotPath,
              snapshot_ref: snapshotPath,
              content_hash: nextHash,
              retrieved_at: retrievedAt || new Date().toISOString(),
              generated_at: new Date().toISOString(),
              model_id: "auto_verify_ai_extract_v1"
            };
            autoVerifiedTouched = true;
          }
          report.updated_ssot += 1;
          isoHadEvidence = machineEvidenceOk;
          perIso.set(iso2, {
            evidence_found: Boolean(machineEvidenceOk),
            wrote_machine_verified: Boolean(machineEvidenceOk),
            wrote_mv: Boolean(machineEvidenceOk),
            reason: machineEvidenceOk ? "OK" : "NO_EVIDENCE",
            host: (() => {
              try {
                return new URL(url).hostname || "";
              } catch {
                return "";
              }
            })(),
            snapshot_ref: snapshotPath
          });
          break;
        } else {
          // keep scanning URLs for evidence
        }
      }
    }
    if (isoChanged) {
      report.changed += 1;
      report.changed_ids.push(iso2);
      if (isoHadEvidence) {
        evidenceSet.add(iso2);
        noEvidenceSet.delete(iso2);
      } else {
        noEvidenceSet.add(iso2);
        if (!perIso.has(iso2)) {
          perIso.set(iso2, {
            evidence_found: false,
            wrote_machine_verified: false,
            wrote_mv: false,
            reason: "NO_EVIDENCE",
            host: "",
            snapshot_ref: ""
          });
        }
      }
    }
    if (processed >= limit) break;
  }

  report.changed_ids = [...new Set(report.changed_ids)].sort();
  report.evidence_ok = evidenceSet.size;
  report.no_evidence = noEvidenceSet.size;
  report.evidence_ids = [...evidenceSet].sort();
  report.no_evidence_ids = [...noEvidenceSet].sort();
  report.items = report.changed_ids.map((iso2) => {
    const entry = perIso.get(iso2) || {
      evidence_found: false,
      wrote_machine_verified: false,
      reason: "NO_EVIDENCE",
      host: "",
      snapshot_ref: ""
    };
    return {
      iso2,
      tried: true,
      evidence_found: entry.evidence_found,
      wrote_machine_verified: entry.wrote_machine_verified,
      wrote_mv: entry.wrote_mv ?? entry.wrote_machine_verified,
      reason: entry.reason,
      host: entry.host,
      snapshot_ref: entry.snapshot_ref
    };
  });

  const mvBeforeCount = Object.keys(autoVerifiedPayload.entries || {}).length;
  let mvWriteSummary = { wrote: false, reason: "NO_UPDATES" };
  if (autoVerifiedTouched) {
    mvWriteSummary = writeMachineVerified(autoVerifiedPayload);
  }
  const afterCount = countMachineVerifiedEntries();
  report.machine_verified_delta = report.items.filter(
    (item) => item.wrote_machine_verified
  ).length;
  report.mv_before = mvBeforeCount;
  report.mv_after = afterCount;
  report.mv_added = report.machine_verified_delta;
  report.mv_removed = Math.max(0, mvBeforeCount + report.mv_added - afterCount);
  report.mv_wrote = Boolean(mvWriteSummary?.wrote);
  report.mv_write_reason = mvWriteSummary?.reason || "";
  if (mvWriteSummary?.corruptBackup) {
    report.mv_corrupt_backup = mvWriteSummary.corruptBackup;
  }

  writeJson(LAST_RUN_PATH, report);
  writeJson(CHANGES_PATH, changes);
  if (report.updated_ssot > 0) {
    const nextPayload =
      ssotPayload.entries && typeof ssotPayload.entries === "object"
        ? {
            ...ssotPayload,
            generated_at: new Date().toISOString(),
            entries: ssotEntries
          }
        : ssotEntries;
    writeJson(LEGAL_SSOT_PATH, nextPayload);
  }
}

main();
