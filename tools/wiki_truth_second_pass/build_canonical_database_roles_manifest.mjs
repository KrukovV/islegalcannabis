#!/usr/bin/env node

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
const MANIFEST_JSON = path.join(
  UNIFIED_DIR,
  "canonical_role_database_manifest.json",
);
const MANIFEST_MD = path.join(
  UNIFIED_DIR,
  "canonical_role_database_manifest.md",
);

const ROLE_TO_DATABASE = {
  territory_universe: {
    database: "territories",
    reason:
      "defines the 307-GEO working universe and belongs with territory audit rows",
  },
  project_status_and_map_snapshot: {
    database: "territories",
    reason:
      "read-only project status and map-color snapshots are territory attributes",
  },
  discrepancy_and_axis_analysis: {
    database: "territories",
    reason:
      "status/color differences are comparisons on territory legal axes",
  },
  official_link_registry: {
    database: "official_links",
    reason:
      "official URL ownership and registry membership are URL-level evidence",
  },
  source_corpus: {
    database: "official_links",
    reason:
      "search/open/fetch results describe candidate or accepted official URLs",
  },
  visual_proof: {
    database: "artifact_catalog",
    reason:
      "screenshots and contact sheets prove review but are not legal-status rows",
  },
  terminology_corpus: {
    database: "artifact_catalog",
    reason:
      "cannabis-family vocabulary is discovery metadata, not law evidence by itself",
  },
  ui_render_proof: {
    database: "artifact_catalog",
    reason:
      "render probes and screenshots prove UI behavior, not jurisdiction status",
  },
  preservation_and_progress_ledger: {
    database: "artifact_catalog",
    reason:
      "anti-shrink checkpoints and progress ledgers preserve provenance",
  },
  service_catalog: {
    database: "artifact_catalog",
    reason:
      "catalog/inventory files describe applicability of other artifacts",
  },
};

const ACTIVE_DATABASES = {
  territories: {
    file: rel(TERRITORIES_DB),
    role: "country_territory_status_and_geo_universe",
    active_operational_database: true,
    meaning:
      "the one active 307-GEO country/territory cannabis-law audit database",
  },
  official_links: {
    file: rel(OFFICIAL_LINKS_DB),
    role: "official_cannabis_law_links_and_source_evidence",
    active_operational_database: true,
    meaning:
      "the one active official cannabis-law URL database, preserving multi-role provenance per URL",
  },
  artifact_catalog: {
    file: rel(ARTIFACT_CATALOG_DB),
    role: "provenance_visual_terms_and_database_applicability_catalog",
    active_operational_database: false,
    service_database_required: true,
    meaning:
      "required service/provenance catalog; not a competing territory or official-link database",
  },
};

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

function countRecords(data) {
  if (Array.isArray(data)) return data.length;
  for (const key of ["records", "items", "entries", "rows"]) {
    if (Array.isArray(data?.[key])) return data[key].length;
  }
  return null;
}

function normalizeRoleName(role) {
  return String(role || "")
    .trim()
    .replace(/-/g, "_");
}

function familyForPath(file) {
  if (file.startsWith("artifacts/wiki_truth_second_pass/unified_databases/")) {
    return "canonical_unified_outputs";
  }
  if (file.includes("/search/")) return "per_geo_search_logs";
  if (file.includes("/reviews/")) return "per_geo_manual_visual_reviews";
  if (file.includes("/screenshots/")) return "visual_screenshot_corpus";
  if (file.includes("/fetched_sources/")) return "fetched_source_corpus";
  if (file.includes("/page_checks/")) return "browser_pdf_page_check_artifacts";
  if (file.includes("/thematic_analysis/source_corpus.role_batch_")) {
    return "source_corpus_role_batches";
  }
  if (file.includes("/thematic_analysis/role_bases.")) {
    return "role_base_registry_precursors";
  }
  if (file.includes("direct-cannabis-law-pages")) {
    return "direct_cannabis_law_collector_outputs";
  }
  if (file.includes("official_link_ownership")) return "official_link_ownership";
  if (file.includes("official_domains")) return "official_domain_registry";
  if (file.includes("wiki-truth-cannabis-law-matrix")) {
    return "wiki_truth_matrix_projection";
  }
  if (file.includes("cannabis_law_visual_reviews")) {
    return "visual_review_ledger";
  }
  if (file.includes("query-derived-cannabis-terms")) {
    return "terminology_inventory";
  }
  if (file.includes("status_snapshot") || file.includes("ssot_legality")) {
    return "project_status_snapshot_inputs";
  }
  if (file.startsWith("data/wiki/")) return "wiki_context_inputs";
  if (file.startsWith("data/ssot/")) return "ssot_universe_and_ownership_inputs";
  if (file.startsWith("data/reviews/")) return "review_and_matrix_inputs";
  if (file.startsWith("data/official/")) return "official_registry_inputs";
  return "other_catalogued_database_like_artifacts";
}

function pushCount(map, key, inc = 1) {
  map[key] = (map[key] || 0) + inc;
}

function canonicalAction(entry) {
  return entry.canonical_action || entry.action || "UNKNOWN";
}

const territories = readJson(TERRITORIES_DB);
const officialLinks = readJson(OFFICIAL_LINKS_DB);
const artifactCatalog = readJson(ARTIFACT_CATALOG_DB);
const inventoryContainer = artifactCatalog.database_inventory || {};
const inventory = Array.isArray(inventoryContainer)
  ? inventoryContainer
  : Array.isArray(inventoryContainer.records)
    ? inventoryContainer.records
    : [];

const parseStatusCounts = {};
const actionCounts = {};
const canonicalSinkCounts = {};
const primaryRoleCounts = {};
const applicabilityRoleCounts = {};
const primarySinkCounts = {};
const applicabilitySinkCounts = {};
const familyMap = new Map();

for (const entry of inventory) {
  pushCount(parseStatusCounts, entry.parse_status || "UNKNOWN");
  pushCount(actionCounts, canonicalAction(entry));
  const primaryRole = normalizeRoleName(
    entry.primary_role || (entry.roles || [])[0] || "service_catalog",
  );
  const primarySink =
    entry.primary_canonical_sink || (entry.canonical_sinks || [])[0] || "artifact_catalog";
  pushCount(primaryRoleCounts, primaryRole);
  pushCount(primarySinkCounts, primarySink);
  pushCount(canonicalSinkCounts, primarySink);
  for (const role of entry.applicability_roles || []) {
    pushCount(applicabilityRoleCounts, normalizeRoleName(role));
  }
  for (const sink of entry.applicability_canonical_sinks || []) {
    pushCount(applicabilitySinkCounts, sink);
  }

  const familyId = familyForPath(entry.path || "");
  const family = familyMap.get(familyId) || {
    family: familyId,
    source_file_count: 0,
    roles: {},
    applicability_roles: {},
    canonical_sinks: {},
    applicability_canonical_sinks: {},
    actions: {},
    sample_paths: [],
  };

  family.source_file_count += 1;
  pushCount(family.roles, primaryRole);
  pushCount(family.canonical_sinks, primarySink);
  for (const role of entry.applicability_roles || []) {
    pushCount(family.applicability_roles, normalizeRoleName(role));
  }
  for (const sink of entry.applicability_canonical_sinks || []) {
    pushCount(family.applicability_canonical_sinks, sink);
  }
  pushCount(family.actions, canonicalAction(entry));
  if (family.sample_paths.length < 8) family.sample_paths.push(entry.path);
  familyMap.set(familyId, family);
}

const canonicalDatabases = Object.entries(ACTIVE_DATABASES).map(
  ([id, config]) => {
    const data =
      id === "territories"
        ? territories
        : id === "official_links"
          ? officialLinks
          : artifactCatalog;

    return {
      id,
      ...config,
      records: countRecords(data),
      source_counts: data.counts || null,
      receives_roles: Object.entries(ROLE_TO_DATABASE)
        .filter(([, role]) => role.database === id)
        .map(([role]) => role),
    };
  },
);

const roleMappings = Object.entries(ROLE_TO_DATABASE).map(([role, config]) => ({
  role,
  canonical_database: config.database,
  reason: config.reason,
}));

const families = [...familyMap.values()]
  .map((family) => ({
    ...family,
    roles: Object.fromEntries(Object.entries(family.roles).sort()),
    applicability_roles: Object.fromEntries(
      Object.entries(family.applicability_roles).sort(),
    ),
    canonical_sinks: Object.fromEntries(
      Object.entries(family.canonical_sinks).sort(),
    ),
    applicability_canonical_sinks: Object.fromEntries(
      Object.entries(family.applicability_canonical_sinks).sort(),
    ),
    actions: Object.fromEntries(Object.entries(family.actions).sort()),
  }))
  .sort((a, b) => {
    const byCount = b.source_file_count - a.source_file_count;
    return byCount || a.family.localeCompare(b.family);
  });

const unknownRoles = new Set();
for (const entry of inventory) {
  for (const role of [
    entry.primary_role || (entry.roles || [])[0],
    ...(entry.applicability_roles || []),
  ]) {
    const normalized = normalizeRoleName(role);
    if (!ROLE_TO_DATABASE[normalized]) unknownRoles.add(role);
  }
}

const manifest = {
  schemaVersion: "1.0.0",
  generatedAt: GENERATED_AT,
  purpose:
    "Canonical role manifest proving that old/new database fragments are consolidated by role into one territory database, one official-link database, and one required service provenance catalog.",
  no_old_new_split: true,
  deletion_or_shrink_allowed: false,
  status_data_changed: false,
  map_colors_changed: false,
  production_touched: false,
  active_operational_databases: canonicalDatabases.filter(
    (db) => db.active_operational_database,
  ).length,
  required_service_databases: canonicalDatabases.filter(
    (db) => db.service_database_required,
  ).length,
  canonical_databases: canonicalDatabases,
  role_to_canonical_database: roleMappings,
  database_like_corpus: {
    scanned_files: inventory.length,
    parse_status_counts: parseStatusCounts,
    primary_role_counts: primaryRoleCounts,
    applicability_role_counts: applicabilityRoleCounts,
    canonical_sink_counts: canonicalSinkCounts,
    primary_canonical_sink_counts: primarySinkCounts,
    applicability_canonical_sink_counts: applicabilitySinkCounts,
    action_counts: actionCounts,
    non_active_provenance_files: inventory.filter(
      (entry) => canonicalAction(entry) !== "canonical_primary_database",
    ).length,
    canonical_primary_database_files: inventory.filter(
      (entry) => canonicalAction(entry) === "canonical_primary_database",
    ).length,
    family_count: families.length,
  },
  source_families: families,
  unknown_or_unmapped_roles: [...unknownRoles].sort(),
  anti_shrink_statement:
    "Raw old and intermediate databases remain preserved as provenance inputs; active projection must read the canonical role databases instead of treating historical batches as competing country/link databases.",
};

writeJson(MANIFEST_JSON, manifest);

const md = [
  "# Canonical role database manifest",
  "",
  `Generated: ${GENERATED_AT}`,
  "",
  "## Active contract",
  "",
  "- No old/new split: historical files are inputs by role, not competing active bases.",
  "- Active operational databases are limited to one territory database and one official-link database.",
  "- The artifact catalog is retained only because screenshots, terms, reports, and provenance need a service index.",
  "- No evidence files are deleted or shrunk by this manifest.",
  "- Status data, map colors, and production outputs are unchanged.",
  "",
  "## Canonical databases",
  "",
  "| Database | Active operational? | Service? | Records | Role | File |",
  "| --- | --- | --- | ---: | --- | --- |",
  ...canonicalDatabases.map(
    (db) =>
      `| ${db.id} | ${db.active_operational_database ? "yes" : "no"} | ${db.service_database_required ? "yes" : "no"} | ${db.records ?? ""} | ${db.role} | \`${db.file}\` |`,
  ),
  "",
  "## Role routing",
  "",
  "| Role | Canonical database | Why |",
  "| --- | --- | --- |",
  ...roleMappings.map(
    (mapping) =>
      `| ${mapping.role} | ${mapping.canonical_database} | ${mapping.reason} |`,
  ),
  "",
  "## Database-like corpus already analyzed",
  "",
  `- database_like_files_scanned: ${manifest.database_like_corpus.scanned_files}`,
  `- canonical_primary_database_files: ${manifest.database_like_corpus.canonical_primary_database_files}`,
  `- non_active_provenance_files: ${manifest.database_like_corpus.non_active_provenance_files}`,
  `- source_family_count: ${manifest.database_like_corpus.family_count}`,
  `- parse_status_counts: ${JSON.stringify(parseStatusCounts)}`,
  `- primary_role_counts: ${JSON.stringify(primaryRoleCounts)}`,
  `- primary_canonical_sink_counts: ${JSON.stringify(primarySinkCounts)}`,
  `- applicability_role_counts: ${JSON.stringify(applicabilityRoleCounts)}`,
  `- action_counts: ${JSON.stringify(actionCounts)}`,
  "",
  "## Source families consolidated into canonical roles",
  "",
  "| Family | Files | Primary sinks | Primary roles | Applicability roles | Sample paths |",
  "| --- | ---: | --- | --- | --- | --- |",
  ...families.map((family) => {
    const sinks = Object.entries(family.canonical_sinks)
      .map(([key, count]) => `${key}:${count}`)
      .join(", ");
    const roles = Object.entries(family.roles)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([key, count]) => `${key}:${count}`)
      .join(", ");
    const applicability = Object.entries(family.applicability_roles)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([key, count]) => `${key}:${count}`)
      .join(", ");
    const samples = family.sample_paths.map((p) => `\`${p}\``).join("<br>");
    return `| ${family.family} | ${family.source_file_count} | ${sinks} | ${roles} | ${applicability} | ${samples} |`;
  }),
  "",
  "## Unmapped roles",
  "",
  unknownRoles.size
    ? [...unknownRoles].sort().map((role) => `- ${role}`).join("\n")
    : "- none",
  "",
  "## Preservation note",
  "",
  manifest.anti_shrink_statement,
  "",
].join("\n");

fs.writeFileSync(MANIFEST_MD, md);

console.log(
  JSON.stringify(
    {
      manifest_json: rel(MANIFEST_JSON),
      manifest_md: rel(MANIFEST_MD),
      active_operational_databases: manifest.active_operational_databases,
      required_service_databases: manifest.required_service_databases,
      database_like_files_scanned: inventory.length,
      non_active_provenance_files:
        manifest.database_like_corpus.non_active_provenance_files,
      source_family_count: manifest.database_like_corpus.family_count,
      unknown_or_unmapped_roles: manifest.unknown_or_unmapped_roles.length,
      status_data_changed: false,
      map_colors_changed: false,
      production_touched: false,
      deletion_or_shrink_allowed: false,
    },
    null,
    2,
  ),
);
