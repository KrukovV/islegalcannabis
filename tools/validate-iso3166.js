const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();
const ISO_PATH = path.join(ROOT, "data", "iso3166", "iso3166-1.json");

function validateIsoFile() {
  if (!fs.existsSync(ISO_PATH)) {
    throw new Error("Missing data/iso3166/iso3166-1.json.");
  }

  const raw = fs.readFileSync(ISO_PATH, "utf-8");
  const data = JSON.parse(raw);

  if (data.version !== "iso3166-1") {
    throw new Error("iso3166-1.json version must be \"iso3166-1\".");
  }

  if (typeof data.generated_at !== "string") {
    throw new Error("iso3166-1.json generated_at must be a string.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.generated_at)) {
    throw new Error("iso3166-1.json generated_at must be YYYY-MM-DD.");
  }

  if (!Array.isArray(data.entries)) {
    throw new Error("iso3166-1.json entries must be an array.");
  }

  if (data.entries.length !== 249) {
    throw new Error(`iso3166-1.json must contain 249 entries, got ${data.entries.length}.`);
  }

  const seen = new Set();
  for (const entry of data.entries) {
    const alpha2 = entry?.alpha2;
    const alpha3 = entry?.alpha3;
    const name = entry?.name;
    const id = entry?.id;

    if (!/^[A-Z]{2}$/.test(alpha2)) {
      throw new Error(`Invalid alpha-2 code: ${alpha2}`);
    }
    if (!/^[A-Z]{3}$/.test(alpha3) && alpha3 !== "UNK") {
      throw new Error(`Invalid alpha-3 code: ${alpha3}`);
    }
    if (typeof name !== "string" || name.trim().length === 0) {
      throw new Error(`Invalid name for ${alpha2}`);
    }
    if (id !== alpha2) {
      throw new Error(`Invalid id for ${alpha2}: ${id}`);
    }
    if (seen.has(alpha2)) {
      throw new Error(`Duplicate alpha-2 code: ${alpha2}`);
    }
    seen.add(alpha2);
  }
}

validateIsoFile();
console.log("iso3166-1.json validated.");
