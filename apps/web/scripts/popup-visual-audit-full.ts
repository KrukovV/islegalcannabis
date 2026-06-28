import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { buildCardIndexSnapshot } from "../src/new-map/countrySource";

type AuditRow = {
  id: string;
  code?: string;
  name: string;
  type: string;
  processed?: boolean;
  coverage_class?:
    | "individual_article"
    | "substantive_article"
    | "stub_lead_only"
    | "redirect_parent"
    | "root_only"
    | "no_individual_wiki_page"
    | "synthetic_no_wiki"
    | "resolver_failed";
  low_coverage_reason?: string | null;
  source_kind?: "dedicated_profile" | "fallback_wikipedia_source" | "root_legality_source" | "no_wiki_source";
  artifact_dir?: string;
  wiki_page: string | null;
  popup_screenshot: string | null;
  project_popup_screenshot?: string | null;
  wiki_fullpage_screenshot: string | null;
  project_popup_text?: string | null;
  project_popup_json?: string | null;
  wiki_text_snapshot?: string | null;
  wiki_html_snapshot?: string | null;
  wiki_json_snapshot?: string | null;
  wiki_sections_found: string[];
  popup_sections_found: string[];
  wiki_sections?: string[];
  popup_sections?: string[];
  source_trace_errors?: string[];
  before_sections?: number | null;
  after_sections?: number | null;
  extracted_sections?: string[];
  skipped_reason?: string | null;
  mismatches?: string[];
  regressions?: string[];
  missing_sections: string[];
  misplaced_content: string[];
  repeated_text: string[];
  boilerplate_detected: string[];
  status_mismatch: boolean;
  color_mismatch: boolean;
  raw_urls: string[];
  changed_files: string[];
  notes: string[];
};

type AuditManifest = {
  generatedAt: string;
  datasetTotal: number;
  total_geo_count?: number;
  processed_geo_count?: number;
  total: number;
  order: string;
  batchOffset: number;
  batchLimit: number | null;
  popupCaptured: number;
  wikiCaptured: number;
  coverage_summary?: Record<string, number>;
  rows: AuditRow[];
};

function repoRoot() {
  return path.resolve(process.cwd(), "..", "..");
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function resolveAuditTotal() {
  const envTotal = Number(process.env.NEW_MAP_POPUP_VISUAL_AUDIT_TOTAL || 0);
  if (Number.isFinite(envTotal) && envTotal > 0) return Math.floor(envTotal);
  const cardIndex = buildCardIndexSnapshot();
  return Object.values(cardIndex).filter((entry) => {
    const geo = String(entry?.geo || "").toUpperCase();
    const type = String(entry?.type || "").toLowerCase();
    return /^US-[A-Z]{2}$/.test(geo) ? type === "state" : type === "country" && (/^[A-Z]{2}$/.test(geo) || /^[A-Z]{3}$/.test(geo));
  }).length;
}

function rewriteArtifactPath(value: string | null | undefined, archiveBase: string) {
  const normalized = String(value || "").trim();
  if (!normalized) return normalized || null;
  if (path.isAbsolute(normalized)) return normalized;
  return path.join(archiveBase, normalized.replace(/^Artifacts\//, ""));
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

function resolveExistingPath(root: string, value: string | null | undefined) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  if (path.isAbsolute(normalized)) return normalized;
  return path.join(root, normalized);
}

function resolveBaselineManifestPath() {
  const envPath = String(process.env.NEW_MAP_POPUP_VISUAL_AUDIT_BASELINE_MANIFEST || "").trim();
  const home = String(process.env.HOME || "").trim();
  const candidates = [
    envPath,
    home ? path.join(home, "islegalcannabis_archive", "20260626-artifacts", "popup-visual-audit", "full-manifest.json") : ""
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function buildBaselineSectionMap() {
  const baselinePath = resolveBaselineManifestPath();
  if (!baselinePath) return new Map<string, number>();
  try {
    const manifest = readJson<AuditManifest>(baselinePath);
    return new Map(
      (manifest.rows || []).map((row) => [String(row.id || "").toUpperCase(), Array.isArray(row.popup_sections_found) ? row.popup_sections_found.length : 0] as const)
    );
  } catch {
    return new Map<string, number>();
  }
}

function deriveSourceTraceErrors(root: string, row: AuditRow) {
  const errors: string[] = [];
  const popupSections = row.popup_sections_found || [];
  const wikiSections = row.wiki_sections_found || [];
  if (popupSections.length > 0 && !row.wiki_page) errors.push("SOURCE_PAGE_MISSING");
  if (popupSections.length > 0 && (!row.source_kind || row.source_kind === "no_wiki_source")) errors.push("SOURCE_KIND_MISSING");
  if (row.coverage_class === "individual_article" && popupSections.length > 0 && wikiSections.length === 0) {
    errors.push("SOURCE_SECTION_MISSING");
  }
  const popupJsonPath = resolveExistingPath(root, row.project_popup_json);
  if (popupSections.length > 0 && popupJsonPath && fs.existsSync(popupJsonPath)) {
    try {
      const popupSnapshot = readJson<{ source_links?: Array<{ href?: string | null }> }>(popupJsonPath);
      const wikiLinks = (popupSnapshot.source_links || []).filter((item) => /wikipedia\.org\/wiki\//i.test(String(item?.href || "")));
      if (row.source_kind === "dedicated_profile" && wikiLinks.length === 0) {
        errors.push("SECTION_SOURCE_LINK_MISSING");
      }
    } catch {
      errors.push("POPUP_JSON_UNREADABLE");
    }
  }
  return stableUnique(errors);
}

function deriveMismatches(row: AuditRow) {
  return stableUnique([
    ...(row.missing_sections || []).map((item) => `missing:${item}`),
    ...(row.misplaced_content || []).map((item) => `misplaced:${item}`),
    ...(row.repeated_text || []).map((item) => `repeat:${item}`),
    ...(row.raw_urls || []).map((item) => `raw-url:${item}`),
    ...(row.source_trace_errors || []).map((item) => `source-trace:${item}`),
    ...(row.status_mismatch ? ["status-mismatch"] : []),
    ...(row.color_mismatch ? ["color-mismatch"] : [])
  ]);
}

function deriveRegressions(row: AuditRow) {
  const regressions: string[] = [];
  if (typeof row.before_sections === "number" && typeof row.after_sections === "number" && row.after_sections < row.before_sections) {
    regressions.push(`SECTION_COUNT_DROP:${row.before_sections}->${row.after_sections}`);
  }
  return stableUnique(regressions);
}

function deriveSparseCoverageReason(row: AuditRow) {
  if (row.low_coverage_reason) return row.low_coverage_reason;
  const popupSectionsFound = row.popup_sections_found || [];
  const wikiSectionsFound = row.wiki_sections_found || [];
  const missingSections = row.missing_sections || [];
  const coverageClass = row.coverage_class || "resolver_failed";
  const sourceKind = row.source_kind || "no_wiki_source";
  const hasComparableCannabisProfile = sourceKind === "dedicated_profile";
  if (popupSectionsFound.length > 1) return null;

  if (coverageClass === "substantive_article") {
    if (!hasComparableCannabisProfile) {
      return "Fallback territory/parent article is not cannabis-specific, so popup stays at law/source-only coverage.";
    }
    if (wikiSectionsFound.length <= 1) {
      return "Source article exposes only limited cannabis-specific structured sections for this geo.";
    }
    if (missingSections.length > 0) {
      return "Source article has additional structured sections that are not yet surfaced in the popup.";
    }
    return "Structured source coverage is still too thin to support more than one popup section without speculation.";
  }

  if (coverageClass === "individual_article") {
    if (missingSections.length > 0) {
      return "Dedicated cannabis article has additional structured sections that are not yet surfaced in the popup.";
    }
    if (wikiSectionsFound.length <= 1) {
      return "Dedicated cannabis article currently yields only one structured section.";
    }
    return "Dedicated cannabis article is present, but extracted facts still collapse into one popup section.";
  }

  return null;
}

function normalizeRow(root: string, baselineSectionsByGeo: Map<string, number>, row: AuditRow): AuditRow {
  const next = { ...row };
  next.low_coverage_reason = deriveSparseCoverageReason(next);
  next.code = next.id;
  next.project_popup_screenshot = next.popup_screenshot;
  next.popup_sections = [...(next.popup_sections_found || [])];
  next.wiki_sections = [...(next.wiki_sections_found || [])];
  next.extracted_sections = [...(next.popup_sections_found || [])];
  next.skipped_reason = next.low_coverage_reason;
  next.before_sections = baselineSectionsByGeo.get(String(next.id || "").toUpperCase()) ?? null;
  next.after_sections = (next.popup_sections_found || []).length;
  next.source_trace_errors = deriveSourceTraceErrors(root, next);
  next.mismatches = deriveMismatches(next);
  next.regressions = deriveRegressions(next);
  const notes = new Set(next.notes || []);
  if (next.low_coverage_reason) notes.add(`LOW_COVERAGE:${next.low_coverage_reason}`);
  next.notes = Array.from(notes);
  return next;
}

function applyArchiveBase(row: AuditRow, archiveBase: string): AuditRow {
  if (!archiveBase) return row;
  return {
    ...row,
    artifact_dir: rewriteArtifactPath(row.artifact_dir, archiveBase) || row.artifact_dir,
    popup_screenshot: rewriteArtifactPath(row.popup_screenshot, archiveBase) || row.popup_screenshot,
    project_popup_screenshot: rewriteArtifactPath(row.project_popup_screenshot || row.popup_screenshot, archiveBase) || row.project_popup_screenshot || row.popup_screenshot,
    wiki_fullpage_screenshot: rewriteArtifactPath(row.wiki_fullpage_screenshot, archiveBase) || row.wiki_fullpage_screenshot,
    project_popup_text: rewriteArtifactPath(row.project_popup_text, archiveBase) || row.project_popup_text,
    project_popup_json: rewriteArtifactPath(row.project_popup_json, archiveBase) || row.project_popup_json,
    wiki_text_snapshot: rewriteArtifactPath(row.wiki_text_snapshot, archiveBase) || row.wiki_text_snapshot,
    wiki_html_snapshot: rewriteArtifactPath(row.wiki_html_snapshot, archiveBase) || row.wiki_html_snapshot,
    wiki_json_snapshot: rewriteArtifactPath(row.wiki_json_snapshot, archiveBase) || row.wiki_json_snapshot
  };
}

function renderHtmlIndex(rows: AuditRow[], summary: AuditManifest) {
  const linkHref = (value: string | null | undefined) => {
    const normalized = String(value || "").trim();
    if (!normalized) return "";
    if (normalized.startsWith("file://")) return normalized;
    if (path.isAbsolute(normalized)) return `file://${normalized}`;
    return `../../${normalized}`;
  };
  const summaryCards = [
    ["Dataset total", summary.datasetTotal],
    ["Processed", summary.processed_geo_count || rows.length],
    ["Popup captured", summary.popupCaptured],
    ["Wiki captured", summary.wikiCaptured],
    ["Sparse <=1 section", rows.filter((row) => (row.popup_sections_found || []).length <= 1).length],
    ["Regressions", rows.filter((row) => (row.regressions || []).length > 0).length]
  ]
    .map(
      ([label, value]) =>
        `<div class="card"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div></div>`
    )
    .join("");
  const tableRows = rows
    .map((row) => {
      const mismatches = row.mismatches || [];
      const regressions = (row.regressions || []).join(" | ");
      const projectShot = row.popup_screenshot ? `<a href="${escapeHtml(linkHref(row.popup_screenshot))}">popup</a>` : "";
      const wikiShot = row.wiki_fullpage_screenshot ? `<a href="${escapeHtml(linkHref(row.wiki_fullpage_screenshot))}">wiki</a>` : "";
      const artifactDir = row.artifact_dir ? `<a href="${escapeHtml(linkHref(row.artifact_dir))}">artifacts</a>` : "";
      return `<tr>
        <td>${escapeHtml(row.id)}</td>
        <td>${escapeHtml(row.name)}</td>
        <td>${escapeHtml(row.coverage_class || "")}</td>
        <td>${escapeHtml(`${row.before_sections ?? "-"} -> ${row.after_sections ?? "-"}`)}</td>
        <td>${escapeHtml((row.popup_sections || row.popup_sections_found || []).join(" | "))}</td>
        <td>${escapeHtml((row.wiki_sections || row.wiki_sections_found || []).join(" | "))}</td>
        <td>${escapeHtml(row.low_coverage_reason || "")}</td>
        <td>${escapeHtml(mismatches.join(" | "))}</td>
        <td>${escapeHtml(regressions)}</td>
        <td>${projectShot} ${wikiShot} ${artifactDir}</td>
      </tr>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Popup Visual Audit Full</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 24px; color: #111; background: #fafafa; }
    .cards { display: grid; grid-template-columns: repeat(6, minmax(140px, 1fr)); gap: 12px; margin-bottom: 24px; }
    .card { background: #fff; border: 1px solid #ddd; padding: 12px; border-radius: 8px; }
    .label { font-size: 12px; color: #666; margin-bottom: 6px; }
    .value { font-size: 20px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; background: #fff; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; vertical-align: top; font-size: 12px; }
    th { background: #f0f0f0; position: sticky; top: 0; }
    a { color: #0b57d0; text-decoration: underline; }
  </style>
</head>
<body>
  <h1>Popup Visual Audit Full</h1>
  <div class="cards">${summaryCards}</div>
  <table>
    <thead>
      <tr>
        <th>Code</th>
        <th>Name</th>
        <th>Coverage</th>
        <th>Before/after</th>
        <th>Popup sections</th>
        <th>Wiki sections</th>
        <th>Low coverage reason</th>
        <th>Mismatches</th>
        <th>Regressions</th>
        <th>Artifacts</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
</body>
</html>
`;
}

function renderVisualAuditCsv(rows: AuditRow[]) {
  const header = [
    "id",
    "code",
    "name",
    "type",
    "processed",
    "coverage_class",
    "low_coverage_reason",
    "skipped_reason",
    "source_kind",
    "artifact_dir",
    "wiki_page",
    "popup_screenshot",
    "project_popup_screenshot",
    "wiki_fullpage_screenshot",
    "project_popup_text",
    "project_popup_json",
    "wiki_text_snapshot",
    "wiki_html_snapshot",
    "wiki_json_snapshot",
    "before_sections",
    "after_sections",
    "popup_sections",
    "wiki_sections",
    "extracted_sections",
    "wiki_sections_found",
    "popup_sections_found",
    "missing_sections",
    "misplaced_content",
    "repeated_text",
    "source_trace_errors",
    "mismatches",
    "regressions",
    "boilerplate_detected",
    "status_mismatch",
    "color_mismatch",
    "raw_urls",
    "changed_files",
    "notes"
  ];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.id,
        row.code || row.id,
        row.name,
        row.type,
        row.processed ? "1" : "0",
        row.coverage_class || "",
        row.low_coverage_reason || "",
        row.skipped_reason || "",
        row.source_kind || "",
        row.artifact_dir || "",
        row.wiki_page || "",
        row.popup_screenshot || "",
        row.project_popup_screenshot || row.popup_screenshot || "",
        row.wiki_fullpage_screenshot || "",
        row.project_popup_text || "",
        row.project_popup_json || "",
        row.wiki_text_snapshot || "",
        row.wiki_html_snapshot || "",
        row.wiki_json_snapshot || "",
        row.before_sections ?? "",
        row.after_sections ?? "",
        (row.popup_sections || []).join(" | "),
        (row.wiki_sections || []).join(" | "),
        (row.extracted_sections || []).join(" | "),
        (row.wiki_sections_found || []).join(" | "),
        (row.popup_sections_found || []).join(" | "),
        (row.missing_sections || []).join(" | "),
        (row.misplaced_content || []).join(" | "),
        (row.repeated_text || []).join(" | "),
        (row.source_trace_errors || []).join(" | "),
        (row.mismatches || []).join(" | "),
        (row.regressions || []).join(" | "),
        (row.boilerplate_detected || []).join(" | "),
        row.status_mismatch ? "1" : "0",
        row.color_mismatch ? "1" : "0",
        (row.raw_urls || []).join(" | "),
        (row.changed_files || []).join(" | "),
        (row.notes || []).join(" | ")
      ].map(csvCell).join(",")
    );
  }
  return `${lines.join("\n")}\n`;
}

function batchLabel(offset: number, limit: number, total: number) {
  const end = Math.min(Math.max(0, total - 1), offset + limit - 1);
  return `${String(offset).padStart(3, "0")}-${String(end).padStart(3, "0")}`;
}

function main() {
  const root = repoRoot();
  const baselineSectionsByGeo = buildBaselineSectionMap();
  const auditDir = path.join(root, "Artifacts", "popup-visual-audit");
  const batchDir = path.join(auditDir, "batches");
  const manifestPath = path.join(auditDir, "manifest.json");
  const reportPath = path.join(auditDir, "report.csv");
  const batchSize = Math.max(1, Number(process.env.NEW_MAP_POPUP_VISUAL_AUDIT_BATCH_SIZE || 10) || 10);
  const total = Math.max(1, resolveAuditTotal());
  const resume = process.env.NEW_MAP_POPUP_VISUAL_AUDIT_RESUME === "1";
  const archiveBase = String(process.env.NEW_MAP_POPUP_VISUAL_AUDIT_ARCHIVE_BASE || "").trim();

  fs.mkdirSync(batchDir, { recursive: true });
  const expectedLabels: string[] = [];

  for (let offset = 0; offset < total; offset += batchSize) {
    expectedLabels.push(batchLabel(offset, batchSize, total));
  }

  if (!resume) {
    for (const file of fs.readdirSync(batchDir)) {
      if (!/^\d{3}-\d{3}\.(manifest\.json|report\.csv)$/.test(file)) continue;
      fs.rmSync(path.join(batchDir, file), { force: true });
    }
  }

  for (let offset = 0; offset < total; offset += batchSize) {
    const label = batchLabel(offset, batchSize, total);
    const batchManifestPath = path.join(batchDir, `${label}.manifest.json`);
    const batchReportPath = path.join(batchDir, `${label}.report.csv`);
    if (resume && fs.existsSync(batchManifestPath) && fs.existsSync(batchReportPath)) {
      console.warn(`MAP_POPUP_VISUAL_AUDIT_FULL_SKIP batch=${label}`);
      continue;
    }
    console.warn(`MAP_POPUP_VISUAL_AUDIT_FULL_RUN batch=${label}`);
    const result = spawnSync(
      "npm",
      ["run", "popup:visual:audit"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NEW_MAP_POPUP_VISUAL_AUDIT_OFFSET: String(offset),
          NEW_MAP_POPUP_VISUAL_AUDIT_LIMIT: String(batchSize)
        },
        stdio: "inherit"
      }
    );
    if (result.status !== 0) {
      process.exit(result.status || 1);
    }
    fs.copyFileSync(manifestPath, batchManifestPath);
    fs.copyFileSync(reportPath, batchReportPath);
  }

  const manifests = fs.readdirSync(batchDir)
    .filter((file) => file.endsWith(".manifest.json"))
    .filter((file) => expectedLabels.includes(file.replace(/\.manifest\.json$/, "")))
    .sort()
    .map((file) => readJson<AuditManifest>(path.join(batchDir, file)));

  const rows = manifests
    .flatMap((manifest) => manifest.rows || [])
    .map((row) => normalizeRow(root, baselineSectionsByGeo, row))
    .map((row) => applyArchiveBase(row, archiveBase));
  const combined: AuditManifest = {
    generatedAt: new Date().toISOString(),
    datasetTotal: total,
    total_geo_count: total,
    processed_geo_count: rows.length,
    total: rows.length,
    order: "displayName:asc",
    batchOffset: 0,
    batchLimit: null,
    popupCaptured: rows.filter((row) => Boolean(row.popup_screenshot)).length,
    wikiCaptured: rows.filter((row) => Boolean(row.wiki_fullpage_screenshot)).length,
    coverage_summary: rows.reduce<Record<string, number>>((acc, row) => {
      const key = String(row.coverage_class || "unclassified");
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
    rows
  };

  fs.writeFileSync(manifestPath, `${JSON.stringify(combined, null, 2)}\n`);
  fs.writeFileSync(reportPath, renderVisualAuditCsv(rows));
  fs.writeFileSync(path.join(auditDir, "full-manifest.json"), `${JSON.stringify(combined, null, 2)}\n`);
  fs.writeFileSync(path.join(auditDir, "full-report.csv"), renderVisualAuditCsv(rows));
  fs.writeFileSync(path.join(auditDir, "full-index.html"), renderHtmlIndex(rows, combined));
  fs.writeFileSync(
    path.join(auditDir, "full-summary.json"),
    `${JSON.stringify(
      {
        generatedAt: combined.generatedAt,
        datasetTotal: combined.datasetTotal,
        total_geo_count: combined.total_geo_count,
        processed_geo_count: combined.processed_geo_count,
        popupCaptured: combined.popupCaptured,
        wikiCaptured: combined.wikiCaptured,
        coverage_summary: combined.coverage_summary,
        regression_summary: {
          rows_with_regressions: rows.filter((row) => (row.regressions || []).length > 0).length,
          rows_with_source_trace_errors: rows.filter((row) => (row.source_trace_errors || []).length > 0).length,
          rows_with_missing_artifacts: rows.filter((row) => !row.popup_screenshot || !row.wiki_fullpage_screenshot).length
        },
        sparse_summary: {
          total: rows.filter((row) => (row.popup_sections_found || []).length <= 1).length,
          enriched: rows.filter((row) => (row.popup_sections_found || []).length > 1).length,
          honestly_low_coverage: rows.filter((row) => Boolean(row.low_coverage_reason)).length,
          no_page: rows.filter((row) => row.coverage_class === "no_individual_wiki_page").length,
          synthetic: rows.filter((row) => row.coverage_class === "synthetic_no_wiki").length,
          failed: rows.filter((row) => !row.processed).length
        }
      },
      null,
      2
    )}\n`
  );

  console.warn(
    `MAP_POPUP_VISUAL_AUDIT_FULL_DONE total=${combined.total} popupCaptured=${combined.popupCaptured} wikiCaptured=${combined.wikiCaptured}`
  );
}

main();
