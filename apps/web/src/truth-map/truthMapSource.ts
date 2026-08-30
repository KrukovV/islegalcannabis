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

export type TruthMapLegalEvidenceStatus =
  | "VERIFIED_ACCESS"
  | "LIMITED_OR_QUALIFIED"
  | "PROHIBITION_EVIDENCED"
  | "UNRESOLVED";

export type TruthMapLegalEvidenceCitation = {
  title: string;
  url: string;
  publisher: string;
  annotation: string;
  quote: string;
};

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

type FinalTruthEvidenceSource = {
  title?: string;
  url?: string;
  officialPublisher?: string;
  primaryOrContext?: string;
  verification?: string;
  visualReview?: string;
  cannabisSpecific?: boolean;
  directFragmentAvailable?: boolean;
  fragment?: string;
  note?: string;
  sourceAnnotation?: string;
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
    sourceCoverage?: string;
    officialSources?: FinalTruthEvidenceSource[];
    freshAxisOfficialSources?: FinalTruthEvidenceSource[];
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
  legalEvidenceStatus: TruthMapLegalEvidenceStatus;
  legalEvidenceIcon: "✅" | "⚠️" | "❌";
  legalEvidenceLabel: string;
  legalEvidenceSummary: string;
  legalEvidenceCitationCount: number;
  legalEvidenceCitationsJson: string;
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

export type TruthMapRuntimeMeta = Pick<
  TruthMapDatasetMeta,
  "generatedAt" | "datasetHash" | "finalSnapshotId"
>;

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

function cleanEvidenceText(value: unknown, maxLength = 280) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function sourceAnnotation(source: FinalTruthEvidenceSource) {
  const explicit = cleanEvidenceText(source.sourceAnnotation, 150);
  if (explicit) return explicit;
  const role = source.primaryOrContext === "PRIMARY"
    ? "Primary legal source"
    : source.primaryOrContext === "OPERATIONAL"
      ? "Official operational record"
      : "Official legal record";
  const review = String(source.verification || source.visualReview || "").toUpperCase().includes("VISUAL")
    ? "visual review recorded"
    : source.directFragmentAvailable
      ? "quoted legal fragment retained"
      : "scope recorded";
  return `${role} · ${review}`;
}

function evidenceSourcesForRow(row: FinalTruthRow) {
  const sources = [
    ...(row.primaryLaw?.officialSources || []),
    ...(row.primaryLaw?.freshAxisOfficialSources || [])
  ];
  const seen = new Set<string>();
  return sources
    .map((source) => ({ source, url: String(source.url || "").trim() }))
    .filter(({ url }) => Boolean(url) && !seen.has(url) && Boolean(seen.add(url)))
    .sort(({ source: left }, { source: right }) => {
      const score = (candidate: FinalTruthEvidenceSource) =>
        (candidate.primaryOrContext === "PRIMARY" ? 4 : 0)
        + (candidate.directFragmentAvailable ? 2 : 0)
        + (candidate.cannabisSpecific ? 1 : 0);
      return score(right) - score(left);
    });
}

export function resolveTruthMapLegalEvidence(
  row: FinalTruthRow | undefined,
  truthColor: TruthColor,
  displayColor: TruthMapDisplayColor
) {
  const coverage = String(row?.primaryLaw?.sourceCoverage || "NO_CANDIDATE_PAGE_FOUND").trim().toUpperCase();
  const citations: TruthMapLegalEvidenceCitation[] = row
    ? evidenceSourcesForRow(row).slice(0, 2).map(({ source, url }) => ({
      title: cleanEvidenceText(source.title, 140) || "Official legal source",
      url,
      publisher: cleanEvidenceText(source.officialPublisher, 120) || "Official publisher recorded in the audit",
      annotation: sourceAnnotation(source),
      quote: cleanEvidenceText(source.fragment || source.note, 280)
    }))
    : [];

  if (truthColor === "GREEN") {
    const reviewed = coverage === "VISUALLY_VERIFIED_OFFICIAL_CANNABIS_LAW" && citations.some((citation) => citation.quote);
    return {
      status: "VERIFIED_ACCESS" as const,
      icon: "✅" as const,
      label: reviewed ? "Lawful access verified" : "Lawful access conclusion",
      summary: reviewed
        ? "Applicable official legal evidence has been reviewed and supports this lawful-access conclusion."
        : "The reconciled legal conclusion is GREEN; retained official evidence is available below.",
      citations
    };
  }

  if (truthColor === "RED") {
    return {
      status: "PROHIBITION_EVIDENCED" as const,
      icon: "❌" as const,
      label: "Prohibition evidenced in applicable law",
      summary: "Reviewed official legal evidence supports this prohibition conclusion for the territory.",
      citations
    };
  }

  if (truthColor === "YELLOW") {
    return {
      status: "LIMITED_OR_QUALIFIED" as const,
      icon: "⚠️" as const,
      label: "Limited or qualified legal status",
      summary: "Official legal material supports a limited lawful regime, not verified general access.",
      citations
    };
  }

  if (truthColor === "UNKNOWN" && displayColor === "RED") {
    return {
      status: "UNRESOLVED" as const,
      icon: "❌" as const,
      label: "Possible prohibition — legal conclusion unresolved",
      summary: "Evidence direction points to prohibition, but the legal conclusion remains UNKNOWN. This is not a confirmed prohibition finding.",
      citations
    };
  }

  if (truthColor === "UNKNOWN" && (coverage === "NO_CANDIDATE_PAGE_FOUND" || coverage === "OFFICIAL_SOURCE_ACCESS_BLOCKED")) {
    return {
      status: "UNRESOLVED" as const,
      icon: "❌" as const,
      label: "No confirmed applicable conclusion",
      summary: "The retained record does not confirm an applicable legal conclusion. This is not a confirmed prohibition finding.",
      citations
    };
  }

  return {
    status: "LIMITED_OR_QUALIFIED" as const,
    icon: "⚠️" as const,
    label: "Legal evidence needs qualification",
    summary: "Official material is retained, but scope, currentness, or a required legal axis remains unresolved.",
    citations
  };
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
  const legalEvidence = resolveTruthMapLegalEvidence(row, truthColor, display.color);
  const legalMapCategory = toMapCategory(truthColor);
  const displayMapCategory = display.color === "GRAY" ? "UNKNOWN" : toMapCategory(display.color);
  // Keep the route-local polar exception visually identical to the accepted
  // Antarctica treatment on /new-map; this never changes legal UNKNOWN.
  const displayBaseColor = display.color === "GRAY" ? "#c5ccd3" : resolveLegalFillColor(displayMapCategory);
  const displayHoverColor = display.color === "GRAY" ? "#d4dae0" : resolveLegalHoverColor(displayMapCategory);
  return {
    geo,
    displayName,
    status: toResultStatus(truthColor),
    result: { status: toResultStatus(truthColor), color: truthColor },
    mapCategory: legalMapCategory,
    displayMapCategory,
    baseColor: displayBaseColor,
    hoverColor: displayHoverColor,
    fillOpacity: display.color === "GRAY" ? 1 : resolveLegalFillOpacity(displayMapCategory),
    hoverOpacity: display.color === "GRAY" ? 1 : resolveLegalHoverOpacity(displayMapCategory),
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
    legalEvidenceStatus: legalEvidence.status,
    legalEvidenceIcon: legalEvidence.icon,
    legalEvidenceLabel: legalEvidence.label,
    legalEvidenceSummary: legalEvidence.summary,
    legalEvidenceCitationCount: legalEvidence.citations.length,
    legalEvidenceCitationsJson: JSON.stringify(legalEvidence.citations),
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

/**
 * The public root only needs build identity. Keep that SSR path independent of
 * the full 10m geometry collection, which is loaded by the map client later.
 */
export function getTruthMapRuntimeMeta(): TruthMapRuntimeMeta {
  const { source, raw } = readFinalTruthFile();
  return {
    generatedAt: String(source.generatedAt || "UNCONFIRMED"),
    datasetHash: crypto.createHash("sha256").update(raw).digest("hex"),
    finalSnapshotId: "FINAL_307_RECONCILIATION"
  };
}
