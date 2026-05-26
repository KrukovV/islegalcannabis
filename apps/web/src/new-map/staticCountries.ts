import { createHash } from "node:crypto";
import type { Feature, MultiPolygon, Polygon, Position } from "geojson";
import { buildCountrySourceSnapshot } from "./countrySource";
import type { LegalCountryCollection, LegalCountryFeatureProperties } from "./map.types";

const COORDINATE_PRECISION = 5;
const COORDINATE_FACTOR = 10 ** COORDINATE_PRECISION;
const SIMPLIFY_TOLERANCE_DEGREES = 0.01;
const SIMPLIFY_TOLERANCE_SQ = SIMPLIFY_TOLERANCE_DEGREES * SIMPLIFY_TOLERANCE_DEGREES;
const COUNTRIES_CACHE_CONTROL = "public, max-age=31536000, immutable";

export type StaticCountriesAsset = {
  hash: string;
  url: string;
  json: string;
  byteLength: number;
  cacheControl: string;
};

let assetCache: StaticCountriesAsset | null = null;

function roundCoordinate(value: number) {
  return Math.round(value * COORDINATE_FACTOR) / COORDINATE_FACTOR;
}

function roundPosition(position: Position): Position {
  return position.map((value) =>
    typeof value === "number" ? roundCoordinate(value) : value
  ) as Position;
}

function pointsEqual(a: Position, b: Position) {
  return a.length >= 2 && b.length >= 2 && a[0] === b[0] && a[1] === b[1];
}

function dedupeConsecutive(points: Position[]) {
  const next: Position[] = [];
  for (const point of points) {
    const rounded = roundPosition(point);
    const previous = next[next.length - 1];
    if (!previous || !pointsEqual(previous, rounded)) {
      next.push(rounded);
    }
  }
  return next;
}

function getSquaredDistance(point: Position, start: Position, end: Position) {
  const x = point[0] ?? 0;
  const y = point[1] ?? 0;
  const x1 = start[0] ?? 0;
  const y1 = start[1] ?? 0;
  const x2 = end[0] ?? 0;
  const y2 = end[1] ?? 0;
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) {
    const px = x - x1;
    const py = y - y1;
    return px * px + py * py;
  }
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  const projectedX = x1 + t * dx;
  const projectedY = y1 + t * dy;
  const px = x - projectedX;
  const py = y - projectedY;
  return px * px + py * py;
}

function simplifyOpenLine(points: Position[], toleranceSq: number): Position[] {
  if (points.length <= 2) return points;
  let maxDistanceSq = -1;
  let index = -1;
  const first = points[0];
  const last = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i += 1) {
    const distanceSq = getSquaredDistance(points[i], first, last);
    if (distanceSq > maxDistanceSq) {
      maxDistanceSq = distanceSq;
      index = i;
    }
  }
  if (maxDistanceSq <= toleranceSq || index < 0) {
    return [first, last];
  }
  const left = simplifyOpenLine(points.slice(0, index + 1), toleranceSq);
  const right = simplifyOpenLine(points.slice(index), toleranceSq);
  return left.slice(0, -1).concat(right);
}

function simplifyRing(ring: Position[]) {
  const rounded = dedupeConsecutive(ring);
  if (rounded.length < 4) return ring.map(roundPosition);
  const closed = pointsEqual(rounded[0], rounded[rounded.length - 1]);
  const line = closed ? rounded.slice(0, -1) : rounded;
  if (line.length < 3) return ring.map(roundPosition);
  const simplified = simplifyOpenLine(line, SIMPLIFY_TOLERANCE_SQ);
  const next = closed ? simplified.concat([simplified[0]]) : simplified;
  return next.length >= 4 ? next : ring.map(roundPosition);
}

function simplifyPolygonCoordinates(coordinates: Polygon["coordinates"]): Polygon["coordinates"] {
  return coordinates.map((ring) => simplifyRing(ring));
}

function simplifyMultiPolygonCoordinates(coordinates: MultiPolygon["coordinates"]): MultiPolygon["coordinates"] {
  return coordinates.map((polygon) => simplifyPolygonCoordinates(polygon));
}

function simplifyGeometry(geometry: Polygon | MultiPolygon): Polygon | MultiPolygon {
  if (geometry.type === "Polygon") {
    return {
      type: "Polygon",
      coordinates: simplifyPolygonCoordinates(geometry.coordinates)
    };
  }
  return {
    type: "MultiPolygon",
    coordinates: simplifyMultiPolygonCoordinates(geometry.coordinates)
  };
}

function slimFeature(
  feature: Feature<Polygon | MultiPolygon, LegalCountryFeatureProperties>
): Feature<Polygon | MultiPolygon, LegalCountryFeatureProperties> {
  return {
    type: "Feature",
    id: feature.id,
    geometry: simplifyGeometry(feature.geometry),
    properties: {
      geo: feature.properties.geo,
      displayName: feature.properties.displayName,
      status: feature.properties.result.status,
      result: feature.properties.result,
      mapCategory: feature.properties.mapCategory,
      baseColor: feature.properties.baseColor,
      hoverColor: feature.properties.hoverColor
    }
  };
}

export function buildStaticCountrySourceSnapshot(): LegalCountryCollection {
  const snapshot = buildCountrySourceSnapshot();
  return {
    type: "FeatureCollection",
    features: snapshot.features.map((feature) => slimFeature(feature))
  };
}

export function getStaticCountriesAsset(): StaticCountriesAsset {
  if (assetCache) return assetCache;
  const json = JSON.stringify(buildStaticCountrySourceSnapshot());
  const hash = createHash("sha256").update(json).digest("hex").slice(0, 12);
  assetCache = {
    hash,
    url: `/static/countries/countries.${hash}.json`,
    json,
    byteLength: Buffer.byteLength(json),
    cacheControl: COUNTRIES_CACHE_CONTROL
  };
  return assetCache;
}
