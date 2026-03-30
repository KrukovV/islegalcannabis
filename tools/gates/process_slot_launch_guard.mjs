#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { MAX_PARALLEL_PROCESSES } from "../runtime/processSlots.mjs";

const root = process.cwd();
const playwrightConfigPath = path.join(root, "playwright.config.ts");
const scanRoots = [path.join(root, "tools"), path.join(root, "tests")];
const launchPattern =
  /\b(?:chromium|webkit|firefox|browserType)\.(?:launch|launchPersistentContext)\s*\(/g;
const processSpawnPattern = /\b(?:spawn|spawnSync|execa)\s*\(/g;
const slotOwnershipPattern = /\b(?:acquireProjectProcessSlot|withProjectProcessSlot)\b/;
const allowedExtensions = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx"]);
const failures = [];
let launchSiteCount = 0;
let processSpawnSiteCount = 0;

function isProcessManagedRuntimePath(relativePath) {
  return (
    relativePath.startsWith("tools/playwright-smoke/") ||
    relativePath.startsWith("tools/diagnostics/") ||
    relativePath.startsWith("tests/ui/")
  );
}

function walk(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "Reports" || entry.name === "Artifacts" || entry.name === "QUARANTINE") {
      continue;
    }
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (!allowedExtensions.has(path.extname(entry.name))) continue;
    const source = fs.readFileSync(fullPath, "utf8");
    const relativePath = path.relative(root, fullPath);
    const matches = source.match(launchPattern);
    if (matches) {
      launchSiteCount += matches.length;
      if (!slotOwnershipPattern.test(source)) {
        failures.push(`MISSING_SLOT_OWNER:${relativePath}`);
      }
    }
    if (isProcessManagedRuntimePath(relativePath)) {
      const processMatches = source.match(processSpawnPattern);
      if (processMatches) {
        processSpawnSiteCount += processMatches.length;
        if (!slotOwnershipPattern.test(source)) {
          failures.push(`PROCESS_BYPASS_SLOT_OWNER:${relativePath}`);
        }
      }
    }
  }
}

for (const scanRoot of scanRoots) {
  if (fs.existsSync(scanRoot)) walk(scanRoot);
}

const playwrightConfig = fs.existsSync(playwrightConfigPath) ? fs.readFileSync(playwrightConfigPath, "utf8") : "";
if (!/workers:\s*1\b/.test(playwrightConfig)) {
  failures.push("PLAYWRIGHT_WORKERS_NOT_ONE");
}
if (MAX_PARALLEL_PROCESSES !== 3) {
  failures.push(`MAX_PARALLEL_PROCESSES=${MAX_PARALLEL_PROCESSES}`);
}

console.log(
  `PROCESS_SLOT_LAUNCH_GUARD max_parallel_processes=${MAX_PARALLEL_PROCESSES} launch_sites=${launchSiteCount} process_spawn_sites=${processSpawnSiteCount}`
);
if (failures.length > 0) {
  console.log(`PROCESS_SLOT_LAUNCH_GUARD_FAILURES=${failures.join(",")}`);
  console.log("PROCESS_SLOT_LAUNCH_GUARD=FAIL");
  process.exit(1);
}

console.log("PROCESS_SLOT_LAUNCH_GUARD=PASS");
