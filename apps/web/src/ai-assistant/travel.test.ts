import { describe, expect, it } from "vitest";
import { buildJurisdictionContext, buildLegalResponse, buildTravelAdvisory, getAirports, isTravelQuery, resolveTravelGeo } from "./travel";

describe("ai-assistant travel airports", () => {
  it("detects travel intent", () => {
    expect(isTravelQuery("Can I fly with weed from Texas?")).toBe(true);
    expect(isTravelQuery("Tell me about Bob Marley")).toBe(false);
  });

  it("resolves Nepal without leaking another country", () => {
    expect(resolveTravelGeo("Nepal airport", "RU")).toBe("NP");
  });

  it("resolves California to US-CA", () => {
    expect(resolveTravelGeo("California airport")).toBe("US-CA");
  });

  it("returns exact airports for Germany", () => {
    const airports = getAirports("DE");
    expect(airports.length).toBeGreaterThan(0);
    expect(airports.every((airport) => airport.country === "DE")).toBe(true);
  });

  it("builds Texas travel advisory with state airports only", () => {
    const advisory = buildTravelAdvisory("Can I fly with weed from Texas?", undefined, "en");
    expect(advisory?.geo).toBe("US-TX");
    expect(advisory?.text).toContain("Travel");
    expect(advisory?.text).toContain("(ABI)");
    expect(advisory?.text).not.toContain("Germany");
    expect(advisory?.text).not.toContain("Nepal");
    expect(advisory?.sources).toContain("airports:US-TX");
  });

  it("builds jurisdiction context from SSOT notes and sources", () => {
    const context = buildJurisdictionContext("US-TX", "en");
    expect(context?.text).toContain("Jurisdiction: Texas");
    expect(context?.text).toContain("Normalized notes:");
    expect(context?.text).toContain("Official / source context:");
    expect(context?.sources.some((source) => source.startsWith("ssot:US-TX:"))).toBe(true);
  });

  it("puts normalized notes before final legal summary", () => {
    const response = buildLegalResponse("DE", "en");
    expect(response?.text).toContain("Normalized notes:");
    expect(response?.text).toContain("Final legal summary:");
    expect(response!.text.indexOf("Normalized notes:")).toBeLessThan(response!.text.indexOf("Final legal summary:"));
  });

  it("keeps travel scope local to Nepal", () => {
    const advisory = buildTravelAdvisory("Can I take weed through airport in Nepal?", undefined, "en");
    const firstAirport = getAirports("NP")[0];
    expect(advisory?.geo).toBe("NP");
    expect(advisory?.text).toContain(firstAirport.iata);
    expect(advisory?.text).not.toContain("Russia");
  });
});
