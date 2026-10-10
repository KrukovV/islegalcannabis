import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type PolygonGeometry = {
  type: "Polygon" | "MultiPolygon";
  coordinates: number[][][] | number[][][][];
};
type SourceFeature = { properties: Record<string, string>; geometry: PolygonGeometry };
type SourceCollection = { features: SourceFeature[] };

const sourcePath = (name: string) => path.join(process.cwd(), "..", "..", "data", "geojson", name);
const readSource = (name: string) => JSON.parse(fs.readFileSync(sourcePath(name), "utf8")) as SourceCollection;

function withinRing([x, y]: number[], ring: number[][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) {
      inside = !inside;
    }
  }
  return inside;
}

function withinPolygon(point: number[], geometry: PolygonGeometry) {
  const polygons = geometry.type === "Polygon"
    ? [geometry.coordinates as number[][][]]
    : geometry.coordinates as number[][][][];
  return polygons.some((rings) => withinRing(point, rings[0]) && !rings.slice(1).some((hole) => withinRing(point, hole)));
}

describe("US state display geometry", () => {
  const country = readSource("ne_10m_admin_0_countries.geojson").features
    .find((feature) => feature.properties.ADMIN === "United States of America")!;
  const oldStates = readSource("ne_50m_admin_1_states_provinces.geojson").features;
  const states = readSource("ne_10m_admin_1_us_states.geojson").features;

  it("ships one bounded 10m polygon for each of the 50 states and DC", () => {
    const ids = states.map((feature) => feature.properties.iso_3166_2);
    expect(states).toHaveLength(51);
    expect(new Set(ids).size).toBe(51);
    expect(ids.every((id) => /^US-[A-Z]{2}$/.test(id))).toBe(true);
    expect(states.every((feature) => feature.geometry.type === "Polygon" || feature.geometry.type === "MultiPolygon")).toBe(true);
    expect(fs.statSync(sourcePath("ne_10m_admin_1_us_states.geojson")).size).toBeLessThan(2_000_000);
  });

  it.each([
    ["US-OR", [-124.41, 42.3]],
    ["US-WA", [-124.06, 46.5]],
    ["US-CA", [-117.74, 33.5]],
    ["US-FL", [-81.1, 25.13]],
    ["US-ME", [-69.34, 44]]
  ])("covers a US-coast cell missed by the older 50m %s outline", (id, point) => {
    const previous = oldStates.find((feature) => feature.properties.iso_3166_2 === id)!;
    const current = states.find((feature) => feature.properties.iso_3166_2 === id)!;
    expect(withinPolygon(point as number[], country.geometry)).toBe(true);
    expect(withinPolygon(point as number[], previous.geometry)).toBe(false);
    expect(withinPolygon(point as number[], current.geometry)).toBe(true);
  });
});
