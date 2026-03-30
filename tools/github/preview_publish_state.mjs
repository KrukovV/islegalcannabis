#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const manifestPath = path.join(ROOT, "tools", "github", "publish_manifest.json");
const reportPath = path.join(ROOT, "Reports", "github_publish_preview.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function listGitPaths(args) {
  const output = execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
  return output ? output.split(/\r?\n/).filter(Boolean) : [];
}

function matchesRule(filePath, rules) {
  const normalized = filePath.replace(/\\/g, "/");
  const exact = Array.isArray(rules?.exact) ? rules.exact : [];
  const prefix = Array.isArray(rules?.prefix) ? rules.prefix : [];
  const suffix = Array.isArray(rules?.suffix) ? rules.suffix : [];
  if (exact.includes(normalized)) return true;
  if (prefix.some((candidate) => normalized.startsWith(candidate))) return true;
  if (suffix.some((candidate) => normalized.endsWith(candidate))) return true;
  return false;
}

const manifest = readJson(manifestPath);
const trackedPaths = listGitPaths(["ls-files"]);
const visibleWorktreePaths = Array.from(
  new Set([
    ...trackedPaths,
    ...listGitPaths(["ls-files", "--others", "--exclude-standard"])
  ])
).sort();

const allowed = [];
const denied = [];
const unmatched = [];

for (const filePath of visibleWorktreePaths) {
  if (matchesRule(filePath, manifest.deny)) {
    denied.push(filePath);
    continue;
  }
  if (matchesRule(filePath, manifest.allow)) {
    allowed.push(filePath);
    continue;
  }
  unmatched.push(filePath);
}

const report = {
  generated_at: new Date().toISOString(),
  manifest: path.relative(ROOT, manifestPath),
  mode: manifest.mode || "prepare_only",
  tracked_total: trackedPaths.length,
  visible_worktree_total: visibleWorktreePaths.length,
  allowed_total: allowed.length,
  denied_total: denied.length,
  unmatched_total: unmatched.length,
  denied,
  unmatched
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(`GITHUB_PUBLISH_MANIFEST=${path.relative(ROOT, manifestPath)}`);
console.log(`GITHUB_PUBLISH_MODE=${report.mode}`);
console.log(`GITHUB_PUBLISH_ALLOWED_TOTAL=${allowed.length}`);
console.log(`GITHUB_PUBLISH_DENIED_TOTAL=${denied.length}`);
console.log(`GITHUB_PUBLISH_UNMATCHED_TOTAL=${unmatched.length}`);
console.log(`GITHUB_PUBLISH_REPORT=${path.relative(ROOT, reportPath)}`);
if (denied.length) {
  console.log(`GITHUB_PUBLISH_DENIED_SAMPLE=${denied.slice(0, 10).join(",")}`);
}
if (unmatched.length) {
  console.log(`GITHUB_PUBLISH_UNMATCHED_SAMPLE=${unmatched.slice(0, 10).join(",")}`);
}
