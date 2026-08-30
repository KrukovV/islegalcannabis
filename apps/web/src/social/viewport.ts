import { getResolution, gridDisk, latLngToCell, polygonToCells } from "h3-js";
import { SOCIAL_QUERY_BUCKET_RESOLUTION } from "./privacy";

export const MAX_SOCIAL_VIEWPORT_QUERY_CELLS = 64;
export const MAX_SOCIAL_MAP_ACTIVITY_ITEMS = 200;

export type SocialViewportBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type SocialMapVisibilityLevel = "HIDDEN" | "ACTIVITY" | "CLUSTER" | "DISCUSSION";

/**
 * Presentation-only thresholds. They never alter an H3 publication
 * resolution: a more detailed map can still render only a coarse safe cell.
 */
export function getSocialMapVisibilityLevel(zoom: number): SocialMapVisibilityLevel {
  if (!Number.isFinite(zoom) || zoom < 3.5) return "HIDDEN";
  if (zoom < 7.5) return "ACTIVITY";
  if (zoom < 10) return "CLUSTER";
  return "DISCUSSION";
}

function validBounds(bounds: SocialViewportBounds) {
  return Number.isFinite(bounds.west)
    && Number.isFinite(bounds.east)
    && Number.isFinite(bounds.south)
    && Number.isFinite(bounds.north)
    && bounds.west >= -180
    && bounds.west <= 180
    && bounds.east >= -180
    && bounds.east <= 180
    && bounds.south >= -90
    && bounds.south <= 90
    && bounds.north >= -90
    && bounds.north <= 90
    && bounds.south <= bounds.north;
}

function longitudeSpan(bounds: SocialViewportBounds) {
  return bounds.west <= bounds.east
    ? bounds.east - bounds.west
    : 360 - bounds.west + bounds.east;
}

function cellsForRectangle(west: number, south: number, east: number, north: number) {
  const ring = [
    [south, west],
    [south, east],
    [north, east],
    [north, west],
    [south, west],
  ];
  return polygonToCells(ring, SOCIAL_QUERY_BUCKET_RESOLUTION);
}

function cornerCells(bounds: SocialViewportBounds) {
  const longitudeMidpoint = bounds.west <= bounds.east
    ? (bounds.west + bounds.east) / 2
    : ((bounds.west + bounds.east + 360) / 2) % 360;
  const latitudeMidpoint = (bounds.south + bounds.north) / 2;
  return [
    [bounds.south, bounds.west],
    [bounds.south, bounds.east],
    [bounds.north, bounds.west],
    [bounds.north, bounds.east],
    [latitudeMidpoint, longitudeMidpoint],
  ].flatMap(([latitude, longitude]) => gridDisk(latLngToCell(latitude, longitude, SOCIAL_QUERY_BUCKET_RESOLUTION), 1));
}

/**
 * The browser converts viewport geometry to bounded H3 query buckets. Bounds
 * themselves never leave the client: the Social API only receives these cells.
 */
export function toSocialViewportQueryCells(bounds: SocialViewportBounds) {
  if (!validBounds(bounds)) return [];
  // `polygonToCells` represents a world-sized ring ambiguously at the
  // antimeridian and can return a deceptively small subset. Do not let the
  // corner fallback turn that subset into a world query. Large views need a
  // separately designed aggregate endpoint, not a truncated cell list.
  if (longitudeSpan(bounds) > 30 || bounds.north - bounds.south > 20) return [];
  const rectangles = bounds.west <= bounds.east
    ? [[bounds.west, bounds.east] as const]
    : [[bounds.west, 180] as const, [-180, bounds.east] as const];
  const cells = new Set<string>();
  for (const [west, east] of rectangles) {
    for (const cell of cellsForRectangle(west, bounds.south, east, bounds.north)) cells.add(cell);
  }
  for (const cell of cornerCells(bounds)) cells.add(cell);
  const result = [...cells]
    .filter((cell) => getResolution(cell) === SOCIAL_QUERY_BUCKET_RESOLUTION)
    .sort();
  return result.length <= MAX_SOCIAL_VIEWPORT_QUERY_CELLS ? result : [];
}

export function isSocialQueryCell(value: string) {
  try {
    return getResolution(value) === SOCIAL_QUERY_BUCKET_RESOLUTION;
  } catch {
    return false;
  }
}
