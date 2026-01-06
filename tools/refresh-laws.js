const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();
const LAWS_DIR = path.join(ROOT, "data", "laws");
const CACHE_PATH = path.join(ROOT, "data", "jurisdictions", "source-cache.json");
const REFRESH_WINDOW_MS = 12 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 4000;

function listJsonFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listJsonFiles(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(fullPath);
    }
  }
  return files;
}

function loadCache() {
  if (!fs.existsSync(CACHE_PATH)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function saveCache(cache) {
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2) + "\n", "utf-8");
}

function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function isStale(profile, now) {
  if (profile.status !== "known") return false;
  const verifiedDate = parseDate(profile.verified_at);
  if (!verifiedDate) return true;
  return now - verifiedDate > REFRESH_WINDOW_MS;
}

function normalizeHeader(value) {
  if (!value) return null;
  return String(value).trim();
}

function detectHeaderChange(previous, next) {
  if (!previous) return false;
  if (!next) return false;
  return (
    previous.etag !== next.etag ||
    previous.lastModified !== next.lastModified ||
    previous.contentLength !== next.contentLength
  );
}

async function fetchHeaders(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let response = null;
  try {
    response = await fetch(url, { method: "HEAD", signal: controller.signal });
  } catch {
    response = null;
  }

  if (!response || !response.ok) {
    try {
      response = await fetch(url, { method: "GET", signal: controller.signal });
    } catch {
      response = null;
    }
  }

  clearTimeout(timeout);

  if (!response || !response.ok) {
    return { ok: false };
  }

  return {
    ok: true,
    etag: normalizeHeader(response.headers.get("etag")),
    lastModified: normalizeHeader(response.headers.get("last-modified")),
    contentLength: normalizeHeader(response.headers.get("content-length"))
  };
}

async function refreshLawProfile(profile, cache, now, fetchFn = fetchHeaders) {
  let status = profile.status;
  let verifiedAt = profile.verified_at;
  let hadFailure = false;
  let hasChange = false;

  const sources = Array.isArray(profile.sources) ? profile.sources : [];
  for (const source of sources) {
    const url = source.url;
    if (!url) continue;
    const previous = cache[url] ?? null;
    const result = await fetchFn(url);
    if (!result.ok) {
      hadFailure = true;
      continue;
    }

    if (detectHeaderChange(previous, result)) {
      hasChange = true;
    }

    cache[url] = {
      etag: result.etag,
      lastModified: result.lastModified,
      contentLength: result.contentLength,
      checkedAt: now.toISOString()
    };
  }

  if (hasChange) {
    status = "needs_review";
  }

  if (hadFailure) {
    if (profile.confidence === "low") {
      status = "unknown";
    } else {
      status = "needs_review";
    }
  }

  if (!hadFailure && !hasChange) {
    verifiedAt = now.toISOString().slice(0, 10);
  }

  return {
    ...profile,
    status,
    verified_at: verifiedAt
  };
}

async function main() {
  const files = listJsonFiles(LAWS_DIR);
  const cache = loadCache();
  const now = new Date();
  let updatedCount = 0;

  for (const file of files) {
    const raw = fs.readFileSync(file, "utf-8");
    const profile = JSON.parse(raw);
    if (!isStale(profile, now)) continue;

    const refreshed = await refreshLawProfile(profile, cache, now);
    if (JSON.stringify(refreshed) !== JSON.stringify(profile)) {
      fs.writeFileSync(file, JSON.stringify(refreshed, null, 2) + "\n", "utf-8");
      updatedCount += 1;
      console.log(`[refresh] ${profile.id} -> ${refreshed.status}`);
    }
  }

  saveCache(cache);
  console.log(`Refresh complete. Updated ${updatedCount} profiles.`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  refreshLawProfile,
  detectHeaderChange
};
