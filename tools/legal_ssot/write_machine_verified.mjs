import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const DEFAULT_OUTPUT = path.join(ROOT, "data", "legal_ssot", "machine_verified.json");

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2) + "\n");
  fs.renameSync(tmp, file);
}

function backupCorrupt(file, runId) {
  if (!fs.existsSync(file)) return "";
  const suffix = runId ? `${runId}` : `${Date.now()}`;
  const backup = `${file}.corrupt.${suffix}.json`;
  fs.copyFileSync(file, backup);
  return backup;
}

function normalizeEntries(payload) {
  if (!payload || typeof payload !== "object") return {};
  if (payload.entries && typeof payload.entries === "object") return payload.entries;
  return payload;
}

function buildEvidenceId(entry) {
  const iso2 = String(entry?.iso2 || entry?.iso || "").toUpperCase();
  const hash = String(entry?.content_hash || "");
  const evidence = Array.isArray(entry?.evidence) ? entry.evidence : [];
  const anchor = String(evidence[0]?.anchor || evidence[0]?.page || "");
  if (!iso2 || !hash || !anchor) return "";
  return crypto.createHash("sha256").update(`${iso2}|${hash}|${anchor}`).digest("hex");
}

export function writeMachineVerifiedEntries({
  entries,
  outputPath = DEFAULT_OUTPUT,
  runId = "",
  reason = ""
} = {}) {
  const existingRaw = fs.existsSync(outputPath)
    ? fs.readFileSync(outputPath, "utf8")
    : "";
  let existingPayload = readJson(outputPath, null);
  let corruptBackup = "";
  if (existingRaw && !existingPayload) {
    corruptBackup = backupCorrupt(outputPath, runId);
    existingPayload = { generated_at: new Date().toISOString(), entries: {} };
  }
  const existingEntries = normalizeEntries(existingPayload);
  const beforeCount = Object.keys(existingEntries || {}).length;
  const skipReasons = new Set(["OFFLINE", "NO_LAW_PAGE"]);
  if (skipReasons.has(String(reason || ""))) {
    return {
      beforeCount,
      afterCount: beforeCount,
      added: 0,
      removed: 0,
      updated: 0,
      wrote: false,
      reason: reason || "SKIP_REASON",
      corruptBackup
    };
  }
  const incomingEntries = entries && typeof entries === "object" ? entries : {};
  const incomingCount = Object.keys(incomingEntries).length;

  if (incomingCount === 0) {
    return {
      beforeCount,
      afterCount: beforeCount,
      added: 0,
      removed: 0,
      updated: 0,
      wrote: false,
      reason: reason || "EMPTY_WRITE_GUARD",
      corruptBackup
    };
  }

  const nextEntries = { ...(existingEntries || {}) };
  let added = 0;
  let updated = 0;
  for (const [isoKey, entry] of Object.entries(incomingEntries)) {
    if (!entry || typeof entry !== "object") continue;
    const iso2 = String(entry.iso2 || entry.iso || isoKey || "").toUpperCase();
    if (!iso2) continue;
    const evidenceId = entry.evidence_id || buildEvidenceId(entry);
    const existing = nextEntries[iso2];
    const existingId = existing?.evidence_id || buildEvidenceId(existing);
    const normalized = { ...entry, iso: iso2, iso2, evidence_id: evidenceId || existingId };
    if (!existing) {
      nextEntries[iso2] = normalized;
      added += 1;
      continue;
    }
    if (evidenceId && existingId && evidenceId === existingId) {
      continue;
    }
    nextEntries[iso2] = normalized;
    updated += 1;
  }

  const afterCount = Object.keys(nextEntries).length;
  if (added === 0 && updated === 0) {
    return {
      beforeCount,
      afterCount: beforeCount,
      added,
      removed: 0,
      updated,
      wrote: false,
      reason: reason || "EMPTY_WRITE_GUARD",
      corruptBackup
    };
  }
  if (afterCount === 0 && beforeCount > 0) {
    return {
      beforeCount,
      afterCount: beforeCount,
      added: 0,
      removed: 0,
      updated: 0,
      wrote: false,
      reason: reason || "SKIP_EMPTY_WRITE",
      corruptBackup
    };
  }

  const payload = existingPayload && existingPayload.entries
    ? { ...existingPayload, generated_at: new Date().toISOString(), entries: nextEntries }
    : nextEntries;
  writeJsonAtomic(outputPath, payload);
  return {
    beforeCount,
    afterCount,
    added,
    removed: 0,
    updated,
    wrote: true,
    reason: reason || "OK",
    corruptBackup
  };
}
