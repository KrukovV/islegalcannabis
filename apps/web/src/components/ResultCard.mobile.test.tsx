import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import fs from "node:fs";
import path from "node:path";
import ResultCard from "./ResultCard";
import type { JurisdictionLawProfile, ResultViewModel } from "@islegal/shared";

const legalProfile: JurisdictionLawProfile = {
  id: "US-CA",
  country: "US",
  region: "CA",
  medical: "allowed",
  recreational: "allowed",
  possession_limit: "Up to 1 oz",
  public_use: "restricted",
  home_grow: "allowed",
  cross_border: "illegal",
  risks: ["driving"],
  sources: [{ title: "California Department of Public Health", url: "https://www.cdph.ca.gov/" }],
  updated_at: "2024-01-01",
  verified_at: "2025-01-06",
  confidence: "medium",
  status: "known"
};

const legalViewModel: ResultViewModel = {
  jurisdictionKey: "US-CA",
  title: "California, US",
  statusLevel: "green",
  statusTitle: "Legal here",
  bullets: ["Medical allowed", "Recreational allowed", "Public use restricted", "Home grow allowed"],
  keyRisks: ["driving"],
  sources: [
    { title: "California Department of Public Health", url: "https://www.cdph.ca.gov/" },
    { title: "Official State Portal", url: "https://www.ca.gov/" }
  ],
  verifiedAt: "2025-01-06",
  updatedAt: "2024-01-01",
  location: {
    mode: "detected",
    method: "gps",
    confidence: "high"
  },
  meta: {
    requestId: "abcd1234"
  }
};

const illegalProfile: JurisdictionLawProfile = {
  ...legalProfile,
  id: "US-TX",
  region: "TX",
  medical: "illegal",
  recreational: "illegal",
  risks: ["border_crossing"]
};

const illegalViewModel: ResultViewModel = {
  ...legalViewModel,
  jurisdictionKey: "US-TX",
  title: "Texas, US",
  statusLevel: "red",
  statusTitle: "Illegal here",
  keyRisks: ["border_crossing"],
  nearestLegal: {
    title: "New Mexico, US",
    jurisdictionKey: "US-NM",
    distanceKm: 210,
    approx: true
  }
};

describe("ResultCard mobile rendering", () => {
  it("renders legal (green/amber) card with sources and hit-area styles", () => {
    const html = renderToStaticMarkup(
      <ResultCard profile={legalProfile} title="Test" viewModel={legalViewModel} isPaidUser />
    );
    const dom = new JSDOM(html, { pretendToBeVisual: true });
    const { document } = dom.window;
    const sources = document.querySelector('[data-testid="sources"]');
    const sourceLinks = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('[data-testid="source-link"]')
    );

    expect(sources).not.toBeNull();
    expect(sourceLinks.length).toBeGreaterThan(0);
    sourceLinks.forEach((link) => {
      expect(link.textContent).not.toContain("https://");
      expect(link.className).toContain("sourceLink");
    });

    const cssPath = path.join(__dirname, "ResultCard.module.css");
    const css = fs.readFileSync(cssPath, "utf8");
    expect(css).toContain(".sourceLink");
    expect(css).toContain("min-height: 44px");
  });

  it("renders illegal (red) card with warning + nearest legal", () => {
    const html = renderToStaticMarkup(
      <ResultCard profile={illegalProfile} title="Test" viewModel={illegalViewModel} isPaidUser />
    );
    const dom = new JSDOM(html, { pretendToBeVisual: true });
    const { document } = dom.window;
    const warning = document.querySelector('[data-testid="warning"]');
    const nearestLegal = document.querySelector('[data-testid="nearest-legal"]');

    expect(warning).not.toBeNull();
    expect(nearestLegal).not.toBeNull();
  });
});
