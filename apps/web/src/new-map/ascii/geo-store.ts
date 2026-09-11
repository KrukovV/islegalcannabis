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

const geoListeners = new Set<(_context: GeoContext) => void>();

export function setGeoContext(next: GeoContext) {
  geoContext = next;
  geoListeners.forEach((listener) => listener(geoContext));
}

export function getGeoContext() {
  return geoContext;
}

export function subscribeGeoContext(listener: (_context: GeoContext) => void) {
  geoListeners.add(listener);
  return () => {
    geoListeners.delete(listener);
  };
}
