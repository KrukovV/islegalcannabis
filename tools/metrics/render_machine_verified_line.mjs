import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const AUTO_PATH = path.join(ROOT, "data", "legal_ssot", "machine_verified.json");
const FACTS_REPORT = path.join(ROOT, "Reports", "auto_facts", "last_run.json");
const VERIFY_REPORT = path.join(ROOT, "Reports", "auto_verify", "last_run.json");

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function readReportHints() {
  let mvWrote = true;
  let mvReason = "";
  if (fs.existsSync(FACTS_REPORT)) {
    try {
      const data = JSON.parse(fs.readFileSync(FACTS_REPORT, "utf8"));
      if (typeof data.mv_wrote === "boolean") mvWrote = data.mv_wrote;
      mvReason = String(data.mv_write_reason || "");
    } catch {
      mvWrote = true;
      mvReason = "";
    }
  } else if (fs.existsSync(VERIFY_REPORT)) {
    try {
      const data = JSON.parse(fs.readFileSync(VERIFY_REPORT, "utf8"));
      if (typeof data.mv_wrote === "boolean") mvWrote = data.mv_wrote;
      mvReason = String(data.mv_write_reason || "");
    } catch {
      mvWrote = true;
      mvReason = "";
    }
  }
  if (!mvWrote && !mvReason) mvReason = "EMPTY_WRITE_GUARD";
  return { mvWrote, mvReason };
}

const payload = readJson(AUTO_PATH, {});
const entries =
  payload && typeof payload === "object" && payload.entries
    ? payload.entries
    : payload;
const record = entries && typeof entries === "object" ? entries : {};
const values = Object.values(record);
const { mvWrote, mvReason } = readReportHints();
const forceEmpty = !mvWrote && mvReason === "EMPTY_WRITE_GUARD";
const total = forceEmpty ? 0 : values.length;
const evidenceOk = forceEmpty
  ? 0
  : values.filter((entry) =>
      Array.isArray(entry?.evidence) && entry.evidence.length > 0
    ).length;

let delta = 0;
const preHash = process.env.MACHINE_PRE_HASH || "";
const preMtime = Number(process.env.MACHINE_PRE_MTIME || 0) || 0;
const preCount = Number(process.env.MACHINE_PRE_COUNT || 0) || 0;
const startEpoch = Number(process.env.RUN_STARTED_AT || 0) || 0;
if (forceEmpty) {
  delta = 0;
}
if (!forceEmpty && fs.existsSync(AUTO_PATH) && (preHash || preMtime || preCount)) {
  const stat = fs.statSync(AUTO_PATH);
  const raw = fs.readFileSync(AUTO_PATH);
  const hash = sha256(raw);
  const changed =
    (preHash && hash && hash !== preHash) ||
    (preMtime && stat.mtimeMs > preMtime);
  const fresh = startEpoch ? stat.mtimeMs >= startEpoch * 1000 : true;
  if (changed && fresh) {
    delta = Math.max(0, total - preCount);
  }
}
const deltaLabel = `${delta >= 0 ? "+" : ""}${delta}`;

console.log(`Machine Verified: total=${total} delta=${deltaLabel} evidence_ok=${evidenceOk}`);
