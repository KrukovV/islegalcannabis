import fs from "node:fs";
import path from "node:path";
import { readSchemaVersion } from "./lib/readSchemaVersion.mjs";

const ROOT = process.cwd();
const LAWS_DIR = path.join(ROOT, "data", "laws");
const GEO_DIR = path.join(ROOT, "data", "geo");

function listJsonFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
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

function main() {
  const schemaVersion = readSchemaVersion();
  const issues = [];

  for (const filePath of listJsonFiles(LAWS_DIR)) {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch {
      issues.push(`${filePath}: invalid JSON`);
      continue;
    }
    if (parsed.schema_version !== schemaVersion) {
      issues.push(
        `${filePath}: schema_version expected ${schemaVersion}, got ${parsed.schema_version}`
      );
    }
  }

  for (const filePath of listJsonFiles(GEO_DIR)) {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch {
      issues.push(`${filePath}: invalid JSON`);
      continue;
    }
    if (parsed.schema_version !== schemaVersion) {
      issues.push(
        `${filePath}: schema_version expected ${schemaVersion}, got ${parsed.schema_version}`
      );
    }
    if (!parsed.items || typeof parsed.items !== "object") {
      issues.push(`${filePath}: missing items object`);
    }
  }

  const registryPath = path.join(ROOT, "data", "sources_registry.json");
  if (fs.existsSync(registryPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(registryPath, "utf-8"));
      if (parsed.schema_version !== schemaVersion) {
        issues.push(
          `${registryPath}: schema_version expected ${schemaVersion}, got ${parsed.schema_version}`
        );
      }
    } catch {
      issues.push(`${registryPath}: invalid JSON`);
    }
  }

  if (issues.length > 0) {
    console.error("Data schema validation failed:");
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  console.log("Data schema versions validated.");
}

main();
