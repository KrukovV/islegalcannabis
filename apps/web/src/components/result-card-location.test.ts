import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import ResultCard from "./ResultCard";
import type { JurisdictionLawProfile } from "@islegal/shared";
import { STATUS_BANNERS } from "@islegal/shared";
import type { LocationContext } from "@/lib/location/locationContext";
import { getLawProfile } from "@/lib/lawStore";
import { buildResultViewModel } from "@/lib/resultViewModel";

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

describe("ResultCard location rendering", () => {
  it("renders IP detected with approximate hint", () => {
    const context: LocationContext = {
      mode: "detected",
      country: "US",
      region: "CA",
      method: "ip",
      confidence: "low",
      source: "ip"
    };
    const html = renderToStaticMarkup(
      createElement(ResultCard, {
        profile,
        title: "Test",
        isPaidUser: false,
        locationContext: context
      })
    );
    expect(html).toContain("Mode: Detected");
    expect(html).toContain("Detected via IP (approximate)");
    expect(html).toContain("Location may be approximate");
  });

  it("renders manual medium confidence with approximate hint", () => {
    const context: LocationContext = {
      mode: "manual",
      country: "DE",
      method: "manual",
      confidence: "medium",
      source: "user"
    };
    const html = renderToStaticMarkup(
      createElement(ResultCard, {
        profile,
        title: "Test",
        isPaidUser: false,
        locationContext: context
      })
    );
    expect(html).toContain("Mode: Manual");
    expect(html).toContain("Selected manually");
    expect(html).toContain("Location may be approximate");
  });

  it("renders warning with nearest legal location for red status", () => {
    const redProfile = getLawProfile({ country: "US", region: "TX" });
    expect(redProfile).not.toBeNull();
    if (!redProfile) return;
    const viewModel = buildResultViewModel({
      profile: redProfile,
      title: "Texas",
      nearestLegal: {
        title: "Colorado, US",
        jurisdictionKey: "US-CO",
        distanceKm: 100,
        approx: true
      }
    });
    const html = renderToStaticMarkup(
      createElement(ResultCard, {
        profile: redProfile,
        title: "Texas",
        isPaidUser: false,
        viewModel
      })
    );
    expect(html).toContain("Not legal here.");
    expect(html).toContain("Nearest legal area: preview");
    expect(html).toContain("Unlock details");
  });

  it("renders nearest legal details for paid users", () => {
    const redProfile = getLawProfile({ country: "US", region: "TX" });
    expect(redProfile).not.toBeNull();
    if (!redProfile) return;
    const viewModel = buildResultViewModel({
      profile: redProfile,
      title: "Texas",
      nearestLegal: {
        title: "Colorado, US",
        jurisdictionKey: "US-CO",
        distanceKm: 100,
        approx: true
      }
    });
    const html = renderToStaticMarkup(
      createElement(ResultCard, {
        profile: redProfile,
        title: "Texas",
        isPaidUser: true,
        viewModel
      })
    );
    expect(html).toContain("Nearest legal area: US-CO (~100 km)");
  });

  it("does not render nearest legal location for unknown status", () => {
    const baseProfile = getLawProfile({ country: "DE" });
    expect(baseProfile).not.toBeNull();
    if (!baseProfile) return;
    const unknownProfile = { ...baseProfile, status: "unknown" as const };
    const html = renderToStaticMarkup(
      createElement(ResultCard, {
        profile: unknownProfile,
        title: "Germany",
        isPaidUser: false
      })
    );
    expect(html).not.toContain("Nearest place where status is green/yellow");
    expect(html).toContain("Data not available");
  });

  it("renders provisional banner when status is provisional", () => {
    const baseProfile = getLawProfile({ country: "DE" });
    expect(baseProfile).not.toBeNull();
    if (!baseProfile) return;
    const provisionalProfile = {
      ...baseProfile,
      status: "provisional" as const
    };
    const html = renderToStaticMarkup(
      createElement(ResultCard, {
        profile: provisionalProfile,
        title: "Germany",
        isPaidUser: false
      })
    );
    expect(html).toContain(STATUS_BANNERS.provisional.body);
  });
});
