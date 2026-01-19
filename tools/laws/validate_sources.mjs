import fs from "node:fs";
import path from "node:path";
import { normalizeSources } from "../../packages/shared/src/sources.js";
import { loadSourceRegistries } from "../sources/load_registries.mjs";

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

const roots = [
  path.join(process.cwd(), "data", "laws", "us"),
  path.join(process.cwd(), "data", "laws", "eu"),
  path.join(process.cwd(), "data", "laws", "world")
];

const violations = [];
const registries = loadSourceRegistries();

for (const root of roots) {
  if (!fs.existsSync(root)) continue;
  const files = fs.readdirSync(root).filter((file) => file.endsWith(".json"));
  for (const file of files) {
    const filePath = path.join(root, file);
    const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (payload?.status !== "known") continue;
    const sources = normalizeSources(payload?.sources, registries).official;
    if (sources.length < 1) {
      violations.push(`${filePath}: known without sources`);
      continue;
    }
  }
}

if (violations.length > 0) {
  fail(violations[0]);
}

console.log("OK validate_sources");
