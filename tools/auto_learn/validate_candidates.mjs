import fs from "node:fs";
import path from "node:path";
import { validateCandidateUrl } from "./validate_url.mjs";

const ROOT = process.cwd();
const DEFAULT_CANDIDATES = path.join(
  ROOT,
  "data",
  "sources",
  "wikidata_candidates.json"
);
const DEFAULT_VALIDATED = path.join(
  ROOT,
  "data",
  "sources",
  "wikidata_validated.json"
);
const PRIMARY_ALLOWLIST = path.join(ROOT, "data", "sources", "allowlist_domains.json");
const DEFAULT_ALLOWLIST = path.join(
  ROOT,
  "data",
  "sources",
  "official_domains_whitelist.json"
);
const DENYLIST_PATH = path.join(ROOT, "data", "sources", "domain_denylist.json");
const REPORT_PATH = path.join(ROOT, "Reports", "auto_learn", "validate_candidates.json");

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + "\n");
}

function normalizeUrl(url) {
  return String(url || "").trim();
}

function normalizeCandidateList(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((entry) => {
      if (typeof entry === "string") {
        return { url: normalizeUrl(entry), source: "wikidata", prop: "P856" };
      }
      if (entry && typeof entry === "object") {
        return {
          url: normalizeUrl(entry.url),
          source: entry.source || "wikidata",
          prop: entry.prop || "P856",
          fetched_at: entry.fetched_at
        };
      }
      return null;
    })
    .filter((entry) => entry && entry.url);
}

async function main() {
  const args = process.argv.slice(2);
  let candidatesPath = DEFAULT_CANDIDATES;
  let allowlistPath = fs.existsSync(PRIMARY_ALLOWLIST)
    ? PRIMARY_ALLOWLIST
    : DEFAULT_ALLOWLIST;
  for (let i = 0; i < args.length; i += 1) {
    const value = args[i + 1];
    if (args[i] === "--candidates" && value) candidatesPath = value;
    if (args[i] === "--allowlist" && value) allowlistPath = value;
  }

  const candidatesPayload = readJson(candidatesPath) || {};
  const discoveredAt = candidatesPayload.generated_at || new Date().toISOString();

  const rejected = [];
  let validatedCount = 0;
  const validatedOutput = {};
  const rejectedByIso = {};

  const candidates = candidatesPayload.candidates || {};
  for (const [iso2, urls] of Object.entries(candidates)) {
    const normalized = normalizeCandidateList(urls);
    if (normalized.length === 0) continue;
    const validated = [];
    const rejectedReasons = [];
    for (const entry of normalized) {
      const verdict = await validateCandidateUrl(entry.url, {
        allowlistPath,
        denylistPath: DENYLIST_PATH
      });
      if (!verdict.ok) {
        const reason = verdict.reason || "invalid";
        rejected.push({ iso2, url: entry.url, reason });
        rejectedReasons.push({ url: entry.url, reason });
        continue;
      }
      validated.push({
        final_url: verdict.finalUrl || entry.url,
        status_code: Number(verdict.status || 0) || 0,
        checked_at: new Date().toISOString()
      });
      validatedCount += 1;
    }
    if (validated.length > 0) {
      validatedOutput[iso2] = validated;
    }
    if (rejectedReasons.length > 0) {
      rejectedByIso[iso2] = rejectedReasons;
    }
  }

  fs.mkdirSync(path.dirname(DEFAULT_VALIDATED), { recursive: true });
  fs.writeFileSync(
    DEFAULT_VALIDATED,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        discovered_at: discoveredAt,
        candidates_source: candidatesPath,
        validated: Object.fromEntries(
          Object.entries(validatedOutput).sort(([a], [b]) => a.localeCompare(b))
        ),
        rejected: rejectedByIso
      },
      null,
      2
    ) + "\n"
  );

  const report = {
    ts: new Date().toISOString(),
    validated_count: validatedCount,
    rejected_count: rejected.length,
    updated_iso2: Object.keys(validatedOutput).sort(),
    rejected
  };
  writeJson(REPORT_PATH, report);

  console.log(
    `VALIDATE_CANDIDATES: validated=${report.validated_count} rejected=${report.rejected_count}`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  });
}
