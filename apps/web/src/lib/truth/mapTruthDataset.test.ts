import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { buildGeoJson, buildRegions } from "@/lib/mapData";
import { buildMapTruthDataset, resolveMapPaintStatus } from "@/lib/truth/mapTruthDataset";

function resolveRepoPath(...parts: string[]) {
  const roots = [process.cwd(), path.resolve(process.cwd(), ".."), path.resolve(process.cwd(), "..", "..")];
  for (const root of roots) {
    const candidate = path.join(root, ...parts);
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(process.cwd(), ...parts);
}

describe("mapTruthDataset", () => {
  test("resolves map paint status with a strict 4-bucket matrix", () => {
    expect(resolveMapPaintStatus({ finalRecStatus: "Legal" })).toBe("LEGAL_OR_DECRIM");
    expect(resolveMapPaintStatus({ finalRecStatus: "Decriminalized" })).toBe("LEGAL_OR_DECRIM");
    expect(resolveMapPaintStatus({ finalRecStatus: "Illegal", finalMedStatus: "Legal" })).toBe("LIMITED_OR_MEDICAL");
    expect(resolveMapPaintStatus({ finalRecStatus: "Illegal", finalMedStatus: "Limited" })).toBe("LIMITED_OR_MEDICAL");
    expect(resolveMapPaintStatus({ finalRecStatus: "Illegal", finalMedStatus: "Only medical" })).toBe("LIMITED_OR_MEDICAL");
    expect(resolveMapPaintStatus({ finalRecStatus: "Decriminalized", finalMedStatus: "Illegal" })).toBe("LEGAL_OR_DECRIM");
    expect(resolveMapPaintStatus({ finalRecStatus: "Legal", finalMedStatus: "Legal" })).toBe("LEGAL_OR_DECRIM");
    expect(resolveMapPaintStatus({ finalRecStatus: "Illegal", finalMedStatus: "Illegal" })).toBe("ILLEGAL");
    expect(resolveMapPaintStatus({})).toBe("UNKNOWN");
  });

  test("builds a paintable country dataset from SSOT truth rows", () => {
    const regions = buildRegions();
    const geojsonData = buildGeoJson("countries");
    const dataset = buildMapTruthDataset({ regions, geojsonData });

    expect(dataset.diagnostics.truthCountryRowsTotal).toBeGreaterThanOrEqual(240);
    expect(dataset.diagnostics.mapPaintedCountryRows).toBe(dataset.diagnostics.truthCountryRowsTotal);
    expect(dataset.diagnostics.mapUnpaintedTruthRows).toBe(0);
    expect(dataset.diagnostics.officialCoveredTruthRows).toBeGreaterThan(0);
    expect(dataset.diagnostics.officialCoveredUnpaintedRows).toBe(0);
    expect(dataset.diagnostics.greenCount).toBeGreaterThan(0);
    expect(dataset.diagnostics.yellowCount).toBeGreaterThan(0);
    expect(dataset.diagnostics.redCount).toBeGreaterThan(0);
    expect(dataset.diagnostics.greyCount).toBeGreaterThan(0);
    expect(dataset.diagnostics.medicalLikeRowsTotal).toBeGreaterThan(0);
    expect(dataset.diagnostics.medicalLikeRowsPaintedYellow).toBeGreaterThan(0);
    expect(dataset.diagnostics.medicalLikeRowsNotYellow).toBe(0);
    expect(dataset.diagnostics.officialCoveredMedicalLikeRowsNotYellow).toBe(0);
    expect(Object.keys(dataset.statusIndex).length).toBeGreaterThanOrEqual(dataset.diagnostics.truthCountryRowsTotal);
  });

  test("keeps Western Sahara renderable as explicit unknown fallback instead of white basemap land", () => {
    const geojsonData = buildGeoJson("countries");
    const westernSahara = geojsonData.features.find((feature) => String(feature.properties?.geo || "") === "EH");

    expect(westernSahara).toBeTruthy();
    expect(westernSahara?.properties?.legalStatusGlobal).toBe("Unknown");
    expect(westernSahara?.properties?.medicalStatusGlobal).toBe("Unknown");
    expect(westernSahara?.properties?.truthLevel).toBe("UNKNOWN");
    expect(westernSahara?.properties?.reasons).toContain("MAP_RENDER_TERRITORY_FALLBACK");
  });

  test("keeps Natural Earth no-ISO special territories renderable instead of dropping them to white basemap land", () => {
    const geojsonData = buildGeoJson("countries");
    const renderedNames = new Set(
      geojsonData.features
        .map((feature) => String(feature.properties?.NAME_EN || feature.properties?.NAME || feature.properties?.ADMIN || "").trim())
        .filter(Boolean)
    );
    const source = JSON.parse(
      fs.readFileSync(resolveRepoPath("data", "geojson", "ne_10m_admin_0_countries.geojson"), "utf8")
    ) as {
      features: Array<{ properties?: Record<string, unknown> }>;
    };
    const noIsoNames = source.features
      .map((feature) => feature.properties || {})
      .filter((props) => {
        const candidates = [props.ISO_A2_EH, props.iso_a2_eh, props.ISO_A2, props.iso_a2]
          .map((value) => String(value || "").toUpperCase())
          .filter((value) => /^[A-Z]{2}$/.test(value) && value !== "-99");
        return candidates.length === 0;
      })
      .map((props) => String(props.NAME_EN || props.NAME || props.ADMIN || "").trim())
      .filter(Boolean);

    expect(noIsoNames.length).toBeGreaterThan(0);
    expect(noIsoNames.every((name) => renderedNames.has(name))).toBe(true);

    const somaliland = geojsonData.features.find((feature) => String(feature.properties?.NAME_EN || "") === "Somaliland");
    const northernCyprus = geojsonData.features.find(
      (feature) => String(feature.properties?.NAME_EN || "") === "Turkish Republic of Northern Cyprus"
    );
    const guantanamo = geojsonData.features.find(
      (feature) => String(feature.properties?.NAME_EN || "") === "Guantanamo Bay Naval Base"
    );
    const birTawil = geojsonData.features.find((feature) => String(feature.properties?.NAME_EN || "") === "Bir Tawil");

    expect(somaliland?.properties?.geo).toBe("SO");
    expect(northernCyprus?.properties?.geo).toBe("CY");
    expect(guantanamo?.properties?.geo).toBe("CU");
    expect(birTawil?.properties?.geo).toBe("BRT");
    expect(birTawil?.properties?.legalStatusGlobal).toBe("Unknown");
    expect(birTawil?.properties?.reasons).toContain("MAP_RENDER_SPECIAL_TERRITORY_FALLBACK");
  });

  test("covers territory geos that exist on the map even when legal SSOT has no country row", () => {
    const regions = buildRegions();
    const geojsonData = buildGeoJson("countries");
    const dataset = buildMapTruthDataset({ regions, geojsonData });

    for (const geo of ["PR", "FK", "GS", "AQ", "NC"]) {
      expect(dataset.statusIndex[geo]).toBeTruthy();
      expect(dataset.statusIndex[geo]?.mapPaintStatus).toBe("UNKNOWN");
      expect(geojsonData.features.find((feature) => String(feature.properties?.geo || "") === geo)).toBeTruthy();
    }
  });

  test("keeps US state map statuses differentiated instead of collapsing every state to legal", () => {
    const regions = buildRegions();
    const statesGeojson = buildGeoJson("states");
    const dataset = buildMapTruthDataset({ regions, geojsonData: buildGeoJson("countries") });
    const california = statesGeojson.features.find((feature) => String(feature.properties?.geo || "") === "US-CA");
    const texas = statesGeojson.features.find((feature) => String(feature.properties?.geo || "") === "US-TX");
    const idaho = statesGeojson.features.find((feature) => String(feature.properties?.geo || "") === "US-ID");

    expect(statesGeojson.features.some((feature) => String(feature.properties?.geo || "").startsWith("US-"))).toBe(true);
    expect(california?.properties?.legalStatusGlobal).toBe("Legal");
    expect(dataset.statusIndex["US-CA"]?.mapPaintStatus).toBe("LEGAL_OR_DECRIM");
    expect(texas?.properties?.legalStatusGlobal).toBe("Illegal");
    expect(texas?.properties?.medicalStatusGlobal).toBe("Limited");
    expect(dataset.statusIndex["US-TX"]?.mapPaintStatus).toBe("LIMITED_OR_MEDICAL");
    expect(idaho?.properties?.legalStatusGlobal).toBe("Illegal");
    expect(dataset.statusIndex["US-ID"]?.mapPaintStatus).toBe("ILLEGAL");
  });

  test("keeps note-based stronger language in explainability without changing final SSOT status", () => {
    const regions = buildRegions();
    const ecuador = regions.find((entry) => entry.geo === "EC");

    expect(ecuador).toBeTruthy();
    expect(ecuador?.finalRecStatus).toBe("Illegal");
    expect(ecuador?.finalMedStatus).toBe("Legal");
    expect(ecuador?.mapCategory).toBe("LIMITED_OR_MEDICAL");
    expect(ecuador?.evidenceDelta).toBe("STRONG_CONFLICT");
    expect(ecuador?.evidenceDeltaApproved).toBe(false);
    expect(ecuador?.notesTriggerPhrases?.length).toBeGreaterThan(0);
    expect(ecuador?.notesInterpretationSummary).toContain("explainability");
  });
});
