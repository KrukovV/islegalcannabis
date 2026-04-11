import { describe, expect, it } from "vitest";
import {
  buildSeoCountryIndex,
  buildCountryCardIndexFromStorage,
  getCountryGraph,
  getCountryPageData,
  listCountryPageCodes
} from "@/lib/countryPageStorage";

describe("countryPageStorage", () => {
  it("loads generated ISO3 country pages", () => {
    const codes = listCountryPageCodes();
    expect(codes).toContain("nld");
    expect(codes).toContain("fin");
    expect(codes).toContain("us-ca");
    expect(codes.length).toBeGreaterThan(200);
  });

  it("returns normalized SEO payload for Netherlands", () => {
    const netherlands = getCountryPageData("nld");
    expect(netherlands?.iso2).toBe("NL");
    expect(netherlands?.legal_model.recreational.status).toBe("TOLERATED");
    expect(netherlands?.legal_model.distribution.status).toBe("mixed");
    expect(netherlands?.legal_model.distribution.scopes.sale).toBe("tolerated");
    expect(netherlands?.legal_model.distribution.scopes.import).toBe("illegal");
    expect(netherlands?.notes_normalized).toContain("tolerated");
    expect(netherlands?.legal_model.signals?.secondary_source?.has_article).toBe(true);
    expect(typeof netherlands?.legal_model.signals?.secondary_source?.article_len).toBe("number");
    expect(netherlands?.graph.geo_neighbors.length).toBeGreaterThanOrEqual(3);
    expect(netherlands?.graph.legal_similarity.length).toBeGreaterThanOrEqual(3);
    expect(netherlands?.graph.cluster_links.length).toBeGreaterThanOrEqual(2);
    expect(netherlands?.hashes.model_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("derives card index and graph from country page storage", () => {
    const cardIndex = buildCountryCardIndexFromStorage();
    const graph = getCountryGraph();
    expect(cardIndex.NL?.normalizedStatusSummary).toContain("Netherlands");
    expect(cardIndex["US-CA"]?.displayName).toBe("California");
    expect(graph.nodes.find((node) => node.code === "nld")?.seo_cluster).toBe("EU");
    expect(graph.edges.some((edge) => edge.from === "nld" && edge.type === "LEGAL_SIMILARITY")).toBe(true);
  });

  it("builds state-level SEO nodes derived from USA", () => {
    const california = getCountryPageData("us-ca");
    const texas = getCountryPageData("us-tx");
    const florida = getCountryPageData("us-fl");
    const idaho = getCountryPageData("us-id");
    const newYork = getCountryPageData("us-ny");
    expect(california?.node_type).toBe("state");
    expect(california?.geo_code).toBe("US-CA");
    expect(california?.parent_country?.code).toBe("usa");
    expect(california?.legal_model.recreational.status).toBe("LEGAL");
    expect(california?.notes_normalized).toContain("federally illegal in United States");
    expect(texas?.legal_model.recreational.status).toBe("ILLEGAL");
    expect(texas?.legal_model.medical.status).toBe("LEGAL");
    expect(florida?.legal_model.recreational.status).toBe("ILLEGAL");
    expect(florida?.legal_model.medical.status).toBe("LEGAL");
    expect(idaho?.legal_model.recreational.status).toBe("ILLEGAL");
    expect(newYork?.legal_model.recreational.status).toBe("LEGAL");
  });

  it("keeps mixed US state recreational coverage instead of all-legal inheritance", () => {
    const stateCodes = listCountryPageCodes().filter((code) => code.startsWith("us-"));
    const statuses = stateCodes.map((code) => getCountryPageData(code)?.legal_model.recreational.status);
    const uniqueStatuses = Array.from(new Set(statuses.filter(Boolean))).sort();
    expect(uniqueStatuses).toContain("LEGAL");
    expect(uniqueStatuses).toContain("ILLEGAL");
    expect(uniqueStatuses).toContain("DECRIMINALIZED");
  });

  it("builds a route-local SEO index for USA and state pages", () => {
    const usaIndex = buildSeoCountryIndex("usa");
    const californiaIndex = buildSeoCountryIndex("us-ca");
    expect(usaIndex.US?.node_type).toBe("country");
    expect(usaIndex["US-CA"]?.node_type).toBe("state");
    expect(usaIndex["US-TX"]?.node_type).toBe("state");
    expect(californiaIndex["US-CA"]?.name).toBe("California");
    expect(californiaIndex.US?.name).toBe("United States");
    expect(californiaIndex["US-NY"]?.name).toBe("New York");
  });

  it("keeps coordinates for every generated US state route", () => {
    const stateCodes = listCountryPageCodes().filter((code) => code.startsWith("us-"));
    const missing = stateCodes.filter((code) => {
      const page = getCountryPageData(code);
      return !page?.coordinates || typeof page.coordinates.lat !== "number" || typeof page.coordinates.lng !== "number";
    });
    expect(stateCodes).toHaveLength(50);
    expect(missing).toEqual([]);
  });

  it("enforces the derived medical floor for rec freedom conflicts", () => {
    const belgium = getCountryPageData("bel");
    const antigua = getCountryPageData("atg");
    expect(belgium?.legal_model.recreational.status).toBe("DECRIMINALIZED");
    expect(belgium?.legal_model.medical.status).toBe("LIMITED");
    expect(belgium?.legal_model.medical.override_reason).toBe("rec_implies_med_floor");
    expect(antigua?.legal_model.medical.status).toBe("LIMITED");
  });
});
