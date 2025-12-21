import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LAWS_DIR = path.join(ROOT, "src", "laws");

type LawProfile = {
  id: string;
  country: string;
  medical: string;
  recreational: string;
  public_use: string;
  cross_border: string;
  updated_at: string;
  sources: Array<{ title: string; url: string }>;
};

const REQUIRED_FIELDS: Array<keyof LawProfile> = [
  "id",
  "country",
  "medical",
  "recreational",
  "public_use",
  "cross_border",
  "updated_at",
  "sources"
];

function listJsonFiles(dir: string, files: string[] = []) {
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

function validateFile(filePath: string) {
  const raw = fs.readFileSync(filePath, "utf-8");
  let parsed: LawProfile;

  try {
    parsed = JSON.parse(raw) as LawProfile;
  } catch {
    throw new Error(`Invalid JSON: ${filePath}`);
  }

  for (const field of REQUIRED_FIELDS) {
    if (!(field in parsed)) {
      throw new Error(`Missing field "${field}" in ${filePath}`);
    }
  }

  if (!Array.isArray(parsed.sources) || parsed.sources.length === 0) {
    throw new Error(`Sources must be a non-empty array in ${filePath}`);
  }
}

function main() {
  if (!fs.existsSync(LAWS_DIR)) {
    throw new Error("Missing src/laws directory.");
  }

  const files = listJsonFiles(LAWS_DIR);
  if (files.length === 0) {
    throw new Error("No law JSON files found in src/laws.");
  }

  for (const file of files) {
    validateFile(file);
  }

  console.log(`Validated ${files.length} law files.`);
}

main();
