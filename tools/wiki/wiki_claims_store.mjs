import fs from "node:fs";
import path from "node:path";

function getPaths() {
  const root = process.cwd();
  return {
    claimsDir: path.join(root, "data", "wiki", "wiki_claims"),
    snapshotPath: path.join(root, "data", "wiki", "wiki_claims.json"),
    ssotClaimsPath: path.join(root, "data", "wiki_ssot", "wiki_claims.json")
  };
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function normalizeClaim(entry) {
  if (!entry || typeof entry !== "object") return null;
  const mainArticles = Array.isArray(entry.main_articles)
    ? entry.main_articles
    : Array.isArray(entry.notes_main_articles)
      ? entry.notes_main_articles
      : [];
  const notesRaw =
    typeof entry.notes_raw === "string"
      ? entry.notes_raw
      : typeof entry.notes_text === "string"
        ? entry.notes_text
        : "";
  const wikiRefs = Array.isArray(entry.wiki_refs) ? entry.wiki_refs : [];
  const wikiRec =
    entry.wiki_rec || entry.rec_status || entry.recreational_status || "Unknown";
  const wikiMed =
    entry.wiki_med || entry.med_status || entry.medical_status || "Unknown";
  return {
    ...entry,
    geo_key: String(entry.geo_key || entry.geoKey || entry.geo || "").toUpperCase(),
    wiki_rec: wikiRec,
    wiki_med: wikiMed,
    notes_raw: notesRaw,
    main_articles: mainArticles,
    wiki_refs: wikiRefs,
    recreational_status: entry.recreational_status || wikiRec,
    medical_status: entry.medical_status || wikiMed,
    notes_main_articles: Array.isArray(entry.notes_main_articles)
      ? entry.notes_main_articles
      : mainArticles
  };
}

export function readWikiClaimsSnapshot() {
  const { ssotClaimsPath, snapshotPath } = getPaths();
  const ssotPayload = readJson(ssotClaimsPath, null);
  if (ssotPayload) {
    const ssotItems = Array.isArray(ssotPayload) ? ssotPayload : ssotPayload?.items;
    if (Array.isArray(ssotItems)) {
      return ssotItems.map((entry) => normalizeClaim(entry)).filter(Boolean);
    }
  }
  const payload = readJson(snapshotPath, null);
  if (!payload) return null;
  const items = Array.isArray(payload) ? payload : payload?.items;
  if (!Array.isArray(items)) return null;
  return items.map((entry) => normalizeClaim(entry)).filter(Boolean);
}

export function readWikiClaim(geoKey) {
  const key = String(geoKey || "").toUpperCase();
  if (!key) return null;
  const { claimsDir } = getPaths();
  const snapshot = readWikiClaimsSnapshot();
  if (snapshot) {
    const match = snapshot.find((entry) => entry?.geo_key === key);
    if (match) return match;
  }
  const claimPath = path.join(claimsDir, `${key}.json`);
  return normalizeClaim(readJson(claimPath, null));
}

export const WIKI_CLAIMS_SNAPSHOT_PATH = path.join(
  process.cwd(),
  "data",
  "wiki",
  "wiki_claims.json"
);
