type Bounds = {
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
};

const GERMANY_BOUNDS: Bounds = {
  latMin: 47.27,
  latMax: 55.06,
  lonMin: 5.87,
  lonMax: 15.04
};

function isWithinBounds(lat: number, lon: number, bounds: Bounds) {
  return (
    lat >= bounds.latMin &&
    lat <= bounds.latMax &&
    lon >= bounds.lonMin &&
    lon <= bounds.lonMax
  );
}

export type BboxResult =
  | { country: "DE" }
  | { country: "US"; region: "CA" };

export function resolveByBbox(lat: number, lon: number): BboxResult {
  if (isWithinBounds(lat, lon, GERMANY_BOUNDS)) {
    return { country: "DE" };
  }

  return { country: "US", region: "CA" };
}
