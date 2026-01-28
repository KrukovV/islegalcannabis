import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const refsPath = fs.existsSync(path.join(ROOT, "data", "wiki_ssot", "wiki_refs.json"))
  ? path.join(ROOT, "data", "wiki_ssot", "wiki_refs.json")
  : path.join(ROOT, "data", "wiki", "wiki_claims_enriched.json");
const allowlistPath = path.join(ROOT, "data", "sources", "official_allowlist.json");
const reportTxtPath = path.join(ROOT, "Reports", "official_diff.txt");
const reportJsonPath = path.join(ROOT, "Reports", "official_diff.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeHost(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  try {
    const url = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    if (!host || /^[\d.]+$/.test(host) || host === "localhost") return "";
    return host;
  } catch {
    return "";
  }
}

const allowlistPayload = readJson(allowlistPath);
const allowlistDomains = new Set(
  (Array.isArray(allowlistPayload) ? allowlistPayload : allowlistPayload.domains || [])
    .map((d) => normalizeHost(d))
    .filter(Boolean)
);

const refsPayload = readJson(refsPath);
const refsItems = refsPayload?.items || refsPayload;
const refsList = Array.isArray(refsItems) ? refsItems : Object.values(refsItems || {});

const domainCounts = new Map();
let refsTotal = 0;
for (const entry of refsList) {
  const refs = Array.isArray(entry?.refs) ? entry.refs : Array.isArray(entry) ? entry : [];
  for (const ref of refs) {
    const url = typeof ref === "string" ? ref : ref?.url || ref?.href || ref?.link || "";
    const host = normalizeHost(url);
    if (!host) continue;
    refsTotal += 1;
    domainCounts.set(host, (domainCounts.get(host) || 0) + 1);
  }
}

const domainsTotal = domainCounts.size;
let matchedDomains = 0;
let missingDomains = 0;
const matched = [];
const missing = [];
for (const [host, count] of domainCounts.entries()) {
  if (allowlistDomains.has(host)) {
    matchedDomains += 1;
    matched.push([host, count]);
  } else {
    missingDomains += 1;
    missing.push([host, count]);
  }
}

matched.sort((a, b) => b[1] - a[1]);
missing.sort((a, b) => b[1] - a[1]);

const summaryLine = `OFFICIAL_DIFF_SUMMARY total=${domainsTotal} allowlist=${allowlistDomains.size} matched=${matchedDomains} missing=${missingDomains} ratio=${domainsTotal ? (matchedDomains / domainsTotal).toFixed(4) : "0.0000"} refs=${refsTotal}`;
console.log(summaryLine);

fs.mkdirSync(path.dirname(reportTxtPath), { recursive: true });
const lines = [
  summaryLine,
  "OFFICIAL_DIFF_TOP_UNMATCHED n=50"
];
for (const [host, count] of missing.slice(0, 50)) {
  lines.push(`${host} ${count}`);
}
lines.push("OFFICIAL_DIFF_TOP_MATCHED n=50");
for (const [host, count] of matched.slice(0, 50)) {
  lines.push(`${host} ${count}`);
}
fs.writeFileSync(reportTxtPath, `${lines.join("\n")}\n`);

const reportJson = {
  totals: {
    domains_total: domainsTotal,
    allowlist_total: allowlistDomains.size,
    matched_total: matchedDomains,
    missing_total: missingDomains,
    ratio: domainsTotal ? matchedDomains / domainsTotal : 0,
    refs_total: refsTotal
  },
  top_missing: missing.slice(0, 50).map(([host, count]) => ({ host, count })),
  top_matched: matched.slice(0, 50).map(([host, count]) => ({ host, count }))
};
fs.writeFileSync(reportJsonPath, JSON.stringify(reportJson, null, 2));
