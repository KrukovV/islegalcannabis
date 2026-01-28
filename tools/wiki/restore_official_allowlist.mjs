import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TARGET_PATH = path.join(ROOT, "data", "sources", "official_allowlist.json");
const SOURCE_CANDIDATES = [
  "/mnt/data/official_domains_whitelist.json",
  "/mnt/data/allowlist_domains.json",
  path.join(ROOT, "data", "sources", "official_domains_whitelist.json"),
  path.join(ROOT, "data", "sources", "allowlist_domains.json")
];

function loadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function pickSource() {
  for (const candidate of SOURCE_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function normalizeDomain(entry) {
  let value = String(entry || "").trim().toLowerCase();
  if (!value) return "";
  value = value.replace(/^https?:\/\//, "");
  value = value.split(/[/?#]/)[0];
  value = value.replace(/^www\./, "");
  return value;
}

function buildAllowlist(sourcePayload) {
  const allowed = Array.isArray(sourcePayload)
    ? sourcePayload
    : Array.isArray(sourcePayload?.allowed)
      ? sourcePayload.allowed
      : [];
  const domains = new Set();
  const patterns = new Set();
  for (const entry of allowed) {
    const normalized = normalizeDomain(entry);
    if (!normalized) continue;
    if (normalized.includes("*")) {
      patterns.add(normalized);
    } else {
      domains.add(normalized);
    }
  }
  return {
    domains: Array.from(domains).sort(),
    patterns: Array.from(patterns).sort()
  };
}

function guardAllowlist(prevCount, nextCount) {
  if (prevCount === 0) return;
  const minAllowed = Math.max(50, Math.floor(prevCount * 0.7));
  if (nextCount < minAllowed) {
    console.log(
      `OFFICIAL_ALLOWLIST_GUARD_FAIL prev=${prevCount} new=${nextCount} reason=SHRUNK_TOO_MUCH`
    );
    process.exit(1);
  }
}

const sourcePath = pickSource();
if (!sourcePath) {
  console.log("OFFICIAL_ALLOWLIST_RESTORE_FAIL reason=NO_SOURCE");
  process.exit(1);
}

const sourcePayload = loadJson(sourcePath);
if (!sourcePayload) {
  console.log("OFFICIAL_ALLOWLIST_RESTORE_FAIL reason=JSON_INVALID");
  process.exit(1);
}

const nextAllowlist = buildAllowlist(sourcePayload);
if (nextAllowlist.domains.length <= 4) {
  console.log(
    `OFFICIAL_ALLOWLIST_RESTORE_FAIL reason=TOO_SMALL domains=${nextAllowlist.domains.length}`
  );
  process.exit(1);
}

let prevCount = 0;
if (fs.existsSync(TARGET_PATH)) {
  const prevPayload = loadJson(TARGET_PATH);
  if (!prevPayload) {
    console.log("OFFICIAL_ALLOWLIST_GUARD_FAIL reason=JSON_INVALID");
    process.exit(1);
  }
  prevCount = Array.isArray(prevPayload?.domains) ? prevPayload.domains.length : 0;
}
guardAllowlist(prevCount, nextAllowlist.domains.length);

const ts = new Date().toISOString().replace(/[:.]/g, "-");
if (fs.existsSync(TARGET_PATH)) {
  const backupPath = `${TARGET_PATH}.bak.${ts}`;
  fs.copyFileSync(TARGET_PATH, backupPath);
}

fs.mkdirSync(path.dirname(TARGET_PATH), { recursive: true });
const tmpPath = `${TARGET_PATH}.tmp`;
fs.writeFileSync(tmpPath, JSON.stringify(nextAllowlist, null, 2) + "\n");
fs.renameSync(tmpPath, TARGET_PATH);

console.log(
  `OFFICIAL_ALLOWLIST_RESTORED domains=${nextAllowlist.domains.length} patterns=${nextAllowlist.patterns.length} source=${sourcePath}`
);
console.log(`OFFICIAL_ALLOWLIST_SIZE domains=${nextAllowlist.domains.length}`);
