import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ResultCard from "./ResultCard";
import type { JurisdictionLawProfile } from "@islegal/shared";
import type { LocationContext } from "@/lib/location/locationContext";

const profile: JurisdictionLawProfile = {
  id: "US-CA",
  country: "US",
  region: "CA",
  medical: "allowed",
  recreational: "allowed",
  possession_limit: "Up to 1 oz",
  public_use: "restricted",
  home_grow: "allowed",
  cross_border: "illegal",
  risks: ["public_use", "driving"],
  sources: [{ title: "Example", url: "https://example.com" }],
  updated_at: "2024-01-01",
  verified_at: "2025-01-06",
  confidence: "medium",
  status: "known"
};

describe("ResultCard paywall", () => {
  it("hides paid sections in free mode", () => {
    const html = renderToStaticMarkup(
      <ResultCard profile={profile} title="Test" isPaidUser={false} />
    );
    expect(html).not.toContain("Key risks");
    expect(html).not.toContain("Sources");
    expect(html).not.toContain("PDF export");
  });

  it("renders IP location context with approximate hint", () => {
    const context: LocationContext = {
      mode: "detected",
      country: "US",
      region: "CA",
      method: "ip",
      confidence: "low",
      source: "ip"
    };
    const html = renderToStaticMarkup(
      <ResultCard
        profile={profile}
        title="Test"
        isPaidUser={false}
        locationContext={context}
      />
    );
    expect(html).toContain("Detected via IP (approximate)");
    expect(html).toContain("Location may be approximate");
  });

  it("renders manual location with approximate hint", () => {
    const context: LocationContext = {
      mode: "manual",
      country: "DE",
      method: "manual",
      confidence: "medium",
      source: "user"
    };
    const html = renderToStaticMarkup(
      <ResultCard
        profile={profile}
        title="Test"
        isPaidUser={false}
        locationContext={context}
      />
    );
    expect(html).toContain("Selected manually");
    expect(html).toContain("Location may be approximate");
  });
});
