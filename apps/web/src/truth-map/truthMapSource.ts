import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Feature, MultiPolygon, Point, Polygon } from "geojson";
import { buildGeoJson } from "@/lib/mapData";
import { findRepoRoot } from "@/lib/ssotDiff/ssotSnapshotStore";
import type { MapCategory, ResultStatus } from "@/lib/resultStatus";
import type { LegalCountryCollection, LegalCountryFeatureProperties } from "@/new-map/map.types";
import {
  resolveLegalFillColor,
  resolveLegalFillOpacity,
  resolveLegalHoverColor,
  resolveLegalHoverOpacity
} from "@/new-map/legalStyle";

const FINAL_RECONCILIATION_FILE = "wiki-truth-307-final-reconciliation.json";
const FINAL_RECONCILIATION_SOURCE = `data/reviews/${FINAL_RECONCILIATION_FILE}`;

export type TruthColor = "GREEN" | "YELLOW" | "RED" | "UNKNOWN";
export type TruthMapDisplayColor = "GREEN" | "YELLOW" | "RED" | "GRAY";
export type TruthMapDisplayColorBasis =
  | "LEGAL_VERDICT"
  | "EVIDENCE_DIRECTION_PROHIBITION"
  | "EVIDENCE_DIRECTION_SCOPE_UNRESOLVED"
  | "EVIDENCE_DIRECTION_INSUFFICIENT_OFFICIAL_EVIDENCE"
  | "POLAR_UNRESOLVED_SCOPE";

export type TruthMapDisplayPolicy = {
  schemaVersion: 1;
  route: "/truth-map";
  canonicalUniverse: string;
  polarDisplayGreyGeos: string[];
  legalTruthMutationAllowed: false;
  ssotMutationAllowed: false;
  productionMutationAllowed: false;
  displayUncoloredAllowed: false;
  nonPolarGreyAllowed: false;
};

type FinalTruthRow = {
  geo?: string;
  territory?: string;
  truthColor?: TruthColor;
  truthRuleId?: string;
  truthReason?: string;
  truthConfidence?: string;
  applyState?: string;
  primaryLaw?: {
    primaryLawUrl?: string;
    officialSources?: Array<{ url?: string }>;
  };
  canonicalTruthResult?: { primary_law?: string[] };
};

type FinalTruthFile = {
  generatedAt?: string;
  rowsExpected?: number;
  rowsTotal?: number;
  nonMutating?: boolean;
  localOnly?: boolean;
  rows?: FinalTruthRow[];
};

export type TruthMapFeatureProperties = LegalCountryFeatureProperties & {
  truthColor: TruthColor;
  legalTruthColor: TruthColor;
  truthMapDisplayColor: TruthMapDisplayColor;
  displayColorBasis: TruthMapDisplayColorBasis;
  displayIsResearchDirection: boolean;
  displayGreyAllowedByPolicy: boolean;
  displayMapCategory: MapCategory;
  truthRuleId: string;
  truthReason: string;
  truthConfidence: string;
  applyState: string;
  sourceUrl: string | null;
  truthDataset: "FINAL_307_RECONCILIATION";
};

export type TruthMapDatasetMeta = {
  source: string;
  generatedAt: string;
  rowsExpected: number;
  rowsTotal: number;
  rowsWithGeometry: number;
  rowsWithoutGeometry: string[];
  colors: Record<TruthColor, number>;
  displayColors: Record<TruthMapDisplayColor, number>;
  displayGreyGeos: string[];
  displayNonPolarGreyGeos: string[];
  displayUncoloredGeos: string[];
  nonMutating: boolean;
  localOnly: boolean;
  datasetHash: string;
  finalSnapshotId: "FINAL_307_RECONCILIATION";
};

export type TruthMapCollection = LegalCountryCollection & {
  meta?: TruthMapDatasetMeta & { layer: "countries" | "us-states" };
};

export type TruthMapDataset = {
  countries: TruthMapCollection;
  usStates: TruthMapCollection;
  meta: TruthMapDatasetMeta;
};

type TruthMapDatasetCache = { signature: string; dataset: TruthMapDataset };

let cache: TruthMapDatasetCache | null = null;

function truthMapPath() {
  return path.join(findRepoRoot(process.cwd()), "data", "reviews", FINAL_RECONCILIATION_FILE);
}

function displayPolicyPath() {
  return path.join(findRepoRoot(process.cwd()), "data", "reviews", "truth-map-display-policy.v1.json");
}

function readDisplayPolicy(): { policy: TruthMapDisplayPolicy; signature: string } {
  const filePath = displayPolicyPath();
  const policy = JSON.parse(fs.readFileSync(filePath, "utf8")) as TruthMapDisplayPolicy;
  if (
    policy.schemaVersion !== 1 ||
    policy.route !== "/truth-map" ||
    policy.canonicalUniverse !== "data/reviews/geo-list-307.json" ||
    policy.legalTruthMutationAllowed !== false ||
    policy.ssotMutationAllowed !== false ||
    policy.productionMutationAllowed !== false ||
    policy.displayUncoloredAllowed !== false ||
    policy.nonPolarGreyAllowed !== false ||
    !Array.isArray(policy.polarDisplayGreyGeos)
  ) {
    throw new Error("INVALID_TRUTH_MAP_DISPLAY_POLICY");
  }
  const stat = fs.statSync(filePath);
  return { policy, signature: `${stat.mtimeMs}:${stat.size}` };
}

function readFinalTruthFile(): { source: FinalTruthFile; raw: string; signature: string } {
  const filePath = truthMapPath();
  const raw = fs.readFileSync(filePath, "utf8");
  const stat = fs.statSync(filePath);
  return { source: JSON.parse(raw) as FinalTruthFile, raw, signature: `${stat.mtimeMs}:${stat.size}` };
}

function normalizeGeo(value: unknown) {
  return String(value || "").trim().toUpperCase();
}

function normalizeTruthColor(value: unknown): TruthColor {
  const color = String(value || "").trim().toUpperCase();
  return color === "GREEN" || color === "YELLOW" || color === "RED" || color === "UNKNOWN" ? color : "UNKNOWN";
}

function toMapCategory(color: TruthColor): MapCategory {
  switch (color) {
    case "GREEN": return "LEGAL_OR_DECRIM";
    case "YELLOW": return "LIMITED_OR_MEDICAL";
    case "RED": return "ILLEGAL";
    case "UNKNOWN": return "UNKNOWN";
  }
}

function toResultStatus(color: TruthColor): ResultStatus {
  switch (color) {
    case "GREEN": return "LEGAL";
    case "YELLOW": return "MIXED";
    case "RED": return "ILLEGAL";
    case "UNKNOWN": return "UNKNOWN";
  }
}

export function resolveTruthMapDisplayColor(
  geo: string,
  truthColor: TruthColor,
  truthRuleId: string,
  truthReason: string,
  policy: TruthMapDisplayPolicy
): { color: TruthMapDisplayColor; basis: TruthMapDisplayColorBasis; greyAllowedByPolicy: boolean } {
  if (truthColor !== "UNKNOWN") {
    return { color: truthColor, basis: "LEGAL_VERDICT", greyAllowedByPolicy: false };
  }

  if (policy.polarDisplayGreyGeos.includes(geo)) {
    return {
      color: "GRAY",
      basis: "POLAR_UNRESOLVED_SCOPE",
      greyAllowedByPolicy: true
    };
  }

  const basisText = `${truthRuleId}\n${truthReason}`.toUpperCase();
  if (/(?:NO_UNITARY_APPLICABLE_REGIME|DISPUTED_GEO|COMPONENTS_HAVE_DIFFERENT_REGIMES|TERRITORIAL_APPLICABILITY|SPECIAL_LAW_EXTENSION|DEPENDENT_TERRITORY_LOCAL_APPLICABILITY)/.test(basisText)) {
    return { color: "YELLOW", basis: "EVIDENCE_DIRECTION_SCOPE_UNRESOLVED", greyAllowedByPolicy: false };
  }

  const hasCurrentProhibition = /(?:CURRENT|PRIMARY|RECREATIONAL)[A-Z_\s-]*PROHIBITION|PROHIBITION[A-Z_\s-]*(?:MEDICAL|PATIENT|EXCEPTION)|CURRENT_CANNABIS_CLASSIFICATION/.test(basisText);
  const currentnessUnresolved = /(?:HISTORICAL|CURRENTNESS_UNRESOLVED|NO_VERIFIABLE_CURRENT|UNVERIFIABLE_CURRENT)/.test(basisText);
  if (hasCurrentProhibition && !currentnessUnresolved) {
    return { color: "RED", basis: "EVIDENCE_DIRECTION_PROHIBITION", greyAllowedByPolicy: false };
  }

  return { color: "YELLOW", basis: "EVIDENCE_DIRECTION_INSUFFICIENT_OFFICIAL_EVIDENCE", greyAllowedByPolicy: false };
}

function sourceUrlForRow(row: FinalTruthRow): string | null {
  const canonical = row.canonicalTruthResult?.primary_law?.find(Boolean);
  if (canonical) return canonical;
  if (row.primaryLaw?.primaryLawUrl) return row.primaryLaw.primaryLawUrl;
  return row.primaryLaw?.officialSources?.map((source) => String(source.url || "")).find(Boolean) || null;
}

function truthProperties(
  row: FinalTruthRow | undefined,
  geometryProperties: Record<string, unknown>,
  policy: TruthMapDisplayPolicy
): TruthMapFeatureProperties {
  const truthColor = normalizeTruthColor(row?.truthColor);
  const geo = normalizeGeo(row?.geo || geometryProperties.geo);
  const displayName = String(row?.territory || geometryProperties.displayName || geometryProperties.name || geo).trim() || geo;
  const truthRuleId = String(row?.truthRuleId || "LEGAL_APPLICABILITY_UNRESOLVED");
  const truthReason = String(row?.truthReason || "No canonical final-reconciliation row is available for this geometry.");
  const display = resolveTruthMapDisplayColor(geo, truthColor, truthRuleId, truthReason, policy);
  const legalMapCategory = toMapCategory(truthColor);
  const displayMapCategory = display.color === "GRAY" ? "UNKNOWN" : toMapCategory(display.color);
  const displayBaseColor = display.color === "GRAY" ? "#9aa0a6" : resolveLegalFillColor(displayMapCategory);
  const displayHoverColor = display.color === "GRAY" ? "#b7bec5" : resolveLegalHoverColor(displayMapCategory);
  return {
    geo,
    displayName,
    status: toResultStatus(truthColor),
    result: { status: toResultStatus(truthColor), color: truthColor },
    mapCategory: legalMapCategory,
    displayMapCategory,
    baseColor: displayBaseColor,
    hoverColor: displayHoverColor,
    fillOpacity: display.color === "GRAY" ? 0.62 : resolveLegalFillOpacity(displayMapCategory),
    hoverOpacity: display.color === "GRAY" ? 0.72 : resolveLegalHoverOpacity(displayMapCategory),
    labelAnchorLng: typeof geometryProperties.labelAnchorLng === "number" ? geometryProperties.labelAnchorLng : null,
    labelAnchorLat: typeof geometryProperties.labelAnchorLat === "number" ? geometryProperties.labelAnchorLat : null,
    pointFallbackVisibility: geometryProperties.pointFallbackVisibility === "visible" ? "visible" : "hidden",
    pointFallbackLabel: typeof geometryProperties.pointFallbackLabel === "string" ? geometryProperties.pointFallbackLabel : undefined,
    truthColor,
    legalTruthColor: truthColor,
    truthMapDisplayColor: display.color,
    displayColorBasis: display.basis,
    displayIsResearchDirection: display.basis !== "LEGAL_VERDICT",
    displayGreyAllowedByPolicy: display.greyAllowedByPolicy,
    truthRuleId,
    truthReason,
    truthConfidence: String(row?.truthConfidence || "UNCONFIRMED"),
    applyState: String(row?.applyState || "BLOCKED"),
    sourceUrl: row ? sourceUrlForRow(row) : null,
    truthDataset: "FINAL_307_RECONCILIATION"
  };
}

function buildLayer(
  kind: "countries" | "states",
  rowsByGeo: Map<string, FinalTruthRow>,
  policy: TruthMapDisplayPolicy
): TruthMapCollection {
  const geometry = buildGeoJson(kind) as LegalCountryCollection;
  const features = geometry.features.map((feature) => {
    const geometryProperties = (feature.properties || {}) as Record<string, unknown>;
    const geo = normalizeGeo(geometryProperties.geo);
    const row = rowsByGeo.get(geo);
    return {
      ...feature,
      id: geo,
      properties: truthProperties(row, geometryProperties, policy)
    } as Feature<Polygon | MultiPolygon | Point, TruthMapFeatureProperties> & { id: string };
  });
  return { type: "FeatureCollection", features } as TruthMapCollection;
}

function countColors(rows: FinalTruthRow[]) {
  const counts: Record<TruthColor, number> = { GREEN: 0, YELLOW: 0, RED: 0, UNKNOWN: 0 };
  rows.forEach((row) => { counts[normalizeTruthColor(row.truthColor)] += 1; });
  return counts;
}

function displaySummary(rows: FinalTruthRow[], policy: TruthMapDisplayPolicy) {
  const colors: Record<TruthMapDisplayColor, number> = { GREEN: 0, YELLOW: 0, RED: 0, GRAY: 0 };
  const greyGeos: string[] = [];
  const uncoloredGeos: string[] = [];
  for (const row of rows) {
    const geo = normalizeGeo(row.geo);
    const truthColor = normalizeTruthColor(row.truthColor);
    const display = resolveTruthMapDisplayColor(
      geo,
      truthColor,
      String(row.truthRuleId || "LEGAL_APPLICABILITY_UNRESOLVED"),
      String(row.truthReason || ""),
      policy
    );
    colors[display.color] += 1;
    if (display.color === "GRAY") greyGeos.push(geo);
  }
  return { colors, greyGeos: greyGeos.filter(Boolean).sort(), uncoloredGeos: uncoloredGeos.filter(Boolean).sort() };
}

export function buildTruthMapDataset(): TruthMapDataset {
  const { source, raw, signature } = readFinalTruthFile();
  const { policy, signature: policySignature } = readDisplayPolicy();
  const cacheSignature = `${signature}:${policySignature}`;
  if (cache?.signature === cacheSignature) return cache.dataset;
  const rows = (source.rows || []).filter((row) => Boolean(normalizeGeo(row.geo)));
  const display = displaySummary(rows, policy);
  const rowsByGeo = new Map(rows.map((row) => [normalizeGeo(row.geo), row]));
  const countries = buildLayer("countries", rowsByGeo, policy);
  const usStates = buildLayer("states", rowsByGeo, policy);
  const geometryGeos = new Set([
    ...countries.features.map((feature) => normalizeGeo(feature.properties?.geo)),
    ...usStates.features.map((feature) => normalizeGeo(feature.properties?.geo))
  ]);
  const rowsWithoutGeometry = rows.map((row) => normalizeGeo(row.geo)).filter((geo) => !geometryGeos.has(geo)).sort();
  const meta: TruthMapDatasetMeta = {
    source: FINAL_RECONCILIATION_SOURCE,
    generatedAt: String(source.generatedAt || "UNCONFIRMED"),
    rowsExpected: Number(source.rowsExpected || rows.length),
    rowsTotal: Number(source.rowsTotal || rows.length),
    rowsWithGeometry: rows.length - rowsWithoutGeometry.length,
    rowsWithoutGeometry,
    colors: countColors(rows),
    displayColors: display.colors,
    displayGreyGeos: display.greyGeos,
    displayNonPolarGreyGeos: display.greyGeos.filter((geo) => !policy.polarDisplayGreyGeos.includes(geo)),
    displayUncoloredGeos: display.uncoloredGeos,
    nonMutating: source.nonMutating === true,
    localOnly: source.localOnly === true,
    datasetHash: crypto.createHash("sha256").update(raw).digest("hex"),
    finalSnapshotId: "FINAL_307_RECONCILIATION"
  };
  countries.meta = { ...meta, layer: "countries" };
  usStates.meta = { ...meta, layer: "us-states" };
  const dataset = { countries, usStates, meta };
  cache = { signature: cacheSignature, dataset };
  return dataset;
}

export function getTruthMapDatasetMeta() {
  return buildTruthMapDataset().meta;
}
