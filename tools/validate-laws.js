const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();
const LAWS_DIR = path.join(ROOT, "data", "laws");

const REQUIRED_FIELDS = [
  "id",
  "country",
  "medical",
  "recreational",
  "public_use",
  "cross_border",
  "risks",
  "updated_at",
  "sources"
];

function listJsonFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listJsonFiles(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(fullPath);
    }
  }
  return files;
}

function validateFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  let parsed;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON: ${filePath}`);
  }

  for (const field of REQUIRED_FIELDS) {
    if (!(field in parsed)) {
      throw new Error(`Missing field "${field}" in ${filePath}`);
    }
  }

  if (!Array.isArray(parsed.risks)) {
    throw new Error(`Risks must be an array in ${filePath}`);
  }

  if (!Array.isArray(parsed.sources) || parsed.sources.length === 0) {
    throw new Error(`Sources must be a non-empty array in ${filePath}`);
  }

  for (const source of parsed.sources) {
    if (!source || typeof source.url !== "string") {
      throw new Error(`Source url must be a string in ${filePath}`);
    }
    let parsedUrl;
    try {
      parsedUrl = new URL(source.url);
    } catch {
      throw new Error(`Invalid source url "${source.url}" in ${filePath}`);
    }
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error(`Invalid source url protocol "${source.url}" in ${filePath}`);
    }
  }
}

function main() {
  if (!fs.existsSync(LAWS_DIR)) {
    throw new Error("Missing data/laws directory.");
  }

  const files = listJsonFiles(LAWS_DIR);
  if (files.length === 0) {
    throw new Error("No law JSON files found in data/laws.");
  }

  for (const file of files) {
    validateFile(file);
  }

  console.log(`Validated ${files.length} law files.`);
}

main();
