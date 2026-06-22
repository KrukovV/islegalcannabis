#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const TRACKED_FILES = [
  "data/cannabis_profiles/knowledge_db.json",
  "data/cannabis_profiles/first_wave_profiles.json",
  "data/cannabis_profiles/local_names.dictionary.json",
  "Reports/popup-profile-audit.json",
  "Reports/popup-profile-audit.csv",
  "Reports/knowledge-harvester/first_wave_validation.json",
  "Reports/knowledge-harvester/first_wave_validation.md",
  "Reports/knowledge-harvester/progress.json"
];

function repoRoot() {
  let current = process.cwd();
  while (current && current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, "package.json")) && fs.existsSync(path.join(current, "data"))) return current;
    current = path.dirname(current);
  }
  return process.cwd();
}

function readArg(name, fallback = "") {
  const idx = process.argv.indexOf(name);
  if (idx !== -1) return process.argv[idx + 1] ?? fallback;
  const prefixed = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (prefixed) return prefixed.slice(name.length + 1);
  return fallback;
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function fileSnapshot(root) {
  return TRACKED_FILES.map((relativePath) => {
    const absolutePath = path.join(root, relativePath);
    const exists = fs.existsSync(absolutePath);
    return {
      path: relativePath,
      exists,
      sha256: exists ? sha256(absolutePath) : null
    };
  });
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function renderText(report) {
  const noReliablePages = report.no_reliable_wiki_pages.map((row) => `${row.id}:${row.name}`).join(", ") || "-";
  const changedFiles = report.changed_files.join(", ") || "-";
  return [
    `generated_at=${report.generated_at}`,
    `command=${report.command}`,
    `cache_only=${report.cache_only ? 1 : 0}`,
    `worklist_total=${report.worklist_total}`,
    `batch_total=${report.batch_total}`,
    `total=${report.total}`,
    `processed=${report.processed}`,
    `changed=${report.changed}`,
    `no_page=${report.no_page}`,
    `conflicts=${report.conflicts}`,
    `empty_sections=${report.empty_sections}`,
    `template_sections=${report.template_sections}`,
    `repeated_text=${report.repeated_text}`,
    `garbage_text=${report.garbage_text}`,
    `raw_urls=${report.raw_urls}`,
    `source_errors=${report.source_errors}`,
    `status_review_overrides=${report.status_review_overrides}`,
    `changed_files=${changedFiles}`,
    `no_reliable_wiki_pages=${noReliablePages}`
  ].join("\n");
}

const root = repoRoot();
const snapshotOut = readArg("--write-snapshot", "");
if (snapshotOut) {
  writeJson(path.resolve(root, snapshotOut), {
    generated_at: new Date().toISOString(),
    files: fileSnapshot(root)
  });
  process.exit(0);
}

const snapshotPath = readArg("--snapshot", "");
if (!snapshotPath) {
  console.error("POPUP_PROFILE_FULL_RUN_REPORT_ERROR=MISSING_SNAPSHOT");
  process.exit(1);
}

const auditPath = path.join(root, "Reports", "popup-profile-audit.json");
const progressPath = path.join(root, "Reports", "knowledge-harvester", "progress.json");
const outputPath = path.resolve(root, readArg("--out", "Reports/popup-profile-full-run.json"));
const textOutputPath = outputPath.replace(/\.json$/i, ".txt");
const before = readJson(path.resolve(root, snapshotPath));
const audit = readJson(auditPath);
const progress = fs.existsSync(progressPath) ? readJson(progressPath) : null;
const beforeFiles = new Map((before.files || []).map((entry) => [String(entry.path || ""), entry]));
const afterFiles = fileSnapshot(root);
const changedFiles = afterFiles
  .filter((entry) => {
    const previous = beforeFiles.get(entry.path);
    if (!previous) return true;
    return Boolean(previous.exists) !== Boolean(entry.exists) || String(previous.sha256 || "") !== String(entry.sha256 || "");
  })
  .map((entry) => entry.path);
const rows = Array.isArray(audit.rows) ? audit.rows : [];
const report = {
  generated_at: new Date().toISOString(),
  command: "npm run popup:profile:full-run",
  cache_only: Boolean(progress?.cache_only),
  worklist_total: Number(progress?.worklist_total || audit.total_dataset_entities || rows.length || 0),
  batch_total: Number(progress?.batch_total || audit.total_dataset_entities || rows.length || 0),
  total: Number(audit.total_dataset_entities || rows.length || 0),
  processed: Number(audit.processed_count || 0),
  changed: changedFiles.length,
  no_page: Number(audit.no_page_count || 0),
  conflicts: Number(audit.conflicts_count || 0),
  empty_sections: Number(audit.empty_sections_count || 0),
  template_sections: Number(audit.template_sections_count || 0),
  repeated_text: Number(audit.repeated_text_count || 0),
  garbage_text: Number(audit.garbage_text_count || 0),
  raw_urls: Number(audit.raw_url_count || 0),
  source_errors: Number(audit.source_errors_count || 0),
  status_review_overrides: Number(audit.status_review_override_count || 0),
  changed_files: changedFiles,
  no_reliable_wiki_pages: rows
    .filter((row) => row?.resolver_status === "no_individual_wiki_page")
    .map((row) => ({ id: String(row.id || ""), name: String(row.name || row.id || "") })),
  progress
};

writeJson(outputPath, report);
fs.writeFileSync(textOutputPath, `${renderText(report)}\n`);

console.log(`POPUP_PROFILE_CHANGED=${report.changed}`);
console.log(`POPUP_PROFILE_FULL_RUN_REPORT=${path.relative(root, outputPath)}`);
