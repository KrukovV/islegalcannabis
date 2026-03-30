#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const LEGACY_OVERSIZE_ALLOWLIST = new Set([
  "tools/wiki/sync_legality.mjs"
]);
const rawStatus = execSync("git status --short", { cwd: ROOT, encoding: "utf8" });
const changedFiles = rawStatus
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => line.replace(/^[A-Z? ]+/, "").trim())
  .filter((file) => /\.(ts|tsx|js|mjs)$/.test(file))
  .filter((file) => fs.existsSync(path.join(ROOT, file)));

const oversize = changedFiles
  .map((file) => ({
    file,
    lines: fs.readFileSync(path.join(ROOT, file), "utf8").split(/\r?\n/).length,
    status: rawStatus.split(/\r?\n/).find((line) => line.includes(file)) || ""
  }))
  .filter((entry) => {
    if (entry.lines <= 800) return false;
    if (LEGACY_OVERSIZE_ALLOWLIST.has(entry.file)) return false;
    if (entry.status.startsWith("??")) return true;
    try {
      const diffStat = execSync(`git diff --numstat -- "${entry.file}"`, { cwd: ROOT, encoding: "utf8" }).trim();
      if (!diffStat) return false;
      const [added, removed] = diffStat.split(/\s+/);
      return Number(added || 0) > Number(removed || 0);
    } catch {
      return true;
    }
  });

console.log(`FILE_SIZE_SIMPLIFICATION_GUARD changed=${changedFiles.length} oversize=${oversize.length}`);
if (oversize.length > 0) {
  oversize.forEach((entry) => console.log(`OVERSIZE_FILE file=${entry.file} lines=${entry.lines}`));
}
console.log(`FILE_SIZE_SIMPLIFICATION_GUARD=${oversize.length > 0 ? "FAIL" : "PASS"}`);
process.exit(oversize.length > 0 ? 1 : 0);
