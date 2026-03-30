import {
  GLOBAL_OFFICIAL_DOMAINS,
  inferSourceKind,
  MANUAL_DOMAIN_OWNERS,
  US_STATE_DOMAIN_RULES
} from "./officialLinkOwnershipRules";
import type {
  OfficialLinkOwnershipDataset,
  OfficialLinkOwnershipDiagnostics,
  OfficialLinkOwnershipEntry,
  OfficialMatchingBasis,
  OfficialOwnerScope,
  OfficialOwnershipBasis,
  OfficialOwnershipQuality,
  OfficialSourceScope
} from "./officialLinkOwnershipTypes";

type BuilderInput = {
  registryDomains: string[];
  legacyGeoDomainMap: Record<string, string[]>;
  catalogGeoDomainMap: Record<string, string[]>;
  usageGeoDomainMap: Record<string, string[]>;
};

function normalizeDomain(value: string) {
  return String(value || "").trim().toLowerCase().replace(/^www\./, "").replace(/^\.+|\.+$/g, "");
}

function normalizeGeo(value: string) {
  return String(value || "").trim().toUpperCase();
}

function countryFromGeo(geo: string) {
  return geo.startsWith("US-") ? "US" : geo;
}

function inferScopeFromGeoList(geos: string[]): OfficialOwnerScope {
  if (geos.length === 0) return "unknown";
  if (geos.length === 1) {
    const geo = geos[0];
    if (/^US-[A-Z]{2}$/.test(geo)) return "state";
    return geo.length === 2 ? "country" : "territory";
  }
  return "multi_geo";
}

function buildCountryLabel(geos: string[]) {
  if (!geos.length) return null;
  const primary = geos[0];
  const base = countryFromGeo(primary);
  if (/^[A-Z]{2}$/.test(base)) {
    try {
      const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
      return displayNames.of(base) || base;
    } catch {
      return base;
    }
  }
  if (base === "US") return "United States";
  return base;
}

function collectHints(input: BuilderInput, domain: string) {
  const hints = new Map<string, Set<string>>();
  for (const [geo, domains] of Object.entries(input.legacyGeoDomainMap)) {
    for (const candidate of domains) {
      if (normalizeDomain(candidate) === domain) {
        if (!hints.has("registry_hint")) hints.set("registry_hint", new Set());
        hints.get("registry_hint")!.add(normalizeGeo(geo));
      }
    }
  }
  for (const [geo, domains] of Object.entries(input.catalogGeoDomainMap)) {
    for (const candidate of domains) {
      if (normalizeDomain(candidate) === domain) {
        if (!hints.has("domain_rule")) hints.set("domain_rule", new Set());
        hints.get("domain_rule")!.add(normalizeGeo(geo));
      }
    }
  }
  for (const [geo, domains] of Object.entries(input.usageGeoDomainMap)) {
    for (const candidate of domains) {
      if (normalizeDomain(candidate) === domain) {
        if (!hints.has("page_title")) hints.set("page_title", new Set());
        hints.get("page_title")!.add(normalizeGeo(geo));
      }
    }
  }
  return hints;
}

function inferGeoFromCountryTld(domain: string) {
  const parts = domain.split(".");
  const tld = parts.at(-1) || "";
  if (/^[a-z]{2}$/.test(tld) && tld !== "uk") return tld.toUpperCase();
  return null;
}

function isBannedNonOfficialDomain(domain: string) {
  return /(?:^|\.)wikipedia\.org$|^books\.google\.|(?:^|\.)archive\.org$/i.test(domain);
}

function toSourceScope(ownerScope: OfficialOwnerScope): OfficialSourceScope {
  if (ownerScope === "country" || ownerScope === "territory") return "country";
  if (ownerScope === "state") return "state";
  if (ownerScope === "multi_geo") return "multi_geo";
  if (ownerScope === "global") return "global";
  return "unknown";
}

function isStrongSourceKind(sourceKind: OfficialLinkOwnershipEntry["source_kind"]) {
  return ["government", "ministry", "parliament", "court", "regulator", "official_publication"].includes(sourceKind);
}

function inferOwnershipQuality(params: {
  ownerScope: OfficialOwnerScope;
  sourceKind: OfficialLinkOwnershipEntry["source_kind"];
  domain: string;
  matchingBasis: OfficialMatchingBasis | OfficialOwnershipBasis;
}): OfficialOwnershipQuality {
  if (params.ownerScope === "global") return "GLOBAL_FALLBACK";
  if (params.ownerScope === "unknown") return "UNKNOWN";
  if (params.ownerScope === "multi_geo") return "WEAK_OFFICIAL";
  if (/who\.int$|lex\.europa\.eu$|europa\.eu$|un\.org$|unodc\.org$/.test(params.domain)) return "GLOBAL_FALLBACK";
  if (/postnl\.nl$|thuvienphapluat\.vn$|republicoftogo\.com$|korea-dpr\.com$|shabait\.com$/.test(params.domain)) {
    return "WEAK_OFFICIAL";
  }
  if (isStrongSourceKind(params.sourceKind) && params.matchingBasis !== "page_title") {
    return "STRONG_OFFICIAL";
  }
  if (isStrongSourceKind(params.sourceKind) && params.matchingBasis === "page_title") {
    return "WEAK_OFFICIAL";
  }
  return "WEAK_OFFICIAL";
}

function resolveDomainOwnership(domain: string, input: BuilderInput): OfficialLinkOwnershipEntry {
  if (isBannedNonOfficialDomain(domain)) {
    return {
      url: domain,
      normalized_url: domain,
      domain,
      source_scope: "unknown",
      owner_scope: "unknown",
      owner_geos: [],
      owner_country: null,
      source_kind: "other_official",
      matching_basis: "manual",
      ownership_basis: "unresolved",
      ownership_quality: "UNKNOWN",
      confidence: "high",
      notes: "Protected registry raw entry retained, but excluded from country-level official coverage.",
      is_active_for_country_coverage: false
      ,
      effective: false,
      exclusion_reason: "banned_non_official"
    };
  }

  const manual = MANUAL_DOMAIN_OWNERS[domain];
  if (manual) {
    const sourceKind = inferSourceKind(domain);
    const ownershipQuality =
      manual.scope === "global"
        ? "GLOBAL_FALLBACK"
        : inferOwnershipQuality({
            ownerScope: manual.scope,
            sourceKind,
            domain,
            matchingBasis: manual.basis === "manual" ? "manual_alias_match" : "global_projection"
          });
    return {
      url: domain,
      normalized_url: domain,
      domain,
      source_scope: toSourceScope(manual.scope),
      owner_scope: manual.scope,
      owner_geos: manual.geos,
      owner_country: buildCountryLabel(manual.geos),
      source_kind: sourceKind,
      matching_basis: manual.basis,
      ownership_basis: manual.basis === "manual" ? "manual_alias_match" : "global_projection",
      ownership_quality: ownershipQuality,
      confidence: "high",
      notes: manual.scope === "global" ? "Manual treaty/global rule." : "Manual protected ownership rule.",
      is_active_for_country_coverage: manual.active,
      effective: manual.active && ownershipQuality !== "GLOBAL_FALLBACK",
      exclusion_reason: manual.active ? "none" : "global_non_country_coverage"
    };
  }

  if (GLOBAL_OFFICIAL_DOMAINS.has(domain)) {
    return {
      url: domain,
      normalized_url: domain,
      domain,
      source_scope: "global",
      owner_scope: "global",
      owner_geos: [],
      owner_country: null,
      source_kind: "treaty_body",
      matching_basis: "treaty_mapping",
      ownership_basis: "global_projection",
      ownership_quality: "GLOBAL_FALLBACK",
      confidence: "high",
      notes: "Global or supranational official source.",
      is_active_for_country_coverage: false,
      effective: false,
      exclusion_reason: "global_non_country_coverage"
    };
  }

  for (const rule of US_STATE_DOMAIN_RULES) {
    if (rule.pattern.test(domain)) {
      return {
        url: domain,
        normalized_url: domain,
        domain,
        source_scope: "state",
        owner_scope: "state",
        owner_geos: [rule.geo],
        owner_country: "United States",
        source_kind: inferSourceKind(domain),
        matching_basis: "state_name_match",
        ownership_basis: "state_domain_match",
        ownership_quality: "STRONG_OFFICIAL",
        confidence: "high",
        notes: "Matched US state-specific domain rule.",
        is_active_for_country_coverage: true,
        effective: true,
        exclusion_reason: "none"
      };
    }
  }

  const hints = collectHints(input, domain);
  const hintEntries = Array.from(hints.entries());
  const geoSet = new Set<string>();
  let matchingBasis: OfficialMatchingBasis = "domain_rule";
  for (const [basis, geos] of hintEntries) {
    matchingBasis = basis as OfficialMatchingBasis;
    for (const geo of geos) geoSet.add(geo);
  }
  const geos = Array.from(geoSet).sort();
  if (geos.length > 0) {
    const scope = inferScopeFromGeoList(geos);
    const uniqueCountries = new Set(geos.map(countryFromGeo));
    const ownerScope = uniqueCountries.size > 1 && geos.length > 1 ? "multi_geo" : scope;
    const sourceKind = inferSourceKind(domain);
    const ownershipBasis =
      matchingBasis === "state_name_match"
        ? "state_domain_match"
        : ownerScope === "multi_geo"
          ? "multi_geo_match"
          : matchingBasis === "page_title"
            ? "manual_alias_match"
            : matchingBasis === "registry_hint" || matchingBasis === "country_name_match" || matchingBasis === "domain_rule"
            ? "country_domain_match"
            : "manual_alias_match";
    const ownershipQuality = inferOwnershipQuality({
      ownerScope,
      sourceKind,
      domain,
      matchingBasis: ownershipBasis
    });
    return {
      url: domain,
      normalized_url: domain,
      domain,
      source_scope: toSourceScope(ownerScope),
      owner_scope: ownerScope,
      owner_geos: geos,
      owner_country: uniqueCountries.size === 1 ? buildCountryLabel([Array.from(uniqueCountries)[0]]) : null,
      source_kind: sourceKind,
      matching_basis: matchingBasis,
      ownership_basis: ownershipBasis,
      ownership_quality: ownershipQuality,
      confidence: geos.length === 1 ? "high" : "medium",
      notes: `Resolved from existing geo hints (${hintEntries.map(([basis]) => basis).join(", ")}).`,
      is_active_for_country_coverage: ownershipQuality !== "GLOBAL_FALLBACK",
      effective: ownershipQuality === "STRONG_OFFICIAL" || ownershipQuality === "WEAK_OFFICIAL",
      exclusion_reason: ownershipQuality === "GLOBAL_FALLBACK" ? "global_non_country_coverage" : "none"
    };
  }

  const tldGeo = inferGeoFromCountryTld(domain);
  if (tldGeo) {
    const sourceKind = inferSourceKind(domain);
    const ownershipQuality = inferOwnershipQuality({
      ownerScope: "country",
      sourceKind,
      domain,
      matchingBasis: "country_domain_match"
    });
    return {
      url: domain,
      normalized_url: domain,
      domain,
      source_scope: "country",
      owner_scope: "country",
      owner_geos: [tldGeo],
      owner_country: buildCountryLabel([tldGeo]),
      source_kind: sourceKind,
      matching_basis: "domain_rule",
      ownership_basis: "country_domain_match",
      ownership_quality: ownershipQuality,
      confidence: "medium",
      notes: "Resolved from ccTLD country domain rule.",
      is_active_for_country_coverage: true,
      effective: true,
      exclusion_reason: "none"
    };
  }

  return {
    url: domain,
    normalized_url: domain,
    domain,
    source_scope: "unknown",
    owner_scope: "unknown",
    owner_geos: [],
    owner_country: null,
    source_kind: inferSourceKind(domain),
    matching_basis: "domain_rule",
    ownership_basis: "unresolved",
    ownership_quality: "UNKNOWN",
    confidence: "low",
    notes: "No reliable owner mapping yet.",
    is_active_for_country_coverage: false,
    effective: false,
    exclusion_reason: "unresolved"
  };
}

export function buildOfficialLinkOwnershipDataset(input: BuilderInput): OfficialLinkOwnershipDataset {
  const normalizedDomains = input.registryDomains.map(normalizeDomain).filter(Boolean);
  const uniqueDomains = Array.from(new Set(normalizedDomains)).sort();
  const items = uniqueDomains.map((domain) => resolveDomainOwnership(domain, input));

  const diagnostics: OfficialLinkOwnershipDiagnostics = {
    registry_total_raw: input.registryDomains.length,
    registry_total_unique_urls: uniqueDomains.length,
    registry_total_unique_domains: uniqueDomains.length,
    duplicates_exact: Math.max(input.registryDomains.length - uniqueDomains.length, 0),
    duplicates_same_target: 0,
    unresolved_links: items.filter((entry) => entry.owner_scope === "unknown").length,
    assigned_country_links: items.filter((entry) => entry.owner_scope === "country").length,
    assigned_state_links: items.filter((entry) => entry.owner_scope === "state").length,
    assigned_territory_links: items.filter((entry) => entry.owner_scope === "territory").length,
    assigned_multi_geo_links: items.filter((entry) => entry.owner_scope === "multi_geo").length,
    assigned_global_links: items.filter((entry) => entry.owner_scope === "global").length,
    unresolved_unknown_links: items.filter((entry) => entry.owner_scope === "unknown").length,
    raw_vs_effective_explainer:
      "Raw registry total keeps all 418 protected official domains. Effective ownership is derived from the same raw registry after excluding unresolved and non-country/global coverage rows."
  };

  return {
    generated_at: new Date().toISOString(),
    raw_registry_total: uniqueDomains.length,
    effective_registry_total: items.filter((entry) => entry.effective).length,
    items,
    diagnostics
  };
}
