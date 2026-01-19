import fs from "node:fs";
import path from "node:path";
import { buildSmokeTracePayload } from "./trace_payload.mjs";

let isoNameMap = null;
let stateNameMap = null;
let sourcesCountCache = null;

function findRepoRoot(startDir) {
  let current = startDir;
  for (let i = 0; i < 10; i += 1) {
    const candidate = path.join(current, "data", "iso3166", "iso3166-1.json");
    if (fs.existsSync(candidate)) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return startDir;
}

function loadIsoNameMap(startDir) {
  if (isoNameMap) return isoNameMap;
  const root = findRepoRoot(startDir);
  const isoPath = path.join(root, "data", "iso3166", "iso3166-1.json");
  const map = new Map();
  if (fs.existsSync(isoPath)) {
    const payload = JSON.parse(fs.readFileSync(isoPath, "utf8"));
    const entries = Array.isArray(payload?.entries) ? payload.entries : [];
    for (const entry of entries) {
      const alpha2 = entry?.alpha2 || entry?.id;
      const name = entry?.name;
      if (alpha2 && name) {
        map.set(String(alpha2).toUpperCase(), String(name));
      }
    }
  }
  isoNameMap = map;
  return map;
}

function loadStateNameMap(startDir) {
  if (stateNameMap) return stateNameMap;
  const root = findRepoRoot(startDir);
  const statePath = path.join(root, "data", "geo", "us_state_centroids.json");
  const map = new Map();
  if (fs.existsSync(statePath)) {
    const payload = JSON.parse(fs.readFileSync(statePath, "utf8"));
    const items = payload?.items ?? {};
    Object.entries(items).forEach(([key, value]) => {
      const name = value?.name;
      if (name) {
        const normalizedKey = String(key).replace(/^US-/, "").toUpperCase();
        map.set(normalizedKey, String(name));
        map.set(String(key).toUpperCase(), String(name));
      }
    });
  }
  stateNameMap = map;
  return map;
}

function kindForEntry(entry) {
  return entry?.region ? "region" : "country";
}

function loadSourcesCountCache(startDir) {
  if (sourcesCountCache) return sourcesCountCache;
  sourcesCountCache = new Map();
  const root = findRepoRoot(startDir);
  const dirs = {
    us: path.join(root, "data", "laws", "us"),
    eu: path.join(root, "data", "laws", "eu"),
    world: path.join(root, "data", "laws", "world")
  };
  sourcesCountCache.set("__root", root);
  sourcesCountCache.set("__dirs", dirs);
  return sourcesCountCache;
}

function readSourcesCount(root, dirs, countryCode, regionCode) {
  const cacheKey = `${countryCode}${regionCode ? `-${regionCode}` : ""}`;
  if (sourcesCountCache.has(cacheKey)) {
    return sourcesCountCache.get(cacheKey);
  }
  const candidates = [];
  if (countryCode === "US" && regionCode) {
    candidates.push(path.join(dirs.us, `${regionCode}.json`));
  } else if (countryCode) {
    candidates.push(path.join(dirs.eu, `${countryCode}.json`));
    candidates.push(path.join(dirs.world, `${countryCode}.json`));
  }
  let count = null;
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    try {
      const payload = JSON.parse(fs.readFileSync(file, "utf8"));
      const sources = Array.isArray(payload?.sources) ? payload.sources : [];
      count = sources.length;
      break;
    } catch {
      count = null;
    }
  }
  sourcesCountCache.set(cacheKey, count);
  return count;
}

export function buildCheckedArtifact(checks) {
  const root = process.cwd();
  const nameMap = loadIsoNameMap(root);
  const stateMap = loadStateNameMap(root);
  const sourcesCache = loadSourcesCountCache(root);
  const sourcesRoot = sourcesCache.get("__root");
  const sourcesDirs = sourcesCache.get("__dirs");
  const payload = buildSmokeTracePayload({ passed: 0, failed: 0, checks });
  return payload.checks.map((entry) => {
    const fallbackCountry =
      typeof entry.id === "string" && entry.id.includes("-")
        ? entry.id.split("-")[0]
        : typeof entry.id === "string"
          ? entry.id
          : "";
    const countryCode = String(entry.country ?? fallbackCountry ?? "")
      .trim()
      .toUpperCase();
    const regionCode =
      typeof entry.region === "string" && entry.region.trim()
        ? entry.region.trim().toUpperCase()
        : entry.id?.includes("-")
          ? entry.id.split("-")[1]?.trim().toUpperCase()
          : "";
    const countryName = nameMap.get(countryCode) ?? "";
    const isRegion = Boolean(regionCode);
    let name = countryName;
    if (isRegion) {
      let regionLabel = regionCode;
      if (countryCode === "US" && regionCode.length === 2) {
        regionLabel =
          stateMap.get(regionCode) ??
          stateMap.get(`US-${regionCode}`) ??
          regionCode;
      }
      name = countryName
        ? `${countryName} / ${regionLabel}`
        : regionLabel
          ? `Unknown / ${regionLabel}`
          : "Unknown";
    }
    if (!name) {
      name = "Unknown";
    }
    const missingName = !countryName;
    let sourcesCount = Number(entry?.verified_sources_count ?? 0);
    if (!Number.isFinite(sourcesCount) || sourcesCount <= 0) {
      const derived = readSourcesCount(
        sourcesRoot,
        sourcesDirs,
        countryCode,
        regionCode
      );
      if (Number.isFinite(derived)) {
        sourcesCount = derived;
      }
    }
    const sourcesPresent =
      typeof entry?.verified_sources_present === "boolean"
        ? entry.verified_sources_present
        : sourcesCount > 0;
    return {
      id: entry.id,
      flag: entry.flag,
      kind: kindForEntry(entry),
      name,
      status: entry?.status ?? "unknown",
      method: entry?.method ?? entry?.source ?? "unknown",
      verified_sources_count: Number.isFinite(sourcesCount) ? sourcesCount : 0,
      verified_sources_present: Boolean(sourcesPresent),
      ...(missingName ? { missingName: true } : {})
    };
  });
}

export function writeCheckedArtifact(checks, outputPath) {
  const root = process.cwd();
  const reportsDir = path.join(root, "Reports", "checked");
  const targetPath =
    outputPath ?? path.join(reportsDir, "last_checked.json");
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const entries = buildCheckedArtifact(checks);
  fs.writeFileSync(targetPath, JSON.stringify(entries, null, 2) + "\n");
  return { path: targetPath, count: entries.length };
}
