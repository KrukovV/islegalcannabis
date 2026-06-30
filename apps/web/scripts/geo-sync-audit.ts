import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { chromium, type Page } from "@playwright/test";
import { buildVercelBypassHeaders } from "../../../tools/vercel_bypass.mjs";
import { buildCardIndexSnapshot, buildCountrySourceSnapshot } from "../src/new-map/countrySource";
import {
  deriveMapCategoryFromCountryPageData,
  getCountryPageData,
  getCountryPageIndexByGeoCode
} from "../src/lib/countryPageStorage";
import { deriveCountryCardEntryFromCountryPageData } from "../src/lib/countryCardEntry";
import { deriveResultStatusFromCountryPageData, type MapCategory } from "../src/lib/resultStatus";
import { collectPopupComparableText } from "../src/lib/popupComparableText";

type RuntimeJurisdiction = {
  geo?: string;
  iso2?: string | null;
  code?: string;
  displayName?: string;
  type?: "country" | "state";
  pageHref?: string;
  detailsHref?: string | null;
  mapCategory?: MapCategory;
  result?: {
    status?: string;
    color?: string;
  };
  panel?: {
    levelTitle?: string;
    summary?: string;
  };
  parentCountry?: {
    code?: string;
    name?: string;
  };
  coordinates?: {
    lat: number;
    lng: number;
  };
  sources?: Array<{ id?: string; title?: string; url?: string }>;
  cannabisProfile?: {
    sourceUrl?: string;
    sourceTitle?: string;
    history?: string[];
    culture?: string[];
    enforcementReality?: string[];
    products?: string[];
    traditionalUse?: string[];
    slang?: string[];
    cultivation?: string[];
    market?: string[];
    localNames?: string[];
    notes?: string[];
    cannabisFoods?: string[];
  } | null;
};

type LngLat = {
  lng: number;
  lat: number;
};

type PopupSnapshot = {
  title: string;
  meta: string;
  status_badge: string;
  status_badge_category: string | null;
  status_summary: string;
  raw_text: string;
  section_map: Record<string, string[]>;
  source_links: Array<{ href: string; text: string }>;
};

type SeoSnapshot = {
  title: string;
  badge_text: string;
  badge_category: string | null;
  summary: string;
  intro: string;
  raw_text: string;
  section_map: Record<string, string[]>;
  source_links: Array<{ href: string; text: string }>;
};

type WikiSnapshot = {
  title: string;
  raw_text: string;
  lead_paragraphs: string[];
  section_map: Record<string, string[]>;
  final_url: string;
  html: string;
};

type ResolverScore = {
  title_match: boolean;
  redirect_match: boolean;
  parent_match: boolean;
  collision_risk: "low" | "medium" | "high";
  confidence: "high" | "medium" | "low";
};

type GeoAnalysisResult = {
  code: string;
  geo: string;
  canonical_key: string;
  canonical_record_hash: string | null;
  model_rule_id: string[];
  resolver_score: ResolverScore;
  wiki_coverage:
    | "individual_article"
    | "substantive_article"
    | "stub_lead_only"
    | "redirect_parent"
    | "root_only"
    | "no_individual_wiki_page"
    | "synthetic_no_wiki"
    | "resolver_failed";
  article_richness_score: {
    lead_length: number;
    section_count: number;
    substantive_sections: number;
    source_count: number;
  };
  section_coverage_score: Record<string, number>;
  legal_completeness_score: {
    recreational: boolean;
    medical: boolean;
    possession: boolean;
    sale_distribution: boolean;
    cultivation: boolean;
    industrial: boolean;
    enforcement: boolean;
  };
  sync_score: {
    map_popup_seo_model_aligned: boolean;
    popup_vs_seo_facts: {
      popup_chars: number;
      seo_chars: number;
      popup_items: number;
      seo_items_present: number;
      seo_richer_than_popup: boolean;
    };
  };
  color_model: {
    map_color_bucket: string | null;
    popup_badge_bucket: string | null;
    seo_badge_bucket: string | null;
    normalized_color_bucket: string | null;
    normalized_status: string | null;
    map_layer_id: string | null;
    map_source_id: string | null;
    map_color_evidence: string | null;
  };
  popup_sections: string[];
  seo_sections: string[];
  wiki_sections: string[];
  popup_missing: string[];
  seo_missing: string[];
  wrong_geo_text: string[];
  duplicate_with_geo: string[];
  raw_urls: string[];
  source_errors: string[];
  status_color_conflicts: string[];
  visual_evidence: {
    map_screenshot: ScreenshotStats | null;
    popup_screenshot: ScreenshotStats | null;
    seo_screenshot: ScreenshotStats | null;
    wiki_screenshot: ScreenshotStats | null;
    popup_panel: PopupVisualEvidence | null;
    seo_panel: SeoVisualEvidence | null;
    wiki_page: WikiVisualEvidence | null;
    map_screen_sample_hex: string | null;
  };
  visual_verdicts: {
    map_color_visual_verdict: string;
    map_vs_popup_visual_verdict: string;
    popup_visual_verdict: string;
    popup_vs_seo_visual_verdict: string;
    popup_vs_wiki_visual_verdict: string;
    seo_visual_verdict: string;
    map_vs_seo_visual_verdict: string;
    seo_vs_wiki_visual_verdict: string;
    color_vs_wiki_visual_verdict: string;
    popup_vs_seo_visual_density: number;
    wiki_vs_popup_visual_gap: number;
  };
  risk_flags: string[];
};

type GeoSyncRow = {
  code: string;
  name: string;
  type: string;
  parent: string | null;
  canonical_key: string;
  wiki_page: string | null;
  source_kind: string;
  coverage_class: GeoAnalysisResult["wiki_coverage"];
  low_coverage_reason: string | null;
  resolver_confidence: ResolverScore["confidence"];
  model_rule_ids: string[];
  applied_rules: string[];
  parser_version: string;
  generator_run_id: string;
  canonical_record_hash: string | null;
  map_screenshot: string | null;
  popup_screenshot: string | null;
  project_popup_screenshot: string | null;
  seo_screenshot: string | null;
  project_seo_panel_screenshot: string | null;
  wiki_screenshot: string | null;
  wiki_fullpage_screenshot: string | null;
  geo_analysis_json: string | null;
  artifact_dir: string | null;
  map_color_bucket: string | null;
  map_color_evidence: string | null;
  map_layer_id: string | null;
  map_source_id: string | null;
  popup_badge_bucket: string | null;
  popup_status_label: string | null;
  seo_badge_bucket: string | null;
  seo_status_label: string | null;
  normalized_color_bucket: string | null;
  normalized_status: string | null;
  before_sections: number | null;
  after_sections: number | null;
  popup_sections: string[];
  seo_sections: string[];
  wiki_sections: string[];
  missing_sections: string[];
  misplaced_content: string[];
  repeated_text: string[];
  source_trace_errors: string[];
  popup_missing: string[];
  seo_missing: string[];
  wrong_geo_text: string[];
  duplicate_with_geo: string[];
  raw_urls: string[];
  source_errors: string[];
  status_color_conflicts: string[];
  color_mismatch_kind: string[];
  manual_override_reason: string | null;
  changed_files: string[];
  notes: string[];
};

type MapFeatureEvidence = {
  found: boolean;
  layer_id: string | null;
  source_id: string | null;
  geo: string | null;
  display_name: string | null;
  map_category: string | null;
  status: string | null;
  color: string | null;
  base_color: string | null;
  feature_id: string | null;
  projected_x: number | null;
  projected_y: number | null;
  canvas_left: number | null;
  canvas_top: number | null;
  screenshot_sample_hex: string | null;
  screenshot_sample_rgba: [number, number, number, number] | null;
  screenshot_sample_distance: number | null;
};

type ScreenshotStats = {
  width: number;
  height: number;
  dark_pixel_ratio: number;
  non_white_ratio: number;
};

type PopupVisualEvidence = {
  rendered: boolean;
  panel_height: number;
  panel_width: number;
  text_block_count: number;
  heading_count: number;
  text_line_estimate: number;
  badge_category: string | null;
  badge_background: string | null;
  badge_text_color: string | null;
};

type SeoVisualEvidence = {
  rendered: boolean;
  panel_height: number;
  panel_width: number;
  text_block_count: number;
  heading_count: number;
  text_line_estimate: number;
  badge_category: string | null;
  badge_background: string | null;
  badge_text_color: string | null;
};

type WikiVisualEvidence = {
  rendered: boolean;
  content_height: number;
  content_width: number;
  paragraph_count: number;
  heading_count: number;
  text_line_estimate: number;
};

const ROOT = path.resolve(process.cwd(), "..", "..");
const GEO_SYNC_DIR = path.join(ROOT, "Artifacts", "geo-sync");
const NEW_MAP_ROUTE = "/new-map?qa=1";
const LEGAL_COUNTRIES_SOURCE_ID = "legal-countries";
const US_STATES_SOURCE_ID = "us-states";
const LEGAL_FILL_LAYER_ID = "legal-fill";
const LEGAL_POINT_LAYER_ID = "legal-point";
const LEGAL_TERRITORY_HITBOX_LAYER_ID = "legal-territory-hitbox";
const LEGAL_TERRITORY_LABEL_LAYER_ID = "legal-territory-label";
const US_STATES_FILL_LAYER_ID = "us-states-fill";
const CHANGED_FILES = [
  "apps/web/scripts/geo-sync-audit.ts",
  "apps/web/scripts/popup-visual-audit.ts",
  "apps/web/scripts/popup-seo-content-audit.ts",
  "apps/web/src/lib/countryPageStorage.ts",
  "apps/web/src/new-map/countrySource.ts",
  "apps/web/src/new-map/components/ViewportCountryPopup.tsx",
  "apps/web/src/new-map/components/UnifiedSeoStatusPanel.tsx"
];
const LIVE_FAILURES_PATH = path.join(GEO_SYNC_DIR, "live-failures.jsonl");
const LIVE_SUMMARY_PATH = path.join(GEO_SYNC_DIR, "live-summary.json");
const LIVE_REVIEW_PATH = path.join(GEO_SYNC_DIR, "live-review.jsonl");
const RISK_GEO_PRIORITY = [
  "GE",
  "US-GA",
  "US-WA",
  "US-WI",
  "CO",
  "US-CT",
  "IO",
  "MH",
  "MC",
  "NR",
  "SX",
  "TV",
  "UM",
  "VA",
  "SPI",
  "BJN",
  "BRT",
  "KAS",
  "PGA",
  "SCR",
  "SER",
  "BQ",
  "BV",
  "CX",
  "CC",
  "TK",
  "GF",
  "XK",
  "NC",
  "SV",
  "AQ",
  "AR",
  "KP",
  "SE"
];
const RISK_GEO_SET = new Set(RISK_GEO_PRIORITY);

type GeoSyncManifest = {
  generatedAt: string;
  total_geo_count: number;
  processed_geo_count: number;
  mapCaptured: number;
  popupCaptured: number;
  seoCaptured: number;
  wikiCaptured: number;
  coverage_summary: Record<string, number>;
  rows: GeoSyncRow[];
};

type GeoSyncValidation = {
  generatedAt: string;
  total_geo_count: number;
  processed_geo_count: number;
  screenshot_pairs_ok: boolean;
  existing_paths_ok: boolean;
  regressions: string[];
  missing_artifacts: Array<{ code: string; missing: string[] }>;
  stale_partial_overwrite_risk: boolean;
};

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function stableUnique(items: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const normalized = String(item || "").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeText(value: string) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function bucketToSemanticColor(bucket: string | null | undefined) {
  const normalized = String(bucket || "").trim().toUpperCase();
  if (normalized === "ILLEGAL") return "RED";
  if (normalized === "LIMITED_OR_MEDICAL") return "YELLOW";
  if (normalized === "LEGAL_OR_DECRIM") return "GREEN";
  if (normalized === "UNKNOWN") return "UNKNOWN";
  return "UNKNOWN";
}

function hasWikiMedicalNegation(text: string) {
  return (
    /\bmedicinal\s+likely not prescribed by doctors\b/i.test(text) ||
    /\bmedical (?:cannabis|marijuana|use)\s+(?:is|remains|was|were)\s+(?:illegal|not allowed|not permitted|prohibited|banned)\b/i.test(text) ||
    /\bnot allowed for medical purposes\b/i.test(text) ||
    /\bno (?:comprehensive )?medical cannabis\b/i.test(text)
  );
}

function hasWikiControlledNarcoticConflict(text: string) {
  return (
    /\bcannabis(?: and hemp resin)? is listed.{0,160}\bnarcotics?\b/i.test(text) ||
    /\bcannabis and hemp resin is listed.{0,160}\bnarcotics?\b/i.test(text) ||
    /\bofficially illegal\b/i.test(text) ||
    /\buse is still illegal\b/i.test(text) ||
    /\bcriminal offe[nc]e to smoke\b/i.test(text) ||
    /\blegal status.{0,100}\bunclear\b/i.test(text)
  );
}

function hasWikiRecreationalIllegal(text: string) {
  return /\brecreational\s+illegal\b/i.test(text) || /\brecreational.{0,80}\billegal\b/i.test(text);
}

function deriveSemanticStatusConflicts(params: {
  wikiText: string;
  popupText: string;
  seoText: string;
  mapColorBucket: string | null;
  popupBadgeBucket: string | null;
  seoBadgeBucket: string | null;
  normalizedColorBucket: string | null;
  normalizedStatus: string | null;
}) {
  const wikiText = params.wikiText || "";
  const projectText = `${params.popupText || ""} ${params.seoText || ""}`;
  const projectSaysMedicalAccess =
    /\bmedical access exists\b/i.test(projectText) ||
    /\bmedical cannabis is legal\b/i.test(projectText) ||
    /\bmedical\s+legal\b/i.test(projectText);
  const anyGreen = [
    params.mapColorBucket,
    params.popupBadgeBucket,
    params.seoBadgeBucket,
    params.normalizedColorBucket
  ].some((bucket) => bucketToSemanticColor(bucket) === "GREEN");
  const recreationalIllegal = hasWikiRecreationalIllegal(wikiText);
  const medicalNegation = hasWikiMedicalNegation(wikiText);
  const controlledConflict = hasWikiControlledNarcoticConflict(wikiText);
  return stableUnique([
    anyGreen && recreationalIllegal && medicalNegation ? "wiki_recreational_illegal_medical_negation_green" : "",
    anyGreen && recreationalIllegal && controlledConflict ? "wiki_controlled_narcotic_conflict_green" : "",
    projectSaysMedicalAccess && medicalNegation ? "project_medical_access_contradicts_wiki" : "",
    String(params.normalizedStatus || "").toUpperCase() === "ILLEGAL" &&
      bucketToSemanticColor(params.normalizedColorBucket) === "GREEN" &&
      (medicalNegation || controlledConflict)
      ? "normalized_illegal_green_with_wiki_conflict"
      : ""
  ].filter(Boolean));
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function buildCanonicalRecordHash(payload: Record<string, unknown>) {
  return crypto.createHash("sha256").update(stableSerialize(payload)).digest("hex");
}

function rgbaToHex(rgba: [number, number, number, number] | null) {
  if (!rgba) return null;
  return `#${rgba.slice(0, 3).map((value) => value.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function parseHexColor(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  const match = normalized.match(/^#?([0-9a-f]{6})$/i);
  if (!match) return null;
  const hex = match[1];
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16)
  ] as [number, number, number];
}

function rgbDistance(left: [number, number, number] | null, right: [number, number, number] | null) {
  if (!left || !right) return Number.POSITIVE_INFINITY;
  return Math.sqrt(
    Math.pow(left[0] - right[0], 2) +
    Math.pow(left[1] - right[1], 2) +
    Math.pow(left[2] - right[2], 2)
  );
}

function relativeDelta(base: number, compare: number) {
  if (!Number.isFinite(base) || base <= 0 || !Number.isFinite(compare)) return 0;
  return (compare - base) / base;
}

function resolveRepoPath(relativePath: string | null | undefined) {
  const normalized = String(relativePath || "").trim();
  if (!normalized) return null;
  return path.isAbsolute(normalized) ? normalized : path.join(ROOT, normalized);
}

function fileExists(relativePath: string | null | undefined) {
  const resolved = resolveRepoPath(relativePath);
  return Boolean(resolved && fs.existsSync(resolved));
}

function readArtifactText(relativePath: string | null | undefined) {
  const resolved = resolveRepoPath(relativePath);
  if (!resolved || !fs.existsSync(resolved)) return "";
  return fs.readFileSync(resolved, "utf8");
}

function artifactSiblingText(screenshotPath: string | null | undefined, fileName: string) {
  const resolved = resolveRepoPath(screenshotPath);
  if (!resolved) return "";
  return readArtifactText(path.join(path.dirname(resolved), fileName));
}

async function computeScreenshotStats(screenshotPath: string): Promise<ScreenshotStats | null> {
  if (!fs.existsSync(screenshotPath)) return null;
  const sharp = (await import("sharp")).default;
  const resized = sharp(screenshotPath).ensureAlpha().resize({ width: 256, withoutEnlargement: true });
  const { data, info } = await resized.raw().toBuffer({ resolveWithObject: true });
  const width = info.width || 0;
  const height = info.height || 0;
  if (!width || !height) return null;
  let darkPixels = 0;
  let nonWhitePixels = 0;
  const total = width * height;
  for (let index = 0; index < data.length; index += info.channels) {
    const r = data[index] || 0;
    const g = data[index + 1] || 0;
    const b = data[index + 2] || 0;
    const a = data[index + 3] ?? 255;
    if (a < 16) continue;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (luma < 200) darkPixels += 1;
    if (!(r > 245 && g > 245 && b > 245)) nonWhitePixels += 1;
  }
  return {
    width,
    height,
    dark_pixel_ratio: total > 0 ? darkPixels / total : 0,
    non_white_ratio: total > 0 ? nonWhitePixels / total : 0
  };
}

async function sampleScreenshotPixel(
  screenshotPath: string,
  x: number | null,
  y: number | null,
  expectedHex?: string | null
) {
  if (!fs.existsSync(screenshotPath)) return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const sharp = (await import("sharp")).default;
  const metadata = await sharp(screenshotPath).metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;
  if (!width || !height) return null;
  const centerX = Math.min(width - 1, Math.max(0, Math.round(Number(x))));
  const centerY = Math.min(height - 1, Math.max(0, Math.round(Number(y))));
  const expected = parseHexColor(expectedHex || null);
  const radius = expected ? 80 : 18;
  const left = Math.max(0, centerX - radius);
  const top = Math.max(0, centerY - radius);
  const extractWidth = Math.max(1, Math.min(width - left, radius * 2 + 1));
  const extractHeight = Math.max(1, Math.min(height - top, radius * 2 + 1));
  const { data, info } = await sharp(screenshotPath)
    .ensureAlpha()
    .extract({ left, top, width: extractWidth, height: extractHeight })
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (!data.length || info.channels < 4) return null;
  let best: {
    rgba: [number, number, number, number];
    distance: number;
  } | null = null;
  for (let pixelY = 0; pixelY < extractHeight; pixelY += 1) {
    for (let pixelX = 0; pixelX < extractWidth; pixelX += 1) {
      const offset = (pixelY * extractWidth + pixelX) * info.channels;
      const rgba = [
        data[offset] || 0,
        data[offset + 1] || 0,
        data[offset + 2] || 0,
        data[offset + 3] || 0
      ] as [number, number, number, number];
      if (rgba[3] < 16) continue;
      const distance = rgbDistance(expected, [rgba[0], rgba[1], rgba[2]]);
      if (!best || distance < best.distance) best = { rgba, distance };
    }
  }
  return best;
}

function buildVisualVerdict(options: {
  ok: boolean;
  sparse?: boolean;
  reasons?: string[];
}) {
  if (options.ok) return "PASS";
  if (options.sparse) return "SPARSE";
  const reasons = stableUnique((options.reasons || []).filter(Boolean));
  return reasons.length ? `FAIL:${reasons.join("|")}` : "FAIL";
}

function decodeWikiTitleFromUrl(url: string | null | undefined) {
  const normalized = String(url || "").trim();
  if (!normalized) return "";
  try {
    const parsed = new URL(normalized);
    const match = parsed.pathname.match(/\/wiki\/(.+)$/i);
    if (!match) return "";
    return decodeURIComponent(match[1]).replace(/_/g, " ").trim();
  } catch {
    return "";
  }
}

function isGenericCannabisWikiUrl(url: string | null | undefined) {
  const title = decodeWikiTitleFromUrl(url);
  return /^Cannabis in [^(]+$/i.test(title);
}

function isSpecificCannabisWikiUrl(url: string | null | undefined) {
  const title = decodeWikiTitleFromUrl(url);
  return /^Cannabis in .+\s+\(.+\)$/i.test(title);
}

function isDedicatedCannabisWiki(value: { url?: string | null; title?: string | null }) {
  const title = String(value.title || "").trim();
  const url = String(value.url || "").trim();
  return /^Cannabis in\b/i.test(title) || /\/wiki\/Cannabis_in_/i.test(url);
}

function normalizeWikiComparableUrl(value: string) {
  try {
    const url = new URL(String(value || "").trim());
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return String(value || "").trim().replace(/\/+$/, "");
  }
}

function isSyntheticGeo(geo: string) {
  return /^[A-Z]{3}$/.test(String(geo || "").trim().toUpperCase());
}

function popupSemanticHeading(value: string) {
  const heading = String(value || "")
    .replace(/\s*·\s*.*$/i, "")
    .replace(/\[edit\]/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (heading === "history") return "History";
  if (heading === "status" || heading === "hard restrictions" || heading === "more context" || heading === "why this color") {
    return "Legal/Status";
  }
  if (heading === "culture") return "Culture";
  if (heading === "traditional use") return "Traditional Use";
  if (heading === "cultivation") return "Cultivation";
  if (heading === "market") return "Market";
  if (heading === "products") return "Products";
  if (heading === "local names" || heading === "slang") return "Slang";
  if (heading === "cannabis foods") return "Cannabis Foods";
  if (heading === "enforcement reality") return "Enforcement";
  if (heading === "jurisdiction") return "Jurisdiction";
  return null;
}

function wikiSemanticHeading(value: string) {
  const heading = String(value || "").replace(/\[edit\]/gi, "").trim();
  if (!heading) return null;
  if (/\b(history|chronology|origins?|prehistory|ancient|post-war|legalization|decriminali[sz]ation|reform|developments?|background|modern accounts?)\b/i.test(heading)) {
    return "History";
  }
  if (/\b(laws?|legal status|legislation|policy|ballot|initiative|adult use|medical cannabis|medical marijuana|recreational|industrial)\b/i.test(heading)) {
    return "Legal/Status";
  }
  if (/\b(agriculture|cultivation|production|hemp)\b/i.test(heading)) return "Cultivation";
  if (/\b(economy|economics|market|commodity|trade|tourism|sales?|tax|retail)\b/i.test(heading)) return "Market";
  if (/\b(culture|cultural)\b/i.test(heading)) return "Culture";
  if (/\b(traditional use|ritual|folk|medicinal use)\b/i.test(heading)) return "Traditional Use";
  if (/\b(products?|foods?|edibles?|hashish|resin|oil)\b/i.test(heading)) return "Products";
  if (/\b(local names?|slang|parlance|etymology|terminology)\b/i.test(heading)) return "Slang";
  if (/\b(penalt(?:y|ies)|enforcement|arrests?)\b/i.test(heading)) return "Enforcement";
  return null;
}

function isNonContentWikiHeading(value: string) {
  const heading = String(value || "").replace(/\[edit\]/gi, "").replace(/\s+/g, " ").trim().toLowerCase();
  return ["contents", "content", "see also", "references", "external links", "further reading", "notes"].includes(heading);
}

function cleanWikiItems(items: string[]) {
  return items.filter((item) => {
    const text = String(item || "").replace(/\s+/g, " ").trim();
    if (!text) return false;
    if (/^v\s+t\s+e$/i.test(text)) return false;
    if (/^retrieved\s+\d{4}/i.test(text)) return false;
    if (/^archived from the original/i.test(text)) return false;
    return true;
  });
}

function wikiSemanticSectionsFromSnapshot(sectionMap: Record<string, string[]>, leadParagraphs: string[]) {
  const headings: string[] = [];
  for (const [heading, rawItems] of Object.entries(sectionMap)) {
    if (isNonContentWikiHeading(heading)) continue;
    const items = cleanWikiItems(rawItems);
    if (!items.length) continue;
    const semanticHeading = wikiSemanticHeading(heading);
    if (semanticHeading) headings.push(semanticHeading);
  }
  if (headings.length === 0) {
    const lead = cleanWikiItems(leadParagraphs || []);
    if (lead.some((item) => /\b(history|early|ancient|reform|legali[sz]|decriminali[sz])\b/i.test(item))) headings.push("History");
    if (lead.some((item) => /\b(illegal|legal|banned|restricted|medical|recreational|adult use|hemp)\b/i.test(item))) headings.push("Legal/Status");
    if (lead.some((item) => /\b(prison|fine|arrest|penalt)\b/i.test(item))) headings.push("Enforcement");
  }
  return stableUnique(headings);
}

function deriveWikiAuditUrl(entry: RuntimeJurisdiction) {
  const profileUrl = String(entry?.cannabisProfile?.sourceUrl || "").trim();
  const sourceCandidates = (entry?.sources || [])
    .map((source) => String(source?.url || "").trim())
    .filter((candidate) => /wikipedia\.org\/wiki\//i.test(candidate));
  const canonicalCannabisCandidate = sourceCandidates.find((candidate) => isSpecificCannabisWikiUrl(candidate));
  if (canonicalCannabisCandidate && (!profileUrl || isGenericCannabisWikiUrl(profileUrl))) return canonicalCannabisCandidate;
  if (profileUrl) return profileUrl;
  for (const source of entry?.sources || []) {
    const candidate = String(source?.url || "").trim();
    if (/wikipedia\.org\/wiki\//i.test(candidate)) return candidate;
  }
  const detailsHref = String(entry?.detailsHref || "").trim();
  return /wikipedia\.org\/wiki\//i.test(detailsHref) ? detailsHref : "";
}

function deriveSourceKind(entry: RuntimeJurisdiction, wikiUrl: string) {
  if (String(entry?.cannabisProfile?.sourceUrl || "").trim()) return "dedicated_profile";
  if (/\/wiki\/Legality_of_cannabis(?:$|_by_)/i.test(wikiUrl)) return "root_legality_source";
  if (wikiUrl) return "fallback_wikipedia_source";
  return "no_wiki_source";
}

function readPreviousSectionCounts() {
  const manifestPath = path.join(GEO_SYNC_DIR, "full-manifest.json");
  if (!fs.existsSync(manifestPath)) return new Map<string, number>();
  try {
    const previous = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as GeoSyncManifest;
    return new Map(
      (previous.rows || []).map((row) => [String(row.code || "").toUpperCase(), Array.isArray(row.popup_sections) ? row.popup_sections.length : 0] as const)
    );
  } catch {
    return new Map<string, number>();
  }
}

function deriveLowCoverageReason(options: {
  coverageClass: GeoAnalysisResult["wiki_coverage"];
  sourceKind: string;
  popupSections: string[];
  wikiSections: string[];
  popupMissing: string[];
}) {
  const { coverageClass, sourceKind, popupSections, wikiSections, popupMissing } = options;
  const thematicPopupSections = popupSections.filter(
    (section) => !["Legal/Status", "Jurisdiction", "Medical/Industrial/Recreational"].includes(section)
  );
  if (coverageClass === "root_only") return "Only root legality evidence is available for this geo, so thematic popup sections stay intentionally sparse.";
  if (coverageClass === "no_individual_wiki_page") return "No individual cannabis article exists for this geo; popup remains law/source-only to avoid speculation.";
  if (coverageClass === "synthetic_no_wiki") return "Synthetic/disputed geo has no dedicated cannabis article; popup intentionally stays sparse and claimant-based.";
  if (coverageClass === "substantive_article" && sourceKind !== "dedicated_profile" && thematicPopupSections.length === 0) {
    return "Fallback territory/parent article is not cannabis-specific, so popup stays at law/source-only coverage.";
  }
  if (popupSections.length > 1) return null;
  if (coverageClass === "individual_article") {
    if (popupMissing.length > 0) return "Dedicated cannabis article has additional structured sections that are not yet surfaced in the popup.";
    if (wikiSections.length <= 1) return "Dedicated cannabis article currently yields only one structured section.";
    return "Dedicated cannabis article is present, but extracted facts still collapse into one popup section.";
  }
  if (coverageClass === "substantive_article") {
    if (sourceKind !== "dedicated_profile") {
      return "Fallback territory/parent article is not cannabis-specific, so popup stays at law/source-only coverage.";
    }
    if (wikiSections.length <= 1) return "Source article exposes only limited cannabis-specific structured sections for this geo.";
    if (popupMissing.length > 0) return "Source article has additional structured sections that are not yet surfaced in the popup.";
    return "Structured source coverage is still too thin to support more than one popup section without speculation.";
  }
  if (coverageClass === "stub_lead_only") return "Dedicated cannabis article is lead-only and does not expose enough structured sections for a richer popup.";
  if (coverageClass === "redirect_parent") return "Resolved wiki evidence redirects to a parent/territory article rather than a dedicated cannabis article for this geo.";
  return "Resolver could not prove a dedicated wiki source for this geo.";
}

function buildCoverageSummary(rows: GeoSyncRow[]) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const key = row.coverage_class || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function renderHtmlIndex(rows: GeoSyncRow[], summary: GeoSyncManifest) {
  const linkHref = (value: string | null | undefined) => {
    const normalized = String(value || "").trim();
    if (!normalized) return "";
    if (path.isAbsolute(normalized)) return `file://${normalized}`;
    return `../../${normalized}`;
  };
  const cards = [
    ["Total", summary.total_geo_count],
    ["Processed", summary.processed_geo_count],
    ["Map", summary.mapCaptured],
    ["Popup", summary.popupCaptured],
    ["SEO", summary.seoCaptured],
    ["Wiki", summary.wikiCaptured]
  ]
    .map(([label, value]) => `<div class="card"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div></div>`)
    .join("");
  const tableRows = rows.map((row) => {
    const mapShot = row.map_screenshot ? `<a href="${escapeHtml(linkHref(row.map_screenshot))}">map</a>` : "";
    const popupShot = row.popup_screenshot ? `<a href="${escapeHtml(linkHref(row.popup_screenshot))}">popup</a>` : "";
    const seoPanelShot = row.project_seo_panel_screenshot ? `<a href="${escapeHtml(linkHref(row.project_seo_panel_screenshot))}">seo-panel</a>` : "";
    const seoShot = row.seo_screenshot ? `<a href="${escapeHtml(linkHref(row.seo_screenshot))}">seo-page</a>` : "";
    const wikiShot = row.wiki_screenshot ? `<a href="${escapeHtml(linkHref(row.wiki_screenshot))}">wiki</a>` : "";
    const analysis = row.geo_analysis_json ? `<a href="${escapeHtml(linkHref(row.geo_analysis_json))}">analysis</a>` : "";
    return `<tr>
      <td>${escapeHtml(row.code)}</td>
      <td>${escapeHtml(row.name)}</td>
      <td>${escapeHtml(row.type)}</td>
      <td>${escapeHtml(row.coverage_class)}</td>
      <td>${escapeHtml(row.source_kind)}</td>
      <td>${escapeHtml(row.popup_badge_bucket || "")} / ${escapeHtml(row.seo_badge_bucket || "")} / ${escapeHtml(row.normalized_color_bucket || "")}</td>
      <td>${escapeHtml((row.popup_sections || []).join(" | "))}</td>
      <td>${escapeHtml((row.wiki_sections || []).join(" | "))}</td>
      <td>${escapeHtml(row.low_coverage_reason || "")}</td>
      <td>${escapeHtml((row.source_trace_errors || []).join(" | "))}</td>
      <td>${escapeHtml((row.notes || []).join(" | "))}</td>
      <td>${mapShot} ${popupShot} ${seoPanelShot} ${seoShot} ${wikiShot} ${analysis}</td>
    </tr>`;
  }).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Geo Sync Audit</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 24px; color: #111; background: #fafafa; }
    .cards { display: grid; grid-template-columns: repeat(6, minmax(120px, 1fr)); gap: 12px; margin-bottom: 24px; }
    .card { background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 12px; }
    .label { font-size: 12px; color: #666; margin-bottom: 6px; }
    .value { font-size: 20px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; background: #fff; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; vertical-align: top; font-size: 12px; }
    th { background: #f0f0f0; position: sticky; top: 0; }
    a { color: #0b57d0; text-decoration: underline; }
  </style>
</head>
<body>
  <h1>Geo Sync Audit</h1>
  <div class="cards">${cards}</div>
  <table>
    <thead>
      <tr>
        <th>Code</th>
        <th>Name</th>
        <th>Type</th>
        <th>Coverage</th>
        <th>Source kind</th>
        <th>Color parity</th>
        <th>Popup sections</th>
        <th>Wiki sections</th>
        <th>Low coverage reason</th>
        <th>Source trace</th>
        <th>Notes</th>
        <th>Artifacts</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
</body>
</html>
`;
}

function buildValidation(rows: GeoSyncRow[], total: number): GeoSyncValidation {
  const missingArtifacts = rows
    .map((row) => {
      const missing = [
        fileExists(row.map_screenshot) ? "" : "map_screenshot",
        fileExists(row.popup_screenshot) ? "" : "popup_screenshot",
        fileExists(row.seo_screenshot) ? "" : "seo_screenshot",
        fileExists(row.project_seo_panel_screenshot) ? "" : "seo_panel_screenshot",
        fileExists(row.wiki_screenshot) ? "" : "wiki_screenshot",
        fileExists(row.geo_analysis_json) ? "" : "geo_analysis_json"
      ].filter(Boolean);
      return missing.length ? { code: row.code, missing } : null;
    })
    .filter((item): item is { code: string; missing: string[] } => Boolean(item));
  const regressions = stableUnique([
    rows.length === total ? "" : `PROCESSED_COUNT_MISMATCH:${rows.length}/${total}`,
    rows.every((row) => row.source_trace_errors.length === 0) ? "" : "SOURCE_TRACE_ERRORS_PRESENT",
    rows.every((row) => row.raw_urls.length === 0) ? "" : "RAW_URLS_PRESENT",
    rows.every((row) => row.color_mismatch_kind.length === 0) ? "" : "COLOR_MISMATCH_PRESENT",
    rows.every((row) => row.wrong_geo_text.length === 0) ? "" : "WRONG_GEO_TEXT_PRESENT",
    missingArtifacts.length === 0 ? "" : "MISSING_ARTIFACTS_PRESENT"
  ].filter(Boolean));
  return {
    generatedAt: new Date().toISOString(),
    total_geo_count: total,
    processed_geo_count: rows.length,
    screenshot_pairs_ok: missingArtifacts.length === 0,
    existing_paths_ok: missingArtifacts.length === 0,
    regressions,
    missing_artifacts: missingArtifacts,
    stale_partial_overwrite_risk: total > rows.length
  };
}

function evaluateLiveRow(row: GeoSyncRow) {
  const wikiText = artifactSiblingText(row.wiki_screenshot || row.wiki_fullpage_screenshot, "wiki-fullpage.txt");
  const popupText = artifactSiblingText(row.popup_screenshot || row.project_popup_screenshot, "project-popup.txt");
  const seoText = artifactSiblingText(row.seo_screenshot, "project-seo-fullpage.txt");
  const semanticStatusConflicts = deriveSemanticStatusConflicts({
    wikiText,
    popupText,
    seoText,
    mapColorBucket: row.map_color_bucket,
    popupBadgeBucket: row.popup_badge_bucket,
    seoBadgeBucket: row.seo_badge_bucket,
    normalizedColorBucket: row.normalized_color_bucket,
    normalizedStatus: row.normalized_status
  });
  const failures = stableUnique([
    fileExists(row.map_screenshot) ? "" : "MAP_SCREENSHOT_MISSING",
    fileExists(row.popup_screenshot || row.project_popup_screenshot) ? "" : "POPUP_SCREENSHOT_MISSING",
    fileExists(row.seo_screenshot) ? "" : "SEO_SCREENSHOT_MISSING",
    fileExists(row.project_seo_panel_screenshot) ? "" : "SEO_PANEL_SCREENSHOT_MISSING",
    fileExists(row.wiki_screenshot || row.wiki_fullpage_screenshot) ? "" : "WIKI_SCREENSHOT_MISSING",
    fileExists(row.geo_analysis_json) ? "" : "GEO_ANALYSIS_JSON_MISSING",
    String(row.canonical_record_hash || "").trim() ? "" : "CANONICAL_RECORD_HASH_MISSING",
    ...row.notes.filter((item) => /=FAIL\b/.test(item)),
    row.notes.includes("SEO_NOT_RICHER_THAN_POPUP") ? "SEO_NOT_RICHER_THAN_POPUP" : "",
    row.source_trace_errors.length > 0 || row.source_errors.length > 0 ? "SOURCE_TRACE_ERRORS_PRESENT" : "",
    row.raw_urls.length > 0 ? "RAW_URLS_PRESENT" : "",
    row.repeated_text.length > 0 ? "REPEATED_TEXT_PRESENT" : "",
    row.wrong_geo_text.length > 0 ? "WRONG_GEO_TEXT_PRESENT" : "",
    row.duplicate_with_geo.length > 0 ? "DUPLICATE_GEO_TEXT_PRESENT" : "",
    row.status_color_conflicts.length > 0 ? "STATUS_COLOR_CONFLICTS_PRESENT" : "",
    row.color_mismatch_kind.length > 0 ? "COLOR_MISMATCH_PRESENT" : "",
    ...semanticStatusConflicts.map((item) => `SEMANTIC_STATUS_CONFLICT:${item}`)
  ].filter(Boolean));
  const geo = String(row.canonical_key || row.code || "").split("|")[0].toUpperCase() || row.code.toUpperCase();
  const warnings = stableUnique([
    row.low_coverage_reason ? `LOW_COVERAGE=${row.low_coverage_reason}` : "",
    RISK_GEO_SET.has(geo) ? "RISK_GEO_VISUAL_REVIEW_REQUIRED" : ""
  ].filter(Boolean));
  return {
    ok: failures.length === 0,
    code: geo,
    name: row.name,
    failures,
    warnings,
    screenshots: {
      map: row.map_screenshot,
      popup: row.popup_screenshot,
      seo: row.seo_screenshot,
      wiki: row.wiki_screenshot,
      analysis: row.geo_analysis_json
    }
  };
}

function writeLiveSummary(options: {
  rows: GeoSyncRow[];
  total: number;
  liveFailures: ReturnType<typeof evaluateLiveRow>[];
  startedAt: number;
  current: ReturnType<typeof evaluateLiveRow>;
}) {
  const summary = {
    generatedAt: new Date().toISOString(),
    total_geo_count: options.total,
    processed_geo_count: options.rows.length,
    remaining_geo_count: Math.max(0, options.total - options.rows.length),
    live_fail_count: options.liveFailures.length,
    live_fail_codes: options.liveFailures.map((item) => item.code),
    current: options.current,
    visual_pass: {
      map_color: options.rows.filter((row) => row.notes.some((item) => item === "MAP_COLOR_VISUAL_VERDICT=PASS")).length,
      popup_vs_seo: options.rows.filter((row) => row.notes.some((item) => item === "POPUP_VS_SEO_VISUAL_VERDICT=PASS")).length,
      seo_vs_wiki: options.rows.filter((row) => row.notes.some((item) => item === "SEO_VS_WIKI_VISUAL_VERDICT=PASS")).length
    },
    elapsed_ms: Date.now() - options.startedAt
  };
  fs.writeFileSync(LIVE_SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`);
}

function classifyCoverage(params: {
  geo: string;
  wikiUrl: string;
  hasComparableCannabisProfile: boolean;
  sourceKind: string;
  wikiSnapshot: WikiSnapshot | null;
  wikiSectionsFound: string[];
}) {
  const { geo, wikiUrl, hasComparableCannabisProfile, sourceKind, wikiSnapshot, wikiSectionsFound } = params;
  const finalUrl = normalizeWikiComparableUrl(wikiSnapshot?.final_url || wikiUrl);
  const requestedUrl = normalizeWikiComparableUrl(wikiUrl);
  const finalTitle = String(wikiSnapshot?.title || "").trim();
  const dedicatedFinal = isDedicatedCannabisWiki({ url: finalUrl, title: finalTitle });
  const dedicatedRequested = isDedicatedCannabisWiki({ url: requestedUrl, title: finalTitle });
  const redirected = Boolean(requestedUrl && finalUrl && requestedUrl !== finalUrl);
  const leadParagraphCount = wikiSnapshot?.lead_paragraphs?.length || 0;

  if (!wikiUrl) {
    return isSyntheticGeo(geo) ? "synthetic_no_wiki" : "resolver_failed";
  }
  if (sourceKind === "root_legality_source") return "root_only";
  if (redirected && !dedicatedFinal) return "redirect_parent";
  if (hasComparableCannabisProfile && dedicatedRequested) {
    return wikiSectionsFound.length > 0 ? "individual_article" : "stub_lead_only";
  }
  if (wikiSectionsFound.length > 0 || leadParagraphCount > 0) return "substantive_article";
  return isSyntheticGeo(geo) ? "synthetic_no_wiki" : "no_individual_wiki_page";
}

function buildAuditGeoList(
  cardIndex: Record<string, RuntimeJurisdiction>,
  options: { requested?: Set<string>; offset?: number; limit?: number } = {}
) {
  const requested = options.requested || new Set<string>();
  const offset = Math.max(0, Number(options.offset || 0) || 0);
  const limit = Number.isFinite(Number(options.limit)) && Number(options.limit) > 0 ? Math.floor(Number(options.limit)) : null;
  const allGeosSorted = Array.from(
    new Set(
      Object.entries(cardIndex)
        .map(([geo, entry]) => {
          const normalizedGeo = String(geo || "").toUpperCase();
          const normalizedType = String(entry?.type || "").toLowerCase();
          if (requested.size && !requested.has(normalizedGeo)) return null;
          if (/^US-[A-Z]{2}$/.test(normalizedGeo) && normalizedType === "state") return normalizedGeo;
          if ((/^[A-Z]{2}$/.test(normalizedGeo) || /^[A-Z]{3}$/.test(normalizedGeo)) && normalizedType === "country") return normalizedGeo;
          if (requested.size && requested.has(normalizedGeo)) return normalizedGeo;
          return null;
        })
        .filter((geo): geo is string => Boolean(geo))
    )
  ).sort((left, right) => {
    const leftName = String(cardIndex[left]?.displayName || left).trim();
    const rightName = String(cardIndex[right]?.displayName || right).trim();
    return leftName.localeCompare(rightName, "en", { sensitivity: "base" }) || left.localeCompare(right);
  });
  const requestedOrder = Array.from(requested).filter((geo) => allGeosSorted.includes(geo));
  const riskOrder = RISK_GEO_PRIORITY.filter((geo) => allGeosSorted.includes(geo));
  const allGeos = requested.size
    ? [...requestedOrder, ...allGeosSorted.filter((geo) => !requested.has(geo))]
    : [...riskOrder, ...allGeosSorted.filter((geo) => !RISK_GEO_SET.has(geo))];
  const geos = limit === null ? allGeos.slice(offset) : allGeos.slice(offset, offset + limit);
  return { total: allGeos.length, geos };
}

async function waitForMapReady(page: Page) {
  await page.waitForFunction(() => {
    return document.querySelector('[data-testid="new-map-surface"]')?.getAttribute("data-map-ready") === "1";
  }, { timeout: 20_000 });
  await page.waitForFunction(() => {
    const map = (window as typeof window & { __NEW_MAP_DEBUG__?: { map?: { isStyleLoaded: () => boolean } | null } }).__NEW_MAP_DEBUG__?.map;
    return Boolean(map && typeof map.isStyleLoaded === "function" && map.isStyleLoaded());
  }, { timeout: 20_000 });
}

async function setSelectedGeo(page: Page, geo: string | null) {
  await page.evaluate((targetGeo) => {
    const host = window as typeof window & {
      __NEW_MAP_DEBUG__?: {
        setSelectedGeo?: (_geo: string | null) => void;
      };
    };
    host.__NEW_MAP_DEBUG__?.setSelectedGeo?.(targetGeo);
  }, geo);
  await page.waitForTimeout(900);
}

async function loadRuntimeCardIndex(page: Page) {
  return page.evaluate(() =>
    fetch("/api/new-map/card-index", { credentials: "same-origin", cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`CARD_INDEX_FETCH_FAILED:${response.status}`);
        return response.json();
      })
  );
}

function normalizeLngLat(coords: unknown): LngLat | null {
  if (!coords || typeof coords !== "object") return null;
  const candidate = coords as { lng?: unknown; lat?: unknown };
  const lng = Number(candidate.lng);
  const lat = Number(candidate.lat);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return { lng, lat };
}

function collectCoordinatePairs(value: unknown, output: LngLat[] = []) {
  if (!Array.isArray(value)) return output;
  if (typeof value[0] === "number" && typeof value[1] === "number") {
    const lng = Number(value[0]);
    const lat = Number(value[1]);
    if (Number.isFinite(lng) && Number.isFinite(lat)) output.push({ lng, lat });
    return output;
  }
  for (const item of value) collectCoordinatePairs(item, output);
  return output;
}

function boundsForPoints(points: LngLat[]) {
  const bounds = points.reduce(
    (acc, point) => ({
      minLng: Math.min(acc.minLng, point.lng),
      maxLng: Math.max(acc.maxLng, point.lng),
      minLat: Math.min(acc.minLat, point.lat),
      maxLat: Math.max(acc.maxLat, point.lat)
    }),
    {
      minLng: Number.POSITIVE_INFINITY,
      maxLng: Number.NEGATIVE_INFINITY,
      minLat: Number.POSITIVE_INFINITY,
      maxLat: Number.NEGATIVE_INFINITY
    }
  );
  if (!Number.isFinite(bounds.minLng) || !Number.isFinite(bounds.minLat)) return null;
  return bounds;
}

function geometryAnchorFromCoordinateGroup(value: unknown): { point: LngLat; area: number } | null {
  const points = collectCoordinatePairs(value);
  if (points.length === 0) return null;
  const bounds = boundsForPoints(points);
  if (!bounds) return null;
  const area = Math.max(0, bounds.maxLng - bounds.minLng) * Math.max(0, bounds.maxLat - bounds.minLat);
  const averaged = points.reduce(
    (acc, point) => ({ lng: acc.lng + point.lng, lat: acc.lat + point.lat }),
    { lng: 0, lat: 0 }
  );
  return {
    point: {
      lng: averaged.lng / points.length,
      lat: averaged.lat / points.length
    },
    area
  };
}

function coordinateGroupsForGeometry(geometry: { type?: string; coordinates?: unknown } | null | undefined) {
  if (!geometry || !Array.isArray(geometry.coordinates)) return [];
  if (geometry.type === "Point") return [geometry.coordinates];
  if (geometry.type === "Polygon") return geometry.coordinates;
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.flatMap((polygon) => (Array.isArray(polygon) ? polygon : []));
  }
  return [];
}

function buildMapVisualAnchors(geo: string, entry: RuntimeJurisdiction): LngLat[] {
  const anchors: LngLat[] = [];
  const entryCoords = normalizeLngLat(entry.coordinates);
  if (entryCoords) anchors.push(entryCoords);
  const snapshot = buildCountrySourceSnapshot();
  const geometryAnchors = snapshot.features
    .filter((feature) => String(feature.properties?.geo || "").trim().toUpperCase() === geo)
    .flatMap((feature) => coordinateGroupsForGeometry(feature.geometry)
      .map(geometryAnchorFromCoordinateGroup)
      .filter((anchor): anchor is { point: LngLat; area: number } => Boolean(anchor)))
    .sort((left, right) => right.area - left.area)
    .map((anchor) => anchor.point);
  for (const anchor of geometryAnchors) anchors.push(anchor);
  const seen = new Set<string>();
  return anchors.filter((anchor) => {
    if (!Number.isFinite(anchor.lng) || !Number.isFinite(anchor.lat)) return false;
    const key = `${anchor.lng.toFixed(4)},${anchor.lat.toFixed(4)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 12);
}

async function focusGeoAt(page: Page, coords: LngLat | null, geo: string, zoomOverride?: number) {
  if (!coords || !Number.isFinite(coords.lng) || !Number.isFinite(coords.lat)) return;
  await page.evaluate(({ lng, lat, zoom }) => {
    const host = window as typeof window & {
      __NEW_MAP_QA__?: {
        jumpTo?: (_lng: number, _lat: number, _zoom: number) => Promise<void>;
      };
    };
    return host.__NEW_MAP_QA__?.jumpTo?.(lng, lat, zoom) || null;
  }, {
    lng: coords.lng,
    lat: coords.lat,
    zoom: Number.isFinite(zoomOverride) ? Number(zoomOverride) : (geo.startsWith("US-") ? 5.8 : 4.2)
  }).catch(() => null);
  await page.waitForTimeout(400);
}

async function openPopupForGeo(page: Page, geo: string, mapEvidence: MapFeatureEvidence) {
  await setSelectedGeo(page, null);
  await setSelectedGeo(page, geo);
  const debugOpened = await page.locator('[data-testid="new-map-country-popup"]').waitFor({ state: "visible", timeout: 1_500 })
    .then(() => true)
    .catch(() => false);
  if (debugOpened) return;

  const clickX = Number(mapEvidence.canvas_left) + Number(mapEvidence.projected_x);
  const clickY = Number(mapEvidence.canvas_top) + Number(mapEvidence.projected_y);
  if (!Number.isFinite(clickX) || !Number.isFinite(clickY)) return;
  await page.mouse.click(clickX, clickY);
  await page.locator('[data-testid="new-map-country-popup"]').waitFor({ state: "visible", timeout: 2_500 }).catch(() => null);
}

async function readPopupSnapshot(page: Page): Promise<PopupSnapshot | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await page.evaluate(() => {
        const popup = document.querySelector('[data-testid="new-map-country-popup"]');
        if (!popup) return null;
        const sectionMap: Record<string, string[]> = {};
        for (const section of Array.from(popup.querySelectorAll("section"))) {
          const heading = String(section.querySelector("div")?.textContent || "").replace(/\s+/g, " ").trim();
          if (!heading) continue;
          sectionMap[heading] = Array.from(section.querySelectorAll("li"))
            .map((item) => String(item.textContent || "").replace(/\s+/g, " ").trim())
            .filter(Boolean);
        }
        const badgeNode = popup.querySelector('[data-category]') as HTMLElement | null;
        const statusItems = sectionMap.Status || [];
        return {
          title: String(popup.querySelector('[class*="viewportPopupTitle"]')?.textContent || "").replace(/\s+/g, " ").trim(),
          meta: String(popup.querySelector('[class*="viewportPopupMeta"]')?.textContent || "").replace(/\s+/g, " ").trim(),
          status_badge: String(badgeNode?.textContent || "").replace(/\s+/g, " ").trim(),
          status_badge_category: String(badgeNode?.getAttribute("data-category") || "").trim() || null,
          status_summary: String(statusItems[0] || "").trim(),
          raw_text: String((popup as HTMLElement).innerText || popup.textContent || "").replace(/\s+/g, " ").trim(),
          section_map: sectionMap,
          source_links: Array.from(popup.querySelectorAll("a"))
            .map((link) => ({
              href: String(link.getAttribute("href") || "").trim(),
              text: String(link.textContent || "").replace(/\s+/g, " ").trim()
            }))
            .filter((item) => item.href || item.text)
        };
      });
    } catch (error) {
      if (!/Execution context was destroyed|Cannot find context|Target closed/i.test(String(error)) || attempt === 2) {
        throw error;
      }
      await page.waitForTimeout(250);
    }
  }
  return null;
}

async function readPopupVisualEvidence(page: Page): Promise<PopupVisualEvidence | null> {
  return page.evaluate(() => {
    const popup = document.querySelector('[data-testid="new-map-country-popup"]') as HTMLElement | null;
    if (!popup) return null;
    const rect = popup.getBoundingClientRect();
    const badge = popup.querySelector("[data-category]") as HTMLElement | null;
    const textNodes = Array.from(popup.querySelectorAll("li, p, a, strong, div"));
    const lineEstimate = textNodes.reduce((total, node) => {
      if (!(node instanceof HTMLElement)) return total;
      const text = String(node.innerText || node.textContent || "").trim();
      if (!text) return total;
      return total + Math.max(1, node.getClientRects().length);
    }, 0);
    const badgeStyle = badge ? window.getComputedStyle(badge) : null;
    return {
      rendered: rect.width > 0 && rect.height > 0,
      panel_height: Math.round(rect.height),
      panel_width: Math.round(rect.width),
      text_block_count: Array.from(popup.querySelectorAll("li, p")).length,
      heading_count: Array.from(popup.querySelectorAll("section > div")).length,
      text_line_estimate: lineEstimate,
      badge_category: badge?.getAttribute("data-category")?.trim() || null,
      badge_background: badgeStyle?.backgroundColor || null,
      badge_text_color: badgeStyle?.color || null
    };
  });
}

async function readSeoSnapshot(page: Page): Promise<SeoSnapshot | null> {
  return page.evaluate(() => {
    const root =
      document.querySelector('[data-testid="new-map-seo-overlay"]') ||
      document.querySelector("article") ||
      document.querySelector("main");
    if (!root) return null;
    const sectionMap: Record<string, string[]> = {};
    for (const section of Array.from(root.querySelectorAll("section"))) {
      const heading = String(section.querySelector("h3")?.textContent || section.querySelector("h2")?.textContent || "")
        .replace(/\s+/g, " ")
        .trim();
      if (!heading) continue;
      sectionMap[heading] = Array.from(section.querySelectorAll("li, p"))
        .map((node) => String(node.textContent || "").replace(/\s+/g, " ").trim())
        .filter(Boolean);
    }
    const badgeNode = root.querySelector('[data-category]') as HTMLElement | null;
    return {
      title: String(document.querySelector("h1")?.textContent || "").replace(/\s+/g, " ").trim(),
      badge_text: String(badgeNode?.textContent || "").replace(/\s+/g, " ").trim(),
      badge_category: String(badgeNode?.getAttribute("data-category") || "").trim() || null,
      summary: String(root.querySelector("p")?.textContent || "").replace(/\s+/g, " ").trim(),
      intro: String(document.querySelector('[class*="intro"]')?.textContent || "").replace(/\s+/g, " ").trim(),
      raw_text: String(document.body?.innerText || "").replace(/\s+/g, " ").trim(),
      section_map: sectionMap,
      source_links: Array.from(document.querySelectorAll("a"))
        .map((link) => ({
          href: String(link.getAttribute("href") || "").trim(),
          text: String(link.textContent || "").replace(/\s+/g, " ").trim()
        }))
        .filter((item) => item.href || item.text)
    };
  });
}

async function readSeoVisualEvidence(page: Page): Promise<SeoVisualEvidence | null> {
  return page.evaluate(() => {
    const root = (
      document.querySelector('[data-testid="new-map-seo-overlay"]') ||
      document.querySelector("article") ||
      document.querySelector("main")
    ) as HTMLElement | null;
    if (!root) return null;
    const rect = root.getBoundingClientRect();
    const badge = root.querySelector("[data-category]") as HTMLElement | null;
    const textNodes = Array.from(root.querySelectorAll("li, p, h2, h3"));
    const lineEstimate = textNodes.reduce((total, node) => {
      if (!(node instanceof HTMLElement)) return total;
      const text = String(node.innerText || node.textContent || "").trim();
      if (!text) return total;
      return total + Math.max(1, node.getClientRects().length);
    }, 0);
    const badgeStyle = badge ? window.getComputedStyle(badge) : null;
    return {
      rendered: rect.width > 0 && rect.height > 0,
      panel_height: Math.round(root.scrollHeight || rect.height),
      panel_width: Math.round(rect.width),
      text_block_count: Array.from(root.querySelectorAll("li, p")).length,
      heading_count: Array.from(root.querySelectorAll("h2, h3")).length,
      text_line_estimate: lineEstimate,
      badge_category: badge?.getAttribute("data-category")?.trim() || null,
      badge_background: badgeStyle?.backgroundColor || null,
      badge_text_color: badgeStyle?.color || null
    };
  });
}

async function resolveSeoEvidenceSelector(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    if (document.querySelector('[data-testid="new-map-seo-overlay"]')) return '[data-testid="new-map-seo-overlay"]';
    if (document.querySelector("article")) return "article";
    if (document.querySelector("main")) return "main";
    return null;
  });
}

async function readWikiSnapshot(page: Page): Promise<WikiSnapshot> {
  const html = await page.content();
  const finalUrl = page.url();
  const snapshot = await page.evaluate(() => {
    const sectionMap: Record<string, string[]> = {};
    const headingNodes = Array.from(document.querySelectorAll("h2, h3"));
    for (const headingNode of headingNodes) {
      const heading = String(headingNode.textContent?.replace(/\[edit\]/gi, "") || "").replace(/\s+/g, " ").trim();
      if (!heading) continue;
      const sectionRoot = headingNode.closest(".mw-heading") || headingNode;
      const items: string[] = [];
      let cursor = sectionRoot.nextElementSibling;
      while (cursor) {
        if (cursor.matches(".mw-heading, h2, h3")) break;
        const nodes = [
          ...(cursor.matches("p, li") ? [cursor] : []),
          ...Array.from(cursor.querySelectorAll("p, li"))
        ];
        for (const node of nodes) {
          const text = String(node.textContent || "").replace(/\s+/g, " ").trim();
          if (text) items.push(text);
        }
        cursor = cursor.nextElementSibling;
      }
      sectionMap[heading] = items;
    }
    return {
      title: String(document.querySelector("#firstHeading")?.textContent || "").replace(/\s+/g, " ").trim(),
      raw_text: String(document.body?.innerText || "").replace(/\s+/g, " ").trim(),
      lead_paragraphs: Array.from(document.querySelectorAll("#mw-content-text > .mw-parser-output > p"))
        .map((paragraph) => String(paragraph.textContent || "").replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .slice(0, 4),
      section_map: sectionMap
    };
  });
  return {
    ...snapshot,
    final_url: finalUrl,
    html
  };
}

async function readWikiVisualEvidence(page: Page): Promise<WikiVisualEvidence | null> {
  return page.evaluate(() => {
    const root =
      (document.querySelector("#mw-content-text .mw-parser-output") as HTMLElement | null) ||
      (document.querySelector("#mw-content-text") as HTMLElement | null);
    if (!root) return null;
    const rect = root.getBoundingClientRect();
    const textNodes = Array.from(root.querySelectorAll("p, li, h2, h3"));
    const lineEstimate = textNodes.reduce((total, node) => {
      if (!(node instanceof HTMLElement)) return total;
      const text = String(node.innerText || node.textContent || "").trim();
      if (!text) return total;
      return total + Math.max(1, node.getClientRects().length);
    }, 0);
    return {
      rendered: rect.width > 0 && rect.height > 0,
      content_height: Math.round(root.scrollHeight || rect.height),
      content_width: Math.round(rect.width),
      paragraph_count: Array.from(root.querySelectorAll("p")).length,
      heading_count: Array.from(root.querySelectorAll("h2, h3")).length,
      text_line_estimate: lineEstimate
    };
  });
}

async function captureFullPageScreenshot(page: Page, screenshotPath: string) {
  try {
    await page.screenshot({
      path: screenshotPath,
      fullPage: true,
      timeout: 120_000,
      animations: "disabled",
      scale: "css"
    });
    return;
  } catch (error) {
    await captureTiledFullPageScreenshot(page, screenshotPath, error);
  }
}

async function captureTiledFullPageScreenshot(page: Page, screenshotPath: string, originalError: unknown) {
  const sharp = (await import("sharp")).default;
  const viewport = page.viewportSize() || { width: 1440, height: 900 };
  const dimensions = await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    return {
      width: Math.ceil(Math.max(
        doc?.scrollWidth || 0,
        body?.scrollWidth || 0,
        window.innerWidth || 0
      )),
      height: Math.ceil(Math.max(
        doc?.scrollHeight || 0,
        body?.scrollHeight || 0,
        window.innerHeight || 0
      ))
    };
  });
  const width = Math.max(1, viewport.width || Math.min(dimensions.width, 1440));
  const height = Math.max(1, dimensions.height);
  const tileHeight = Math.max(320, Math.min(viewport.height || 900, 1200));
  const composites: Array<{ input: Buffer; left: number; top: number }> = [];
  let previousTop = -1;

  for (let top = 0; top < height; top += tileHeight) {
    const actualTop = await page.evaluate((scrollTop) => {
      window.scrollTo(0, scrollTop);
      return Math.round(window.scrollY || document.documentElement.scrollTop || 0);
    }, top);
    if (actualTop <= previousTop) break;
    previousTop = actualTop;
    await page.waitForTimeout(35);
    let input = await page.screenshot({
      timeout: 60_000,
      animations: "disabled",
      scale: "css"
    });
    const metadata = await sharp(input).metadata();
    const inputWidth = Math.max(1, Math.min(metadata.width || width, width));
    const inputHeight = Math.max(1, metadata.height || tileHeight);
    const remainingHeight = Math.max(1, height - actualTop);
    if (inputHeight > remainingHeight || inputWidth !== metadata.width) {
      input = await sharp(input)
        .extract({ left: 0, top: 0, width: inputWidth, height: Math.min(inputHeight, remainingHeight) })
        .png()
        .toBuffer();
    }
    composites.push({ input, left: 0, top: actualTop });
    if (actualTop + inputHeight >= height) break;
  }

  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    }
  })
    .composite(composites)
    .png()
    .toFile(screenshotPath);
  fs.writeFileSync(
    `${screenshotPath}.capture-fallback.txt`,
    `FULLPAGE_SCREENSHOT_FALLBACK=tiled\noriginal_error=${String(originalError)}\n`
  );
}

async function captureExpandedElementScreenshot(page: Page, selector: string, screenshotPath: string) {
  const locator = page.locator(selector);
  await locator.waitFor({ state: "visible", timeout: 20_000 });
  const previous = await page.evaluate((targetSelector) => {
    const node = document.querySelector(targetSelector) as HTMLElement | null;
    if (!node) return null;
    const previousStyle = {
      height: node.style.height,
      maxHeight: node.style.maxHeight,
      overflowY: node.style.overflowY
    };
    node.style.height = `${Math.ceil(node.scrollHeight)}px`;
    node.style.maxHeight = "none";
    node.style.overflowY = "visible";
    return previousStyle;
  }, selector);
  await page.waitForTimeout(80);
  try {
    await locator.screenshot({ path: screenshotPath, timeout: 60_000 });
  } finally {
    if (previous) {
      await page.evaluate(({ targetSelector, previousStyle }) => {
        const node = document.querySelector(targetSelector) as HTMLElement | null;
        if (!node) return;
        node.style.height = previousStyle.height;
        node.style.maxHeight = previousStyle.maxHeight;
        node.style.overflowY = previousStyle.overflowY;
      }, { targetSelector: selector, previousStyle: previous });
    }
  }
  await page.waitForTimeout(40);
}

async function captureCleanMapScreenshot(page: Page, screenshotPath: string) {
  const hiddenNodes = await page.evaluate(() => {
    const nodes = new Set<HTMLElement>();
    for (const selector of [
      ".maplibregl-popup",
      ".maplibregl-control-container",
      "[data-testid='new-map-country-popup']",
      "[data-testid='new-map-seo-overlay']",
      "[data-testid='new-map-ai-dock']",
      "[data-testid='new-map-ai-answer']"
    ]) {
      document.querySelectorAll(selector).forEach((node) => nodes.add(node as HTMLElement));
    }
    const runtimeStamp = document.querySelector("[data-testid='visible-runtime-stamp']") as HTMLElement | null;
    const debugOverlay = runtimeStamp?.parentElement?.parentElement as HTMLElement | null;
    if (debugOverlay) nodes.add(debugOverlay);
    return Array.from(nodes).map((node, index) => {
      const key = `geo-sync-hidden-${index}`;
      node.setAttribute("data-geo-sync-hidden", key);
      const previous = {
        key,
        visibility: node.style.visibility,
        pointerEvents: node.style.pointerEvents
      };
      node.style.visibility = "hidden";
      node.style.pointerEvents = "none";
      return previous;
    });
  });
  try {
    await page.locator('[data-testid="new-map-surface"]').screenshot({ path: screenshotPath });
  } finally {
    await page.evaluate((items) => {
      for (const item of items) {
        const node = document.querySelector(`[data-geo-sync-hidden="${item.key}"]`) as HTMLElement | null;
        if (!node) continue;
        node.style.visibility = item.visibility;
        node.style.pointerEvents = item.pointerEvents;
        node.removeAttribute("data-geo-sync-hidden");
      }
    }, hiddenNodes);
  }
}

async function readMapFeatureEvidence(
  page: Page,
  geo: string,
  entry: RuntimeJurisdiction,
  preferredCoordinates?: LngLat
): Promise<MapFeatureEvidence> {
  const acceptedGeos = stableUnique([geo, entry?.geo, entry?.iso2, entry?.code]
    .map((item) => String(item || "").trim().toUpperCase())
    .filter(Boolean));
  const layerIds = geo.startsWith("US-")
    ? [US_STATES_FILL_LAYER_ID]
    : [LEGAL_TERRITORY_LABEL_LAYER_ID, LEGAL_TERRITORY_HITBOX_LAYER_ID, LEGAL_POINT_LAYER_ID, LEGAL_FILL_LAYER_ID];
  return page.evaluate(({ targetGeo, acceptedGeos, sourceId, layerIds, preferred }) => {
    const host = window as typeof window & {
      __NEW_MAP_DEBUG__?: {
        map?: {
          getCanvas: () => HTMLCanvasElement;
          project: (_lngLat: { lng: number; lat: number }) => { x: number; y: number };
          queryRenderedFeatures: (_point: [number, number], _options?: { layers?: string[] }) => Array<{
            id?: string | number;
            source?: string;
            layer?: { id?: string };
            properties?: Record<string, unknown>;
          }>;
        } | null;
      };
    };
    const acceptedGeoSet = new Set([targetGeo, ...acceptedGeos].filter(Boolean));
    const map = host.__NEW_MAP_DEBUG__?.map;
    const fallbackLayerId = layerIds[0] || null;
    if (!map) {
      return {
        found: false,
        layer_id: fallbackLayerId,
        source_id: sourceId,
        geo: null,
        display_name: null,
        map_category: null,
        status: null,
        color: null,
        base_color: null,
        feature_id: null,
        projected_x: null,
        projected_y: null,
        canvas_left: null,
        canvas_top: null,
        screenshot_sample_hex: null,
        screenshot_sample_rgba: null,
        screenshot_sample_distance: null
      };
    }
    const rect = map.getCanvas().getBoundingClientRect();
    const candidatePoints: Array<{ x: number; y: number }> = [];
    if (preferred) {
      const projected = map.project({ lng: preferred.lng, lat: preferred.lat });
      const localScans = [
        { radius: 0, step: 1 },
        { radius: 8, step: 2 },
        { radius: 24, step: 3 },
        { radius: 56, step: 4 },
        { radius: 120, step: 8 }
      ];
      for (const scan of localScans) {
        if (scan.radius === 0) {
          candidatePoints.push({ x: projected.x, y: projected.y });
          continue;
        }
        const startX = Math.max(20, projected.x - scan.radius);
        const endX = Math.min(rect.width - 20, projected.x + scan.radius);
        const startY = Math.max(20, projected.y - scan.radius);
        const endY = Math.min(rect.height - 20, projected.y + scan.radius);
        for (let y = startY; y <= endY; y += scan.step) {
          for (let x = startX; x <= endX; x += scan.step) {
            candidatePoints.push({ x, y });
          }
        }
      }
    }

    const windows: Array<{ startX: number; endX: number; startY: number; endY: number; step: number }> = [
      {
        startX: 40,
        endX: rect.width - 40,
        startY: 40,
        endY: rect.height - 40,
        step: 24
      }
    ];
    for (const windowBox of windows) {
      for (let y = windowBox.startY; y < windowBox.endY; y += windowBox.step) {
        for (let x = windowBox.startX; x < windowBox.endX; x += windowBox.step) {
          candidatePoints.push({ x, y });
        }
      }
    }
    for (const point of candidatePoints) {
      const features = map.queryRenderedFeatures([point.x, point.y], { layers: layerIds });
      for (const feature of features) {
        const props = (feature.properties || {}) as Record<string, unknown>;
        let parsedResult: Record<string, unknown> | null = null;
        if (typeof props.result === "string") {
          try {
            parsedResult = JSON.parse(String(props.result)) as Record<string, unknown>;
          } catch {
            parsedResult = null;
          }
        }
        const resultProps =
          props.result && typeof props.result === "object"
            ? (props.result as Record<string, unknown>)
            : parsedResult;
        const candidateGeo = String(
          props.geo || props.iso2 || props.iso_a2 || props.ISO_A2 || feature.id || ""
        ).trim().toUpperCase();
        if (!acceptedGeoSet.has(candidateGeo)) continue;
        return {
          found: true,
          layer_id: String(feature.layer?.id || fallbackLayerId || ""),
          source_id: String(feature.source || sourceId || ""),
          geo: candidateGeo,
          display_name: String(props.displayName || props.name_en || props.name || candidateGeo || "").trim() || null,
          map_category: String(props.mapCategory || "").trim() || null,
          status: String(props.status || resultProps?.status || "").trim() || null,
          color: String(resultProps?.color || "").trim() || null,
          base_color: String(props.baseColor || resultProps?.color || "").trim() || null,
          feature_id: String(feature.id || "").trim() || null,
          projected_x: point.x,
          projected_y: point.y,
          canvas_left: Math.round(rect.left),
          canvas_top: Math.round(rect.top),
          screenshot_sample_hex: null,
          screenshot_sample_rgba: null,
          screenshot_sample_distance: null
        };
      }
    }
    return {
      found: false,
      layer_id: fallbackLayerId,
      source_id: sourceId,
      geo: null,
      display_name: null,
      map_category: null,
      status: null,
      color: null,
      base_color: null,
      feature_id: null,
      projected_x: null,
      projected_y: null,
      canvas_left: null,
      canvas_top: null,
      screenshot_sample_hex: null,
      screenshot_sample_rgba: null,
      screenshot_sample_distance: null
    };
  }, {
    targetGeo: geo,
    acceptedGeos,
    sourceId: geo.startsWith("US-") ? US_STATES_SOURCE_ID : LEGAL_COUNTRIES_SOURCE_ID,
    layerIds,
    preferred: preferredCoordinates || normalizeLngLat(entry.coordinates)
  });
}

function renderCsv(rows: GeoSyncRow[]) {
  const header = [
    "code",
    "name",
    "type",
    "parent",
    "canonical_key",
    "wiki_page",
    "source_kind",
    "coverage_class",
    "low_coverage_reason",
    "resolver_confidence",
    "model_rule_ids",
    "applied_rules",
    "parser_version",
    "generator_run_id",
    "canonical_record_hash",
    "artifact_dir",
    "map_screenshot",
    "popup_screenshot",
    "project_popup_screenshot",
    "seo_screenshot",
    "project_seo_panel_screenshot",
    "wiki_screenshot",
    "wiki_fullpage_screenshot",
    "geo_analysis_json",
    "map_color_bucket",
    "map_color_evidence",
    "map_color_visual_verdict",
    "map_vs_popup_visual_verdict",
    "map_layer_id",
    "map_source_id",
    "popup_badge_bucket",
    "popup_status_label",
    "popup_visual_verdict",
    "popup_vs_seo_visual_verdict",
    "popup_vs_wiki_visual_verdict",
    "seo_badge_bucket",
    "seo_status_label",
    "seo_visual_verdict",
    "map_vs_seo_visual_verdict",
    "seo_vs_wiki_visual_verdict",
    "color_vs_wiki_visual_verdict",
    "normalized_color_bucket",
    "normalized_status",
    "popup_vs_seo_visual_density",
    "wiki_vs_popup_visual_gap",
    "before_sections",
    "after_sections",
    "popup_sections",
    "seo_sections",
    "wiki_sections",
    "missing_sections",
    "misplaced_content",
    "repeated_text",
    "source_trace_errors",
    "popup_missing",
    "seo_missing",
    "wrong_geo_text",
    "duplicate_with_geo",
    "raw_urls",
    "source_errors",
    "status_color_conflicts",
    "color_mismatch_kind",
    "manual_override_reason",
    "changed_files",
    "notes"
  ];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push([
      row.code,
      row.name,
      row.type,
      row.parent || "",
      row.canonical_key,
      row.wiki_page || "",
      row.source_kind,
      row.coverage_class,
      row.low_coverage_reason || "",
      row.resolver_confidence,
      row.model_rule_ids.join(" | "),
      row.applied_rules.join(" | "),
      row.parser_version,
      row.generator_run_id,
      row.canonical_record_hash || "",
      row.artifact_dir || "",
      row.map_screenshot || "",
      row.popup_screenshot || "",
      row.project_popup_screenshot || "",
      row.seo_screenshot || "",
      row.project_seo_panel_screenshot || "",
      row.wiki_screenshot || "",
      row.wiki_fullpage_screenshot || "",
      row.geo_analysis_json || "",
      row.map_color_bucket || "",
      row.map_color_evidence || "",
      row.notes.find((item) => item.startsWith("MAP_COLOR_VISUAL_VERDICT="))?.replace(/^MAP_COLOR_VISUAL_VERDICT=/, "") || "",
      row.notes.find((item) => item.startsWith("MAP_VS_POPUP_VISUAL_VERDICT="))?.replace(/^MAP_VS_POPUP_VISUAL_VERDICT=/, "") || "",
      row.map_layer_id || "",
      row.map_source_id || "",
      row.popup_badge_bucket || "",
      row.popup_status_label || "",
      row.notes.find((item) => item.startsWith("POPUP_VISUAL_VERDICT="))?.replace(/^POPUP_VISUAL_VERDICT=/, "") || "",
      row.notes.find((item) => item.startsWith("POPUP_VS_SEO_VISUAL_VERDICT="))?.replace(/^POPUP_VS_SEO_VISUAL_VERDICT=/, "") || "",
      row.notes.find((item) => item.startsWith("POPUP_VS_WIKI_VISUAL_VERDICT="))?.replace(/^POPUP_VS_WIKI_VISUAL_VERDICT=/, "") || "",
      row.seo_badge_bucket || "",
      row.seo_status_label || "",
      row.notes.find((item) => item.startsWith("SEO_VISUAL_VERDICT="))?.replace(/^SEO_VISUAL_VERDICT=/, "") || "",
      row.notes.find((item) => item.startsWith("MAP_VS_SEO_VISUAL_VERDICT="))?.replace(/^MAP_VS_SEO_VISUAL_VERDICT=/, "") || "",
      row.notes.find((item) => item.startsWith("SEO_VS_WIKI_VISUAL_VERDICT="))?.replace(/^SEO_VS_WIKI_VISUAL_VERDICT=/, "") || "",
      row.notes.find((item) => item.startsWith("COLOR_VS_WIKI_VISUAL_VERDICT="))?.replace(/^COLOR_VS_WIKI_VISUAL_VERDICT=/, "") || "",
      row.normalized_color_bucket || "",
      row.normalized_status || "",
      row.notes.find((item) => item.startsWith("POPUP_VS_SEO_VISUAL_DENSITY="))?.replace(/^POPUP_VS_SEO_VISUAL_DENSITY=/, "") || "",
      row.notes.find((item) => item.startsWith("WIKI_VS_POPUP_VISUAL_GAP="))?.replace(/^WIKI_VS_POPUP_VISUAL_GAP=/, "") || "",
      row.before_sections ?? "",
      row.after_sections ?? "",
      row.popup_sections.join(" | "),
      row.seo_sections.join(" | "),
      row.wiki_sections.join(" | "),
      row.missing_sections.join(" | "),
      row.misplaced_content.join(" | "),
      row.repeated_text.join(" | "),
      row.source_trace_errors.join(" | "),
      row.popup_missing.join(" | "),
      row.seo_missing.join(" | "),
      row.wrong_geo_text.join(" | "),
      row.duplicate_with_geo.join(" | "),
      row.raw_urls.join(" | "),
      row.source_errors.join(" | "),
      row.status_color_conflicts.join(" | "),
      row.color_mismatch_kind.join(" | "),
      row.manual_override_reason || "",
      row.changed_files.join(" | "),
      row.notes.join(" | ")
    ].map(csvCell).join(","));
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
  const bypassHeaders = buildVercelBypassHeaders(process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "", "true");
  const cleanedBypassHeaders = Object.entries(bypassHeaders).reduce<Record<string, string>>((acc, [key, value]) => {
    if (typeof value === "string" && value) acc[key] = value;
    return acc;
  }, {});
  fs.mkdirSync(GEO_SYNC_DIR, { recursive: true });
  fs.writeFileSync(LIVE_FAILURES_PATH, "");
  fs.writeFileSync(LIVE_REVIEW_PATH, "");
  const previousSectionCounts = readPreviousSectionCounts();
  const liveStartedAt = Date.now();
  const failFast = process.env.GEO_SYNC_AUDIT_FAIL_FAST === "1";
  const liveFailures: ReturnType<typeof evaluateLiveRow>[] = [];

  const browser = await chromium.launch({ headless: process.env.PLAYWRIGHT_HEADFUL === "1" ? false : true });
  const context = await browser.newContext({
    ...(Object.keys(cleanedBypassHeaders).length > 0 ? { extraHTTPHeaders: cleanedBypassHeaders } : {})
  });
  const mapPage = await context.newPage();
  const seoPage = await context.newPage();
  const wikiPage = await context.newPage();

  try {
    await mapPage.goto(`${baseUrl}${NEW_MAP_ROUTE}`, { waitUntil: "domcontentloaded" });
    await waitForMapReady(mapPage);

    const runtimeCardIndex = await loadRuntimeCardIndex(mapPage) as Record<string, RuntimeJurisdiction>;
    const requestedGeos = String(process.env.GEO_SYNC_AUDIT_GEOS || "")
      .split(",")
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean);
    const requestedOffset = Number(process.env.GEO_SYNC_AUDIT_OFFSET || 0);
    const requestedLimitRaw = Number(process.env.GEO_SYNC_AUDIT_LIMIT || 0);
    const requestedSet = new Set(requestedGeos);
    const { total, geos } = buildAuditGeoList(runtimeCardIndex, {
      requested: requestedSet,
      offset: requestedOffset,
      limit: requestedLimitRaw
    });
    const isFullRun = requestedGeos.length === 0 && requestedOffset === 0 && requestedLimitRaw === 0 && geos.length === total;
    const pageIndexByGeo = getCountryPageIndexByGeoCode();
    const rows: GeoSyncRow[] = [];

    for (const [index, geo] of geos.entries()) {
      const entry = runtimeCardIndex[geo] || buildCardIndexSnapshot({ fresh: true })[geo];
      const pageData = entry?.code ? getCountryPageData(entry.code) : pageIndexByGeo.get(geo) || null;
      const canonicalEntry = pageData ? deriveCountryCardEntryFromCountryPageData(pageData) : null;
      const geoDir = path.join(GEO_SYNC_DIR, geo);
      fs.mkdirSync(geoDir, { recursive: true });

      const mapVisualAnchors = buildMapVisualAnchors(geo, entry);
      await focusGeoAt(mapPage, mapVisualAnchors[0] || null, geo, isSyntheticGeo(geo) ? 7.8 : undefined);
      await setSelectedGeo(mapPage, null);
      await setSelectedGeo(mapPage, geo);

      let mapEvidence = await readMapFeatureEvidence(mapPage, geo, entry, mapVisualAnchors[0] || undefined);
      if (!mapEvidence.found && mapVisualAnchors.length > 0) {
        const zooms = geo.startsWith("US-") ? [6.4] : [7.8, 10.5, 12.5, 13.5];
        for (const anchor of mapVisualAnchors) {
          for (const zoom of zooms) {
            await focusGeoAt(mapPage, anchor, geo, zoom);
            await setSelectedGeo(mapPage, geo);
            mapEvidence = await readMapFeatureEvidence(mapPage, geo, entry, anchor);
            if (mapEvidence.found) {
              break;
            }
          }
          if (mapEvidence.found) break;
        }
      }
      const mapScreenshotPath = path.join(geoDir, "project-map.png");
      await captureCleanMapScreenshot(mapPage, mapScreenshotPath);
      const sampledMapPixel = await sampleScreenshotPixel(
        mapScreenshotPath,
        mapEvidence.projected_x,
        mapEvidence.projected_y,
        mapEvidence.base_color || mapEvidence.color || entry?.result?.color || null
      );
      mapEvidence.screenshot_sample_rgba = sampledMapPixel?.rgba || null;
      mapEvidence.screenshot_sample_hex = rgbaToHex(sampledMapPixel?.rgba || null);
      mapEvidence.screenshot_sample_distance = Number.isFinite(sampledMapPixel?.distance) ? sampledMapPixel?.distance || 0 : null;
      const mapScreenshotStats = await computeScreenshotStats(mapScreenshotPath);
      fs.writeFileSync(path.join(geoDir, "project-map.json"), `${JSON.stringify(mapEvidence, null, 2)}\n`);

      await openPopupForGeo(mapPage, geo, mapEvidence);
      const popupSnapshot = await readPopupSnapshot(mapPage);
      const popupScreenshotPath = popupSnapshot ? path.join(geoDir, "project-popup.png") : null;
      if (popupSnapshot && popupScreenshotPath) {
        await captureExpandedElementScreenshot(mapPage, '[data-testid="new-map-country-popup"]', popupScreenshotPath);
        fs.writeFileSync(path.join(geoDir, "project-popup.txt"), `${popupSnapshot.raw_text}\n`);
        fs.writeFileSync(path.join(geoDir, "project-popup.json"), `${JSON.stringify(popupSnapshot, null, 2)}\n`);
      }
      const popupVisual = popupSnapshot ? await readPopupVisualEvidence(mapPage) : null;
      const popupScreenshotStats = popupScreenshotPath ? await computeScreenshotStats(popupScreenshotPath) : null;

      let seoSnapshot: SeoSnapshot | null = null;
      let seoVisual: SeoVisualEvidence | null = null;
      let seoScreenshotPath: string | null = null;
      let seoPanelScreenshotPath: string | null = null;
      const seoHref = pageData?.code
        ? `/c/${pageData.code}`
        : String(entry?.pageHref || "").trim() || `/new-map?geo=${encodeURIComponent(geo)}`;
      if (seoHref) {
        try {
          await seoPage.goto(`${baseUrl}${seoHref}`, { waitUntil: "domcontentloaded" });
          const isMapSeoRoute = /^\/new-map\b/i.test(seoHref);
          if (isMapSeoRoute) {
            await waitForMapReady(seoPage).catch((error) => {
              fs.writeFileSync(path.join(geoDir, "project-seo-map-ready.capture-error.txt"), `${String(error)}\n`);
            });
            await setSelectedGeo(seoPage, geo);
            await seoPage.waitForSelector('[data-testid="new-map-seo-overlay"]', { timeout: 25_000 });
          } else {
            await seoPage.waitForSelector('[data-testid="new-map-seo-overlay"], article, main', { timeout: 20_000 });
          }
          const seoEvidenceSelector = await resolveSeoEvidenceSelector(seoPage);
          seoSnapshot = await readSeoSnapshot(seoPage);
          if (!seoSnapshot || !seoEvidenceSelector) throw new Error("SEO_EVIDENCE_NOT_RENDERED");
          seoScreenshotPath = path.join(geoDir, "project-seo-fullpage.png");
          seoPanelScreenshotPath = path.join(geoDir, "project-seo-panel.png");
          fs.writeFileSync(path.join(geoDir, "project-seo-fullpage.txt"), `${seoSnapshot?.raw_text || ""}\n`);
          fs.writeFileSync(path.join(geoDir, "project-seo-fullpage.json"), `${JSON.stringify(seoSnapshot, null, 2)}\n`);
          seoVisual = await readSeoVisualEvidence(seoPage);
          try {
            await captureFullPageScreenshot(seoPage, seoScreenshotPath);
          } catch (error) {
            fs.writeFileSync(path.join(geoDir, "project-seo-fullpage.capture-error.txt"), `${String(error)}\n`);
            seoScreenshotPath = null;
          }
          try {
            await captureExpandedElementScreenshot(seoPage, seoEvidenceSelector, seoPanelScreenshotPath);
          } catch (error) {
            fs.writeFileSync(path.join(geoDir, "project-seo-panel.capture-error.txt"), `${String(error)}\n`);
            seoPanelScreenshotPath = null;
          }
        } catch (error) {
          fs.writeFileSync(path.join(geoDir, "project-seo.capture-error.txt"), `${String(error)}\n`);
          seoSnapshot = null;
          seoVisual = null;
          seoScreenshotPath = null;
          seoPanelScreenshotPath = null;
        }
      }
      const seoScreenshotStats = seoPanelScreenshotPath ? await computeScreenshotStats(seoPanelScreenshotPath) : null;

      const wikiUrl = deriveWikiAuditUrl(entry);
      let wikiSnapshot: WikiSnapshot | null = null;
      let wikiVisual: WikiVisualEvidence | null = null;
      let wikiScreenshotPath: string | null = null;
      if (wikiUrl) {
        await wikiPage.goto(wikiUrl, { waitUntil: "domcontentloaded" });
        await wikiPage.waitForTimeout(250);
        wikiSnapshot = await readWikiSnapshot(wikiPage);
        wikiVisual = await readWikiVisualEvidence(wikiPage);
        wikiScreenshotPath = path.join(geoDir, "wiki-fullpage.png");
        await captureFullPageScreenshot(wikiPage, wikiScreenshotPath);
        fs.writeFileSync(path.join(geoDir, "wiki-fullpage.txt"), `${wikiSnapshot.raw_text}\n`);
        fs.writeFileSync(path.join(geoDir, "wiki-fullpage.html"), wikiSnapshot.html);
        fs.writeFileSync(path.join(geoDir, "wiki-fullpage.json"), `${JSON.stringify({
          title: wikiSnapshot.title,
          final_url: wikiSnapshot.final_url,
          lead_paragraphs: wikiSnapshot.lead_paragraphs,
          section_map: wikiSnapshot.section_map
        }, null, 2)}\n`);
      }
      const wikiScreenshotStats = wikiScreenshotPath ? await computeScreenshotStats(wikiScreenshotPath) : null;

      const popupSections = stableUnique(
        Object.keys(popupSnapshot?.section_map || {})
          .map((heading) => popupSemanticHeading(heading))
          .filter((item): item is NonNullable<typeof item> => item !== null)
      );
      const seoSections = stableUnique(Object.keys(seoSnapshot?.section_map || {}).map((heading) => heading.replace(/\s+/g, " ").trim()).filter(Boolean));
      const wikiSections = wikiSemanticSectionsFromSnapshot(wikiSnapshot?.section_map || {}, wikiSnapshot?.lead_paragraphs || []);
      const sourceKind = deriveSourceKind(entry, wikiUrl);
      const coverageClass = classifyCoverage({
        geo,
        wikiUrl,
        hasComparableCannabisProfile: Boolean(String(entry?.cannabisProfile?.sourceUrl || "").trim()),
        sourceKind,
        wikiSnapshot,
        wikiSectionsFound: wikiSections
      });

      const popupComparableItems = canonicalEntry ? collectPopupComparableText(canonicalEntry) : [];
      const seoTextNormalized = normalizeText(seoSnapshot?.raw_text || "");
      const seoMissing = popupComparableItems.filter((item) => !seoTextNormalized.includes(normalizeText(item)));
      const popupChars = String(popupSnapshot?.raw_text || "").length;
      const seoChars = String(seoSnapshot?.raw_text || "").length;
      const popupBadgeBucket = popupSnapshot?.status_badge_category || entry?.mapCategory || null;
      const seoBadgeBucket = seoSnapshot?.badge_category || (pageData ? deriveMapCategoryFromCountryPageData(pageData) : null);
      const normalizedColorBucket = pageData ? deriveMapCategoryFromCountryPageData(pageData) : entry?.mapCategory || null;
      const normalizedStatus = pageData ? deriveResultStatusFromCountryPageData(pageData) : String(entry?.result?.status || "").trim() || null;
      const mapColorBucket = mapEvidence.map_category || entry?.mapCategory || null;

      const colorMismatchKind = stableUnique([
        mapColorBucket && popupBadgeBucket && mapColorBucket !== popupBadgeBucket ? "map_vs_popup" : "",
        popupBadgeBucket && seoBadgeBucket && popupBadgeBucket !== seoBadgeBucket ? "popup_vs_seo" : "",
        mapColorBucket && normalizedColorBucket && mapColorBucket !== normalizedColorBucket ? "map_vs_model" : "",
        seoBadgeBucket && normalizedColorBucket && seoBadgeBucket !== normalizedColorBucket ? "seo_vs_model" : ""
      ].filter(Boolean));
      const semanticStatusConflicts = deriveSemanticStatusConflicts({
        wikiText: wikiSnapshot?.raw_text || "",
        popupText: popupSnapshot?.raw_text || "",
        seoText: seoSnapshot?.raw_text || "",
        mapColorBucket,
        popupBadgeBucket,
        seoBadgeBucket,
        normalizedColorBucket,
        normalizedStatus
      });

      const sourceErrors = stableUnique([
        popupSnapshot && !wikiUrl ? "SOURCE_PAGE_MISSING" : "",
        popupSnapshot && sourceKind === "no_wiki_source" ? "SOURCE_KIND_MISSING" : "",
        wikiUrl && !wikiSnapshot ? "WIKI_CAPTURE_MISSING" : "",
        seoHref && !seoSnapshot ? "SEO_CAPTURE_MISSING" : ""
      ].filter(Boolean));

      const statusColorConflicts = stableUnique([
        colorMismatchKind.length > 0 ? "status_color_conflict" : "",
        ...semanticStatusConflicts,
        popupSnapshot && popupComparableItems.length > 0 && seoChars <= popupChars ? "seo_not_richer_than_popup" : ""
      ].filter(Boolean));

      const parent = pageData?.parent_country?.code || entry?.parentCountry?.code || null;
      const canonicalKey = `${geo}|${entry?.type || (geo.startsWith("US-") ? "state" : "country")}|${parent || "-"}|${isSyntheticGeo(geo) ? "synthetic" : (entry?.type || "country")}`;
      const wikiTitle = decodeWikiTitleFromUrl(wikiUrl);
      const canonicalTitle = String(pageData?.sources.legal || entry?.detailsHref || "").trim();
      const resolverScore: ResolverScore = {
        title_match: Boolean(wikiTitle && canonicalTitle && decodeWikiTitleFromUrl(canonicalTitle) === wikiTitle),
        redirect_match: Boolean(wikiSnapshot?.final_url && normalizeWikiComparableUrl(wikiSnapshot.final_url) !== normalizeWikiComparableUrl(wikiUrl)),
        parent_match: Boolean(parent && (wikiUrl.includes(parent.toLowerCase()) || canonicalKey.toLowerCase().includes(parent.toLowerCase()))),
        collision_risk: /\(.+\)$/.test(wikiTitle) ? "low" : (/\bGeorgia\b/i.test(String(entry?.displayName || "")) ? "high" : "medium"),
        confidence: String(entry?.cannabisProfile?.sourceUrl || "").trim()
          ? isSpecificCannabisWikiUrl(entry?.cannabisProfile?.sourceUrl) ? "high" : "medium"
          : wikiUrl ? "low" : "low"
      };

      const rawUrls = stableUnique([
        ...(popupSnapshot?.raw_text.match(/\bhttps?:\/\/\S+/gi) || []),
        ...(seoSnapshot?.raw_text.match(/\bhttps?:\/\/\S+/gi) || [])
      ]);
      const popupMissing = wikiSections.filter((item) => !popupSections.includes(item));
      const beforeSections = previousSectionCounts.get(geo) ?? null;
      const afterSections = popupSections.length;
      const lowCoverageReason = deriveLowCoverageReason({
        coverageClass,
        sourceKind,
        popupSections,
        wikiSections,
        popupMissing
      });
      const canonicalRecordHash = pageData?.hashes?.model_hash || buildCanonicalRecordHash({
        canonical_key: canonicalKey,
        code: pageData?.code || entry?.code || geo.toLowerCase(),
        display_name: entry?.displayName || pageData?.name || geo,
        source_kind: sourceKind,
        wiki_page: wikiUrl || null,
        normalized_color_bucket: normalizedColorBucket,
        normalized_status: pageData ? deriveResultStatusFromCountryPageData(pageData) : entry?.result?.status || null,
        map_category: entry?.mapCategory || null,
        parent,
        cannabis_profile: entry?.cannabisProfile || null,
        sources: entry?.sources || [],
        low_coverage_reason: lowCoverageReason
      });
      const sourceTraceErrors = stableUnique([
        ...sourceErrors,
        popupSections.length > 0 && !wikiUrl ? "SOURCE_PAGE_MISSING" : "",
        popupSections.length > 0 && sourceKind === "no_wiki_source" ? "SOURCE_KIND_MISSING" : "",
        coverageClass === "individual_article" && popupSections.length > 0 && wikiSections.length === 0 ? "SOURCE_SECTION_MISSING" : ""
      ].filter(Boolean));

      const popupVsSeoVisualDensity = seoScreenshotStats && popupScreenshotStats
        ? relativeDelta(
            popupScreenshotStats.height * popupScreenshotStats.non_white_ratio,
            seoScreenshotStats.height * seoScreenshotStats.non_white_ratio
          )
        : 0;
      const wikiVsPopupVisualGap = wikiVisual && popupVisual
        ? relativeDelta(popupVisual.text_line_estimate || popupVisual.panel_height, wikiVisual.text_line_estimate || wikiVisual.content_height)
        : 0;
      const requiresRichSeo = coverageClass === "individual_article" || coverageClass === "substantive_article";
      const seoRicherThanPopup = Boolean(
        !requiresRichSeo ||
        (
          seoSnapshot &&
          popupSnapshot &&
          (
            seoChars > popupChars ||
            (seoVisual?.text_line_estimate || 0) > (popupVisual?.text_line_estimate || 0) ||
            popupVsSeoVisualDensity > 0
          ) &&
          seoMissing.length === 0
        )
      );
      const popupVisualVerdict = buildVisualVerdict({
        ok: Boolean(popupVisual?.rendered && popupScreenshotStats && popupScreenshotStats.non_white_ratio > 0.02),
        sparse: ["root_only", "synthetic_no_wiki", "no_individual_wiki_page"].includes(coverageClass),
        reasons: [
          popupVisual?.rendered ? "" : "POPUP_NOT_RENDERED",
          popupScreenshotStats && popupScreenshotStats.non_white_ratio > 0.02 ? "" : "POPUP_IMAGE_TOO_EMPTY"
        ]
      });
      const seoVisualVerdict = buildVisualVerdict({
        ok: Boolean(!seoSnapshot || (seoVisual?.rendered && seoScreenshotStats && seoScreenshotStats.non_white_ratio > 0.02)),
        sparse: !seoSnapshot && ["root_only", "synthetic_no_wiki", "no_individual_wiki_page"].includes(coverageClass),
        reasons: [
          !seoSnapshot ? "SEO_NOT_CAPTURED" : "",
          seoSnapshot && !seoVisual?.rendered ? "SEO_NOT_RENDERED" : "",
          seoSnapshot && seoScreenshotStats && seoScreenshotStats.non_white_ratio <= 0.02 ? "SEO_IMAGE_TOO_EMPTY" : ""
        ]
      });
      const mapColorVisualVerdict = buildVisualVerdict({
        ok: Boolean(
          mapEvidence.found &&
          mapEvidence.screenshot_sample_hex &&
          mapScreenshotStats &&
          (mapEvidence.screenshot_sample_distance ?? Number.POSITIVE_INFINITY) < 56
        ),
        reasons: [
          mapEvidence.found ? "" : "MAP_FEATURE_NOT_FOUND",
          mapEvidence.screenshot_sample_hex ? "" : "MAP_SCREEN_PIXEL_MISSING",
          (mapEvidence.screenshot_sample_distance ?? Number.POSITIVE_INFINITY) < 56 ? "" : "MAP_SCREEN_PIXEL_COLOR_MISMATCH"
        ]
      });
      const mapVsPopupVisualVerdict = buildVisualVerdict({
        ok: Boolean(
          mapEvidence.found &&
          popupVisual?.rendered &&
          bucketToSemanticColor(mapColorBucket) === bucketToSemanticColor(popupVisual?.badge_category || popupBadgeBucket)
        ),
        reasons: [
          mapEvidence.found ? "" : "MAP_FEATURE_NOT_FOUND",
          popupVisual?.rendered ? "" : "POPUP_NOT_RENDERED",
          bucketToSemanticColor(mapColorBucket) === bucketToSemanticColor(popupVisual?.badge_category || popupBadgeBucket) ? "" : "MAP_POPUP_BADGE_COLOR_MISMATCH"
        ]
      });
      const popupVsSeoVisualVerdict = buildVisualVerdict({
        ok: Boolean(
          popupVisual?.rendered &&
          seoVisual?.rendered &&
          bucketToSemanticColor(popupVisual?.badge_category || popupBadgeBucket) === bucketToSemanticColor(seoVisual?.badge_category || seoBadgeBucket) &&
          seoRicherThanPopup
        ),
        sparse: !requiresRichSeo && Boolean(popupVisual?.rendered),
        reasons: [
          popupVisual?.rendered ? "" : "POPUP_NOT_RENDERED",
          seoVisual?.rendered ? "" : "SEO_NOT_RENDERED",
          bucketToSemanticColor(popupVisual?.badge_category || popupBadgeBucket) === bucketToSemanticColor(seoVisual?.badge_category || seoBadgeBucket) ? "" : "POPUP_SEO_BADGE_COLOR_MISMATCH",
          seoRicherThanPopup ? "" : "SEO_NOT_VISUALLY_RICHER"
        ]
      });
      const mapVsSeoVisualVerdict = buildVisualVerdict({
        ok: Boolean(
          (!seoSnapshot || seoVisual?.rendered) &&
          bucketToSemanticColor(mapColorBucket) === bucketToSemanticColor(seoVisual?.badge_category || seoBadgeBucket || normalizedColorBucket)
        ),
        sparse: !seoSnapshot && ["root_only", "synthetic_no_wiki", "no_individual_wiki_page"].includes(coverageClass),
        reasons: [
          !seoSnapshot || seoVisual?.rendered ? "" : "SEO_NOT_RENDERED",
          bucketToSemanticColor(mapColorBucket) === bucketToSemanticColor(seoVisual?.badge_category || seoBadgeBucket || normalizedColorBucket) ? "" : "MAP_SEO_BADGE_COLOR_MISMATCH"
        ]
      });
      const popupVsWikiVisualVerdict = buildVisualVerdict({
        ok: Boolean(
          popupVisual?.rendered &&
          (!wikiSnapshot || !wikiVisual || wikiVsPopupVisualGap >= 0 || ["root_only", "synthetic_no_wiki", "no_individual_wiki_page"].includes(coverageClass))
        ),
        sparse: ["root_only", "synthetic_no_wiki", "no_individual_wiki_page", "stub_lead_only"].includes(coverageClass),
        reasons: [
          popupVisual?.rendered ? "" : "POPUP_NOT_RENDERED",
          !wikiSnapshot || !wikiVisual || wikiVsPopupVisualGap >= 0 || ["root_only", "synthetic_no_wiki", "no_individual_wiki_page"].includes(coverageClass) ? "" : "WIKI_VISUALLY_THICKER_THAN_POPUP"
        ]
      });
      const seoVsWikiVisualVerdict = buildVisualVerdict({
        ok: Boolean(
          !seoSnapshot ||
          !wikiSnapshot ||
          !seoVisual ||
          !wikiVisual ||
          seoVisual.text_line_estimate <= wikiVisual.text_line_estimate * 1.35
        ),
        sparse: ["root_only", "synthetic_no_wiki", "no_individual_wiki_page", "stub_lead_only"].includes(coverageClass),
        reasons: [
          !seoSnapshot || !wikiSnapshot || !seoVisual || !wikiVisual || seoVisual.text_line_estimate <= wikiVisual.text_line_estimate * 1.35 ? "" : "SEO_EXCEEDS_WIKI_VISUAL_SURFACE"
        ]
      });
      const colorVsWikiVisualVerdict = buildVisualVerdict({
        ok: Boolean(
          !wikiSnapshot ||
          coverageClass === "root_only" ||
          wikiSections.includes("Legal/Status") ||
          /\b(illegal|legal|restricted|medical|recreational|banned|decriminali[sz]ed)\b/i.test(wikiSnapshot.raw_text)
        ),
        sparse: ["synthetic_no_wiki", "no_individual_wiki_page"].includes(coverageClass),
        reasons: [
          !wikiSnapshot ||
          coverageClass === "root_only" ||
          wikiSections.includes("Legal/Status") ||
          /\b(illegal|legal|restricted|medical|recreational|banned|decriminali[sz]ed)\b/i.test(wikiSnapshot.raw_text) ? "" : "WIKI_LEGAL_COLOR_EVIDENCE_THIN"
        ]
      });

      const analysis: GeoAnalysisResult = {
        code: pageData?.code || entry?.code || geo.toLowerCase(),
        geo,
        canonical_key: canonicalKey,
        canonical_record_hash: canonicalRecordHash,
        model_rule_id: [
          "resolver_canonical_entity_key",
          "status_bucket_single_source",
          "popup_seo_single_record_hash",
          "wiki_source_trace_required"
        ],
        resolver_score: resolverScore,
        wiki_coverage: coverageClass,
        article_richness_score: {
          lead_length: wikiSnapshot?.lead_paragraphs.join(" ").length || 0,
          section_count: Object.keys(wikiSnapshot?.section_map || {}).length,
          substantive_sections: wikiSections.length,
          source_count: (entry?.sources || []).length
        },
        section_coverage_score: {
          History: wikiSections.includes("History") ? 1 : 0,
          Legal: wikiSections.includes("Legal/Status") ? 1 : 0,
          Enforcement: wikiSections.includes("Enforcement") ? 1 : 0,
          Cultivation: wikiSections.includes("Cultivation") ? 1 : 0,
          Culture: wikiSections.includes("Culture") ? 1 : 0,
          Traditional: wikiSections.includes("Traditional Use") ? 1 : 0,
          Slang: wikiSections.includes("Slang") ? 1 : 0,
          Market: wikiSections.includes("Market") ? 1 : 0,
          MedicalIndustrialRecreational: wikiSections.includes("Medical/Industrial/Recreational") ? 1 : 0
        },
        legal_completeness_score: {
          recreational: Boolean(pageData?.legal_model?.recreational?.status),
          medical: Boolean(pageData?.legal_model?.medical?.status),
          possession: Boolean(pageData?.legal_model?.distribution?.scopes?.possession || pageData?.facts?.possession_limit),
          sale_distribution: Boolean(pageData?.legal_model?.distribution?.status),
          cultivation: Boolean(pageData?.legal_model?.distribution?.scopes?.cultivation || pageData?.facts?.cultivation),
          industrial: /\bhemp|industrial\b/i.test(JSON.stringify(pageData?.legal_model || {})),
          enforcement: Boolean(pageData?.legal_model?.signals?.penalties)
        },
        sync_score: {
          map_popup_seo_model_aligned: colorMismatchKind.length === 0,
          popup_vs_seo_facts: {
            popup_chars: popupChars,
            seo_chars: seoChars,
            popup_items: popupComparableItems.length,
            seo_items_present: popupComparableItems.length - seoMissing.length,
            seo_richer_than_popup: seoChars > popupChars
          }
        },
        color_model: {
          map_color_bucket: mapColorBucket,
          popup_badge_bucket: popupBadgeBucket,
          seo_badge_bucket: seoBadgeBucket,
          normalized_color_bucket: normalizedColorBucket,
          normalized_status: normalizedStatus,
          map_layer_id: mapEvidence.layer_id,
          map_source_id: mapEvidence.source_id,
          map_color_evidence: mapEvidence.base_color || mapEvidence.color || entry?.result?.color || null
        },
        popup_sections: popupSections,
        seo_sections: seoSections,
        wiki_sections: wikiSections,
        popup_missing: popupMissing,
        seo_missing: seoMissing,
        wrong_geo_text: [],
        duplicate_with_geo: [],
        raw_urls: rawUrls,
        source_errors: sourceTraceErrors,
        status_color_conflicts: statusColorConflicts,
        visual_evidence: {
          map_screenshot: mapScreenshotStats,
          popup_screenshot: popupScreenshotStats,
          seo_screenshot: seoScreenshotStats,
          wiki_screenshot: wikiScreenshotStats,
          popup_panel: popupVisual,
          seo_panel: seoVisual,
          wiki_page: wikiVisual,
          map_screen_sample_hex: mapEvidence.screenshot_sample_hex
        },
        visual_verdicts: {
          map_color_visual_verdict: mapColorVisualVerdict,
          map_vs_popup_visual_verdict: mapVsPopupVisualVerdict,
          popup_visual_verdict: popupVisualVerdict,
          popup_vs_seo_visual_verdict: popupVsSeoVisualVerdict,
          popup_vs_wiki_visual_verdict: popupVsWikiVisualVerdict,
          seo_visual_verdict: seoVisualVerdict,
          map_vs_seo_visual_verdict: mapVsSeoVisualVerdict,
          seo_vs_wiki_visual_verdict: seoVsWikiVisualVerdict,
          color_vs_wiki_visual_verdict: colorVsWikiVisualVerdict,
          popup_vs_seo_visual_density: popupVsSeoVisualDensity,
          wiki_vs_popup_visual_gap: wikiVsPopupVisualGap
        },
        risk_flags: stableUnique([
          ...sourceTraceErrors.map((item) => item.toLowerCase()),
          ...statusColorConflicts,
          ...colorMismatchKind,
          mapColorVisualVerdict.startsWith("FAIL") ? "map_visual_mismatch" : "",
          popupVsSeoVisualVerdict.startsWith("FAIL") ? "popup_seo_visual_mismatch" : "",
          popupVsWikiVisualVerdict.startsWith("FAIL") ? "popup_wiki_visual_mismatch" : "",
          seoVsWikiVisualVerdict.startsWith("FAIL") ? "seo_wiki_visual_mismatch" : "",
          rawUrls.length > 0 ? "raw_urls" : "",
          coverageClass === "resolver_failed" ? "resolver_failed" : "",
          coverageClass === "redirect_parent" ? "wrong_parent_jurisdiction" : "",
          coverageClass === "stub_lead_only" ? "weak_wiki_match" : "",
          popupSections.length === 0 && wikiSections.length > 0 ? "seo_popup_desync" : ""
        ].filter(Boolean))
      };

      const analysisPath = path.join(geoDir, "geo-analysis.json");
      fs.writeFileSync(analysisPath, `${JSON.stringify(analysis, null, 2)}\n`);

      const row: GeoSyncRow = {
        code: analysis.code,
        name: String(entry?.displayName || pageData?.name || geo),
        type: String(entry?.type || pageData?.node_type || (geo.startsWith("US-") ? "state" : "country")),
        parent,
        canonical_key: canonicalKey,
        wiki_page: wikiUrl || null,
        source_kind: sourceKind,
        coverage_class: coverageClass,
        low_coverage_reason: lowCoverageReason,
        resolver_confidence: resolverScore.confidence,
        model_rule_ids: analysis.model_rule_id,
        applied_rules: analysis.model_rule_id,
        parser_version: "geo-sync-audit-v1",
        generator_run_id: new Date().toISOString(),
        canonical_record_hash: analysis.canonical_record_hash,
        artifact_dir: path.relative(ROOT, geoDir),
        map_screenshot: path.relative(ROOT, mapScreenshotPath),
        popup_screenshot: popupScreenshotPath ? path.relative(ROOT, popupScreenshotPath) : null,
        project_popup_screenshot: popupScreenshotPath ? path.relative(ROOT, popupScreenshotPath) : null,
        seo_screenshot: seoScreenshotPath ? path.relative(ROOT, seoScreenshotPath) : null,
        project_seo_panel_screenshot: seoPanelScreenshotPath ? path.relative(ROOT, seoPanelScreenshotPath) : null,
        wiki_screenshot: wikiScreenshotPath ? path.relative(ROOT, wikiScreenshotPath) : null,
        wiki_fullpage_screenshot: wikiScreenshotPath ? path.relative(ROOT, wikiScreenshotPath) : null,
        geo_analysis_json: path.relative(ROOT, analysisPath),
        map_color_bucket: mapColorBucket,
        map_color_evidence: analysis.color_model.map_color_evidence,
        map_layer_id: mapEvidence.layer_id,
        map_source_id: mapEvidence.source_id,
        popup_badge_bucket: popupBadgeBucket,
        popup_status_label: popupSnapshot?.status_summary || entry?.panel?.summary || null,
        seo_badge_bucket: seoBadgeBucket,
        seo_status_label: seoSnapshot?.summary || null,
        normalized_color_bucket: normalizedColorBucket,
        normalized_status: normalizedStatus,
        before_sections: beforeSections,
        after_sections: afterSections,
        popup_sections: popupSections,
        seo_sections: seoSections,
        wiki_sections: wikiSections,
        missing_sections: popupMissing,
        misplaced_content: [],
        repeated_text: [],
        source_trace_errors: sourceTraceErrors,
        popup_missing: analysis.popup_missing,
        seo_missing: seoMissing,
        wrong_geo_text: [],
        duplicate_with_geo: [],
        raw_urls: rawUrls,
        source_errors: sourceTraceErrors,
        status_color_conflicts: statusColorConflicts,
        color_mismatch_kind: colorMismatchKind,
        manual_override_reason: null,
        changed_files: CHANGED_FILES,
        notes: stableUnique([
          `MAP_COLOR_VISUAL_VERDICT=${mapColorVisualVerdict}`,
          `MAP_VS_POPUP_VISUAL_VERDICT=${mapVsPopupVisualVerdict}`,
          `POPUP_VISUAL_VERDICT=${popupVisualVerdict}`,
          `POPUP_VS_SEO_VISUAL_VERDICT=${popupVsSeoVisualVerdict}`,
          `POPUP_VS_WIKI_VISUAL_VERDICT=${popupVsWikiVisualVerdict}`,
          `SEO_VISUAL_VERDICT=${seoVisualVerdict}`,
          `MAP_VS_SEO_VISUAL_VERDICT=${mapVsSeoVisualVerdict}`,
          `SEO_VS_WIKI_VISUAL_VERDICT=${seoVsWikiVisualVerdict}`,
          `COLOR_VS_WIKI_VISUAL_VERDICT=${colorVsWikiVisualVerdict}`,
          `POPUP_VS_SEO_VISUAL_DENSITY=${popupVsSeoVisualDensity.toFixed(3)}`,
          `WIKI_VS_POPUP_VISUAL_GAP=${wikiVsPopupVisualGap.toFixed(3)}`,
          mapEvidence.screenshot_sample_hex ? `MAP_SCREEN_PIXEL=${mapEvidence.screenshot_sample_hex}` : "",
          Number.isFinite(mapEvidence.screenshot_sample_distance) ? `MAP_SCREEN_PIXEL_DISTANCE=${Number(mapEvidence.screenshot_sample_distance).toFixed(2)}` : "",
          popupSnapshot ? "" : "POPUP_NOT_VISIBLE",
          seoSnapshot ? "" : "SEO_NOT_CAPTURED",
          wikiSnapshot || !wikiUrl ? "" : "WIKI_NOT_CAPTURED",
          pageData ? "" : "NO_COUNTRY_PAGE_DATA",
          analysis.sync_score.popup_vs_seo_facts.seo_richer_than_popup ? "" : "SEO_NOT_RICHER_THAN_POPUP"
        ].filter(Boolean))
      };
      rows.push(row);
      const liveVerdict = evaluateLiveRow(row);
      if (!liveVerdict.ok) {
        liveFailures.push(liveVerdict);
        fs.appendFileSync(LIVE_FAILURES_PATH, `${JSON.stringify({ generatedAt: new Date().toISOString(), index: index + 1, ...liveVerdict })}\n`);
      }
      if (liveVerdict.warnings.some((warning) => warning === "RISK_GEO_VISUAL_REVIEW_REQUIRED")) {
        fs.appendFileSync(LIVE_REVIEW_PATH, `${JSON.stringify({ generatedAt: new Date().toISOString(), index: index + 1, ...liveVerdict })}\n`);
        console.warn(`GEO_SYNC_AUDIT_REVIEW geo=${geo} map=${row.map_screenshot || ""} popup=${row.popup_screenshot || ""} seo=${row.seo_screenshot || ""} wiki=${row.wiki_screenshot || ""}`);
      }
      writeLiveSummary({ rows, total, liveFailures, startedAt: liveStartedAt, current: liveVerdict });
      if (failFast && !liveVerdict.ok) {
        throw new Error(`GEO_SYNC_AUDIT_LIVE_FAIL:${geo}:${liveVerdict.failures.join("|")}`);
      }

      console.warn(`GEO_SYNC_AUDIT_ROW ${index + 1}/${geos.length} geo=${geo} map=1 popup=${popupSnapshot ? 1 : 0} seo=${seoSnapshot ? 1 : 0} wiki=${wikiSnapshot ? 1 : 0} live=${liveVerdict.ok ? "PASS" : `FAIL:${liveVerdict.failures.join("|")}`}`);
    }

    const report: GeoSyncManifest = {
      generatedAt: new Date().toISOString(),
      total_geo_count: total,
      processed_geo_count: rows.length,
      mapCaptured: rows.filter((row) => Boolean(row.map_screenshot)).length,
      popupCaptured: rows.filter((row) => Boolean(row.popup_screenshot)).length,
      seoCaptured: rows.filter((row) => Boolean(row.seo_screenshot)).length,
      wikiCaptured: rows.filter((row) => Boolean(row.wiki_screenshot)).length,
      coverage_summary: buildCoverageSummary(rows),
      rows
    };
    const validation = buildValidation(rows, total);
    const summary = {
      generatedAt: report.generatedAt,
      total_geo_count: report.total_geo_count,
      processed_geo_count: report.processed_geo_count,
      mapCaptured: report.mapCaptured,
      popupCaptured: report.popupCaptured,
      seoCaptured: report.seoCaptured,
      wikiCaptured: report.wikiCaptured,
      coverage_summary: report.coverage_summary,
      visual_pass_summary: {
        map_color: rows.filter((row) => row.notes.some((item) => item === "MAP_COLOR_VISUAL_VERDICT=PASS")).length,
        popup_vs_seo: rows.filter((row) => row.notes.some((item) => item === "POPUP_VS_SEO_VISUAL_VERDICT=PASS")).length,
        seo_vs_wiki: rows.filter((row) => row.notes.some((item) => item === "SEO_VS_WIKI_VISUAL_VERDICT=PASS")).length
      },
      sparse_summary: {
        low_coverage: rows.filter((row) => Boolean(row.low_coverage_reason)).length,
        no_page_or_synthetic: rows.filter((row) => ["no_individual_wiki_page", "synthetic_no_wiki", "root_only"].includes(row.coverage_class)).length
      },
      validation
    };
    fs.writeFileSync(path.join(GEO_SYNC_DIR, "manifest.json"), `${JSON.stringify(report, null, 2)}\n`);
    fs.writeFileSync(path.join(GEO_SYNC_DIR, "report.csv"), renderCsv(rows));
    if (isFullRun) {
      fs.writeFileSync(path.join(GEO_SYNC_DIR, "full-manifest.json"), `${JSON.stringify(report, null, 2)}\n`);
      fs.writeFileSync(path.join(GEO_SYNC_DIR, "full-report.csv"), renderCsv(rows));
      fs.writeFileSync(path.join(GEO_SYNC_DIR, "full-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
      fs.writeFileSync(path.join(GEO_SYNC_DIR, "full-validation.json"), `${JSON.stringify(validation, null, 2)}\n`);
      fs.writeFileSync(path.join(GEO_SYNC_DIR, "full-index.html"), renderHtmlIndex(rows, report));
    }
    console.warn(`GEO_SYNC_AUDIT_DONE total=${report.total_geo_count} processed=${report.processed_geo_count} map=${report.mapCaptured} popup=${report.popupCaptured} seo=${report.seoCaptured} wiki=${report.wikiCaptured}`);
  } finally {
    await context.close();
    await browser.close();
  }
}

void main();
