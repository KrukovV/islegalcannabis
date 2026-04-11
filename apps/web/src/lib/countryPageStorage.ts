import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { CountryCardEntry } from "@/new-map/map.types";

type CountryLegalStatus = "LEGAL" | "ILLEGAL" | "DECRIMINALIZED" | "TOLERATED" | "UNKNOWN";
type CountryMedicalStatus = "LEGAL" | "LIMITED" | "ILLEGAL" | "UNKNOWN";
type CountryEnforcement = "STRICT" | "MODERATE" | "UNENFORCED";
type CountryScope = "PERSONAL_USE" | "MEDICAL_ONLY" | "NONE";
type CountryDistributionStatus = "legal" | "regulated" | "tolerated" | "restricted" | "illegal" | "mixed";
type CountryRegion = "EU" | "LATAM" | "ASIA" | "AFRICA" | "NA" | "OCEANIA" | "OTHER";
type GraphEdgeType =
  | "GEO_ADJACENCY"
  | "LEGAL_SIMILARITY"
  | "CULTURAL_CLUSTER"
  | "POLICY_CONTINUUM"
  | "SAME_COUNTRY_STATES"
  | "FEDERAL_PARENT_LINK";
type CountryNodeType = "country" | "state";
type StateEnforcementStrength = "LOW" | "MEDIUM" | "HIGH";

export type CountryHash = {
  code: string;
  content_hash: string;
  notes_hash: string;
  model_hash: string;
};

export type CountryPageSource = {
  id: string;
  url: string;
  title: string;
  type: "external";
  weight: "low";
};

export type CountryLinkRef = {
  code: string;
  name: string;
};

export type CountryGraphLinks = {
  region: CountryRegion;
  seo_cluster: string;
  geo_neighbors: CountryLinkRef[];
  legal_similarity: CountryLinkRef[];
  cluster_links: CountryLinkRef[];
  same_country_states: CountryLinkRef[];
  federal_parent: CountryLinkRef | null;
};

export type CountryPageData = {
  code: string;
  geo_code: string;
  iso2: string;
  name: string;
  node_type: CountryNodeType;
  normalized_version: "v1";
  legal_model: {
    recreational: {
      raw_status?: string;
      status: CountryLegalStatus;
      enforcement: CountryEnforcement;
      scope: CountryScope;
    };
    medical: {
      raw_status?: string;
      status: CountryMedicalStatus;
      enforcement: CountryEnforcement;
      scope: CountryScope;
      override_reason?: string | null;
    };
    distribution: {
      status: CountryDistributionStatus;
      scopes: {
        possession: string | null;
        use: string | null;
        sale: string | null;
        cultivation: string | null;
        import: string | null;
        trafficking: string | null;
      };
      enforcement: string;
      flags: string[];
      modifiers: string[];
    };
    signals?: {
      status: CountryDistributionStatus;
      final_risk?: "HIGH_RISK" | "RESTRICTED" | "LIMITED" | "UNKNOWN";
      enforcement_level?: "active" | "rare" | "unenforced";
      penalties: {
        prison: boolean;
        arrest: boolean;
        fine: boolean;
        severity_score: number;
        prison_priority?: number;
        possession?: {
          prison: boolean;
          arrest: boolean;
          fine: boolean;
          severe: boolean;
        };
        trafficking?: {
          prison: boolean;
          arrest: boolean;
          fine: boolean;
          severe: boolean;
        };
      };
      confidence: "low" | "medium" | "high";
      sources: Array<{
        title: string;
        url: string | null;
        depth: number;
      }>;
      explain: string[];
    };
    enforcement_flags?: string[];
    applied_rules?: string[];
  };
  notes_normalized: string;
  notes_raw: string;
  facts: {
    possession_limit: string | null;
    cultivation: string | null;
    penalty: string | null;
  };
  parent_country: CountryLinkRef | null;
  state_modifiers: {
    recreational: "override" | "inherited";
    medical: "override" | "inherited";
    enforcement_strength: StateEnforcementStrength | null;
    federal_conflict: string | null;
    legalization_status: string | null;
  } | null;
  related_codes: string[];
  related_names: CountryLinkRef[];
  graph: CountryGraphLinks;
  coordinates: { lat: number; lng: number } | null;
  sources: {
    wiki: string | null;
    wiki_truth: string | null;
    citations: CountryPageSource[];
  };
  hashes: CountryHash;
  updated_at: string;
};

export type CountryGraphNode = {
  code: string;
  region: CountryRegion;
  neighbors: string[];
  legal_similarity: string[];
  seo_cluster: string;
};

export type CountryGraphEdge = {
  from: string;
  to: string;
  type: GraphEdgeType;
};

export type CountryGraphPayload = {
  nodes: CountryGraphNode[];
  edges: CountryGraphEdge[];
};

function resolveRepoRoot() {
  let current = process.cwd();
  while (true) {
    const candidate = path.join(current, "data", "index.json");
    if (fs.existsSync(candidate)) return current;
    const parent = path.dirname(current);
    if (parent === current) return process.cwd();
    current = parent;
  }
}

const REPO_ROOT = resolveRepoRoot();
const DATA_ROOT = path.join(REPO_ROOT, "data");
const COUNTRY_DIR = path.join(DATA_ROOT, "countries");
const GRAPH_PATH = path.join(DATA_ROOT, "graph", "country-graph.json");
const INDEX_PATH = path.join(DATA_ROOT, "index.json");

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, nested]) => `${JSON.stringify(key)}:${stableSerialize(nested)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: unknown) {
  return crypto.createHash("sha256").update(stableSerialize(value)).digest("hex");
}

function computeContentHash(data: Omit<CountryPageData, "hashes">) {
  return sha256({
    legal_model: data.legal_model,
    notes_normalized: data.notes_normalized,
    facts: data.facts,
    graph: {
      geo_neighbors: data.graph.geo_neighbors.map((item) => item.code),
      legal_similarity: data.graph.legal_similarity.map((item) => item.code),
      cluster_links: data.graph.cluster_links.map((item) => item.code),
      same_country_states: data.graph.same_country_states.map((item) => item.code),
      federal_parent: data.graph.federal_parent?.code || null
    }
  });
}

export function computeCountryHashes(data: Omit<CountryPageData, "hashes">): CountryHash {
  return {
    code: data.code,
    content_hash: computeContentHash(data),
    notes_hash: sha256(data.notes_normalized),
    model_hash: sha256(data)
  };
}

export function stripCountryPageHashes(data: CountryPageData): Omit<CountryPageData, "hashes"> {
  const { hashes, ...rest } = data;
  void hashes;
  return rest;
}

function includesFold(text: string, probe: string) {
  return text.toLowerCase().includes(probe.toLowerCase());
}

export function validateCountryPageData(data: CountryPageData) {
  const errors: string[] = [];
  if (!data.notes_normalized.trim()) errors.push("MISSING_NOTES_NORMALIZED");
  if (!data.graph.seo_cluster.trim()) errors.push("MISSING_CLUSTER");
  if (
    data.graph.geo_neighbors.length +
      data.graph.legal_similarity.length +
      data.graph.cluster_links.length +
      data.graph.same_country_states.length +
      (data.graph.federal_parent ? 1 : 0) ===
    0
  ) {
    errors.push("ORPHAN_GRAPH_NODE");
  }

  const recStatus = data.legal_model.recreational.status;
  const medStatus = data.legal_model.medical.status;
  const notes = data.notes_normalized;
  if (recStatus === "TOLERATED" && !includesFold(notes, "tolerat")) errors.push("NOTES_STATUS_MISMATCH:TOLERATED");
  if (recStatus === "DECRIMINALIZED" && !includesFold(notes, "decriminal")) {
    errors.push("NOTES_STATUS_MISMATCH:DECRIMINALIZED");
  }
  if (recStatus === "LEGAL" && !includesFold(notes, "legal")) errors.push("NOTES_STATUS_MISMATCH:LEGAL");
  if (recStatus === "ILLEGAL" && !includesFold(notes, "illegal")) errors.push("NOTES_STATUS_MISMATCH:ILLEGAL");
  if (data.node_type === "country" && (recStatus === "LEGAL" || recStatus === "DECRIMINALIZED") && !["LEGAL", "LIMITED"].includes(medStatus)) {
    errors.push("MEDICAL_FLOOR_BROKEN");
  }

  const expectedHashes = computeCountryHashes(stripCountryPageHashes(data));
  if (data.hashes.notes_hash !== expectedHashes.notes_hash) errors.push("NOTES_HASH_MISMATCH");
  if (data.hashes.content_hash !== expectedHashes.content_hash) errors.push("CONTENT_HASH_MISMATCH");
  if (data.hashes.model_hash !== expectedHashes.model_hash) errors.push("MODEL_HASH_MISMATCH");
  return errors;
}

function ensureValidCountryPageData(data: CountryPageData) {
  const errors = validateCountryPageData(data);
  if (errors.length > 0) {
    throw new Error(`COUNTRY_PAGE_DATA_INVALID:${data.code}:${errors.join(",")}`);
  }
  return data;
}

export function listCountryPageCodes() {
  if (!fs.existsSync(INDEX_PATH)) return [];
  const data = readJson<string[]>(INDEX_PATH);
  return Array.isArray(data) ? data : [];
}

export function listCountryPageData() {
  return listCountryPageCodes()
    .map((code) => getCountryPageData(code))
    .filter((entry): entry is CountryPageData => Boolean(entry));
}

export function getCountryPageData(code: string) {
  const normalized = String(code || "").trim().toLowerCase();
  if (!/^(?:[a-z]{3}|us-[a-z]{2})$/.test(normalized)) return null;
  const filePath = path.join(COUNTRY_DIR, `${normalized}.json`);
  if (!fs.existsSync(filePath)) return null;
  return ensureValidCountryPageData(readJson<CountryPageData>(filePath));
}

export function getCountryPageIndexByIso2() {
  return new Map(
    listCountryPageData()
      .filter((entry) => entry.node_type === "country")
      .map((entry) => [entry.iso2.toUpperCase(), entry] as const)
  );
}

export function getCountryPageIndexByGeoCode() {
  return new Map(
    listCountryPageData().map((entry) => [entry.geo_code.toUpperCase(), entry] as const)
  );
}

export function buildSeoCountryIndex(code: string) {
  const root = getCountryPageData(code);
  if (!root) return {};

  const index = getCountryPageIndexByGeoCode();
  const allEntries = listCountryPageData();
  const entries = new Map<string, CountryPageData>();
  const addEntry = (geoCode: string | null | undefined) => {
    const normalizedGeo = String(geoCode || "").trim().toUpperCase();
    if (!normalizedGeo) return;
    const entry = index.get(normalizedGeo) || getCountryPageData(normalizedGeo.toLowerCase());
    if (!entry) return;
    entries.set(entry.geo_code.toUpperCase(), entry);
  };

  addEntry(root.geo_code);
  addEntry(root.parent_country?.code);
  for (const sibling of root.graph.same_country_states) addEntry(sibling.code);
  if (root.code === "usa" || root.geo_code === "US" || root.parent_country?.code === "usa") {
    for (const entry of allEntries) {
      if (entry.parent_country?.code === "usa") addEntry(entry.geo_code);
    }
  }

  return Object.fromEntries(entries.entries());
}

export function getCountryGraph() {
  if (!fs.existsSync(GRAPH_PATH)) return { nodes: [], edges: [] } satisfies CountryGraphPayload;
  return readJson<CountryGraphPayload>(GRAPH_PATH);
}

function toSentenceCase(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .split(" ")
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function summarizeLegalModel(data: CountryPageData) {
  return `Recreational: ${toSentenceCase(data.legal_model.recreational.status)} · ${toSentenceCase(
    data.legal_model.recreational.enforcement
  )} · ${toSentenceCase(data.legal_model.recreational.scope)}`;
}

function summarizeMedicalModel(data: CountryPageData) {
  return `Medical: ${toSentenceCase(data.legal_model.medical.status)} · ${toSentenceCase(
    data.legal_model.medical.scope
  )}`;
}

function summarizeDistributionModel(data: CountryPageData) {
  return `Distribution: ${toSentenceCase(data.legal_model.distribution.status)} · ${toSentenceCase(
    data.legal_model.distribution.enforcement
  )}`;
}

export function deriveMapCategoryFromCountryPageData(data: CountryPageData) {
  const recreational = data.legal_model.recreational;
  const medical = data.legal_model.medical;
  if (recreational.status === "LEGAL" || recreational.status === "DECRIMINALIZED" || recreational.status === "TOLERATED") {
    return "LEGAL_OR_DECRIM" as const;
  }
  if (recreational.enforcement !== "STRICT" || medical.status === "LEGAL" || medical.status === "LIMITED") {
    return "LIMITED_OR_MEDICAL" as const;
  }
  return "ILLEGAL" as const;
}

export function deriveCountryCardEntryFromCountryPageData(data: CountryPageData): CountryCardEntry {
  return {
    geo: data.geo_code,
    displayName: data.name,
    iso2: data.node_type === "state" ? data.geo_code : data.iso2,
    type: data.node_type,
    normalizedStatusSummary: data.notes_normalized,
    recreationalSummary: summarizeLegalModel(data),
    medicalSummary: summarizeMedicalModel(data),
    distributionSummary: summarizeDistributionModel(data),
    normalizedRecreationalStatus: data.legal_model.recreational.status,
    normalizedRecreationalEnforcement: data.legal_model.recreational.enforcement,
    normalizedRecreationalScope: data.legal_model.recreational.scope,
    normalizedMedicalStatus: data.legal_model.medical.status,
    normalizedMedicalScope: data.legal_model.medical.scope,
    normalizedDistributionStatus: data.legal_model.distribution.status,
    distributionFlags: data.legal_model.distribution.flags,
    statusFlags: data.legal_model.distribution.flags,
    notes: data.notes_normalized || data.notes_raw,
    coordinates: data.coordinates || undefined
  };
}

export function buildCountryCardIndexFromStorage() {
  return Object.fromEntries(
    listCountryPageData().map((entry) => {
      const cardEntry = deriveCountryCardEntryFromCountryPageData(entry);
      return [cardEntry.geo, cardEntry] as const;
    })
  );
}
