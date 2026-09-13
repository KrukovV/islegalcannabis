import fs from "node:fs";
import path from "node:path";
import type {
  OfficialLinkOwnershipDataset,
  OfficialLinkOwnershipEntry,
  SourceAuthorityOwnerEntry
} from "./officialLinkOwnershipTypes.ts";

const SOURCE_AUTHORITY_OWNER_KEYS = ["id", "aliases", "scope", "parent_geos", "official_domains", "active"].sort();
const SOURCE_AUTHORITY_OWNER_SCOPES = new Set(["subnational", "supranational", "global"]);
const FORBIDDEN_SOURCE_AUTHORITY_IDENTITIES = new Set(["UN", "INTL", "WEB_ARCHIVE"]);

function isForbiddenSourceAuthorityIdentity(value: string) {
  return FORBIDDEN_SOURCE_AUTHORITY_IDENTITIES.has(value) || value.startsWith("UNCONFIRMED");
}

function normalizeDomain(value: string) {
  return String(value || "").trim().toLowerCase().replace(/^www\./, "").replace(/^\.+|\.+$/g, "");
}

function normalizeGeo(value: string) {
  return String(value || "").trim().toUpperCase();
}

function normalizeUrlOrDomain(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return { raw: "", domain: "" };
  try {
    const parsed = new URL(raw);
    return { raw, domain: normalizeDomain(parsed.hostname) };
  } catch {
    return { raw, domain: normalizeDomain(raw) };
  }
}

function isSortedUnique(values: unknown, normalize: (_value: string) => string) {
  if (!Array.isArray(values) || values.some((value) => typeof value !== "string")) return false;
  const normalized = [...new Set(values.map((value) => normalize(value)).filter(Boolean))].sort();
  return JSON.stringify(values) === JSON.stringify(normalized);
}

function hasExactKeys(value: object, keys: string[]) {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify(keys);
}

export function validateSourceAuthorityOwners(
  dataset: Pick<OfficialLinkOwnershipDataset, "source_authority_owners">,
  canonicalGeos: ReadonlySet<string>,
  officialDomains: readonly string[]
) {
  const entries = dataset.source_authority_owners;
  if (entries === undefined) return new Map<string, SourceAuthorityOwnerEntry>();
  if (!Array.isArray(entries)) throw new Error("SOURCE_AUTHORITY_OWNERS_INVALID");
  const official = officialDomains.map(normalizeDomain).filter(Boolean);
  const identities = new Set<string>();
  let priorId = "";
  const index = new Map<string, SourceAuthorityOwnerEntry>();
  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || !hasExactKeys(entry, SOURCE_AUTHORITY_OWNER_KEYS)
      || !/^[A-Z][A-Z0-9-]*$/.test(entry.id)
      || entry.id <= priorId
      || entry.active !== true
      || !SOURCE_AUTHORITY_OWNER_SCOPES.has(entry.scope)
      || !isSortedUnique(entry.aliases, (value) => String(value).trim().toUpperCase())
      || entry.aliases.some((alias) => !/^[A-Z][A-Z0-9_-]*$/.test(alias))
      || !isSortedUnique(entry.parent_geos, normalizeGeo)
      || entry.parent_geos.some((geo) => !canonicalGeos.has(geo))
      || (entry.scope === "subnational" && entry.parent_geos.length !== 1)
      || (entry.scope === "global" && entry.parent_geos.length !== 0)
      || !entry.official_domains.length
      || !isSortedUnique(entry.official_domains, normalizeDomain)
      || entry.official_domains.some((domain) => !official.some((registered) => (
        domain === registered || domain.endsWith(`.${registered}`)
      )))) {
      throw new Error(`SOURCE_AUTHORITY_OWNER_INVALID=${entry?.id || "EMPTY"}`);
    }
    priorId = entry.id;
    for (const identity of [entry.id, ...entry.aliases]) {
      if (canonicalGeos.has(identity) || identities.has(identity) || isForbiddenSourceAuthorityIdentity(identity)) {
        throw new Error(`SOURCE_AUTHORITY_OWNER_IDENTITY_INVALID=${identity}`);
      }
      identities.add(identity);
      index.set(identity, entry);
    }
  }
  return index;
}

export function matchesSourceAuthorityOwner(
  sourceOwnerGeo: string,
  sourceUrl: string,
  canonicalGeos: ReadonlySet<string>,
  authorityOwners: ReadonlyMap<string, SourceAuthorityOwnerEntry>
) {
  if (canonicalGeos.has(sourceOwnerGeo)) return true;
  const owner = authorityOwners.get(sourceOwnerGeo);
  if (!owner?.active) return false;
  let host = "";
  try {
    host = normalizeDomain(new URL(sourceUrl).hostname);
  } catch {
    return false;
  }
  return owner.official_domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

export function hasRequiredSourceAuthorityLegalBasis(
  sourceOwnerGeo: string,
  operationGeo: string,
  appliesToGeos: readonly string[],
  legalBasisForExtension: string
) {
  const required = sourceOwnerGeo !== operationGeo || appliesToGeos.length > 1;
  return !required || Boolean(legalBasisForExtension.trim() && legalBasisForExtension !== "NOT_RECORDED");
}

export function readOfficialLinkOwnership(rootDir: string): OfficialLinkOwnershipDataset {
  const filePath = path.join(rootDir, "data", "ssot", "official_link_ownership.json");
  if (!fs.existsSync(filePath)) {
    return {
      generated_at: "",
      raw_registry_total: 0,
      effective_registry_total: 0,
      source_authority_owners: [],
      items: [],
      diagnostics: {
        registry_total_raw: 0,
        registry_total_unique_urls: 0,
        registry_total_unique_domains: 0,
        duplicates_exact: 0,
        duplicates_same_target: 0,
        unresolved_links: 0,
        assigned_country_links: 0,
        assigned_state_links: 0,
        assigned_territory_links: 0,
        assigned_multi_geo_links: 0,
        assigned_global_links: 0,
        unresolved_unknown_links: 0,
        raw_vs_effective_explainer: ""
      }
    };
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as OfficialLinkOwnershipDataset;
}

export function buildOfficialLinkOwnershipIndex(dataset: OfficialLinkOwnershipDataset) {
  const byDomain = new Map<string, OfficialLinkOwnershipEntry>();
  for (const entry of dataset.items || []) {
    byDomain.set(normalizeDomain(entry.domain || entry.normalized_url || entry.url), entry);
  }
  return byDomain;
}

export function resolveOfficialLinkOwnership(url: string, ownershipIndex: Map<string, OfficialLinkOwnershipEntry>) {
  const normalized = normalizeUrlOrDomain(url);
  if (!normalized.domain) return null;
  if (ownershipIndex.has(normalized.domain)) return ownershipIndex.get(normalized.domain) || null;
  for (const [domain, entry] of ownershipIndex.entries()) {
    if (normalized.domain === domain || normalized.domain.endsWith(`.${domain}`)) return entry;
  }
  return null;
}

export function isEffectiveOfficialOwnership(entry: OfficialLinkOwnershipEntry | null | undefined) {
  if (!entry) return false;
  if (!entry.effective) return false;
  if (!["country", "state", "multi_geo"].includes(entry.owner_scope)) return false;
  if (!["STRONG_OFFICIAL", "WEAK_OFFICIAL"].includes(entry.ownership_quality)) return false;
  if (entry.exclusion_reason !== "none") return false;
  return true;
}

export function matchesOfficialGeoOwnership(url: string, geo: string, ownershipIndex: Map<string, OfficialLinkOwnershipEntry>) {
  const entry = resolveOfficialLinkOwnership(url, ownershipIndex);
  if (!entry) return false;
  if (!isEffectiveOfficialOwnership(entry)) return false;
  const normalizedGeo = normalizeGeo(geo);
  return entry.owner_geos.map(normalizeGeo).includes(normalizedGeo);
}

export function getEffectiveOfficialLinksByGeo(
  geo: string,
  dataset: OfficialLinkOwnershipDataset
) {
  const normalizedGeo = normalizeGeo(geo);
  return (dataset.items || []).filter(
    (entry) => isEffectiveOfficialOwnership(entry) && entry.owner_geos.map(normalizeGeo).includes(normalizedGeo)
  );
}

export function hasEffectiveOfficialLinks(geo: string, dataset: OfficialLinkOwnershipDataset) {
  return getEffectiveOfficialLinksByGeo(geo, dataset).length > 0;
}

export function getUnknownOwnershipRows(dataset: OfficialLinkOwnershipDataset) {
  return (dataset.items || []).filter((entry) => entry.owner_scope === "unknown");
}

export function getFilteredOwnershipRows(dataset: OfficialLinkOwnershipDataset) {
  return (dataset.items || []).filter((entry) => !isEffectiveOfficialOwnership(entry));
}

export function getEffectiveOfficialCountryCoverage(
  validWikiRows: Array<{ geoKey?: string; iso2?: string }>,
  dataset: OfficialLinkOwnershipDataset
) {
  const geos = validWikiRows
    .map((row) => normalizeGeo(String(row.geoKey || row.iso2 || "")))
    .filter((geo) => /^[A-Z]{2}$/.test(geo));
  const covered = geos.filter((geo) => hasEffectiveOfficialLinks(geo, dataset));
  return {
    total: geos.length,
    covered: covered.length,
    missing: geos.length - covered.length,
    coveredGeos: covered
  };
}
