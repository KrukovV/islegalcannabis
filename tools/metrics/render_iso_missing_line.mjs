import fs from "node:fs";
import path from "node:path";

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(2);
}

const coveragePath = path.join(process.cwd(), "Reports", "coverage", "last_coverage.json");
const batchPath = path.join(process.cwd(), "Reports", "iso-last-batch.json");
if (!fs.existsSync(coveragePath)) {
  fail("coverage artifact missing");
}
let coverage;
try {
  coverage = JSON.parse(fs.readFileSync(coveragePath, "utf8"));
} catch {
  fail("coverage artifact invalid JSON");
}
const missing = Number(coverage.missing);
if (!Number.isFinite(missing)) {
  fail("coverage artifact missing missing");
}
let addedCount = Number(process.env.ISO_BATCH_N || 5);
if (fs.existsSync(batchPath)) {
  try {
    const batch = JSON.parse(fs.readFileSync(batchPath, "utf8"));
    const added = Array.isArray(batch.added) ? batch.added.filter(Boolean) : [];
    addedCount = Number.isFinite(Number(batch.addedCount)) ? Number(batch.addedCount) : added.length;
  } catch {
    addedCount = 5;
  }
}
process.stdout.write(`ISO batch: +${addedCount} provisional, missing now=${missing}`);
