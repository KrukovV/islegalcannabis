import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildOfficialLinkOwnershipIndex,
  hasRequiredSourceAuthorityLegalBasis,
  matchesSourceAuthorityOwner,
  matchesOfficialGeoOwnership,
  readOfficialLinkOwnership,
  resolveOfficialLinkOwnership,
  validateSourceAuthorityOwners
} from "@/lib/officialSources/officialLinkOwnership";

function findRepoRoot(start: string): string {
  let current = start;
  for (let i = 0; i < 6; i += 1) {
    if (fs.existsSync(path.join(current, "data", "ssot", "official_link_ownership.json"))) return current;
    const parent = path.dirname(current);
    if (!parent || parent === current) break;
    current = parent;
  }
  return start;
}

describe("official link ownership", () => {
  const root = findRepoRoot(process.cwd());
  const dataset = readOfficialLinkOwnership(root);
  const index = buildOfficialLinkOwnershipIndex(dataset);
  const canonicalGeos = new Set<string>(JSON.parse(fs.readFileSync(
    path.join(root, "data", "reviews", "geo-list-307.json"),
    "utf8"
  )) as string[]);
  const officialDomains = (JSON.parse(fs.readFileSync(
    path.join(root, "data", "official", "official_domains.ssot.json"),
    "utf8"
  )) as { domains: string[] }).domains;
  const authorityOwners = validateSourceAuthorityOwners(dataset, canonicalGeos, officialDomains);

  it("keeps raw registry floors and explains effective filtered totals", () => {
    expect(dataset.raw_registry_total).toBe(418);
    expect(dataset.effective_registry_total).toBe(dataset.items.filter((entry) => entry.effective).length);
    expect(dataset.items).toHaveLength(dataset.raw_registry_total);
  });

  it("resolves country, state and global ownership deterministically", () => {
    expect(resolveOfficialLinkOwnership("https://www.gov.uk/", index)?.owner_geos).toEqual(["GB"]);
    expect(resolveOfficialLinkOwnership("https://www.canada.ca/en/health-canada.html", index)?.owner_geos).toEqual(["CA"]);
    expect(resolveOfficialLinkOwnership("https://cannabis.ny.gov/", index)?.owner_geos).toEqual(["US-NY"]);
    expect(resolveOfficialLinkOwnership("https://www.unodc.org/", index)?.owner_scope).toBe("global");
  });

  it("only matches owner-covered geos for official coverage", () => {
    expect(matchesOfficialGeoOwnership("https://www.gov.uk/", "GB", index)).toBe(true);
    expect(matchesOfficialGeoOwnership("https://www.gov.uk/", "DE", index)).toBe(false);
    expect(matchesOfficialGeoOwnership("https://www.unodc.org/", "DE", index)).toBe(false);
  });

  it("keeps non-country official fallbacks out of active country coverage", () => {
    const unodc = resolveOfficialLinkOwnership("https://www.unodc.org/", index);
    expect(unodc?.is_active_for_country_coverage).toBe(false);
    expect(unodc?.owner_scope).toBe("global");
  });

  it("allows only registered host-bound authority owner IDs and explicit aliases", () => {
    expect(dataset.source_authority_owners).toEqual([
      {
        id: "AU-WA",
        aliases: ["WA"],
        scope: "subnational",
        parent_geos: ["AU"],
        official_domains: ["wa.gov.au"],
        active: true
      },
      {
        id: "UNODC-GLOBAL",
        aliases: ["UNODC_GLOBAL"],
        scope: "global",
        parent_geos: [],
        official_domains: ["unodc.org"],
        active: true
      }
    ]);
    expect(matchesSourceAuthorityOwner("WA", "https://legislation.wa.gov.au/example", canonicalGeos, authorityOwners)).toBe(true);
    expect(matchesSourceAuthorityOwner("UNODC_GLOBAL", "https://www.unodc.org/example", canonicalGeos, authorityOwners)).toBe(true);
    expect(matchesSourceAuthorityOwner("WA", "https://legislation.nsw.gov.au/example", canonicalGeos, authorityOwners)).toBe(false);
    expect(matchesSourceAuthorityOwner("UN", "https://www.unodc.org/example", canonicalGeos, authorityOwners)).toBe(false);
    expect(hasRequiredSourceAuthorityLegalBasis("WA", "CC", ["CC"], "Direct territorial extension.")).toBe(true);
    expect(hasRequiredSourceAuthorityLegalBasis("WA", "CC", ["CC"], "NOT_RECORDED")).toBe(false);
    expect(hasRequiredSourceAuthorityLegalBasis("UNODC_GLOBAL", "NG", ["NG"], "Treaty evidence applies to Nigeria.")).toBe(true);
    expect(hasRequiredSourceAuthorityLegalBasis("UNODC_GLOBAL", "NG", ["NG"], "NOT_RECORDED")).toBe(false);
  });

  it("fails closed for malformed, colliding, inactive or unregistered authority owners", () => {
    const base = structuredClone(dataset.source_authority_owners);
    const invalidRegistries = [
      [{ ...base[0], active: false }, base[1]],
      [{ ...base[0], aliases: ["AU"] }, base[1]],
      [{ ...base[0], official_domains: ["example.com"] }, base[1]],
      [{ ...base[0], unexpected: true }, base[1]]
    ];
    for (const alias of ["UN", "INTL", "WEB_ARCHIVE", "UNCONFIRMED_OWNER"]) {
      invalidRegistries.push([{ ...base[0], aliases: [alias] }, base[1]]);
    }
    for (const source_authority_owners of invalidRegistries) {
      expect(() => validateSourceAuthorityOwners(
        { source_authority_owners } as typeof dataset,
        canonicalGeos,
        officialDomains
      )).toThrow(/SOURCE_AUTHORITY_OWNER_/);
    }
    expect(() => validateSourceAuthorityOwners(
      { source_authority_owners: [base[0]] } as typeof dataset,
      canonicalGeos,
      ["legislation.wa.gov.au"]
    )).toThrow("SOURCE_AUTHORITY_OWNER_INVALID=AU-WA");
  });
});
