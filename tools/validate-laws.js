const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();
const LAWS_DIR = path.join(ROOT, "data", "laws");
const TOP25_PATH = path.join(ROOT, "packages", "shared", "src", "top25.json");

const { validateLawPayload } = require("./laws-validation");

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

  if (Array.isArray(parsed.sources)) {
    parsed.sources.forEach((source, index) => {
      const url = source?.url;
      if (typeof url !== "string") {
        throw new Error(`sources[${index}].url must be a string in ${filePath}`);
      }
      if (/\s/.test(url)) {
        throw new Error(
          `sources[${index}].url must not contain whitespace in ${filePath}`
        );
      }
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        throw new Error(
          `sources[${index}].url must start with http(s) in ${filePath}`
        );
      }
    });
  }

  validateLawPayload(parsed, filePath);
  return parsed.id;
}

function loadTop25Keys() {
  if (!fs.existsSync(TOP25_PATH)) {
    throw new Error("Missing packages/shared/src/top25.json.");
  }
  const raw = fs.readFileSync(TOP25_PATH, "utf-8");
  const parsed = JSON.parse(raw);
  return parsed.map((entry) => entry.jurisdictionKey);
}

function main() {
  if (!fs.existsSync(LAWS_DIR)) {
    throw new Error("Missing data/laws directory.");
  }

  const files = listJsonFiles(LAWS_DIR);
  if (files.length === 0) {
    throw new Error("No law JSON files found in data/laws.");
  }

  const ids = new Set();
  for (const file of files) {
    const id = validateFile(file);
    ids.add(id);
  }

  const top25Keys = loadTop25Keys();
  const missingTop25 = top25Keys.filter((key) => !ids.has(key));
  if (missingTop25.length > 0) {
    throw new Error(
      `Missing law profiles for TOP25: ${missingTop25.join(", ")}`
    );
  }

  console.log(`Validated ${files.length} law files.`);
}

main();
