import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_URL = "https://raw.githubusercontent.com/mledoze/countries/master/countries.json";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const outputPath = path.join(repoRoot, "apps", "web", "src", "lib", "countryNames.snapshot.json");

const response = await fetch(SOURCE_URL, {
  headers: {
    "user-agent": "islegalcannabis-country-names-generator"
  }
});

if (!response.ok) {
  throw new Error(`Failed to download ${SOURCE_URL}: ${response.status} ${response.statusText}`);
}

const payload = await response.json();
const countries = Array.isArray(payload)
  ? payload
      .filter((entry) => typeof entry?.cca2 === "string" && entry.cca2.length === 2)
      .map((entry) => ({
        cca2: entry.cca2,
        cca3: typeof entry.cca3 === "string" ? entry.cca3 : null,
        name: {
          common: entry?.name?.common || null,
          official: entry?.name?.official || null,
          native: entry?.name?.native || {}
        },
        translations: entry?.translations || {},
        latlng:
          Array.isArray(entry?.latlng) && entry.latlng.length >= 2
            ? [Number(entry.latlng[0]), Number(entry.latlng[1])]
            : null
      }))
      .sort((a, b) => a.cca2.localeCompare(b.cca2))
  : [];

const snapshot = {
  source: "mledoze/countries",
  sourceUrl: SOURCE_URL,
  generatedAt: new Date().toISOString(),
  countries
};

await fs.writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(`WROTE_COUNTRY_NAMES_SNAPSHOT=${outputPath}`);
