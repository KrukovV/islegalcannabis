import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const AUTO_PATH = path.join(ROOT, "data", "legal_ssot", "machine_verified.json");

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

const payload = readJson(AUTO_PATH, {});
const entries =
  payload && typeof payload === "object" && payload.entries
    ? payload.entries
    : payload;
const record = entries && typeof entries === "object" ? entries : {};
const values = Object.values(record);
const total = values.length;
const evidenceOk = values.filter((entry) =>
  Array.isArray(entry?.evidence) && entry.evidence.length > 0
).length;

let delta = 0;
const preHash = process.env.MACHINE_PRE_HASH || "";
const preMtime = Number(process.env.MACHINE_PRE_MTIME || 0) || 0;
const preCount = Number(process.env.MACHINE_PRE_COUNT || 0) || 0;
const startEpoch = Number(process.env.RUN_STARTED_AT || 0) || 0;
if (fs.existsSync(AUTO_PATH) && (preHash || preMtime || preCount)) {
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
