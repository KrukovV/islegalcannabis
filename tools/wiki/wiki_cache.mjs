import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DEFAULT_CACHE_PATH = path.join(ROOT, "data", "wiki", "cache", "legality_of_cannabis.json");

function resolvePath(customPath) {
  if (customPath) return customPath;
  return DEFAULT_CACHE_PATH;
}

export function loadCache(customPath) {
  const cachePath = resolvePath(customPath);
  if (!fs.existsSync(cachePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(cachePath, "utf8"));
  } catch {
    return null;
  }
}

export function saveCache(payload, customPath) {
  const cachePath = resolvePath(customPath);
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(payload, null, 2) + "\n");
}

export function cacheAgeHours(cache) {
  const fetchedAt = cache?.fetched_at ? new Date(cache.fetched_at).getTime() : 0;
  if (!fetchedAt) return null;
  const diffMs = Date.now() - fetchedAt;
  return diffMs / 36e5;
}

export function shouldRefresh(cache, maxAgeHours = 4) {
  if (!cache || !cache.revision_id || !cache.fetched_at || !Array.isArray(cache.rows)) {
    return true;
  }
  const age = cacheAgeHours(cache);
  if (age === null || Number.isNaN(age)) return true;
  return age > maxAgeHours;
}
