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

  if (!Array.isArray(data.alpha2)) {
    throw new Error("iso3166-1.json alpha2 must be an array.");
  }

  if (data.alpha2.length !== 249) {
    throw new Error(`iso3166-1.json must contain 249 codes, got ${data.alpha2.length}.`);
  }

  const seen = new Set();
  for (const code of data.alpha2) {
    if (!/^[A-Z]{2}$/.test(code)) {
      throw new Error(`Invalid alpha-2 code: ${code}`);
    }
    if (seen.has(code)) {
      throw new Error(`Duplicate alpha-2 code: ${code}`);
    }
    seen.add(code);
  }
}

validateIsoFile();
console.log("iso3166-1.json validated.");
