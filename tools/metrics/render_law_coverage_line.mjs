import fs from "node:fs";
import path from "node:path";
import { isLawKnown } from "../../packages/shared/src/law_known.js";
import { normalizeSources } from "../../packages/shared/src/sources.js";
import { loadSourceRegistries } from "../sources/load_registries.mjs";

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(2);
}

const ROOT = process.cwd();
const coveragePath = path.join(ROOT, "Reports", "coverage", "last_coverage.json");
const isoPath = path.join(ROOT, "data", "iso3166", "iso3166-1.json");
const lawsWorld = path.join(ROOT, "data", "laws", "world");
const lawsEu = path.join(ROOT, "data", "laws", "eu");
const registries = loadSourceRegistries();

let total = 0;
let known = 0;
let missingSources = 0;

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function profileForIso(code) {
  const worldPath = path.join(lawsWorld, `${code}.json`);
  if (fs.existsSync(worldPath)) {
    return readJson(worldPath);
  }
  const euPath = path.join(lawsEu, `${code}.json`);
  if (fs.existsSync(euPath)) {
    return readJson(euPath);
  }
  return null;
}

if (!fs.existsSync(coveragePath)) {
  fail("coverage artifact missing");
}
const coverage = readJson(coveragePath);
const covered = Number(coverage?.covered);
if (!Number.isFinite(covered)) {
  fail("coverage artifact invalid values");
}
total = covered;

if (!fs.existsSync(isoPath)) {
  fail("iso3166 source missing");
}
const isoRaw = readJson(isoPath);
const isoEntries = Array.isArray(isoRaw?.entries) ? isoRaw.entries : [];
const isoCodes = isoEntries
  .map((entry) => String(entry?.alpha2 || "").toUpperCase())
  .filter((code) => code.length === 2);

for (const code of isoCodes) {
  const payload = profileForIso(code);
  if (!payload) {
    missingSources += 1;
    continue;
  }
  const sources = normalizeSources(payload?.sources, registries).official;
  if (sources.length === 0) {
    missingSources += 1;
  }
  if (payload?.status === "known" && isLawKnown(payload, registries)) {
    known += 1;
  }
}

if (!Number.isFinite(known) || !Number.isFinite(missingSources)) {
  fail("law coverage counts invalid");
}

if (process.argv.includes("--stats")) {
  const unknown = Math.max(0, total - known);
  process.stdout.write([total, known, unknown, missingSources].join(" "));
} else {
  const unknown = Math.max(0, total - known);
  process.stdout.write(
    `Law Knowledge: total=${total} known=${known} unknown=${unknown} missing_sources=${missingSources}`
  );
}
