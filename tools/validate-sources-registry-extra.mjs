import fs from "node:fs";
import path from "node:path";

function fail(message) {
  console.error(`ERROR: sources registry invalid: ${message}`);
  process.exit(1);
}

const registryPath = path.join(process.cwd(), "data", "sources", "registry.json");
if (!fs.existsSync(registryPath)) {
  fail(`Missing ${registryPath}`);
}

const raw = fs.readFileSync(registryPath, "utf8");
const entries = JSON.parse(raw);
if (!Array.isArray(entries)) fail("registry must be an array");

const seen = new Set();
for (const entry of entries) {
  if (!entry || typeof entry !== "object") fail("entry must be an object");
  if (!entry.country || typeof entry.country !== "string") fail("entry.country required");
  const key = entry.country.toUpperCase();
  if (seen.has(key)) fail(`duplicate entry for ${key}`);
  seen.add(key);
  if (!Array.isArray(entry.sources) || entry.sources.length === 0) {
    fail(`entry.sources required for ${key}`);
  }
  for (const source of entry.sources) {
    if (!source.title || !source.url || !source.kind || !source.checked_at) {
      fail(`source missing fields for ${key}`);
    }
    if (!/^https:\/\//.test(source.url)) {
      fail(`source url must be https for ${key}`);
    }
    if (typeof source.weight !== "number") {
      fail(`source weight must be number for ${key}`);
    }
  }
}
