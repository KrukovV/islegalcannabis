import type { Feature, FeatureCollection, MultiPolygon, Point, Polygon } from "geojson";
import type { ResultStatus } from "@/lib/resultStatus";

export type LegalCountryFeatureProperties = {
  geo: string;
  displayName: string;
  status: ResultStatus;
  result: {
    status: ResultStatus;
    color: string;
  };
  mapCategory: "LEGAL_OR_DECRIM" | "LIMITED_OR_MEDICAL" | "ILLEGAL" | "UNKNOWN";
  baseColor: string;
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

export type CountryCardEntry = {
  geo: string;
  displayName: string;
  iso2: string | null;
  type: "country" | "state";
  result: {
    status: ResultStatus;
    color: string;
  };
  mapCategory: "LEGAL_OR_DECRIM" | "LIMITED_OR_MEDICAL" | "ILLEGAL" | "UNKNOWN";
  mapReason: string | null;
  normalizedStatusSummary: string;
  recreationalSummary: string;
  medicalSummary: string;
  distributionSummary: string;
  normalizedRecreationalStatus: string;
  normalizedRecreationalEnforcement: string;
  normalizedRecreationalScope: string;
  normalizedMedicalStatus: string;
  normalizedMedicalScope: string;
  normalizedDistributionStatus: string;
  distributionFlags: string[];
  statusFlags: string[];
  notes: string;
  coordinates?: { lat: number; lng: number };
};

export type NewMapBootResult = {
  map: import("maplibre-gl").Map;
  ready: Promise<void>;
  setData: (_countries: LegalCountryCollection) => void;
  setStyle: (_style: import("maplibre-gl").StyleSpecification) => void;
  destroy: () => void;
};

export type HoverControllerHandle = {
  destroy: () => void;
};
