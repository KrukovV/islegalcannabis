import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const IMPORT_DIR =
  process.env.OFFICIAL_IMPORT_DIR ||
  path.join(ROOT, "data", "import", "official_allowlist");
const OUTPUT_PATH = path.join(ROOT, "data", "sources", "official_allowlist.json");
const MIN_IMPORT = Number(process.env.MIN_IMPORT || 50);

const INPUT_FILES = [
  "official_domains_whitelist.json",
  "allowlist_domains.json",
  "official_registry.json",
  "sources_registry.json",
  "government_portals_parsed.json",
  "government_portals_seed.json",
  "wikidata_candidates.json",
  "government_domains_seed.txt",
  "portals_seed.txt",
  "governmentof_raw.txt"
];

if (String(process.env.CI || "") === "1" || String(process.env.CI || "") === "true") {
  console.log("OFFICIAL_IMPORT_BLOCKED reason=CI");
  process.exit(1);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function extractCandidates(value, acc) {
  if (!value) return;
  if (typeof value === "string") {
    acc.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) extractCandidates(entry, acc);
    return;
  }
  if (typeof value === "object") {
    for (const entry of Object.values(value)) extractCandidates(entry, acc);
  }
}

function normalizeDomain(raw) {
  const input = String(raw || "").trim();
  if (!input) return "";
  let host = "";
  try {
    host = new URL(input).hostname;
  } catch {
    host = input
      .replace(/^[a-z]+:\/\//i, "")
      .replace(/\/.*$/, "")
      .trim();
  }
  host = host.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  if (!host || host === "localhost") return "";
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return "";
  if (!host.includes(".")) return "";
  return host;
}

function loadInputs() {
  const found = [];
  const missing = [];
  const rawValues = [];
  const sourceCounts = {};
  for (const file of INPUT_FILES) {
    const fullPath = path.resolve(IMPORT_DIR, file);
    if (!fs.existsSync(fullPath)) {
      missing.push(file);
      continue;
    }
    found.push(file);
    if (file.endsWith(".json")) {
      const payload = readJson(fullPath);
      if (!payload) continue;
      const candidates = [];
      if (Array.isArray(payload)) {
        extractCandidates(payload, candidates);
      } else if (Array.isArray(payload?.domains)) {
        extractCandidates(payload.domains, candidates);
      } else if (Array.isArray(payload?.allowed)) {
        extractCandidates(payload.allowed, candidates);
      } else if (Array.isArray(payload?.items)) {
        extractCandidates(payload.items, candidates);
      } else {
        extractCandidates(payload, candidates);
      }
      rawValues.push(...candidates);
      sourceCounts[file] = candidates.length;
    } else {
      const text = fs.readFileSync(fullPath, "utf8");
      const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      rawValues.push(...lines);
      sourceCounts[file] = lines.length;
    }
  }
  return {
    found,
    missing,
    rawValues,
    sourceCounts
  };
}

function main() {
  const { found, missing, rawValues, sourceCounts } = loadInputs();
  const normalized = rawValues.map(normalizeDomain).filter(Boolean);
  const unique = Array.from(new Set(normalized)).sort();

  console.log(
    `OFFICIAL_IMPORT_INPUTS found=${found.length} used=${Object.keys(sourceCounts).length} missing=${missing.length}`
  );
  console.log(
    `OFFICIAL_IMPORT_COUNTS raw=${rawValues.length} normalized=${normalized.length} unique=${unique.length}`
  );

  if (unique.length < MIN_IMPORT) {
    console.log(
      `OFFICIAL_IMPORT_FAIL reason=TOO_FEW_DOMAINS min=${MIN_IMPORT} found=${unique.length}`
    );
    process.exit(1);
  }

  const prevPayload = readJson(OUTPUT_PATH);
  const prevDomains = Array.isArray(prevPayload?.domains) ? prevPayload.domains : [];
  const expectedMin = Math.max(50, Math.floor(prevDomains.length * 0.7));
  if (prevDomains.length > 0 && unique.length < expectedMin) {
    console.log(
      `OFFICIAL_ALLOWLIST_GUARD_FAIL prev=${prevDomains.length} new=${unique.length} reason=SHRUNK_TOO_MUCH`
    );
    process.exit(1);
  }

  const output = {
    domains: unique,
    meta: {
      generated_at: new Date().toISOString(),
      sources: sourceCounts
    }
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  const backupPath = `${OUTPUT_PATH}.bak.${Date.now()}`;
  if (fs.existsSync(OUTPUT_PATH)) {
    fs.copyFileSync(OUTPUT_PATH, backupPath);
  }
  const tmpPath = `${OUTPUT_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(output, null, 2) + "\n");
  fs.renameSync(tmpPath, OUTPUT_PATH);

  console.log(`OFFICIAL_IMPORT_WRITE path=${path.relative(ROOT, OUTPUT_PATH)} domains=${unique.length}`);
  console.log(`OFFICIAL_ALLOWLIST_SIZE domains=${unique.length}`);
  console.log(`OFFICIAL_ALLOWLIST_RESTORED domains=${unique.length}`);
}

main();
