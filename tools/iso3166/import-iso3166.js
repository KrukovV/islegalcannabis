const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();
const ISO_PATH = path.join(ROOT, "data", "iso3166", "iso3166-1.json");
const CATALOG_PATH = path.join(ROOT, "data", "jurisdictions", "catalog.json");
const LAWS_DIR = path.join(ROOT, "data", "laws");

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

function loadIsoList() {
  if (!fs.existsSync(ISO_PATH)) {
    throw new Error("Missing data/iso3166/iso3166-1.json.");
  }
  const raw = fs.readFileSync(ISO_PATH, "utf-8");
  const data = JSON.parse(raw);
  if (!Array.isArray(data.alpha2)) {
    throw new Error("Invalid iso3166-1.json format: missing alpha2 array.");
  }
  return data.alpha2;
}

function loadCatalog() {
  if (!fs.existsSync(CATALOG_PATH)) {
    return [];
  }
  const raw = fs.readFileSync(CATALOG_PATH, "utf-8");
  return JSON.parse(raw);
}

function loadLawIndex() {
  const files = listJsonFiles(LAWS_DIR);
  const byCountry = new Map();
  for (const file of files) {
    const raw = fs.readFileSync(file, "utf-8");
    const data = JSON.parse(raw);
    const code = data.country?.toUpperCase();
    if (!code) continue;
    if (data.region) continue;
    if (!byCountry.has(code)) {
      byCountry.set(code, data);
    }
  }
  return byCountry;
}

function normalizeEntry(entry) {
  return {
    country: entry.country,
    kind: entry.kind ?? "iso3166-1",
    target: entry.target !== false,
    hasLawProfile: Boolean(entry.hasLawProfile),
    lastVerifiedAt: entry.lastVerifiedAt ?? null,
    status: entry.status ?? "pending",
    notes: Array.isArray(entry.notes) ? entry.notes : [],
    sources: Array.isArray(entry.sources) ? entry.sources : []
  };
}

function syncCatalog() {
  const isoList = loadIsoList();
  const existingCatalog = loadCatalog();
  const lawIndex = loadLawIndex();

  const existingByCountry = new Map(
    existingCatalog
      .filter((entry) => entry.country)
      .map((entry) => [entry.country.toUpperCase(), normalizeEntry(entry)])
  );

  const nextCatalog = [];

  for (const codeRaw of isoList) {
    const code = String(codeRaw).toUpperCase();
    if (!code) continue;

    const existing = existingByCountry.get(code);
    const lawProfile = lawIndex.get(code);
    const hasLawProfile = Boolean(lawProfile);
    const next = existing ?? {
      country: code,
      kind: "iso3166-1",
      target: true,
      hasLawProfile: hasLawProfile,
      lastVerifiedAt: lawProfile?.verified_at ?? null,
      status: hasLawProfile ? lawProfile.status ?? "known" : "pending",
      notes: [],
      sources: Array.isArray(lawProfile?.sources) ? lawProfile.sources : []
    };

    const previousHasLawProfile = next.hasLawProfile;
    next.kind = "iso3166-1";
    next.target = true;
    next.hasLawProfile = hasLawProfile;
    if (hasLawProfile) {
      next.lastVerifiedAt = lawProfile?.verified_at ?? next.lastVerifiedAt ?? null;
      if (!next.status || next.status === "pending") {
        next.status = lawProfile?.status ?? "known";
      }
    } else {
      next.lastVerifiedAt = null;
    }
    if (Array.isArray(next.notes) === false) {
      next.notes = [];
    }
    if (hasLawProfile) {
      if (!Array.isArray(next.sources) || next.sources.length === 0) {
        next.sources = Array.isArray(lawProfile?.sources) ? lawProfile.sources : [];
      }
    } else if (!Array.isArray(next.sources)) {
      next.sources = [];
    }

    nextCatalog.push(next);
  }

  for (const entry of existingCatalog) {
    const code = entry.country?.toUpperCase();
    if (!code) {
      nextCatalog.push(entry);
      continue;
    }
    if (!existingByCountry.has(code)) {
      nextCatalog.push(entry);
    }
  }

  fs.mkdirSync(path.dirname(CATALOG_PATH), { recursive: true });
  fs.writeFileSync(
    CATALOG_PATH,
    JSON.stringify(nextCatalog, null, 2) + "\n",
    "utf-8"
  );
}

syncCatalog();
