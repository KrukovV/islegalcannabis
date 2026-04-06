import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const BASE_URL = process.env.AI_COVERAGE_BASE_URL || "http://127.0.0.1:3000";
const statesPath = path.join(ROOT, "data", "ai", "states_us.json");
const isoPath = path.join(ROOT, "data", "iso3166", "iso3166-1.json");
const airportsPath = path.join(ROOT, "data", "ai", "travel", "airports.json");
const reportPath = path.join(ROOT, "Reports", "ai-coverage.json");

const statesPayload = JSON.parse(fs.readFileSync(statesPath, "utf8"));
const isoPayload = JSON.parse(fs.readFileSync(isoPath, "utf8"));
const airportsPayload = JSON.parse(fs.readFileSync(airportsPath, "utf8"));
const stateGeos = Array.from(new Set(Object.values(statesPayload))).sort();
const countryGeos = (Array.isArray(isoPayload?.entries) ? isoPayload.entries : [])
  .map((entry) => String(entry?.alpha2 || entry?.id || "").toUpperCase())
  .filter((geo) => /^[A-Z]{2}$/.test(geo))
  .sort();
const allSupportedGeos = new Set([...countryGeos, ...stateGeos]);

function collectAirportGeoMismatches() {
  const mismatches = [];
  for (const [geo, airports] of Object.entries(airportsPayload || {})) {
    if (!allSupportedGeos.has(geo)) {
      mismatches.push({ geo, reason: "UNKNOWN_GEO_KEY" });
      continue;
    }
    for (const airport of Array.isArray(airports) ? airports : []) {
      const country = String(airport?.country || "").toUpperCase();
      const region = String(airport?.region || "").toUpperCase();
      if (!country || !allSupportedGeos.has(country)) {
        mismatches.push({ geo, iata: airport?.iata || "-", reason: "AIRPORT_COUNTRY_MISSING" });
        continue;
      }
      if (geo.startsWith("US-") && region && region !== geo) {
        mismatches.push({ geo, iata: airport?.iata || "-", reason: `REGION_MISMATCH:${region}` });
      }
      if (!geo.startsWith("US-") && country !== geo && region !== geo) {
        mismatches.push({ geo, iata: airport?.iata || "-", reason: `COUNTRY_MISMATCH:${country}` });
      }
    }
  }
  return mismatches;
}

async function checkGeo(geo) {
  const url = new URL("/api/check", BASE_URL);
  url.searchParams.set("country", geo);
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" }
    });
    if (!response.ok) {
      return { geo, ok: false, error: `HTTP_${response.status}` };
    }
    const payload = await response.json();
    if (!payload?.ok) {
      return { geo, ok: false, error: payload?.error?.code || "CHECK_NOT_OK" };
    }
    return { geo, ok: true, fallbackOnly: geo.startsWith("US-") && payload?.jurisdictionKey === "US" };
  } catch (error) {
    return { geo, ok: false, error: error instanceof Error ? error.message : "FETCH_FAILED" };
  }
}

async function main() {
  const ok = [];
  const missing = [];
  const errors = [];
  const fallbackOnlyStates = [];
  const airportGeoMismatches = collectAirportGeoMismatches();

  for (const geo of [...countryGeos, ...stateGeos]) {
    const result = await checkGeo(geo);
    if (result.ok) {
      ok.push(geo);
      if (result.fallbackOnly) fallbackOnlyStates.push(geo);
      continue;
    }
    if (String(result.error || "").startsWith("HTTP_404")) {
      missing.push(geo);
      continue;
    }
    errors.push({ geo, error: result.error || "UNKNOWN" });
  }

  const report = {
    baseUrl: BASE_URL,
    totals: {
      countries: countryGeos.length,
      usStates: stateGeos.length,
      ok: ok.length,
      missing: missing.length,
      errors: errors.length,
      fallbackOnlyStates: fallbackOnlyStates.length
      ,
      airportGeoMismatches: airportGeoMismatches.length
    },
    ok,
    missing,
    errors,
    fallbackOnlyStates,
    airportGeoMismatches
  };

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`AI_COVERAGE_REPORT_OK file=${path.relative(ROOT, reportPath)} ok=${ok.length} missing=${missing.length} errors=${errors.length} fallback_only_states=${fallbackOnlyStates.length} airport_geo_mismatches=${airportGeoMismatches.length}`);
}

await main();
