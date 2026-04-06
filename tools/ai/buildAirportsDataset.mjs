#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import https from "node:https";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const TMP_DIR = path.join(ROOT, "tmp", "ourairports");
const OUT_PATH = path.join(ROOT, "data", "ai", "travel", "airports.json");
const AIRPORTS_URL = "https://ourairports.com/data/airports.csv";
const COUNTRIES_URL = "https://ourairports.com/data/countries.csv";
const STRICT_IATA = new Set(["DXB"]);

function download(url, target) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(target);
    https
      .get(url, (response) => {
        if ((response.statusCode || 0) >= 300 && (response.statusCode || 0) < 400 && response.headers.location) {
          file.close();
          fs.unlinkSync(target);
          download(response.headers.location, target).then(resolve, reject);
          return;
        }
        if (response.statusCode !== 200) {
          file.close();
          fs.unlinkSync(target);
          reject(new Error(`Download failed ${url}: ${response.statusCode}`));
          return;
        }
        response.pipe(file);
        file.on("finish", () => file.close(resolve));
      })
      .on("error", (error) => {
        file.close();
        try {
          fs.unlinkSync(target);
        } catch {}
        reject(error);
      });
  });
}

function parseCsv(text) {
  const rows = [];
  let field = "";
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === "\"") {
        if (text[i + 1] === "\"") {
          field += "\"";
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === "\"") {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    if (char !== "\r") {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function toObjects(rows) {
  const [header, ...rest] = rows;
  return rest.map((values) => Object.fromEntries(header.map((key, index) => [key, values[index] ?? ""])));
}

function groupAirport(map, key, airport) {
  if (!key) return;
  if (!map[key]) map[key] = [];
  map[key].push(airport);
}

function isMilitaryLike(value) {
  return /\b(air base|air force|army air field|naval air station|military|fort bliss)\b/i.test(value);
}

async function main() {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  const airportsPath = path.join(TMP_DIR, "airports.csv");
  const countriesPath = path.join(TMP_DIR, "countries.csv");
  await download(AIRPORTS_URL, airportsPath);
  await download(COUNTRIES_URL, countriesPath);

  const airports = toObjects(parseCsv(fs.readFileSync(airportsPath, "utf8")));
  const countries = toObjects(parseCsv(fs.readFileSync(countriesPath, "utf8")));
  const validCountries = new Set(countries.map((row) => String(row.code || "").trim().toUpperCase()).filter(Boolean));
  const grouped = {};

  for (const row of airports) {
    const type = String(row.type || "");
    const country = String(row.iso_country || "").trim().toUpperCase();
    const region = String(row.iso_region || "").trim().toUpperCase();
    const iata = String(row.iata_code || "").trim().toUpperCase();
    const icao = String(row.gps_code || row.ident || "").trim().toUpperCase();
    const scheduled = String(row.scheduled_service || "").trim().toLowerCase();
    const name = String(row.name || "").trim();
    const city = String(row.municipality || "").trim() || undefined;
    if (!validCountries.has(country)) continue;
    if (!iata) continue;
    if (type !== "large_airport" && type !== "medium_airport") continue;
    if (scheduled !== "yes") continue;
    if (isMilitaryLike(name)) continue;
    const airport = {
      iata,
      icao,
      name,
      country,
      region: region || undefined,
      city,
      _rank: type === "large_airport" ? 0 : 1,
      _international: /\binternational\b/i.test(name) ? 0 : 1,
      ...(STRICT_IATA.has(iata) ? { strict: true } : {})
    };
    if (!airport.name) continue;
    groupAirport(grouped, country, airport);
    if (region) groupAirport(grouped, region, airport);
  }

  const sorted = Object.fromEntries(
    Object.entries(grouped)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, items]) => [
        key,
        items
          .sort((left, right) => {
            if (Boolean(right.strict) !== Boolean(left.strict)) return Number(Boolean(right.strict)) - Number(Boolean(left.strict));
            if (Number(left._international || 9) !== Number(right._international || 9)) {
              return Number(left._international || 9) - Number(right._international || 9);
            }
            if (Number(left._rank || 9) !== Number(right._rank || 9)) return Number(left._rank || 9) - Number(right._rank || 9);
            return String(left.name).localeCompare(String(right.name));
          })
          .map(({ _rank, _international, ...airport }) => airport)
          .slice(0, 64)
      ])
  );

  fs.writeFileSync(OUT_PATH, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`AIRPORTS_DATASET_OK keys=${Object.keys(sorted).length} out=${path.relative(ROOT, OUT_PATH)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
