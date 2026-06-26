import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

type AuditRow = {
  id: string;
  name: string;
  type: string;
  wiki_page: string | null;
  popup_screenshot: string | null;
  wiki_fullpage_screenshot: string | null;
  wiki_sections_found: string[];
  popup_sections_found: string[];
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
  total: number;
  order: string;
  batchOffset: number;
  batchLimit: number | null;
  popupCaptured: number;
  wikiCaptured: number;
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

function renderVisualAuditCsv(rows: AuditRow[]) {
  const header = [
    "id",
    "name",
    "type",
    "wiki_page",
    "popup_screenshot",
    "wiki_fullpage_screenshot",
    "wiki_sections_found",
    "popup_sections_found",
    "missing_sections",
    "misplaced_content",
    "repeated_text",
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
        row.name,
        row.type,
        row.wiki_page || "",
        row.popup_screenshot || "",
        row.wiki_fullpage_screenshot || "",
        (row.wiki_sections_found || []).join(" | "),
        (row.popup_sections_found || []).join(" | "),
        (row.missing_sections || []).join(" | "),
        (row.misplaced_content || []).join(" | "),
        (row.repeated_text || []).join(" | "),
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

function batchLabel(offset: number, limit: number) {
  const end = Math.min(299, offset + limit - 1);
  return `${String(offset).padStart(3, "0")}-${String(end).padStart(3, "0")}`;
}

function main() {
  const root = repoRoot();
  const auditDir = path.join(root, "Artifacts", "popup-visual-audit");
  const batchDir = path.join(auditDir, "batches");
  const manifestPath = path.join(auditDir, "manifest.json");
  const reportPath = path.join(auditDir, "report.csv");
  const batchSize = Math.max(1, Number(process.env.NEW_MAP_POPUP_VISUAL_AUDIT_BATCH_SIZE || 10) || 10);
  const total = Math.max(1, Number(process.env.NEW_MAP_POPUP_VISUAL_AUDIT_TOTAL || 300) || 300);
  const resume = process.env.NEW_MAP_POPUP_VISUAL_AUDIT_RESUME === "1";

  fs.mkdirSync(batchDir, { recursive: true });

  for (let offset = 0; offset < total; offset += batchSize) {
    const label = batchLabel(offset, batchSize);
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
    .sort()
    .map((file) => readJson<AuditManifest>(path.join(batchDir, file)));

  const rows = manifests.flatMap((manifest) => manifest.rows || []);
  const combined: AuditManifest = {
    generatedAt: new Date().toISOString(),
    datasetTotal: manifests[0]?.datasetTotal || total,
    total: rows.length,
    order: "displayName:asc",
    batchOffset: 0,
    batchLimit: null,
    popupCaptured: rows.filter((row) => Boolean(row.popup_screenshot)).length,
    wikiCaptured: rows.filter((row) => Boolean(row.wiki_fullpage_screenshot)).length,
    rows
  };

  fs.writeFileSync(manifestPath, `${JSON.stringify(combined, null, 2)}\n`);
  fs.writeFileSync(reportPath, renderVisualAuditCsv(rows));
  fs.writeFileSync(path.join(auditDir, "full-manifest.json"), `${JSON.stringify(combined, null, 2)}\n`);
  fs.writeFileSync(path.join(auditDir, "full-report.csv"), renderVisualAuditCsv(rows));

  console.warn(
    `MAP_POPUP_VISUAL_AUDIT_FULL_DONE total=${combined.total} popupCaptured=${combined.popupCaptured} wikiCaptured=${combined.wikiCaptured}`
  );
}

main();
