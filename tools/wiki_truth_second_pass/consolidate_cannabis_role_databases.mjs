#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const GENERATED_AT = new Date().toISOString();

const UNIFIED_DIR = path.join(
  ROOT,
  "artifacts/wiki_truth_second_pass/unified_databases",
);

const TERRITORIES_DB = path.join(
  UNIFIED_DIR,
  "territories.cannabis_law_audit.unified.json",
);
const OFFICIAL_LINKS_DB = path.join(
  UNIFIED_DIR,
  "official_links.cannabis_law_audit.unified.json",
);
const ARTIFACT_CATALOG_DB = path.join(
  UNIFIED_DIR,
  "artifact_catalog.role_applicability.unified.json",
);
const REPORT_MD = path.join(
  UNIFIED_DIR,
  "database_role_consolidation_report.md",
);
const SEARCH_DIR = path.join(ROOT, "artifacts/wiki_truth_second_pass/search");
const REVIEW_DIR = path.join(ROOT, "artifacts/wiki_truth_second_pass/reviews");

const SCAN_ROOTS = [
  "data",
  "artifacts/wiki_truth_second_pass",
];

const DATABASE_EXTENSIONS = new Set([".json", ".jsonl", ".csv", ".tsv", ".md"]);

const SKIP_DIR_PARTS = new Set([
  ".git",
  ".next",
  "node_modules",
]);

const CANONICAL_DATABASES = {
  territories: {
    file: path.relative(ROOT, TERRITORIES_DB),
    role: "territory_status_and_geo_universe",
    meaning:
      "single canonical country/territory audit row database for the 307-GEO working universe",
  },
  official_links: {
    file: path.relative(ROOT, OFFICIAL_LINKS_DB),
    role: "official_link_and_cannabis_law_source_evidence",
    meaning:
      "single canonical URL-level official cannabis-law evidence database with multi-role provenance",
  },
  artifact_catalog: {
    file: path.relative(ROOT, ARTIFACT_CATALOG_DB),
    role: "service_provenance_and_database_applicability_catalog",
    meaning:
      "service catalog for raw artifacts, visual proof, terminology, reports, and database applicability; not a competing legal status database",
  },
};

const ROLE_DEFINITIONS = {
  territory_universe: {
    sink: "territories",
    keywords: [
      "geo-list",
      "full-manifest",
      "territor",
      "country",
      "countries",
      "wiki_pages_universe",
      "us_states_wiki",
      "ssot_snapshot",
      "snapshot",
      "matrix-307",
      "wiki-truth-cannabis-law-matrix",
    ],
  },
  project_status_and_map_snapshot: {
    sink: "territories",
    keywords: [
      "status_snapshot",
      "status-engine",
      "map",
      "color",
      "ssot_legality",
      "legality_table",
    ],
  },
  discrepancy_and_axis_analysis: {
    sink: "territories",
    keywords: [
      "difference",
      "differences",
      "mismatch",
      "diff",
      "axis",
      "proposal",
      "high_confidence",
    ],
  },
  official_link_registry: {
    sink: "official_links",
    keywords: [
      "official",
      "official_domains",
      "official_link_ownership",
      "registry",
      "link_ownership",
      "source",
      "sources",
      "url",
      "urls",
    ],
  },
  source_corpus: {
    sink: "official_links",
    keywords: [
      "source_corpus",
      "direct-cannabis-law-pages",
      "collect_direct",
      "fetched",
      "fetch",
      "page",
      "pages",
      "batch",
      "cannabis-law",
    ],
  },
  visual_proof: {
    sink: "artifact_catalog",
    keywords: [
      "visual",
      "screenshot",
      "screenshots",
      "contact-sheet",
      "contact_sheet",
      "page_checks",
      "review",
      "manual",
      "audit",
    ],
  },
  terminology_corpus: {
    sink: "artifact_catalog",
    keywords: [
      "terminology",
      "terms",
      "query-derived",
      "cannabis_profiles",
      "inventory",
      "synonym",
    ],
  },
  ui_render_proof: {
    sink: "artifact_catalog",
    keywords: [
      "wiki-truth",
      "live_probe",
      "smoke",
      "render",
      "favicon",
      "ui",
    ],
  },
  preservation_and_progress_ledger: {
    sink: "artifact_catalog",
    keywords: [
      "baseline",
      "progress",
      "preservation",
      "anti-shrink",
      "shrink",
      "role_bases",
      "unified_current_registry",
      "common_thematic",
      "remaining",
      "blocker_queue",
    ],
  },
  service_catalog: {
    sink: "artifact_catalog",
    keywords: [
      "artifact_catalog",
      "bases_inventory",
      "role_applicability",
      "database_role_consolidation",
      "catalog",
    ],
  },
};

const LEGACY_ARTIFACT_ROLE_MAP = {
  "difference-source": "discrepancy_and_axis_analysis",
  "official-link-source": "official_link_registry",
  "preservation-or-consolidation-source": "preservation_and_progress_ledger",
  "source-corpus": "source_corpus",
  "supporting-source": "source_corpus",
  "terminology-corpus": "terminology_corpus",
  "territory-audit-source": "territory_universe",
  "territory-universe": "territory_universe",
  "visual-proof-source": "visual_proof",
};

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function primaryRoleForPath(relativePath) {
  const p = relativePath.toLowerCase();

  if (p === CANONICAL_DATABASES.territories.file) return "territory_universe";
  if (p === CANONICAL_DATABASES.official_links.file) return "official_link_registry";
  if (p === CANONICAL_DATABASES.artifact_catalog.file) return "service_catalog";
  if (p.includes("/unified_databases/")) return "service_catalog";
  if (p.includes("/search/")) return "source_corpus";
  if (p.includes("/reviews/")) return "visual_proof";
  if (p.includes("/screenshots/")) return "visual_proof";
  if (p.includes("/fetched_sources/") || p.includes("/raw_pages/")) return "source_corpus";
  if (p.includes("/page_checks/")) return "visual_proof";
  if (p.includes("/thematic_analysis/source_corpus.role_batch_")) return "source_corpus";
  if (p.includes("/thematic_analysis/role_bases.")) return "preservation_and_progress_ledger";
  if (p.includes("official_link_ownership")) return "official_link_registry";
  if (p.includes("official_domains")) return "official_link_registry";
  if (p.includes("direct-cannabis-law-pages")) return "source_corpus";
  if (p.includes("cannabis_law_visual_reviews")) return "visual_proof";
  if (p.includes("query-derived-cannabis-terms") || p.includes("cannabis_query_term_inventory")) return "terminology_corpus";
  if (p.includes("wiki-truth-cannabis-law-matrix")) return "discrepancy_and_axis_analysis";
  if (p.includes("difference") || p.includes("mismatch") || p.includes("diff")) return "discrepancy_and_axis_analysis";
  if (p.includes("status_snapshot") || p.includes("ssot_legality") || p.includes("/status-engine/")) return "project_status_and_map_snapshot";
  if (p.includes("geo-list") || p.includes("/countries/") || p.includes("wiki_pages_universe") || p.includes("us_states_wiki")) return "territory_universe";
  if (p.startsWith("data/wiki/") || p.startsWith("data/ssot/")) return "territory_universe";
  if (p.includes("official") || p.includes("source")) return "official_link_registry";
  if (p.includes("baseline") || p.includes("progress") || p.includes("preservation") || p.includes("shrink")) return "preservation_and_progress_ledger";

  return "service_catalog";
}

function rel(file) {
  return path.relative(ROOT, file).split(path.sep).join("/");
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const dirent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, dirent.name);
    const parts = path.relative(ROOT, full).split(path.sep);
    if (parts.some((part) => SKIP_DIR_PARTS.has(part))) continue;
    if (dirent.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (dirent.isFile() && DATABASE_EXTENSIONS.has(path.extname(dirent.name))) {
      out.push(full);
    }
  }
  return out;
}

function hashText(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function safeParseJson(text) {
  try {
    return { value: JSON.parse(text), error: null };
  } catch (error) {
    return { value: null, error: error.message };
  }
}

function summarizeShape(file, text) {
  const ext = path.extname(file).toLowerCase();
  const summary = {
    extension: ext,
    parse_status: "text_only",
    top_level_type: "text",
    row_count_hint: null,
    key_count: null,
    keys_sample: [],
    url_literal_count: (text.match(/https?:\/\//g) || []).length,
    geo_literal_count: (text.match(/"geo"\s*:/g) || []).length,
  };

  if (ext === ".json") {
    const parsed = safeParseJson(text);
    if (parsed.error) {
      summary.parse_status = "json_parse_error";
      summary.parse_error = parsed.error;
      return summary;
    }

    const value = parsed.value;
    summary.parse_status = "json_ok";
    summary.top_level_type = Array.isArray(value) ? "array" : typeof value;
    if (Array.isArray(value)) {
      summary.row_count_hint = value.length;
      return summary;
    }

    if (value && typeof value === "object") {
      const keys = Object.keys(value);
      summary.key_count = keys.length;
      summary.keys_sample = keys.slice(0, 16);
      const rowKeys = [
        "records",
        "rows",
        "entries",
        "items",
        "sources",
        "domains",
        "geos",
        "files",
        "artifacts",
        "results",
        "families",
        "themes",
      ];
      for (const key of rowKeys) {
        if (Array.isArray(value[key])) {
          summary.row_count_hint = value[key].length;
          summary.row_count_key = key;
          break;
        }
      }
    }
    return summary;
  }

  if (ext === ".jsonl") {
    const lines = text.split(/\r?\n/).filter(Boolean);
    summary.parse_status = "jsonl_text";
    summary.top_level_type = "jsonl";
    summary.row_count_hint = lines.length;
    return summary;
  }

  if (ext === ".csv" || ext === ".tsv") {
    const lines = text.split(/\r?\n/).filter(Boolean);
    summary.parse_status = "delimited_text";
    summary.top_level_type = ext.slice(1);
    summary.row_count_hint = Math.max(0, lines.length - 1);
    return summary;
  }

  if (ext === ".md") {
    const lines = text.split(/\r?\n/);
    summary.parse_status = "markdown_text";
    summary.top_level_type = "markdown";
    summary.row_count_hint = lines.length;
    return summary;
  }

  return summary;
}

function classify(pathname, text, summary) {
  const haystack = [
    pathname.toLowerCase(),
    summary.keys_sample.join(" ").toLowerCase(),
    text.slice(0, 4000).toLowerCase(),
  ].join(" ");

  const primaryRole = primaryRoleForPath(pathname);
  const primarySink = ROLE_DEFINITIONS[primaryRole].sink;
  const keywordRoles = [];
  for (const [role, definition] of Object.entries(ROLE_DEFINITIONS)) {
    if (definition.keywords.some((keyword) => haystack.includes(keyword))) {
      keywordRoles.push(role);
    }
  }

  const applicabilityRoles = uniqueSorted(
    keywordRoles.filter((role) => role !== primaryRole),
  );
  const applicabilitySinks = uniqueSorted(
    applicabilityRoles.map((role) => ROLE_DEFINITIONS[role].sink),
  );

  return {
    primary_role: primaryRole,
    primary_canonical_sink: primarySink,
    roles: [primaryRole],
    canonical_sinks: [primarySink],
    applicability_roles: applicabilityRoles,
    applicability_canonical_sinks: applicabilitySinks,
  };
}

function canonicalAction(relativePath) {
  for (const [name, definition] of Object.entries(CANONICAL_DATABASES)) {
    if (relativePath === definition.file) {
      return {
        action: "canonical_primary_database",
        canonical_database_name: name,
      };
    }
  }
  return {
    action: "role_catalogued_as_provenance_not_deleted",
    canonical_database_name: null,
  };
}

function normalizeLegacyArtifactRole(role) {
  return LEGACY_ARTIFACT_ROLE_MAP[role] || null;
}

function enrichArtifactCatalogRecords(artifactCatalog) {
  if (!Array.isArray(artifactCatalog.records)) return artifactCatalog;

  artifactCatalog.records = artifactCatalog.records.map((record) => {
    const relativePath = record.path || record.file || "";
    const pathPrimaryRole = relativePath
      ? primaryRoleForPath(relativePath)
      : "service_catalog";
    const legacyPrimaryRole = normalizeLegacyArtifactRole(record.role);
    const primaryRole = legacyPrimaryRole || pathPrimaryRole;
    const primaryCanonicalSink =
      ROLE_DEFINITIONS[primaryRole]?.sink || "artifact_catalog";
    const pathCanonicalSink =
      ROLE_DEFINITIONS[pathPrimaryRole]?.sink || primaryCanonicalSink;
    const action = canonicalAction(relativePath);
    const observedArtifactRoles = uniqueSorted([
      record.role,
      ...(Array.isArray(record.roles) ? record.roles : []),
    ]);
    const applicabilityRoles = uniqueSorted([
      primaryRole,
      pathPrimaryRole,
      ...observedArtifactRoles
        .map((role) => normalizeLegacyArtifactRole(role))
        .filter(Boolean),
    ]);
    const applicabilityCanonicalSinks = uniqueSorted(
      applicabilityRoles.map((role) => ROLE_DEFINITIONS[role]?.sink).filter(Boolean),
    );

    return {
      ...record,
      primary_role: primaryRole,
      primary_canonical_sink: primaryCanonicalSink,
      canonical_sink: primaryCanonicalSink,
      canonical_sinks: uniqueSorted([primaryCanonicalSink, pathCanonicalSink]),
      applicability_roles: applicabilityRoles,
      applicability_canonical_sinks: applicabilityCanonicalSinks,
      observed_artifact_roles: observedArtifactRoles,
      canonical_action: action.action,
      canonical_database_name: action.canonical_database_name,
      role_consolidation_note:
        "Preserved provenance artifact. Canonical consumers should read the unified role database named by canonical_sink first, then use this raw artifact only for drill-down.",
      deletion_allowed: false,
      shrink_allowed: false,
    };
  });

  artifactCatalog.counts = {
    ...(artifactCatalog.counts || {}),
    enriched_records_with_primary_role: artifactCatalog.records.filter((record) =>
      Boolean(record.primary_role)
    ).length,
    enriched_records_with_canonical_sink: artifactCatalog.records.filter((record) =>
      Boolean(record.canonical_sink)
    ).length,
    no_old_new_split: true,
  };

  return artifactCatalog;
}

function buildCandidateRecord(file) {
  const text = fs.readFileSync(file, "utf8");
  const stat = fs.statSync(file);
  const relativePath = rel(file);
  const summary = summarizeShape(file, text);
  const classified = classify(relativePath, text, summary);
  const action = canonicalAction(relativePath);

  return {
    path: relativePath,
    bytes: stat.size,
    sha256: hashText(text),
    mtimeMs: stat.mtimeMs,
    ...summary,
    primary_role: classified.primary_role,
    primary_canonical_sink: classified.primary_canonical_sink,
    roles: classified.roles,
    canonical_sinks: classified.canonical_sinks,
    applicability_roles: classified.applicability_roles,
    applicability_canonical_sinks: classified.applicability_canonical_sinks,
    canonical_action: action.action,
    canonical_database_name: action.canonical_database_name,
    deletion_allowed: false,
    shrink_allowed: false,
  };
}

function countBy(records, mapper) {
  const counts = {};
  for (const record of records) {
    const keys = mapper(record);
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      counts[key] = (counts[key] || 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0])));
}

function summarizeCanonicalDb(file) {
  const data = readJson(file);
  const records = Array.isArray(data.records) ? data.records : [];
  return {
    file: rel(file),
    records: records.length,
    counts: data.counts || null,
    status_data_changed: data.status_data_changed ?? null,
    map_colors_changed: data.map_colors_changed ?? null,
    production_touched: data.production_touched ?? null,
    deletion_or_shrink_allowed: data.deletion_or_shrink_allowed ?? false,
  };
}

function isFreshSearchComplete(record, geo) {
  return record?.geo === geo &&
    record?.fresh_search === true &&
    Array.isArray(record?.URLs_opened) &&
    record.URLs_opened.length > 0 &&
    record?.review_result !== "PENDING_FRESH_BROWSER_SEARCH";
}

function isFreshReviewComplete(record, geo) {
  return record?.geo === geo &&
    record?.screenshot_opened === true &&
    record?.visually_read === true &&
    record?.geo_identity_confirmed === true &&
    record?.negation_checked === true &&
    record?.effective_law_checked === true &&
    record?.bill_vs_law_checked === true &&
    Array.isArray(record?.fresh_screenshot_paths) &&
    record.fresh_screenshot_paths.length > 0 &&
    record?.review_result !== "PENDING_FRESH_BROWSER_REVIEW";
}

function readGeoJson(dir, geo) {
  const file = path.join(dir, `${geo}.json`);
  if (!fs.existsSync(file)) return null;
  return readJson(file);
}

function normalizeScreenshotRecord(item, bucket = "fresh_visual_proof") {
  const screenshotPath = item?.path || item?.screenshot_path || item?.screenshotPath;
  if (!screenshotPath) return null;
  return {
    path: screenshotPath,
    exists: item.exists ?? fs.existsSync(screenshotPath),
    sha256: item.sha256 || item.screenshot_sha256 || item.screenshotSha256 || null,
    source_url: item.source_url || item.url || null,
    viewed_at: item.viewed_at || item.accepted_at || null,
    visual_result: item.visual_result || item.result || null,
    evidence_scope: item.evidence_scope || item.evidenceScope || null,
    source_role: "visual-proof",
    bucket,
  };
}

function mergeVisualEvidence(existing, additions) {
  const existingItems = Array.isArray(existing) ? existing : [];
  const out = [...existingItems];
  const seen = new Set();
  for (const item of existingItems) {
    if (!item) continue;
    seen.add([
      item.path || "",
      item.sha256 || "",
      item.source_url || "",
      item.visual_result || "",
    ].join("\0"));
  }
  for (const item of additions) {
    if (!item) continue;
    const key = [
      item.path || "",
      item.sha256 || "",
      item.source_url || "",
      item.visual_result || "",
    ].join("\0");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function updateTerritoryFreshnessFromSearchReviews(data) {
  if (!Array.isArray(data.records)) return data;

  for (const record of data.records) {
    const geo = record.geo;
    const search = readGeoJson(SEARCH_DIR, geo);
    const review = readGeoJson(REVIEW_DIR, geo);
    const freshSearch = isFreshSearchComplete(search, geo);
    const freshReview = isFreshReviewComplete(review, geo);
    record.freshness = {
      ...(record.freshness || {}),
      fresh_search: freshSearch,
      fresh_visual_review: freshReview,
      review_result: review?.review_result || search?.review_result || record.freshness?.review_result || "PENDING",
      confidence: review?.confidence || record.freshness?.confidence || "none",
    };

    const reviewScreenshots = [
      ...((review?.fresh_screenshot_paths || []).map((item) =>
        normalizeScreenshotRecord(item, "fresh_visual_proof")
      )),
      ...((review?.accepted_screenshot_paths || []).map((item) =>
        normalizeScreenshotRecord(item, "accepted_visual_proof")
      )),
      ...((review?.failed_screenshot_paths || []).map((item) =>
        normalizeScreenshotRecord(item, "failed_or_context_rendered_provenance")
      )),
      ...((review?.rejected_screenshot_paths || []).map((item) =>
        normalizeScreenshotRecord(item, "rejected_visual_provenance")
      )),
    ]
      .filter(Boolean);
    record.visual_evidence = mergeVisualEvidence(record.visual_evidence, reviewScreenshots);

    record.matched_terms = uniqueSorted([
      ...(record.matched_terms || []),
      ...(search?.relevant_terms_found || []),
      ...(review?.matched_terms || []),
      ...(review?.cannabis_family_terms_visible || []),
    ]);

    const rejectionReasons = [
      ...(search?.rejection_reasons || []),
      ...(Array.isArray(search?.rejected_candidates)
        ? search.rejected_candidates.map((item) => item.reason || item.rejection_reason || item.result)
        : []),
    ].filter(Boolean);
    record.blocker_or_rejection_reasons = uniqueSorted([
      ...(record.blocker_or_rejection_reasons || []),
      ...rejectionReasons,
    ]);

    record.data_preservation = {
      ...(record.data_preservation || {}),
      preserved_opened_url_count: Array.isArray(search?.URLs_opened)
        ? search.URLs_opened.length
        : record.data_preservation?.preserved_opened_url_count || 0,
      preserved_fresh_screenshot_count: Array.isArray(review?.fresh_screenshot_paths)
        ? review.fresh_screenshot_paths.length
        : record.data_preservation?.preserved_fresh_screenshot_count || 0,
      consolidation_refreshed_from_search_review: true,
      status_data_changed: false,
      map_colors_changed: false,
      production_touched: false,
      evidence_data_deleted: false,
    };
  }

  data.counts = {
    ...(data.counts || {}),
    territories: data.records.length,
    fresh_search: data.records.filter((record) => record.freshness?.fresh_search).length,
    fresh_visual_review: data.records.filter((record) => record.freshness?.fresh_visual_review).length,
    remaining_without_fresh_visual: data.records.filter((record) => !record.freshness?.fresh_visual_review).length,
    rows_with_official_links: data.records.filter((record) =>
      (Array.isArray(record.official_link_ids) && record.official_link_ids.length > 0) ||
      Number(record.official_link_count || 0) > 0
    ).length,
    visual_evidence_records: data.records.reduce(
      (total, record) => total + (Array.isArray(record.visual_evidence) ? record.visual_evidence.length : 0),
      0,
    ),
  };
  data.status_data_changed = false;
  data.map_colors_changed = false;
  data.production_touched = false;
  data.evidence_data_deleted = false;
  data.deletion_or_shrink_allowed = false;
  return data;
}

function annotateCanonicalDatabase(file, databaseName, inventorySummary) {
  const data = readJson(file);
  const existingRecords = Array.isArray(data.records) ? data.records.length : null;
  if (databaseName === "territories") {
    updateTerritoryFreshnessFromSearchReviews(data);
  }
  data.database_consolidation = {
    generatedAt: GENERATED_AT,
    generatedBy: "tools/wiki_truth_second_pass/consolidate_cannabis_role_databases.mjs",
    canonical_database_name: databaseName,
    canonical_role: CANONICAL_DATABASES[databaseName].role,
    meaning: CANONICAL_DATABASES[databaseName].meaning,
    no_old_new_split: true,
    deletion_or_shrink_allowed: false,
    competing_database_policy:
      "raw files stay as immutable provenance; this canonical database is the active role sink",
    source_database_inventory: {
      stored_in: CANONICAL_DATABASES.artifact_catalog.file,
      database_like_files_scanned: inventorySummary.total_database_like_files,
      role_counts: inventorySummary.role_counts,
      primary_role_counts: inventorySummary.primary_role_counts,
      applicability_role_counts: inventorySummary.applicability_role_counts,
      canonical_sink_counts: inventorySummary.canonical_sink_counts,
      primary_canonical_sink_counts: inventorySummary.primary_canonical_sink_counts,
      applicability_canonical_sink_counts: inventorySummary.applicability_canonical_sink_counts,
    },
  };
  writeJson(file, data);

  const after = readJson(file);
  const afterRecords = Array.isArray(after.records) ? after.records.length : null;
  if (existingRecords !== afterRecords) {
    throw new Error(
      `${rel(file)} record count changed during consolidation: ${existingRecords} -> ${afterRecords}`,
    );
  }
}

function renderReport(inventorySummary, canonicalSummaries, records) {
  const lines = [];
  lines.push("# Cannabis-law database role consolidation");
  lines.push("");
  lines.push(`Generated: ${GENERATED_AT}`);
  lines.push("");
  lines.push("## Contract");
  lines.push("");
  lines.push("- No old/new split: every database-like artifact is assigned by role and applicability.");
  lines.push("- No deletion/shrink: raw files remain immutable provenance; canonical databases are annotated, not reduced.");
  lines.push("- Active operational databases are intentionally limited to two: territories and official links.");
  lines.push("- The artifact catalog is required service provenance, not a third legal-status or source-truth database.");
  lines.push("- Status data, map colors, and production outputs are not edited by this consolidation.");
  lines.push("");
  lines.push("## Canonical databases");
  lines.push("");
  for (const [name, definition] of Object.entries(CANONICAL_DATABASES)) {
    const summary = canonicalSummaries.find((item) => item.file === definition.file);
    lines.push(`- ${name}: ${definition.file}`);
    lines.push(`  - role: ${definition.role}`);
    lines.push(`  - records: ${summary?.records ?? "n/a"}`);
    lines.push(`  - meaning: ${definition.meaning}`);
  }
  lines.push("");
  lines.push("## Scanned database-like corpus");
  lines.push("");
  lines.push(`- scanned_roots: ${SCAN_ROOTS.join(", ")}`);
  lines.push(`- database_like_files_scanned: ${inventorySummary.total_database_like_files}`);
  lines.push(`- parse_status_counts: ${JSON.stringify(inventorySummary.parse_status_counts)}`);
  lines.push(`- primary_canonical_sink_counts: ${JSON.stringify(inventorySummary.primary_canonical_sink_counts)}`);
  lines.push(`- applicability_canonical_sink_counts: ${JSON.stringify(inventorySummary.applicability_canonical_sink_counts)}`);
  lines.push(`- canonical_action_counts: ${JSON.stringify(inventorySummary.canonical_action_counts)}`);
  lines.push("");
  lines.push("## Role counts");
  lines.push("");
  lines.push("Primary roles, exactly one per database-like file:");
  lines.push("");
  for (const [role, count] of Object.entries(inventorySummary.role_counts)) {
    lines.push(`- ${role}: ${count}`);
  }
  lines.push("");
  lines.push("Applicability roles, preserved only for provenance drill-down and never as competing active bases:");
  lines.push("");
  for (const [role, count] of Object.entries(inventorySummary.applicability_role_counts)) {
    lines.push(`- ${role}: ${count}`);
  }
  lines.push("");
  lines.push("## Manual applicability conclusions");
  lines.push("");
  lines.push("- Territory/status data belongs to one active database: `territories.cannabis_law_audit.unified.json`.");
  lines.push("- Official cannabis-law URLs belong to one active database: `official_links.cannabis_law_audit.unified.json`.");
  lines.push("- Visual screenshots, fetched pages, batch reports, old collectors, and old review outputs are not deleted and are not competing databases; they are provenance/source-corpus records indexed by `artifact_catalog.role_applicability.unified.json`.");
  lines.push("- A raw artifact can have several applicability roles, but exactly one primary role and one primary canonical sink for operational reads.");
  lines.push("- Old-source value is preserved by route intelligence and provenance references; accepted data is merged additively into the active role sink rather than copied into another country/source database.");
  lines.push("");
  lines.push("## Active operational database policy");
  lines.push("");
  lines.push("| role family | active database | raw/provenance handling |");
  lines.push("|---|---|---|");
  lines.push("| territory universe, project status snapshot, axis/mismatch projections | `territories.cannabis_law_audit.unified.json` | old country/status/matrix files are catalogued and referenced, not read as competing country databases |");
  lines.push("| official cannabis-law links, source ownership, opened URL attempts | `official_links.cannabis_law_audit.unified.json` | old collectors/search logs/source-corpus files feed link provenance and blocker history |");
  lines.push("| visual proof, fetched PDFs/HTML, screenshots, UI smoke, terminology, progress ledgers | `artifact_catalog.role_applicability.unified.json` | service/provenance catalog only; not a legal-status database |");
  lines.push("");
  lines.push("## One-by-one database inventory");
  lines.push("");
  lines.push("| # | path | primary role | primary sink | applicability roles | rows/key hint | urls | action |");
  lines.push("|---:|---|---|---|---|---:|---:|---|");
  records.forEach((record, index) => {
    lines.push(
      `| ${index + 1} | \`${record.path}\` | ${record.primary_role} | ${record.primary_canonical_sink} | ${record.applicability_roles.join(", ")} | ${record.row_count_hint ?? ""} | ${record.url_literal_count} | ${record.canonical_action} |`,
    );
  });
  lines.push("");
  lines.push("## Operational reading rule");
  lines.push("");
  lines.push("- For countries/territories, read the territories unified database first.");
  lines.push("- For official cannabis-law links, read the official_links unified database first.");
  lines.push("- For screenshots, fetched pages, terminology, source batches, reports, and historical databases, read the artifact catalog applicability inventory as provenance.");
  lines.push("- Do not treat older source-corpus files as separate truth databases; they are input evidence with role/applicability tags.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main() {
  for (const file of [TERRITORIES_DB, OFFICIAL_LINKS_DB, ARTIFACT_CATALOG_DB]) {
    if (!fs.existsSync(file)) {
      throw new Error(`Missing canonical database: ${rel(file)}`);
    }
  }

  const files = SCAN_ROOTS.flatMap((root) => walk(path.join(ROOT, root))).sort();
  const records = files.map(buildCandidateRecord);

  const inventorySummary = {
    generatedAt: GENERATED_AT,
    generatedBy: "tools/wiki_truth_second_pass/consolidate_cannabis_role_databases.mjs",
    no_old_new_split: true,
    deletion_or_shrink_allowed: false,
    scanned_roots: SCAN_ROOTS,
    candidate_extensions: [...DATABASE_EXTENSIONS].sort(),
    total_database_like_files: records.length,
    parse_status_counts: countBy(records, (record) => record.parse_status),
    role_counts: countBy(records, (record) => record.roles),
    primary_role_counts: countBy(records, (record) => record.primary_role),
    applicability_role_counts: countBy(
      records,
      (record) => record.applicability_roles,
    ),
    canonical_sink_counts: countBy(records, (record) => record.canonical_sinks),
    primary_canonical_sink_counts: countBy(
      records,
      (record) => record.primary_canonical_sink,
    ),
    applicability_canonical_sink_counts: countBy(
      records,
      (record) => record.applicability_canonical_sinks,
    ),
    canonical_action_counts: countBy(records, (record) => record.canonical_action),
    canonical_databases: CANONICAL_DATABASES,
    records,
  };

  annotateCanonicalDatabase(TERRITORIES_DB, "territories", inventorySummary);
  annotateCanonicalDatabase(OFFICIAL_LINKS_DB, "official_links", inventorySummary);

  const artifactCatalog = readJson(ARTIFACT_CATALOG_DB);
  const artifactRecordCountBefore = Array.isArray(artifactCatalog.records)
    ? artifactCatalog.records.length
    : null;
  const enrichedArtifactCatalog = enrichArtifactCatalogRecords(artifactCatalog);
  enrichedArtifactCatalog.database_inventory = inventorySummary;
  enrichedArtifactCatalog.database_consolidation = {
    generatedAt: GENERATED_AT,
    generatedBy: "tools/wiki_truth_second_pass/consolidate_cannabis_role_databases.mjs",
    canonical_database_name: "artifact_catalog",
    canonical_role: CANONICAL_DATABASES.artifact_catalog.role,
    meaning: CANONICAL_DATABASES.artifact_catalog.meaning,
    no_old_new_split: true,
    deletion_or_shrink_allowed: false,
    competing_database_policy:
      "raw files stay as immutable provenance; this catalog indexes their role and canonical sink",
  };
  writeJson(ARTIFACT_CATALOG_DB, enrichedArtifactCatalog);
  const artifactCatalogAfter = readJson(ARTIFACT_CATALOG_DB);
  const artifactRecordCountAfter = Array.isArray(artifactCatalogAfter.records)
    ? artifactCatalogAfter.records.length
    : null;
  if (artifactRecordCountBefore !== artifactRecordCountAfter) {
    throw new Error(
      `${rel(ARTIFACT_CATALOG_DB)} record count changed during consolidation: ${artifactRecordCountBefore} -> ${artifactRecordCountAfter}`,
    );
  }

  const canonicalSummaries = [
    summarizeCanonicalDb(TERRITORIES_DB),
    summarizeCanonicalDb(OFFICIAL_LINKS_DB),
    summarizeCanonicalDb(ARTIFACT_CATALOG_DB),
  ];

  fs.writeFileSync(REPORT_MD, renderReport(inventorySummary, canonicalSummaries, records));

  console.log(
    JSON.stringify(
      {
        generatedAt: GENERATED_AT,
        database_like_files_scanned: records.length,
        canonical_databases: canonicalSummaries,
        role_counts: inventorySummary.role_counts,
        canonical_sink_counts: inventorySummary.canonical_sink_counts,
        report: rel(REPORT_MD),
        status_data_changed: false,
        map_colors_changed: false,
        production_touched: false,
        deletion_or_shrink_allowed: false,
      },
      null,
      2,
    ),
  );
}

main();
