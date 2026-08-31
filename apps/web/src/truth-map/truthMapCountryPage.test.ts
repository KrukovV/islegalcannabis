import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import TruthMapTerritorySeoPage from "@/app/_components/TruthMapTerritorySeoPage";
import { getCountryPageData, listCountryPageCodes } from "@/lib/countryPageStorage";
import { parseTruthMapLegalEvidenceCitations } from "./TruthMapLegalEvidence";
import {
  getTruthMapCountryPageProjection,
  getTruthMapCountryPageProjectionForGeo,
  listTruthMapCountryPageProjectionGeos
} from "./truthMapCountryPage";
import { buildTruthMapDataset } from "./truthMapSource";

function text(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

describe("Truth Map country-page projection", () => {
  it("keeps all 307 final-reconciliation GEO status owners in the committed public page projection", () => {
    const expected = [...buildTruthMapDataset().countries.features, ...buildTruthMapDataset().usStates.features]
      .map((feature) => feature.properties!)
      .filter((properties, index, all) => all.findIndex((candidate) => candidate.geo === properties.geo) === index);
    const geos = listTruthMapCountryPageProjectionGeos();

    expect(expected).toHaveLength(307);
    expect(geos).toHaveLength(307);
    for (const properties of expected) {
      const projection = getTruthMapCountryPageProjectionForGeo(properties.geo);
      expect(projection, `projection:${properties.geo}`).toBeTruthy();
      expect(projection?.properties.legalTruthColor).toBe(properties.legalTruthColor);
      expect(projection?.properties.truthMapDisplayColor).toBe(properties.truthMapDisplayColor);
      expect(projection?.card.result.color).toBe(properties.legalTruthColor);
      expect(projection?.card.panel.summary).toBe(properties.legalEvidenceSummary);
    }
  });

  it("keeps every legacy /c page on its matching final-reconciliation GEO and gives every map-only territory a rich noindex detail page", () => {
    const pageCodes = listCountryPageCodes();
    const mapOnlyGeos = listTruthMapCountryPageProjectionGeos()
      .filter((geo) => !getCountryPageData(geo.toLowerCase()));

    expect(pageCodes).toHaveLength(288);
    expect(mapOnlyGeos).toHaveLength(19);
    for (const code of pageCodes) {
      const data = getCountryPageData(code);
      expect(data, `country page:${code}`).toBeTruthy();
      if (!data) continue;
      const projection = getTruthMapCountryPageProjection(data);
      expect(projection, `country page projection:${code}`).toBeTruthy();
      expect(projection?.properties.geo).toBe(data.geo_code);
    }

    for (const geo of mapOnlyGeos) {
      const projection = getTruthMapCountryPageProjectionForGeo(geo);
      expect(projection, `map-only projection:${geo}`).toBeTruthy();
      if (!projection) continue;
      const html = text(renderToStaticMarkup(createElement(TruthMapTerritorySeoPage, { code: geo.toLowerCase(), projection })));
      expect(html).toContain(`Current legal conclusion: ${projection.properties.legalTruthColor}`);
      expect(html).toContain("Current legal conclusion, citations and annotations");
      expect(html).toContain("Retained supplementary source register");
      for (const citation of parseTruthMapLegalEvidenceCitations(projection.properties.legalEvidenceCitationsJson)) {
        expect(html).toContain(citation.title);
        expect(html).toContain(citation.annotation);
      }
    }
  });
});
