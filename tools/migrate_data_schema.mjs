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

function normalizeSources(sources) {
  if (!Array.isArray(sources)) return sources;
  return sources.map((source) => {
    if (!source || typeof source !== "object") return source;
    const url =
      typeof source.url === "string" ? source.url.replace(/\s+/g, "") : source.url;
    return { ...source, url };
  });
}

function writeJson(filePath, payload) {
  const next = JSON.stringify(payload, null, 2) + "\n";
  const current = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, "utf-8")
    : "";
  if (current !== next) {
    fs.writeFileSync(filePath, next);
  }
}

function migrateLaws(version) {
  const files = listJsonFiles(LAWS_DIR);
  for (const filePath of files) {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    const next = {
      ...parsed,
      schema_version: version,
      sources: normalizeSources(parsed.sources)
    };
    writeJson(filePath, next);
  }
}

function migrateGeo(version) {
  if (!fs.existsSync(GEO_DIR)) return;
  const files = listJsonFiles(GEO_DIR);
  for (const filePath of files) {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.schema_version) {
      writeJson(filePath, parsed);
      continue;
    }
    const wrapped = {
      schema_version: version,
      items: parsed
    };
    writeJson(filePath, wrapped);
  }
}

function main() {
  const version = readSchemaVersion();
  migrateLaws(version);
  migrateGeo(version);
  console.log(`Migrated data to schema_version=${version}.`);
}

main();
