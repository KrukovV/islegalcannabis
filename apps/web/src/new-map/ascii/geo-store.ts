export type GeoContext = {
  lat: number;
  lng: number;
  zoom: number;
  anchorX?: number;
  anchorY?: number;
  viewportWidth?: number;
  viewportHeight?: number;
};

export type AsciiTrigger = "auto";

let geoContext: GeoContext = {
  lat: 50,
  lng: 25,
  zoom: 1.55
};

export function setGeoContext(next: GeoContext) {
  geoContext = next;
}

export function getGeoContext() {
  return geoContext;
}
