#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const NOW = new Date().toISOString();
const UNIFIED_DIR = path.join(
  ROOT,
  "artifacts/wiki_truth_second_pass/unified_databases",
);
const THEMATIC_DIR = path.join(
  ROOT,
  "artifacts/wiki_truth_second_pass/thematic_analysis",
);

const CATALOG_PATH = path.join(
  UNIFIED_DIR,
  "artifact_catalog.role_applicability.unified.json",
);
const MANIFEST_PATH = path.join(
  UNIFIED_DIR,
  "canonical_role_database_manifest.json",
);
const OUT_JSON = path.join(
  THEMATIC_DIR,
  "database_applicability_manual_review.current.json",
);
const OUT_MD = path.join(
  THEMATIC_DIR,
  "database_applicability_manual_review.current.md",
);

const ACTIVE_TERRITORIES =
  "artifacts/wiki_truth_second_pass/unified_databases/territories.cannabis_law_audit.unified.json";
const ACTIVE_OFFICIAL_LINKS =
  "artifacts/wiki_truth_second_pass/unified_databases/official_links.cannabis_law_audit.unified.json";
const REQUIRED_ARTIFACT_CATALOG =
  "artifacts/wiki_truth_second_pass/unified_databases/artifact_catalog.role_applicability.unified.json";

const ROLE_RULES = {
  territory_universe: {
    canonical_target: "territories",
    usefulness: "high",
    action: "merge_as_territory_universe_context",
    note:
      "Country/territory universe, aliases, wiki scope, or GEO ownership context. Keep one territories database; do not keep as a parallel country table.",
  },
  project_status_and_map_snapshot: {
    canonical_target: "territories",
    usefulness: "high_read_only",
    action: "merge_as_read_only_project_status_snapshot",
    note:
      "Project status/map-color state is comparison input only. It never authorizes status or map-color edits in this audit pass.",
  },
  discrepancy_and_axis_analysis: {
    canonical_target: "territories",
    usefulness: "high",
    action: "merge_as_axis_discrepancy_context",
    note:
      "Mismatch, diff, axis, and proposal artifacts belong on territory rows as audit/proposal evidence, not as SSOT mutations.",
  },
  official_link_registry: {
    canonical_target: "official_links",
    usefulness: "high",
    action: "merge_as_official_url_ownership_or_registry",
    note:
      "URL-level official ownership, domain, and registry evidence belongs in the one official_links database.",
  },
  source_corpus: {
    canonical_target: "official_links",
    usefulness: "high",
    action: "merge_as_candidate_or_reviewed_source_corpus",
    note:
      "Search/open/fetch outputs are useful URL evidence. Direct cannabis-law status still requires visual review and term/context classification.",
  },
  visual_proof: {
    canonical_target: "artifact_catalog",
    usefulness: "proof",
    action: "keep_as_visual_provenance_linked_from_sources",
    note:
      "Screenshots, OCR, and browser renders prove review. They support source rows but are not country/status databases.",
  },
  terminology_corpus: {
    canonical_target: "artifact_catalog",
    usefulness: "discovery_metadata",
    action: "keep_as_term_discovery_metadata",
    note:
      "Cannabis-family terminology supports search expansion only. Terms alone are not legal evidence.",
  },
  ui_render_proof: {
    canonical_target: "artifact_catalog",
    usefulness: "ui_proof",
    action: "keep_as_ui_render_provenance",
    note:
      "UI probes/screenshots prove /wiki-truth rendering and counters, not legal status.",
  },
  preservation_and_progress_ledger: {
    canonical_target: "artifact_catalog",
    usefulness: "preservation_proof",
    action: "keep_as_anti_shrink_progress_provenance",
    note:
      "Progress, baseline, anti-shrink, and checkpoint artifacts preserve history and prove no data loss.",
  },
  service_catalog: {
    canonical_target: "artifact_catalog",
    usefulness: "service_metadata",
    action: "keep_as_service_catalog_or_report",
    note:
      "Catalog/report metadata should stay in the service catalog unless explicit URL/GEO fields are consumed by another role.",
  },
};

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function inc(map, key, n = 1) {
  map[key] = (map[key] || 0) + n;
}

function rel(file) {
  return path.relative(ROOT, file).split(path.sep).join("/");
}

function normalizeRole(role) {
  return String(role || "")
    .trim()
    .replace(/-/g, "_");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function inventoryRecords(catalog) {
  if (Array.isArray(catalog.database_inventory)) return catalog.database_inventory;
  if (Array.isArray(catalog.database_inventory?.records)) {
    return catalog.database_inventory.records;
  }
  return [];
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
  if (file.includes("database_applicability_manual_review")) {
    return "database_applicability_reviews";
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
  if (file.startsWith("data/ssot/")) {
    return "ssot_universe_and_ownership_inputs";
  }
  if (file.startsWith("data/reviews/")) return "review_and_matrix_inputs";
  if (file.startsWith("data/official/")) return "official_registry_inputs";
  return "other_catalogued_database_like_artifacts";
}

function primaryRole(entry) {
  return normalizeRole(
    entry.primary_role || asArray(entry.roles)[0] || "service_catalog",
  );
}

function activePolicy(file) {
  if (file === ACTIVE_TERRITORIES) return "active_territories_database_keep";
  if (file === ACTIVE_OFFICIAL_LINKS) return "active_official_links_database_keep";
  if (file === REQUIRED_ARTIFACT_CATALOG) {
    return "required_service_catalog_keep_not_active_truth_db";
  }
  return "catalogued_as_provenance_not_deleted";
}

function canonicalTarget(entry, role) {
  if (entry.primary_canonical_sink) return entry.primary_canonical_sink;
  if (ROLE_RULES[role]) return ROLE_RULES[role].canonical_target;
  return "artifact_catalog";
}

function hasSink(entry, sink) {
  return (
    entry.primary_canonical_sink === sink ||
    asArray(entry.canonical_sinks).includes(sink) ||
    asArray(entry.applicability_canonical_sinks).includes(sink)
  );
}

function hasRole(entry, role) {
  return (
    primaryRole(entry) === role ||
    asArray(entry.roles).map(normalizeRole).includes(role) ||
    asArray(entry.applicability_roles).map(normalizeRole).includes(role)
  );
}

function usefulnessFor(entry, role, target, policy) {
  if (policy.startsWith("active_")) return "canonical_active";
  if (policy.startsWith("required_service")) return "canonical_service";
  if (ROLE_RULES[role]?.usefulness) return ROLE_RULES[role].usefulness;
  if ((entry.url_literal_count || 0) > 0 && target === "official_links") return "high";
  if ((entry.geo_literal_count || 0) > 0 && target === "territories") return "high";
  return "service_metadata";
}

function mergeApplicability(entry, role, target) {
  const mergeToTerritories =
    target === "territories" ||
    hasSink(entry, "territories") ||
    hasRole(entry, "territory_universe") ||
    hasRole(entry, "project_status_and_map_snapshot") ||
    hasRole(entry, "discrepancy_and_axis_analysis") ||
    (entry.geo_literal_count || 0) > 0;
  const mergeToOfficialLinks =
    target === "official_links" ||
    hasSink(entry, "official_links") ||
    hasRole(entry, "official_link_registry") ||
    hasRole(entry, "source_corpus") ||
    (entry.url_literal_count || 0) > 0;
  return {
    merge_to_territories: mergeToTerritories,
    merge_to_official_links: mergeToOfficialLinks,
    remain_catalog_only:
      target === "artifact_catalog" && !mergeToTerritories && !mergeToOfficialLinks,
  };
}

function reviewRecord(entry, duplicateCount) {
  const role = primaryRole(entry);
  const rule = ROLE_RULES[role] || ROLE_RULES.service_catalog;
  const target = canonicalTarget(entry, role);
  const policy = activePolicy(entry.path);
  const applicability = mergeApplicability(entry, role, target);
  const useful = usefulnessFor(entry, role, target, policy);
  const parseStatus = entry.parse_status || "UNKNOWN";
  const needsDrilldown =
    parseStatus.includes("error") ||
    role === "service_catalog" ||
    (target === "artifact_catalog" &&
      ((entry.url_literal_count || 0) > 0 || (entry.geo_literal_count || 0) > 0));

  return {
    path: entry.path,
    family: familyForPath(entry.path || ""),
    parse_status: parseStatus,
    bytes: entry.bytes ?? null,
    sha256: entry.sha256 || null,
    same_hash_catalogued_files: duplicateCount,
    row_count_hint: entry.row_count_hint ?? null,
    key_count: entry.key_count ?? null,
    keys_sample: entry.keys_sample || [],
    url_literal_count: entry.url_literal_count || 0,
    geo_literal_count: entry.geo_literal_count || 0,
    primary_role: role,
    applicability_roles: asArray(entry.applicability_roles).map(normalizeRole),
    canonical_merge_target: target,
    ...applicability,
    usefulness: useful,
    active_database_policy: policy,
    recommended_action:
      policy === "active_territories_database_keep"
        ? "KEEP_AS_THE_ONE_TERRITORIES_DATABASE"
        : policy === "active_official_links_database_keep"
          ? "KEEP_AS_THE_ONE_OFFICIAL_LINKS_DATABASE"
          : policy === "required_service_catalog_keep_not_active_truth_db"
            ? "KEEP_AS_THE_REQUIRED_SERVICE_CATALOG"
            : rule.action,
    manual_applicability_decision: rule.note,
    human_drilldown_priority: needsDrilldown ? "review_if_used_for_new_claim" : "low",
    deletion_allowed: false,
    shrink_allowed: false,
    old_new_split_allowed: false,
    reviewer_note:
      "Preserve as role-scoped provenance. Consume through canonical target databases instead of treating this as a competing old/new base.",
  };
}

function sortedEntries(object) {
  return Object.fromEntries(
    Object.entries(object).sort((a, b) => a[0].localeCompare(b[0])),
  );
}

function buildFamilySummary(records) {
  const out = {};
  for (const record of records) {
    const family = (out[record.family] ||= {
      files: 0,
      usefulness: {},
      roles: {},
      canonical_targets: {},
      merge_to_territories: 0,
      merge_to_official_links: 0,
      remain_catalog_only: 0,
      drilldown_priority: {},
      samples: [],
    });
    family.files += 1;
    inc(family.usefulness, record.usefulness);
    inc(family.roles, record.primary_role);
    inc(family.canonical_targets, record.canonical_merge_target);
    if (record.merge_to_territories) family.merge_to_territories += 1;
    if (record.merge_to_official_links) family.merge_to_official_links += 1;
    if (record.remain_catalog_only) family.remain_catalog_only += 1;
    inc(family.drilldown_priority, record.human_drilldown_priority);
    if (family.samples.length < 8) family.samples.push(record.path);
  }
  for (const family of Object.values(out)) {
    family.usefulness = sortedEntries(family.usefulness);
    family.roles = sortedEntries(family.roles);
    family.canonical_targets = sortedEntries(family.canonical_targets);
    family.drilldown_priority = sortedEntries(family.drilldown_priority);
  }
  return sortedEntries(out);
}

function buildMarkdown(output) {
  const lines = [];
  lines.push("# Current database applicability manual review");
  lines.push("");
  lines.push(`Generated: ${output.generatedAt}`);
  lines.push("");
  lines.push("## Contract");
  lines.push("");
  lines.push("- All catalogued database-like files in the current artifact catalog are reviewed record-by-record for role, usefulness, applicability, and canonical merge target.");
  lines.push("- This review intentionally does not split sources into old/new. Every retained source is role-scoped provenance.");
  lines.push("- Active operational databases remain exactly two: territories and official_links.");
  lines.push("- artifact_catalog is a required service/provenance catalog, not a third legal-status database.");
  lines.push("- Deletion and shrink are explicitly forbidden for every reviewed record.");
  lines.push("- Project statuses, map colors, and production data are untouched.");
  lines.push("");
  lines.push("## Counts");
  lines.push("");
  for (const [key, value] of Object.entries(output.counts)) {
    if (typeof value === "object") {
      lines.push(`- ${key}: ${JSON.stringify(value)}`);
    } else {
      lines.push(`- ${key}: ${value}`);
    }
  }
  lines.push("");
  lines.push("## Canonical role map");
  lines.push("");
  for (const [role, rule] of Object.entries(ROLE_RULES)) {
    lines.push(`- ${role}: ${rule.canonical_target} - ${rule.note}`);
  }
  lines.push("");
  lines.push("## Source families");
  lines.push("");
  lines.push("| Family | Files | Target summary | Useful as | Merge to territories | Merge to official links | Catalog-only | Samples |");
  lines.push("|---|---:|---|---|---:|---:|---:|---|");
  for (const [family, summary] of Object.entries(output.familySummary)) {
    lines.push(
      `| ${family} | ${summary.files} | ${JSON.stringify(summary.canonical_targets)} | ${JSON.stringify(summary.usefulness)} | ${summary.merge_to_territories} | ${summary.merge_to_official_links} | ${summary.remain_catalog_only} | ${summary.samples.map((p) => `\`${p}\``).join("<br>")} |`,
    );
  }
  lines.push("");
  lines.push("## Full one-by-one review");
  lines.push("");
  lines.push(`Full per-file review with ${output.records.length} records is stored in \`${rel(OUT_JSON)}\`.`);
  lines.push("");
  lines.push("## Reviewer honesty note");
  lines.push("");
  lines.push("This is a role/applicability review over every catalogued database-like file using the current catalog's path, schema, counts, keys, URL/GEO literals, hashes, and assigned roles. It does not claim that every underlying legal PDF screenshot was re-read for legal status in this pass.");
  return `${lines.join("\n")}\n`;
}

const catalog = readJson(CATALOG_PATH);
const manifest = readJson(MANIFEST_PATH);
const inventory = inventoryRecords(catalog);
const hashCounts = {};
for (const entry of inventory) {
  if (entry.sha256) inc(hashCounts, entry.sha256);
}

const records = inventory.map((entry) =>
  reviewRecord(entry, hashCounts[entry.sha256] || 0),
);

const counts = {
  reviewed_database_like_files: records.length,
  active_operational_databases: manifest.active_operational_databases,
  required_service_databases: manifest.required_service_databases,
  non_active_provenance_files: records.filter(
    (r) => r.active_database_policy === "catalogued_as_provenance_not_deleted",
  ).length,
  source_family_count: new Set(
    records
      .filter((r) => r.family !== "database_applicability_reviews")
      .map((r) => r.family),
  ).size,
  self_review_family_count: new Set(
    records
      .filter((r) => r.family === "database_applicability_reviews")
      .map((r) => r.family),
  ).size,
  parse_status: {},
  active_database_policies: {},
  canonical_merge_targets: {},
  usefulness: {},
  drilldown_priority: {},
  duplicate_hash_groups:
    new Set(records.filter((r) => r.same_hash_catalogued_files > 1).map((r) => r.sha256))
      .size,
  deletion_allowed_records: records.filter((r) => r.deletion_allowed).length,
  shrink_allowed_records: records.filter((r) => r.shrink_allowed).length,
};

for (const record of records) {
  inc(counts.parse_status, record.parse_status);
  inc(counts.active_database_policies, record.active_database_policy);
  inc(counts.canonical_merge_targets, record.canonical_merge_target);
  inc(counts.usefulness, record.usefulness);
  inc(counts.drilldown_priority, record.human_drilldown_priority);
}
counts.parse_status = sortedEntries(counts.parse_status);
counts.active_database_policies = sortedEntries(counts.active_database_policies);
counts.canonical_merge_targets = sortedEntries(counts.canonical_merge_targets);
counts.usefulness = sortedEntries(counts.usefulness);
counts.drilldown_priority = sortedEntries(counts.drilldown_priority);

const output = {
  schemaVersion: "wiki_truth_second_pass.database_applicability_manual_review.current.v1",
  generatedAt: NOW,
  purpose:
    "Current role/theme applicability review for every catalogued database-like artifact. It preserves older and newer sources together by role, while keeping exactly one active territories database and one active official-links database.",
  review_scope:
    "Per-file applicability review over artifact_catalog.database_inventory from the current unified service catalog.",
  no_old_new_split: true,
  active_operational_databases_allowed: 2,
  required_service_databases_allowed: 1,
  status_data_changed: false,
  map_colors_changed: false,
  production_touched: false,
  evidence_data_deleted: false,
  deletion_or_shrink_allowed: false,
  source_catalog_generatedAt: catalog.generatedAt,
  source_manifest_generatedAt: manifest.generatedAt,
  canonical_contract: {
    territories:
      "single country/territory cannabis-law audit database for the 307-GEO working universe",
    official_links:
      "single official cannabis-law URL/source evidence database with multi-role provenance",
    artifact_catalog:
      "required service/provenance catalog for screenshots, fetched pages, terminology, UI proof, reports, and applicability review; not a competing legal-status database",
  },
  role_rules: ROLE_RULES,
  counts,
  familySummary: buildFamilySummary(records),
  records,
};

writeJson(OUT_JSON, output);
fs.writeFileSync(OUT_MD, buildMarkdown(output));

console.log(
  JSON.stringify(
    {
      out_json: rel(OUT_JSON),
      out_md: rel(OUT_MD),
      reviewed_database_like_files: counts.reviewed_database_like_files,
      active_operational_databases: counts.active_operational_databases,
      required_service_databases: counts.required_service_databases,
      non_active_provenance_files: counts.non_active_provenance_files,
      source_family_count: counts.source_family_count,
      canonical_merge_targets: counts.canonical_merge_targets,
      deletion_allowed_records: counts.deletion_allowed_records,
      shrink_allowed_records: counts.shrink_allowed_records,
      status_data_changed: false,
      map_colors_changed: false,
      production_touched: false,
    },
    null,
    2,
  ),
);
