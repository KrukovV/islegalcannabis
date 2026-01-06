const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();
const LAWS_DIR = path.join(ROOT, "data", "laws");

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

  validateLawPayload(parsed, filePath);
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
