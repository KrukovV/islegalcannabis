import fs from "node:fs";
import path from "node:path";

const sourceUrl = process.env.NEW_MAP_SOURCE_URL || "http://127.0.0.1:3000/api/new-map/countries";
const outputPath = path.resolve(process.cwd(), "apps/web/src/data/legalSnapshot.json");

const response = await fetch(sourceUrl, { cache: "no-store" });
if (!response.ok) {
  throw new Error(`EXPORT_SNAPSHOT_FAIL status=${response.status} url=${sourceUrl}`);
}

const payload = await response.json();
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2) + "\n");

console.log(`EXPORT_SNAPSHOT_OK url=${sourceUrl} output=${outputPath} features=${Array.isArray(payload?.features) ? payload.features.length : 0}`);
