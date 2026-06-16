import type { Feature, FeatureCollection, MultiPolygon, Point, Polygon } from "geojson";
import type { ResultStatus } from "@/lib/resultStatus";

export type LegalCountryFeatureProperties = {
  geo: string;
  displayName: string;
  status?: ResultStatus;
  result?: {
    status: ResultStatus;
    color: string;
  };
  mapCategory?: "LEGAL_OR_DECRIM" | "LIMITED_OR_MEDICAL" | "ILLEGAL" | "UNKNOWN";
  baseColor: string;
  hoverColor: string;
  fillOpacity?: number;
  hoverOpacity?: number;
  labelAnchorLng?: number | null;
  labelAnchorLat?: number | null;
  pointFallbackVisibility?: "hidden" | "visible";
  pointFallbackLabel?: string;
};

export type LegalCountryFeature = Feature<Polygon | MultiPolygon | Point, LegalCountryFeatureProperties> & {
  id: string;
};

export type LegalCountryCollection = FeatureCollection<Polygon | MultiPolygon | Point, LegalCountryFeatureProperties>;
export type AdminBoundaryCollection = FeatureCollection<Polygon | MultiPolygon, { geo: string; displayName: string }>;
export type LabelPointCollection = FeatureCollection<Point, { geo: string; label: string; kind: "country" | "marine" }>;

export type CountryCardEntry = {
  geo: string;
  code: string;
  pageHref: string;
  detailsHref: string | null;
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
  cannabisProfile?: {
    history: string[];
    localNames: string[];
    culture: string[];
    enforcementReality: string[];
    products: string[];
    traditionalUse: string[];
    notes: string[];
    cannabisFoods: string[];
    slang: string[];
    cultivation: string[];
    market: string[];
  } | null;
  notes: string;
  panel: {
    levelTitle: string;
    summary: string;
    critical: Array<{ id: string; text: string; href: string; sourceUrl?: string }>;
    info: Array<{ id: string; text: string; href: string; sourceUrl?: string }>;
    why: Array<{ id: string; text: string; href: string; sourceUrl?: string }>;
  };
  sources: Array<{ id: string; title: string; url: string }>;
  coordinates?: { lat: number; lng: number };
};

export type NewMapBootResult = {
  map: import("maplibre-gl").Map;
  basemapReady: Promise<void>;
  ready: Promise<void>;
  setData: (_countries: LegalCountryCollection) => void;
  loadUsStates: () => void;
  destroy: () => void;
};

export type HoverControllerHandle = {
  destroy: () => void;
};
