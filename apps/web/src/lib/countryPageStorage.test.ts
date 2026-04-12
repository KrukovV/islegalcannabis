import { describe, expect, it } from "vitest";
import {
  buildSeoCountryIndex,
  buildCountryCardIndexFromStorage,
  deriveMapCategoryFromCountryPageData,
  deriveCountryCardEntryFromCountryPageData,
  getCountryGraph,
  getCountryPageData,
  listCountryPageCodes
} from "@/lib/countryPageStorage";
import { buildCountrySourceSnapshot, buildUsStateSourceSnapshot } from "@/new-map/countrySource";
import {
  deriveResultStatusFromCountryPageData,
  REFERENCE_MAP_CATEGORY_COLORS,
  REFERENCE_MAP_CATEGORY_HOVER_COLORS,
  statusToColor,
  statusToHoverColor
} from "@/lib/resultStatus";
import { NEW_MAP_WATER_COLOR } from "@/new-map/mapPalette";
import { resolveLegalFillColor, resolveLegalHoverColor } from "@/new-map/legalStyle";

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

  it("keeps map categories aligned with the canonical SSOT -> MAP contract", () => {
    const fixtures = [
      { code: "dza", expectedCategory: "ILLEGAL" },
      { code: "chn", expectedCategory: "ILLEGAL" },
      { code: "jpn", expectedCategory: "ILLEGAL" },
      { code: "sgp", expectedCategory: "ILLEGAL" },
      { code: "fra", expectedCategory: "LIMITED_OR_MEDICAL" },
      { code: "nor", expectedCategory: "LEGAL_OR_DECRIM" },
      { code: "est", expectedCategory: "LEGAL_OR_DECRIM" },
      { code: "nld", expectedCategory: "LEGAL_OR_DECRIM" },
      { code: "fin", expectedCategory: "LEGAL_OR_DECRIM" },
      { code: "ind", expectedCategory: "LEGAL_OR_DECRIM" },
      { code: "lux", expectedCategory: "LEGAL_OR_DECRIM" },
      { code: "aus", expectedCategory: "LIMITED_OR_MEDICAL" },
      { code: "can", expectedCategory: "LEGAL_OR_DECRIM" },
      { code: "us-ca", expectedCategory: "LEGAL_OR_DECRIM" },
      { code: "us-tx", expectedCategory: "LIMITED_OR_MEDICAL" }
    ] as const;
    const snapshot = buildCountrySourceSnapshot();
    const usStateSnapshot = buildUsStateSourceSnapshot();

    for (const fixture of fixtures) {
      const page = getCountryPageData(fixture.code);
      expect(page).toBeTruthy();
      const status = deriveResultStatusFromCountryPageData(page!);
      const mapCategory = deriveMapCategoryFromCountryPageData(page!);
      const featureGeo = page!.node_type === "state" ? page!.geo_code : page!.iso2;
      const source = page!.node_type === "state" ? usStateSnapshot : snapshot;
      const feature = source.features.find((item) => item.properties.geo === featureGeo);
      expect(mapCategory).toBe(fixture.expectedCategory);
      expect(feature?.properties.result.status).toBe(status);
      expect(feature?.properties.status).toBe(status);
      expect(feature?.properties.mapCategory).toBe(mapCategory);
      expect(feature?.properties.baseColor).toBe(resolveLegalFillColor(mapCategory));
      expect(feature?.properties.hoverColor).toBe(resolveLegalHoverColor(mapCategory));
      expect(feature?.properties.result.color).toBe(resolveLegalFillColor(mapCategory));
    }
  });

  it("derives map snapshot categories from the explicit truth/view layer", () => {
    const snapshot = buildCountrySourceSnapshot();
    const countries = ["nld", "lux", "fra", "fin", "aus", "can", "sgp"] as const;

    for (const code of countries) {
      const page = getCountryPageData(code);
      expect(page).toBeTruthy();
      const status = deriveResultStatusFromCountryPageData(page!);
      const mapCategory = deriveMapCategoryFromCountryPageData(page!);
      const feature = snapshot.features.find((item) => item.properties.geo === page!.iso2);
      expect(feature).toBeTruthy();
      expect(feature?.properties.result.status).toBe(status);
      expect(feature?.properties.mapCategory).toBe(mapCategory);
    }
  });

  it("derives hover colors from the same canonical status bucket", () => {
    expect(statusToColor("LEGAL")).toBe("#cde7cf");
    expect(statusToColor("MIXED")).toBe("#cde7cf");
    expect(statusToColor("DECRIM")).toBe("#cde7cf");
    expect(statusToColor("ILLEGAL")).toBe("#ead0d1");
    expect(statusToHoverColor("LEGAL")).toBe(statusToHoverColor("MIXED"));
    expect(statusToHoverColor("DECRIM")).toBe("#daf0dc");
    expect(statusToHoverColor("ILLEGAL")).not.toBe(statusToHoverColor("LEGAL"));
  });

  it("keeps the reference map palette frozen", () => {
    expect(REFERENCE_MAP_CATEGORY_COLORS).toEqual({
      LEGAL_OR_DECRIM: "#cde7cf",
      LIMITED_OR_MEDICAL: "#f4e9c2",
      ILLEGAL: "#ead0d1",
      UNKNOWN: "#d7dcdc"
    });
    expect(REFERENCE_MAP_CATEGORY_HOVER_COLORS).toEqual({
      LEGAL_OR_DECRIM: "#daf0dc",
      LIMITED_OR_MEDICAL: "#f7edd0",
      ILLEGAL: "#efdadb",
      UNKNOWN: "#e0e3e3"
    });
    expect(NEW_MAP_WATER_COLOR).toBe("#d7dcdc");
  });

  it("keeps strong prison-year countries like Australia illegal in truth but yellow in the view layer", () => {
    const australia = getCountryPageData("aus");
    expect(australia?.legal_model.recreational.status).toBe("ILLEGAL");
    expect(australia?.legal_model.medical.status).toBe("LEGAL");
    expect(deriveResultStatusFromCountryPageData(australia!)).toBe("ILLEGAL");
    expect(deriveMapCategoryFromCountryPageData(australia!)).toBe("LIMITED_OR_MEDICAL");
    expect(statusToColor("ILLEGAL")).toBe("#ead0d1");
  });

  it("does not downgrade fully illegal countries to non-red map categories", () => {
    const iran = getCountryPageData("irn");
    const saudiArabia = getCountryPageData("sau");
    const singapore = getCountryPageData("sgp");
    expect(deriveResultStatusFromCountryPageData(iran!)).toBe("ILLEGAL");
    expect(deriveMapCategoryFromCountryPageData(iran!)).toBe("ILLEGAL");
    expect(deriveResultStatusFromCountryPageData(saudiArabia!)).toBe("ILLEGAL");
    expect(deriveMapCategoryFromCountryPageData(saudiArabia!)).toBe("ILLEGAL");
    expect(deriveResultStatusFromCountryPageData(singapore!)).toBe("ILLEGAL");
    expect(deriveMapCategoryFromCountryPageData(singapore!)).toBe("ILLEGAL");
  });

  it("keeps result status and map categories aligned through the explicit view layer", () => {
    const algeria = getCountryPageData("dza");
    const china = getCountryPageData("chn");
    const estonia = getCountryPageData("est");
    const luxembourg = getCountryPageData("lux");
    const netherlands = getCountryPageData("nld");
    const france = getCountryPageData("fra");
    const norway = getCountryPageData("nor");
    const finland = getCountryPageData("fin");
    const india = getCountryPageData("ind");
    const australia = getCountryPageData("aus");
    const usa = getCountryPageData("usa");
    const japan = getCountryPageData("jpn");
    const singapore = getCountryPageData("sgp");
    expect(deriveResultStatusFromCountryPageData(algeria!)).toBe("ILLEGAL");
    expect(deriveMapCategoryFromCountryPageData(algeria!)).toBe("ILLEGAL");
    expect(deriveResultStatusFromCountryPageData(china!)).toBe("ILLEGAL");
    expect(deriveMapCategoryFromCountryPageData(china!)).toBe("ILLEGAL");
    expect(deriveResultStatusFromCountryPageData(estonia!)).toBe("DECRIM");
    expect(deriveMapCategoryFromCountryPageData(estonia!)).toBe("LEGAL_OR_DECRIM");
    expect(deriveResultStatusFromCountryPageData(luxembourg!)).toBe("DECRIM");
    expect(deriveMapCategoryFromCountryPageData(luxembourg!)).toBe("LEGAL_OR_DECRIM");
    expect(deriveResultStatusFromCountryPageData(netherlands!)).toBe("MIXED");
    expect(deriveMapCategoryFromCountryPageData(netherlands!)).toBe("LEGAL_OR_DECRIM");
    expect(deriveResultStatusFromCountryPageData(france!)).toBe("ILLEGAL");
    expect(deriveMapCategoryFromCountryPageData(france!)).toBe("LIMITED_OR_MEDICAL");
    expect(deriveResultStatusFromCountryPageData(norway!)).toBe("DECRIM");
    expect(deriveMapCategoryFromCountryPageData(norway!)).toBe("LEGAL_OR_DECRIM");
    expect(deriveResultStatusFromCountryPageData(finland!)).toBe("DECRIM");
    expect(deriveMapCategoryFromCountryPageData(finland!)).toBe("LEGAL_OR_DECRIM");
    expect(deriveResultStatusFromCountryPageData(india!)).toBe("MIXED");
    expect(deriveMapCategoryFromCountryPageData(india!)).toBe("LEGAL_OR_DECRIM");
    expect(deriveResultStatusFromCountryPageData(australia!)).toBe("ILLEGAL");
    expect(deriveMapCategoryFromCountryPageData(australia!)).toBe("LIMITED_OR_MEDICAL");
    expect(deriveResultStatusFromCountryPageData(usa!)).toBe("MIXED");
    expect(deriveMapCategoryFromCountryPageData(usa!)).toBe("LEGAL_OR_DECRIM");
    expect(deriveResultStatusFromCountryPageData(japan!)).toBe("ILLEGAL");
    expect(deriveResultStatusFromCountryPageData(singapore!)).toBe("ILLEGAL");
  });

  it("explains every yellow bucket that still has illegal truth", () => {
    const entries = listCountryPageCodes()
      .map((code) => getCountryPageData(code))
      .filter(Boolean);

    for (const page of entries) {
      const status = deriveResultStatusFromCountryPageData(page!);
      const category = deriveMapCategoryFromCountryPageData(page!);
      const card = deriveCountryCardEntryFromCountryPageData(page!);
      if (status === "ILLEGAL" && category === "LIMITED_OR_MEDICAL") {
        expect(card.mapReason).toBeTruthy();
      }
    }
  });

  it("explains every green bucket that still has non-legal truth", () => {
    const entries = listCountryPageCodes()
      .map((code) => getCountryPageData(code))
      .filter(Boolean);

    for (const page of entries) {
      const status = deriveResultStatusFromCountryPageData(page!);
      const category = deriveMapCategoryFromCountryPageData(page!);
      const card = deriveCountryCardEntryFromCountryPageData(page!);
      if (category === "LEGAL_OR_DECRIM" && status !== "LEGAL") {
        expect(card.mapReason).toBeTruthy();
      }
    }
  });
});
