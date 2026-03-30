import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildOfficialLinkOwnershipIndex,
  matchesOfficialGeoOwnership,
  readOfficialLinkOwnership,
  resolveOfficialLinkOwnership
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
});
