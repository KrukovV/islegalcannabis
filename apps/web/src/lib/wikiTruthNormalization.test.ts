import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildExpectedWikiPageByIso, resolveExpectedWikiPage } from "./wikiTruthNormalization";

function findRepoRoot(start: string): string {
  let current = start;
  for (let i = 0; i < 6; i += 1) {
    if (fs.existsSync(path.join(current, "data", "ssot", "wiki_pages_universe.json"))) return current;
    const parent = path.dirname(current);
    if (!parent || parent === current) break;
    current = parent;
  }
  return start;
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

describe("wikiTruthNormalization", () => {
  it("prefers canonical claim wiki rows over pseudo discovery URLs", () => {
    const resolved = resolveExpectedWikiPage({
      iso2: "AX",
      countryName: "Åland",
      expectedWikiUrl: "https://en.wikipedia.org/wiki/land",
      claimWikiUrl: "https://en.wikipedia.org/wiki/%C3%85land_Islands",
      fromCannabisByCountry: false
    });
    expect(resolved.expectedWikiPage).toBe("https://en.wikipedia.org/wiki/%C3%85land_Islands");
    expect(resolved.reason).toBe("CLAIM_WIKI_ROW");
  });

  it("prefers the canonical claim wiki row over discovery-only Cannabis_by_country pages", () => {
    const resolved = resolveExpectedWikiPage({
      iso2: "DE",
      countryName: "Germany",
      expectedWikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Germany",
      claimWikiUrl: "https://en.wikipedia.org/wiki/Germany",
      fromCannabisByCountry: true
    });
    expect(resolved.expectedWikiPage).toBe("https://en.wikipedia.org/wiki/Germany");
    expect(resolved.reason).toBe("CLAIM_WIKI_ROW");
  });

  it("builds a pseudo-free expected wiki map for known problem territories", () => {
    const root = findRepoRoot(process.cwd());
    const wikiUniversePayload = readJson(path.join(root, "data", "ssot", "wiki_pages_universe.json")) as {
      items?: Array<Record<string, unknown>>;
    };
    const claimsPayload = readJson(path.join(root, "data", "wiki", "wiki_claims_map.json")) as {
      items?: Record<string, Record<string, unknown>>;
    };
    const resolved = buildExpectedWikiPageByIso({
      wikiUniverseItems: Array.isArray(wikiUniversePayload.items) ? wikiUniversePayload.items : [],
      claimsItems: claimsPayload.items && typeof claimsPayload.items === "object" ? claimsPayload.items : {}
    });
    expect(resolved.AX).toBe("https://en.wikipedia.org/wiki/%C3%85land_Islands");
    expect(resolved.CW).toBe("https://en.wikipedia.org/wiki/Cura%C3%A7ao");
    expect(resolved.BL).toBe("https://en.wikipedia.org/wiki/St._Barth%C3%A9lemy");
    expect(resolved.VI).toBe("https://en.wikipedia.org/wiki/U.S._Virgin_Islands");
    expect(resolved.BQ).toBe("https://en.wikipedia.org/wiki/Caribbean_Netherlands");
    expect(resolved.CC).toBe("https://en.wikipedia.org/wiki/Cocos_(Keeling)_Islands");
    expect(resolved.GF).toBe("https://en.wikipedia.org/wiki/French_Guiana");
    expect(resolved.RE).toBe("https://en.wikipedia.org/wiki/R%C3%A9union");
    expect(resolved.YT).toBe("https://en.wikipedia.org/wiki/Mayotte");
    expect(resolved.VA).toBe("https://en.wikipedia.org/wiki/Vatican_City");
  });
});
