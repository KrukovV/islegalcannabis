import type { Feature, FeatureCollection, MultiPolygon, Point, Polygon } from "geojson";

export type LegalCountryFeatureProperties = {
  geo: string;
  displayName: string;
  mapCategory: "LEGAL_OR_DECRIM" | "LIMITED_OR_MEDICAL" | "ILLEGAL" | "UNKNOWN";
  legalColor: string;
  hoverColor: string;
  fillOpacity: number;
  hoverOpacity: number;
  labelAnchorLng: number | null;
  labelAnchorLat: number | null;
};

export type LegalCountryFeature = Feature<Polygon | MultiPolygon, LegalCountryFeatureProperties> & {
  id: string;
};

export type LegalCountryCollection = FeatureCollection<Polygon | MultiPolygon, LegalCountryFeatureProperties>;
export type AdminBoundaryCollection = FeatureCollection<Polygon | MultiPolygon, { geo: string; displayName: string }>;
export type LabelPointCollection = FeatureCollection<Point, { geo: string; label: string; kind: "country" | "marine" }>;

export type NewMapBootResult = {
  map: import("maplibre-gl").Map;
  ready: Promise<void>;
  setData: (_countries: LegalCountryCollection, _adminBoundaries: AdminBoundaryCollection) => void;
  setStyle: (_style: import("maplibre-gl").StyleSpecification) => void;
  destroy: () => void;
};

export type HoverControllerHandle = {
  destroy: () => void;
};
