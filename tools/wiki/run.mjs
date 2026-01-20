#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const BASE_DIR =
  typeof import.meta.dirname === "string"
    ? import.meta.dirname
    : path.dirname(new URL(import.meta.url).pathname);
let ROOT = process.env.PROJECT_ROOT ?? path.resolve(BASE_DIR, "../../..");
if (!fs.existsSync(path.join(ROOT, "tools", "wiki"))) {
  ROOT = path.resolve(BASE_DIR, "../..");
}
if (!fs.existsSync(path.join(ROOT, "tools", "wiki"))) {
  console.error("FATAL: PROJECT_ROOT not resolved:", ROOT);
  process.exit(2);
}
if (process.cwd() !== ROOT) {
  console.warn(`WARN: cwd=${process.cwd()} root=${ROOT} (auto-chdir)`);
  process.chdir(ROOT);
}

const [command, ...rest] = process.argv.slice(2);
if (!command) {
  console.error("Usage: node tools/wiki/run.mjs <ping|sync|inspect> [...args]");
  process.exit(2);
}

const execPath = process.execPath;
const scriptMap = {
  ping: [path.join(ROOT, "tools", "wiki", "mediawiki_api.mjs"), "--ping"],
  sync: [path.join(ROOT, "tools", "wiki", "sync_legality.mjs")],
  inspect: [path.join(ROOT, "tools", "wiki", "inspect_claim.mjs")]
};

const target = scriptMap[command];
if (!target) {
  console.error(`Unknown command: ${command}`);
  process.exit(2);
}

const result = spawnSync(execPath, [...target, ...rest], { stdio: "inherit" });
process.exit(result.status ?? 1);
