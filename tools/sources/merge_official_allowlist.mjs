import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const INPUTS = [
  path.join(ROOT, "data", "sources", "allowlist_domains.json"),
  path.join(ROOT, "data", "sources", "official_allowlist.json"),
  path.join(ROOT, "data", "sources", "official_domains_whitelist.json"),
  path.join(ROOT, "data", "sources", "allow_domains.json")
];
const OUTPUT_PATH = path.join(ROOT, "data", "sources", "official_allowlist.json");

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function normalizeDomain(raw) {
  let value = String(raw || "").trim();
  if (!value) return "";
  const hasWildcard = value.includes("*");
  if (hasWildcard) {
    value = value.replace(/^[a-z]+:\/\//i, "");
    value = value.split("/")[0] ?? "";
    value = value.trim().toLowerCase().replace(/\s+/g, "");
    if (value.startsWith("www.")) value = value.slice(4);
    value = value.replace(/\.$/, "");
    return value;
  }
  try {
    value = new URL(value).hostname;
  } catch {
    value = value.replace(/^[a-z]+:\/\//i, "");
    value = value.split("/")[0] ?? "";
  }
  value = value.trim().toLowerCase().replace(/\s+/g, "");
  if (value.startsWith("www.")) value = value.slice(4);
  value = value.replace(/\.$/, "");
  if (!value.includes(".")) return "";
  return value;
}

function extractDomains(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.domains)) return payload.domains;
  if (Array.isArray(payload.allowed)) return payload.allowed;
  if (Array.isArray(payload.allow_suffixes)) return payload.allow_suffixes;
  if (payload.country_allow_domains && typeof payload.country_allow_domains === "object") {
    return Object.values(payload.country_allow_domains).flat();
  }
  return [];
}

function main() {
  const sources = [];
  const rawDomains = [];
  const inputStats = [];
  for (const input of INPUTS) {
    if (!fs.existsSync(input)) {
      console.log(`OFFICIAL_IMPORT_FAIL reason=MISSING_INPUT path=${path.relative(ROOT, input)}`);
      process.exit(1);
    }
    const payload = readJson(input);
    const extracted = extractDomains(payload);
    const normalized = extracted.map(normalizeDomain).filter(Boolean);
    const unique = Array.from(new Set(normalized));
    rawDomains.push(...extracted);
    const name = path.basename(input);
    sources.push(name);
    inputStats.push({ name, raw: extracted.length, normalized: normalized.length, unique: unique.length });
  }

  const normalized = rawDomains.map(normalizeDomain).filter(Boolean);
  const unique = Array.from(new Set(normalized)).sort();
  const maxInput = Math.max(0, ...inputStats.map((entry) => entry.unique || 0));
  if (unique.length < maxInput) {
    console.log(`OFFICIAL_ALLOWLIST_FAIL reason=ALLOWLIST_SHRINK max_input=${maxInput} output=${unique.length}`);
    process.exit(1);
  }
  const allowlistPayload = readJson(path.join(ROOT, "data", "sources", "allowlist_domains.json"));
  const allowDomainsPayload = readJson(path.join(ROOT, "data", "sources", "allow_domains.json"));
  const officialWhitelistPayload = readJson(path.join(ROOT, "data", "sources", "official_domains_whitelist.json"));
  const officialAllowlistPayload = readJson(path.join(ROOT, "data", "sources", "official_allowlist.json"));
  const allowlistUnique = Array.from(
    new Set(extractDomains(allowlistPayload).map(normalizeDomain).filter(Boolean))
  );
  const allowDomainsUnique = Array.from(
    new Set(extractDomains(allowDomainsPayload).map(normalizeDomain).filter(Boolean))
  );
  const officialWhitelistUnique = Array.from(
    new Set(extractDomains(officialWhitelistPayload).map(normalizeDomain).filter(Boolean))
  );
  const officialAllowlistUnique = Array.from(
    new Set(extractDomains(officialAllowlistPayload).map(normalizeDomain).filter(Boolean))
  );
  console.log(
    `OFFICIAL_ALLOWLIST_DOMAINS_LEN=${unique.length} INPUT_allowlist_domains_LEN=${allowlistUnique.length} INPUT_allow_domains_LEN=${allowDomainsUnique.length} INPUT_official_domains_whitelist_LEN=${officialWhitelistUnique.length} INPUT_official_allowlist_LEN=${officialAllowlistUnique.length}`
  );
  const maxInputLen = Math.max(
    allowlistUnique.length,
    allowDomainsUnique.length,
    officialWhitelistUnique.length,
    officialAllowlistUnique.length
  );
  if (unique.length < allowlistUnique.length) {
    console.log(`OFFICIAL_ALLOWLIST_FAIL reason=ALLOWLIST_MERGE_UNDERREAD allowlist_domains=${allowlistUnique.length} output=${unique.length}`);
    process.exit(1);
  }
  if (unique.length < maxInputLen) {
    console.log(`OFFICIAL_ALLOWLIST_FAIL reason=ALLOWLIST_MERGE_UNDERREAD max_input=${maxInputLen} output=${unique.length}`);
    process.exit(1);
  }

  const output = {
    domains: unique,
    generated_at: new Date().toISOString(),
    sources
  };

  const existing = readJson(OUTPUT_PATH);
  const existingDomains = extractDomains(existing).map(normalizeDomain).filter(Boolean);
  const unchanged = existingDomains.length === unique.length &&
    existingDomains.join("\n") === unique.join("\n");
  if (!unchanged) {
    const backupPath = `${OUTPUT_PATH}.bak.${new Date().toISOString().replace(/[:.]/g, "-")}`;
    if (fs.existsSync(OUTPUT_PATH)) {
      fs.copyFileSync(OUTPUT_PATH, backupPath);
    }
    const tmpPath = `${OUTPUT_PATH}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(output, null, 2) + "\n");
    fs.renameSync(tmpPath, OUTPUT_PATH);
  }

  console.log(`OFFICIAL_ALLOWLIST_SOURCES=${sources.length}/${INPUTS.length}`);
  const inputLens = inputStats
    .map((entry) => `${entry.name}=${entry.unique}`)
    .join(" ");
  console.log(`OFFICIAL_ALLOWLIST_INPUT_LENS ${inputLens}`);
  console.log(`OFFICIAL_ALLOWLIST_DOMAINS_LEN=${unique.length}`);
  console.log(
    `OFFICIAL_IMPORT_INPUTS found=${sources.length} used=${sources.length} missing=${INPUTS.length - sources.length}`
  );
  console.log(
    `OFFICIAL_IMPORT_COUNTS raw=${rawDomains.length} normalized=${normalized.length} unique=${unique.length}`
  );
  console.log(
    `OFFICIAL_IMPORT_WRITE path=${path.relative(ROOT, OUTPUT_PATH)} domains=${unique.length}`
  );
  if (unchanged) {
    console.log("OFFICIAL_IMPORT_UNCHANGED=1");
  }
  console.log(`OFFICIAL_ALLOWLIST_RESTORED domains=${unique.length}`);
  console.log(`OFFICIAL_ALLOWLIST_SIZE domains=${unique.length}`);
}

main();
