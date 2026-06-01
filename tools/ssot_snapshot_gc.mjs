#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const SNAPSHOT_DIR = path.join(ROOT, "data", "ssot_snapshots");
const KEEP_LAST = 50;

const files = fs.existsSync(SNAPSHOT_DIR)
  ? fs.readdirSync(SNAPSHOT_DIR).filter((name) => /^snapshot_\d{4}_\d{2}_\d{2}_\d{2}\.json$/.test(name)).sort()
  : [];

const tracked = new Set(
  execSync("git ls-files -- data/ssot_snapshots", {
    cwd: ROOT,
    encoding: "utf8"
  })
    .split(/\r?\n/)
    .filter(Boolean)
    .map((filePath) => path.basename(filePath))
);
const overflow = Math.max(0, files.length - KEEP_LAST);
const removable = files
  .filter((name) => !tracked.has(name))
  .slice(0, overflow);
for (const name of removable) {
  fs.unlinkSync(path.join(SNAPSHOT_DIR, name));
}

const remaining = files.length - removable.length;
console.log(`SSOT_SNAPSHOT_GC_OK=1`);
console.log(`SSOT_SNAPSHOT_COUNT=${remaining}`);
console.log(`SSOT_SNAPSHOT_REMOVED=${removable.length}`);
if (remaining > KEEP_LAST) {
  console.log(`SSOT_SNAPSHOT_RETENTION_OVERFLOW=${remaining - KEEP_LAST}`);
  process.exit(1);
}
