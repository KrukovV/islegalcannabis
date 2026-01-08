import fs from "node:fs";
import path from "node:path";
import { readSchemaVersion } from "./lib/readSchemaVersion.mjs";

const ROOT = process.cwd();
const LAWS_DIR = path.join(ROOT, "data", "laws");

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

function reportIssue(issues, filePath, jsonPath, message) {
  issues.push(`${filePath}:${jsonPath} ${message}`);
}

function validateSources(filePath, sources, issues) {
  if (!Array.isArray(sources)) return;
  for (let i = 0; i < sources.length; i += 1) {
    const source = sources[i];
    const url = source?.url;
    const jsonPath = `sources[${i}].url`;
    if (typeof url !== "string") {
      reportIssue(issues, filePath, jsonPath, "url must be a string");
      continue;
    }
    if (/\s/.test(url)) {
      reportIssue(issues, filePath, jsonPath, `url contains whitespace: ${url}`);
    }
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      reportIssue(issues, filePath, jsonPath, `url must start with http(s): ${url}`);
    }
  }
}

function main() {
  if (!fs.existsSync(LAWS_DIR)) {
    console.error("Missing data/laws directory.");
    process.exit(1);
  }

  const schemaVersion = readSchemaVersion();
  const files = listJsonFiles(LAWS_DIR);
  const issues = [];

  for (const filePath of files) {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch {
      reportIssue(issues, filePath, "json", "invalid JSON");
      continue;
    }

    validateSources(filePath, parsed.sources, issues);
    if (parsed.schema_version !== schemaVersion) {
      reportIssue(
        issues,
        filePath,
        "schema_version",
        `expected ${schemaVersion}, got ${parsed.schema_version}`
      );
    }
  }

  if (issues.length > 0) {
    console.error("Invalid sources URLs found:");
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  console.log(`Validated ${files.length} law files for sources URLs.`);
}

main();
