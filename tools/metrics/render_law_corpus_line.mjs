import fs from "node:fs";
import path from "node:path";

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(2);
}

const ROOT = process.cwd();
const isoPath = path.join(ROOT, "data", "iso3166", "iso3166-1.json");
const euDir = path.join(ROOT, "data", "laws", "eu");
const worldDir = path.join(ROOT, "data", "laws", "world");

function countJson(dir) {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter((file) => file.endsWith(".json")).length;
}

if (!fs.existsSync(isoPath)) {
  fail("iso3166 source missing");
}
const isoRaw = JSON.parse(fs.readFileSync(isoPath, "utf8"));
const isoEntries = Array.isArray(isoRaw?.entries) ? isoRaw.entries : [];
const totalIso = isoEntries.filter((entry) => entry?.alpha2).length;

const euCount = countJson(euDir);
const worldCount = countJson(worldDir);
const totalLaws = euCount + worldCount;
const missing = Math.max(0, totalIso - worldCount);

if (!Number.isFinite(totalIso)) {
  fail("iso3166 count invalid");
}

process.stdout.write(
  `Law Corpus: total_iso=${totalIso} laws_files_total=${totalLaws} (world=${worldCount}, eu=${euCount}) missing=${missing}`
);
