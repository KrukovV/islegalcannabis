#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeDomain(value) {
  return String(value || "").trim().toLowerCase().replace(/^www\./, "").replace(/^\.+|\.+$/g, "");
}

function domainsFromUrls(urls) {
  const out = [];
  for (const url of urls || []) {
    const raw = String(url || "").trim();
    if (!raw) continue;
    try {
      out.push(normalizeDomain(new URL(raw).hostname));
    } catch {
      out.push(normalizeDomain(raw));
    }
  }
  return out.filter(Boolean);
}

const { buildOfficialLinkOwnershipDataset } = await import(
  path.join(root, "apps/web/src/lib/officialSources/officialLinkOwnershipBuilder.ts")
);

const registry = readJson(path.join(root, "data/official/official_domains.ssot.json"), { domains: [] });
const legacyMap = readJson(path.join(root, "data/official_domains.json"), {});
const registryMap = readJson(path.join(root, "data/sources/official_registry.json"), {});
const catalog = readJson(path.join(root, "data/sources/official_catalog.json"), {});
const enriched = readJson(path.join(root, "data/wiki/wiki_claims_enriched.json"), { items: {} });

const legacyGeoDomainMap = {};
for (const [geo, domains] of Object.entries({ ...legacyMap, ...registryMap })) {
  legacyGeoDomainMap[String(geo).toUpperCase()] = (domains || []).map(normalizeDomain).filter(Boolean);
}

const catalogGeoDomainMap = {};
for (const [geo, row] of Object.entries(catalog)) {
  const domains = domainsFromUrls([
    ...(Array.isArray(row?.gov_portal) ? row.gov_portal : []),
    ...(Array.isArray(row?.government_portals) ? row.government_portals : []),
    ...(Array.isArray(row?.notes_portals) ? row.notes_portals : [])
  ]);
  if (domains.length) catalogGeoDomainMap[String(geo).toUpperCase()] = domains;
}

const usageGeoDomainMap = {};
for (const [geo, rows] of Object.entries(enriched.items || {})) {
  const domains = domainsFromUrls((rows || []).map((row) => row?.url));
  if (domains.length) usageGeoDomainMap[String(geo).toUpperCase()] = domains;
}

const dataset = buildOfficialLinkOwnershipDataset({
  registryDomains: Array.isArray(registry.domains) ? registry.domains : [],
  legacyGeoDomainMap,
  catalogGeoDomainMap,
  usageGeoDomainMap
});

const outPath = path.join(root, "data/ssot/official_link_ownership.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");

console.log(`OFFICIAL_LINK_OWNERSHIP_DATASET=${outPath}`);
console.log(`OFFICIAL_LINK_OWNERSHIP_TOTAL=${dataset.items.length}`);
console.log(`OFFICIAL_LINK_OWNERSHIP_UNKNOWN=${dataset.diagnostics.unresolved_unknown_links}`);
console.log(`OFFICIAL_LINK_OWNERSHIP_RAW_TOTAL=${dataset.raw_registry_total}`);
console.log(`OFFICIAL_LINK_OWNERSHIP_EFFECTIVE_TOTAL=${dataset.effective_registry_total}`);
