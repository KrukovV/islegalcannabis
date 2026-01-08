import fs from "node:fs";
import path from "node:path";

export function readSchemaVersion(rootDir = process.cwd()) {
  const schemaPath = path.join(rootDir, "packages", "shared", "src", "data", "schema.ts");
  const raw = fs.readFileSync(schemaPath, "utf-8");
  const match = raw.match(/DATA_SCHEMA_VERSION\s*=\s*(\d+)/);
  if (!match) {
    throw new Error("Unable to read DATA_SCHEMA_VERSION from schema.ts");
  }
  return Number(match[1]);
}
