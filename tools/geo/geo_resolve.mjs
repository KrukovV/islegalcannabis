#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const input = process.argv.slice(2).join(" ").trim();
if (!input) {
  console.error("Usage: geo_resolve.mjs <input>");
  process.exit(2);
}

const match = input.split(",").map((part) => part.trim());
const regionInput = match[0] || "";
const country = (match[1] || "").toUpperCase();

const US_ADM1_PATH = path.join(process.cwd(), "data", "centroids", "us_adm1.json");

function normalizeRegionName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function loadUsAdm1NameMap() {
  if (!fs.existsSync(US_ADM1_PATH)) return {};
  const payload = JSON.parse(fs.readFileSync(US_ADM1_PATH, "utf8"));
  const items = payload?.items ?? {};
  const map = {};
  for (const [key, entry] of Object.entries(items)) {
    const name = normalizeRegionName(String(entry?.name || ""));
    if (!name || !key.startsWith("US-")) continue;
    map[name] = key.slice(3);
  }
  return map;
}

function resolveUsRegion(region) {
  const cleaned = region.trim();
  const upper = cleaned.toUpperCase();
  if (upper.startsWith("US-")) return { region: upper.slice(3), source: "code" };
  if (upper.startsWith("US_")) return { region: upper.slice(3), source: "code" };
  if (upper.length === 2) return { region: upper, source: "code" };
  const map = loadUsAdm1NameMap();
  const normalized = normalizeRegionName(cleaned);
  const code = map[normalized];
  if (code) return { region: code, source: "adm1" };
  return { region: upper, source: "unknown" };
}

if (country === "US") {
  const resolved = resolveUsRegion(regionInput);
  console.log(`GEO_RESOLVE: input="${regionInput}, ${country}" -> geo=US-${resolved.region} source=${resolved.source}`);
} else {
  console.log(`GEO_RESOLVE: input="${regionInput}, ${country}" -> geo=${country} source=country`);
}
