#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SNAPSHOT_DIR = path.join(ROOT, "data", "ssot_snapshots");
const KEEP_LAST = 50;

const files = fs.existsSync(SNAPSHOT_DIR)
  ? fs.readdirSync(SNAPSHOT_DIR).filter((name) => /^snapshot_\d{4}_\d{2}_\d{2}_\d{2}\.json$/.test(name)).sort()
  : [];

const removable = files.slice(0, Math.max(0, files.length - KEEP_LAST));
for (const name of removable) {
  fs.unlinkSync(path.join(SNAPSHOT_DIR, name));
}

console.log(`SSOT_SNAPSHOT_GC_OK=1`);
console.log(`SSOT_SNAPSHOT_COUNT=${files.length - removable.length}`);
console.log(`SSOT_SNAPSHOT_REMOVED=${removable.length}`);
