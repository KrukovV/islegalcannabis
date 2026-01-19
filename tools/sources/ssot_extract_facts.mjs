import fs from "node:fs";
import path from "node:path";
import { normalizeCatalogEntry } from "./catalog_utils.mjs";

const ROOT = process.cwd();
const CATALOG_PATH = path.join(ROOT, "data", "sources", "official_catalog.json");
const FACTS_DIR = path.join(ROOT, "data", "sources", "ssot_facts");
const REVIEWS_DIR = path.join(ROOT, "data", "reviews");
const LAWS_DIR = path.join(ROOT, "data", "laws");

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function resolveProfilePath(id) {
  const upper = id.toUpperCase();
  if (upper.startsWith("US-") && upper.length === 5) {
    const region = upper.slice(3);
    return path.join(LAWS_DIR, "us", `${region}.json`);
  }
  const euPath = path.join(LAWS_DIR, "eu", `${upper}.json`);
  if (fs.existsSync(euPath)) return euPath;
  return path.join(LAWS_DIR, "world", `${upper}.json`);
}

function resolveEffectiveDate(id) {
  const reviewPath = path.join(REVIEWS_DIR, `${id}.review.json`);
  const review = readJson(reviewPath);
  const reviewDate = review?.updates?.effective_date;
  if (reviewDate) return String(reviewDate);
  const profile = readJson(resolveProfilePath(id));
  if (profile?.effective_date) return String(profile.effective_date);
  return null;
}

function categoryFromKey(key) {
  if (key === "legal_recreational") return "recreational";
  if (key === "legal_medical") return "medical";
  if (key === "decriminalized") return "decriminalized";
  if (key === "illegal") return "illegal";
  return key;
}

if (!fs.existsSync(CATALOG_PATH)) {
  fail(`Missing ${CATALOG_PATH}`);
}

const catalog = readJson(CATALOG_PATH);
if (!catalog || typeof catalog !== "object") {
  fail("official_catalog.json must be an object");
}

fs.mkdirSync(FACTS_DIR, { recursive: true });
const generatedAt = new Date().toISOString().slice(0, 10);

for (const [id, entry] of Object.entries(catalog)) {
  if (!entry || typeof entry !== "object") continue;
  const facts = [];
  const effectiveDate = resolveEffectiveDate(id);
  const normalized = normalizeCatalogEntry(entry);
  for (const [categoryKey, urls] of Object.entries(normalized.verified)) {
    for (const url of urls) {
      if (typeof url !== "string" || !url.trim()) continue;
      facts.push({
        category: categoryFromKey(categoryKey),
        url: url.trim(),
        effective_date: effectiveDate,
        text_snippet: null
      });
    }
  }

  const outPath = path.join(FACTS_DIR, `${id.toUpperCase()}.json`);
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        id: id.toUpperCase(),
        generated_at: generatedAt,
        facts
      },
      null,
      2
    ) + "\n"
  );
}

console.log(`OK ssot facts (${Object.keys(catalog).length})`);
