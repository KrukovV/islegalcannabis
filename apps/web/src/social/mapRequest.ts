import {
  isSocialQueryCell,
  MAX_SOCIAL_VIEWPORT_QUERY_CELLS,
} from "@/social/viewport";

const FORBIDDEN_QUERY_KEYS = new Set([
  "latitude", "longitude", "lat", "lng", "lon", "accuracy", "gps", "location", "coordinate", "coordinates",
  "position", "geohash", "west", "east", "south", "north", "bbox", "locationhistory", "previouscells",
  "userlocation", "authorlocation",
]);

export type SocialMapQuery = { cells: string[]; zoom: number };

export function parseSocialMapQuery(url: URL): SocialMapQuery {
  for (const key of url.searchParams.keys()) {
    if (FORBIDDEN_QUERY_KEYS.has(key.replace(/[^a-z]/gi, "").toLowerCase())) {
      throw new Error("SOCIAL_RAW_LOCATION_QUERY_FORBIDDEN");
    }
  }
  const zoom = Number(url.searchParams.get("zoom"));
  if (!Number.isFinite(zoom) || zoom < 0 || zoom > 14) throw new Error("SOCIAL_VIEWPORT_ZOOM_INVALID");
  const cells = [...new Set(
    String(url.searchParams.get("cells") || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  )];
  if (cells.length === 0 || cells.length > MAX_SOCIAL_VIEWPORT_QUERY_CELLS) {
    throw new Error("SOCIAL_VIEWPORT_CELLS_INVALID");
  }
  if (!cells.every(isSocialQueryCell)) throw new Error("SOCIAL_VIEWPORT_CELL_RESOLUTION_INVALID");
  return { cells: cells.sort(), zoom };
}
