import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon } from "geojson";
import { buildGeoJson } from "@/lib/mapData";
import { resolveLegalFillColor, resolveLegalFillOpacity, resolveLegalHoverColor, resolveLegalHoverOpacity } from "./legalStyle";
import type { AdminBoundaryCollection, LegalCountryCollection, LegalCountryFeature, LegalCountryFeatureProperties } from "./map.types";

type Position = [number, number];

function isPolygonGeometry(geometry: Geometry | null | undefined): geometry is Polygon | MultiPolygon {
  return geometry?.type === "Polygon" || geometry?.type === "MultiPolygon";
}

function normalizeLng(lng: number) {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

function ensureClosedRing(ring: Position[]): Position[] {
  if (ring.length === 0) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return ring;
  return [...ring, [first[0], first[1]]];
}

function unwrapRing(ring: number[][]): Position[] {
  if (ring.length === 0) return [];
  const unwrapped: Position[] = [];
  const firstLat = Number(ring[0][1]);
  let previousLng = normalizeLng(Number(ring[0][0]));
  unwrapped.push([previousLng, firstLat]);
  for (let index = 1; index < ring.length; index += 1) {
    let lng = normalizeLng(Number(ring[index][0]));
    const lat = Number(ring[index][1]);
    while (lng - previousLng > 180) lng -= 360;
    while (lng - previousLng < -180) lng += 360;
    unwrapped.push([lng, lat]);
    previousLng = lng;
  }
  return ensureClosedRing(unwrapped);
}

function interpolateAtLng(a: Position, b: Position, targetLng: number): Position {
  const deltaLng = b[0] - a[0];
  if (Math.abs(deltaLng) < 1e-9) return [targetLng, a[1]];
  const ratio = (targetLng - a[0]) / deltaLng;
  return [targetLng, a[1] + (b[1] - a[1]) * ratio];
}

function clipRingAgainstBoundary(ring: Position[], boundaryLng: number, keepGreater: boolean): Position[] {
  if (ring.length < 4) return [];
  const input = ring.slice(0, -1);
  if (input.length < 3) return [];
  const output: Position[] = [];
  const isInside = (point: Position) => (keepGreater ? point[0] >= boundaryLng : point[0] <= boundaryLng);
  let start = input[input.length - 1];
  for (const end of input) {
    const startInside = isInside(start);
    const endInside = isInside(end);
    if (startInside && endInside) {
      output.push([end[0], end[1]]);
    } else if (startInside && !endInside) {
      output.push(interpolateAtLng(start, end, boundaryLng));
    } else if (!startInside && endInside) {
      output.push(interpolateAtLng(start, end, boundaryLng));
      output.push([end[0], end[1]]);
    }
    start = end;
  }
  if (output.length < 3) return [];
  return ensureClosedRing(output);
}

function clipRingToWindow(ring: Position[], leftLng: number, rightLng: number): Position[] {
  const clippedLeft = clipRingAgainstBoundary(ring, leftLng, true);
  if (clippedLeft.length < 4) return [];
  const clipped = clipRingAgainstBoundary(clippedLeft, rightLng, false);
  return clipped.length >= 4 ? clipped : [];
}

function shiftRingToCanonical(ring: Position[], shiftLng: number): Position[] {
  const shifted = ring.map(([lng, lat]) => [normalizeLng(lng + shiftLng), lat] as Position);
  for (let index = 0; index < shifted.length; index += 1) {
    const previousLng = shifted[(index - 1 + shifted.length) % shifted.length][0];
    const nextLng = shifted[(index + 1) % shifted.length][0];
    const currentLng = shifted[index][0];
    if (currentLng === -180 && (previousLng > 170 || nextLng > 170)) shifted[index][0] = 180;
    if (currentLng === 180 && (previousLng < -170 || nextLng < -170)) shifted[index][0] = -180;
  }
  return ensureClosedRing(shifted);
}

function splitPolygonAtDateline(polygon: number[][][]): number[][][][] {
  const [outerRing, ...holeRings] = polygon;
  const unwrappedOuter = unwrapRing(outerRing);
  if (unwrappedOuter.length < 4) return [];
  const outerLngs = unwrappedOuter.map(([lng]) => lng);
  const windowStart = Math.floor((Math.min(...outerLngs) + 180) / 360);
  const windowEnd = Math.floor((Math.max(...outerLngs) + 180) / 360);
  const pieces: number[][][][] = [];
  for (let windowIndex = windowStart; windowIndex <= windowEnd; windowIndex += 1) {
    const leftLng = -180 + windowIndex * 360;
    const rightLng = 180 + windowIndex * 360;
    const clippedOuter = clipRingToWindow(unwrappedOuter, leftLng, rightLng);
    if (clippedOuter.length < 4) continue;
    const clippedHoles = holeRings
      .map((ring) => clipRingToWindow(unwrapRing(ring), leftLng, rightLng))
      .filter((ring) => ring.length >= 4)
      .map((ring) => shiftRingToCanonical(ring, -windowIndex * 360));
    pieces.push([shiftRingToCanonical(clippedOuter, -windowIndex * 360), ...clippedHoles]);
  }
  return pieces;
}

function normalizeGeometry(geometry: Polygon | MultiPolygon): Polygon | MultiPolygon {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const pieces = polygons.flatMap((polygon) => splitPolygonAtDateline(polygon));
  if (pieces.length <= 1) {
    return {
      type: "Polygon",
      coordinates:
        pieces[0] ||
        polygons[0].map((ring) =>
          ensureClosedRing(ring.map(([lng, lat]) => [normalizeLng(Number(lng)), Number(lat)] as Position))
        )
    };
  }
  return {
    type: "MultiPolygon",
    coordinates: pieces
  };
}

function normalizeFeature(feature: Feature): LegalCountryFeature | null {
  if (!isPolygonGeometry(feature.geometry)) return null;
  const geo = String(feature.properties?.geo || "").trim().toUpperCase();
  if (!geo) return null;
  const mapCategory = String(feature.properties?.mapCategory || "UNKNOWN").trim().toUpperCase() as LegalCountryFeatureProperties["mapCategory"];
  return {
    type: "Feature",
    id: geo,
    geometry: normalizeGeometry(feature.geometry),
    properties: {
      geo,
      displayName: String(feature.properties?.displayName || feature.properties?.name || geo),
      mapCategory,
      legalColor: resolveLegalFillColor(mapCategory),
      hoverColor: resolveLegalHoverColor(mapCategory),
      fillOpacity: resolveLegalFillOpacity(mapCategory),
      hoverOpacity: resolveLegalHoverOpacity(mapCategory),
      labelAnchorLng: Number.isFinite(feature.properties?.labelAnchorLng) ? Number(feature.properties?.labelAnchorLng) : null,
      labelAnchorLat: Number.isFinite(feature.properties?.labelAnchorLat) ? Number(feature.properties?.labelAnchorLat) : null
    }
  };
}

export function buildCountrySourceSnapshot(): LegalCountryCollection {
  const geojson = buildGeoJson("countries") as FeatureCollection;
  const features = geojson.features.map(normalizeFeature).filter((feature): feature is LegalCountryFeature => Boolean(feature));
  return {
    type: "FeatureCollection",
    features
  };
}

export function buildAdminBoundarySnapshot(): AdminBoundaryCollection {
  const geojson = buildGeoJson("states") as FeatureCollection;
  const features = geojson.features
    .filter((feature): feature is Feature<Polygon | MultiPolygon> => isPolygonGeometry(feature.geometry))
    .map((feature) => ({
      type: "Feature" as const,
      id: String(feature.properties?.geo || feature.properties?.displayName || feature.properties?.name || ""),
      geometry: feature.geometry,
      properties: {
        geo: String(feature.properties?.geo || "").trim().toUpperCase(),
        displayName: String(feature.properties?.displayName || feature.properties?.name || feature.properties?.geo || "")
      }
    }))
    .filter((feature) => Boolean(feature.properties.geo));
  return {
    type: "FeatureCollection",
    features
  };
}
