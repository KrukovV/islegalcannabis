import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { deriveCountryStatusModel } from "../apps/web/src/lib/countryStatusDerivation.js";

const ROOT = process.cwd();
const GEOJSON_PATH = path.join(ROOT, "data", "geojson", "ne_10m_admin_0_countries.geojson");
const OUTPUT_DIR = path.join(ROOT, "data", "countries");
const OUTPUT_INDEX_PATH = path.join(ROOT, "data", "index.json");
const GRAPH_DIR = path.join(ROOT, "data", "graph");
const GRAPH_PATH = path.join(GRAPH_DIR, "country-graph.json");
const US_STATE_CENTROIDS_PATH = path.join(ROOT, "data", "centroids", "us_adm1.json");
const US_STATE_ROWS_PATH = path.join(ROOT, "data", "wiki", "cache", "legality_us_states.json");
const US_STATE_WIKI_PATH = path.join(ROOT, "data", "ssot", "us_states_wiki.json");
const US_LAWS_DIR = path.join(ROOT, "data", "laws", "us");
const WIKI_LEGALITY_TABLE_PATH = path.join(ROOT, "data", "wiki", "ssot_legality_table.json");
const WIKI_CLAIMS_MAP_PATH = path.join(ROOT, "data", "wiki", "wiki_claims_map.json");
const WIKI_CLAIMS_ENRICHED_PATH = path.join(ROOT, "data", "wiki", "wiki_claims_enriched.json");
const WIKI_TRAVERSAL_CACHE_PATH = path.join(ROOT, "data", "wiki", "wiki_traversal_cache.json");

const CLUSTER_MAP = {
  LATAM: new Set(["arg", "bra", "chl", "col", "per", "pry", "ury"]),
  EU: new Set(["cze", "deu", "esp", "fra", "ita", "nld", "prt"]),
  ASIA: new Set(["ind", "jpn", "kor", "phl", "tha"]),
  AFRICA: new Set(["ken", "mar", "zaf"]),
  NA: new Set(["can", "mex", "usa"]),
  OCEANIA: new Set(["aus", "nzl"])
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableSerialize(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash("sha256").update(stableSerialize(value)).digest("hex");
}

function computeHashes(entry) {
  const withoutHashes = { ...entry };
  delete withoutHashes.hashes;
  return {
    code: entry.code,
    content_hash: sha256({
      legal_model: entry.legal_model,
      notes_normalized: entry.notes_normalized,
      facts: entry.facts,
      graph: {
        geo_neighbors: entry.graph.geo_neighbors.map((item) => item.code),
        legal_similarity: entry.graph.legal_similarity.map((item) => item.code),
        cluster_links: entry.graph.cluster_links.map((item) => item.code),
        same_country_states: entry.graph.same_country_states.map((item) => item.code),
        federal_parent: entry.graph.federal_parent?.code || null
      }
    }),
    notes_hash: sha256(entry.notes_normalized),
    model_hash: sha256(withoutHashes)
  };
}

function toRegion(continent) {
  switch (String(continent || "").trim()) {
    case "Europe":
      return "EU";
    case "Africa":
      return "AFRICA";
    case "Asia":
      return "ASIA";
    case "Oceania":
      return "OCEANIA";
    case "North America":
      return "NA";
    case "South America":
      return "LATAM";
    default:
      return "OTHER";
  }
}

function resolveCluster(code, region) {
  for (const [cluster, codes] of Object.entries(CLUSTER_MAP)) {
    if (codes.has(code)) return cluster;
  }
  return region === "OTHER" ? "GLOBAL" : `${region}_GENERAL`;
}

function distanceSquared(left, right) {
  if (!left.coordinates || !right.coordinates) return Number.POSITIVE_INFINITY;
  return (
    Math.pow(left.coordinates.lat - right.coordinates.lat, 2) +
    Math.pow(left.coordinates.lng - right.coordinates.lng, 2)
  );
}

function toLinkRef(entry) {
  return { code: entry.code, name: entry.name };
}

function uniqueByCode(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item || seen.has(item.code)) return false;
    seen.add(item.code);
    return true;
  });
}

function takeLinkRefs(candidates, count, excluded = new Set()) {
  const result = [];
  for (const candidate of candidates) {
    if (!candidate || excluded.has(candidate.code)) continue;
    excluded.add(candidate.code);
    result.push(toLinkRef(candidate));
    if (result.length >= count) break;
  }
  return result;
}

function buildCountryCitations(entry) {
  const candidates = [
    entry.sources?.wiki
      ? {
          id: "wiki_country",
          url: entry.sources.wiki,
          title: `Wikipedia: ${entry.name}`,
          type: "external",
          weight: "low"
        }
      : null,
    entry.sources?.wiki_truth
      ? {
          id: "wiki_truth",
          url: entry.sources.wiki_truth,
          title: "Wikipedia: Legality of cannabis",
          type: "external",
          weight: "low"
        }
      : null
  ].filter(Boolean);
  return candidates;
}

function normalizeStateTitleFromWikiUrl(url, fallbackGeo) {
  const raw = String(url || "").split("/").pop() || String(fallbackGeo || "");
  return decodeURIComponent(raw)
    .replaceAll("_", " ")
    .replace(/\s*\((?:U\.S\.\s*state|state)\)$/i, "")
    .trim();
}

function mapLawValueToStatus(value, fallbackStatus = "ILLEGAL") {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "allowed" || normalized === "legal") return "LEGAL";
  if (normalized === "restricted") return "ILLEGAL";
  if (normalized === "illegal") return "ILLEGAL";
  return fallbackStatus;
}

function mapMedicalValueToStatus(value, fallbackStatus = "ILLEGAL") {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "allowed" || normalized === "legal" || normalized === "restricted") return "LEGAL";
  if (normalized === "illegal") return "ILLEGAL";
  return fallbackStatus;
}

function decodeUsStateHs(rawText) {
  const match = String(rawText || "").match(/\{\{Hs\|([0-9.]+)\}\}/i);
  return match ? match[1] : null;
}

function parseStateRecStatusFromRaw(rawText, wikiFallbackStatus = "ILLEGAL") {
  const raw = String(rawText || "").toLowerCase();
  const hs = decodeUsStateHs(rawText);
  if (hs === "1" || hs === "1.1") return "LEGAL";
  if (hs === "2" || hs === "4") return "DECRIMINALIZED";
  if (hs === "3" || hs === "5") return "ILLEGAL";
  if (!raw) return wikiFallbackStatus;
  if (raw.includes("decriminal") || raw.includes("cite and release") || raw.includes("not arresting")) return "DECRIMINALIZED";
  if (raw.includes("tolerat")) return "TOLERATED";
  if (/\blegal(?:ized)?\b|\ballowed\b|\bpermitted\b/.test(raw) && !/\billegal\b/.test(raw)) return "LEGAL";
  if (raw.includes("illegal")) return "ILLEGAL";
  return wikiFallbackStatus;
}

function parseStateMedicalStatus(rawText, lawValue, wikiFallbackStatus = "ILLEGAL") {
  if (lawValue) return mapMedicalValueToStatus(lawValue, wikiFallbackStatus);
  const raw = String(rawText || "").toLowerCase();
  const hs = decodeUsStateHs(rawText);
  if (/\blegal(?:ized)?\b|\ballowed\b|\bpermitted\b|\bmedical marijuana\b|\bmedical cannabis\b/.test(raw) && !/\billegal\b/.test(raw)) {
    return "LEGAL";
  }
  if (hs === "3") return "LEGAL";
  if (/\bde facto legal\b|\bcompassionate use\b|\bcbd\b/.test(raw)) return "LIMITED";
  if (raw.includes("illegal")) return "ILLEGAL";
  return wikiFallbackStatus;
}

function parseStateEnforcement(rawText, legalStatus) {
  const raw = String(rawText || "").toLowerCase();
  if (raw.includes("decriminal") || raw.includes("civil penalty") || raw.includes("fine")) return "MODERATE";
  if (raw.includes("tolerat") || raw.includes("not enforced")) return "UNENFORCED";
  if (legalStatus === "LEGAL" || legalStatus === "DECRIMINALIZED" || legalStatus === "TOLERATED") return "MODERATE";
  return "STRICT";
}

function parseStateEnforcementStrength(rawText, legalStatus) {
  const raw = String(rawText || "").toLowerCase();
  if (raw.includes("not enforced") || raw.includes("tolerat")) return "LOW";
  if (raw.includes("decriminal") || legalStatus === "LEGAL" || legalStatus === "DECRIMINALIZED" || legalStatus === "TOLERATED") {
    return "MEDIUM";
  }
  return "HIGH";
}

function formatStateNotes(entry) {
  const stateName = entry.name;
  const rec = entry.legal_model.recreational.status;
  const med = entry.legal_model.medical.status;
  const possession = entry.facts.possession_limit ? ` Possession is limited to ${entry.facts.possession_limit}.` : "";
  if (rec === "LEGAL") {
    return `Cannabis is legal in ${stateName} under state law for recreational adult use. Medical cannabis is ${med === "LEGAL" ? "also legal" : "not broadly legal"} in ${stateName}. Cannabis remains federally illegal in United States.${possession}`;
  }
  if (rec === "DECRIMINALIZED" || rec === "TOLERATED") {
    return `Cannabis is ${rec === "DECRIMINALIZED" ? "decriminalized" : "tolerated"} in ${stateName} in limited state-level practice, but it is not fully legal under state law. Medical cannabis is ${med === "LEGAL" ? "available in limited form" : "not broadly legal"} in ${stateName}. Cannabis remains federally illegal in United States.${possession}`;
  }
  if (med === "LEGAL") {
    return `Cannabis is illegal in ${stateName} for recreational use under state law, but medical cannabis is available in limited form. Cannabis remains federally illegal in United States.${possession}`;
  }
  return `Cannabis is illegal in ${stateName} under state law for recreational use, and medical cannabis is not broadly legal. Cannabis remains federally illegal in United States.${possession}`;
}

function loadUsStateCentroids() {
  const payload = readJson(US_STATE_CENTROIDS_PATH);
  return payload?.items || {};
}

function loadUsStateLawByGeo() {
  if (!fs.existsSync(US_LAWS_DIR)) return new Map();
  return new Map(
    fs.readdirSync(US_LAWS_DIR)
      .filter((fileName) => fileName.endsWith(".json"))
      .map((fileName) => {
        const law = readJson(path.join(US_LAWS_DIR, fileName));
        return [String(law.id || "").toUpperCase(), law];
      })
      .filter(([geo]) => /^US-[A-Z]{2}$/.test(geo))
  );
}

function loadUsStateWikiByGeo() {
  const wikiPayload = readJson(US_STATE_WIKI_PATH);
  return new Map(
    (Array.isArray(wikiPayload?.items) ? wikiPayload.items : [])
      .map((row) => [String(row.geo || "").toUpperCase(), row])
      .filter(([geo]) => /^US-[A-Z]{2}$/.test(geo))
  );
}

function loadUsStateRawRowsByGeo() {
  const rawPayload = readJson(US_STATE_ROWS_PATH);
  const wikiPayload = readJson(US_STATE_WIKI_PATH);
  const titleToGeo = new Map(
    (Array.isArray(wikiPayload?.items) ? wikiPayload.items : [])
      .map((row) => [
        normalizeStateTitleFromWikiUrl(row?.wiki_page_url, row?.geo || row?.state || row?.name || ""),
        String(row?.geo || "").toUpperCase()
      ])
      .filter(([title, geo]) => title && /^US-[A-Z]{2}$/.test(geo))
  );
  return new Map(
    (Array.isArray(rawPayload?.rows) ? rawPayload.rows : [])
      .map((row) => {
        const title = normalizeStateTitleFromWikiUrl(row?.wiki_row_url || row?.link || row?.name || "", row?.name || "");
        const geo = titleToGeo.get(title) || "";
        return [geo, row];
      })
      .filter(([geo]) => /^US-[A-Z]{2}$/.test(geo))
  );
}

function loadWikiLegalityTableByIso() {
  const payload = readJson(WIKI_LEGALITY_TABLE_PATH);
  return new Map(
    (Array.isArray(payload?.rows) ? payload.rows : [])
      .map((row) => [String(row.iso2 || "").toUpperCase(), row])
      .filter(([geo]) => /^[A-Z]{2}$/.test(geo))
  );
}

function loadWikiClaimsByIso() {
  const payload = readJson(WIKI_CLAIMS_MAP_PATH);
  const items = payload?.items && typeof payload.items === "object" ? payload.items : payload;
  return new Map(
    Object.entries(items || {})
      .map(([geo, row]) => [String(geo || "").toUpperCase(), row])
      .filter(([geo]) => /^[A-Z]{2}$/.test(geo))
  );
}

function loadWikiClaimRefsByIso() {
  const payload = readJson(WIKI_CLAIMS_ENRICHED_PATH);
  const items = payload?.items && typeof payload.items === "object" ? payload.items : payload;
  return new Map(
    Object.entries(items || {})
      .map(([geo, row]) => {
        let refs = [];
        if (Array.isArray(row)) {
          refs = row;
        } else if (row && typeof row === "object") {
          const values = Object.values(row);
          if (values.every((item) => item && typeof item === "object")) {
            refs = values;
          }
        }
        return [String(geo || "").toUpperCase(), refs];
      })
      .filter(([geo]) => /^[A-Z]{2}$/.test(geo))
  );
}

function loadWikiTraversalCache() {
  const payload = readJson(WIKI_TRAVERSAL_CACHE_PATH);
  const items = payload?.items && typeof payload.items === "object" ? payload.items : payload;
  return new Map(
    Object.entries(items || {})
      .map(([title, row]) => [String(title || ""), row])
      .filter(([title, row]) => title && row && typeof row === "object")
  );
}

function buildCountryEntries() {
  const geojson = readJson(GEOJSON_PATH);
  const wikiLegalityByIso = loadWikiLegalityTableByIso();
  const wikiClaimsByIso = loadWikiClaimsByIso();
  const wikiClaimRefsByIso = loadWikiClaimRefsByIso();
  const wikiTraversalCache = loadWikiTraversalCache();
  const geoMetaByIso3 = new Map(
    geojson.features
      .map((feature) => feature?.properties || {})
      .map((properties) => [
        String(properties.ISO_A3_EH || properties.ISO_A3 || "").toLowerCase(),
        {
          continent: String(properties.CONTINENT || "").trim(),
          iso2: String(properties.ISO_A2_EH || properties.ISO_A2 || "").toUpperCase(),
          lat: Number(properties.LABEL_Y),
          lng: Number(properties.LABEL_X)
        }
      ])
      .filter(([code]) => /^[a-z]{3}$/.test(code))
  );

  const index = readJson(OUTPUT_INDEX_PATH).filter((code) => /^[a-z]{3}$/.test(String(code || "")));
  const entries = index
    .map((code) => {
      const filePath = path.join(OUTPUT_DIR, `${code}.json`);
      if (!fs.existsSync(filePath)) return null;
      const current = readJson(filePath);
      const geoMeta = geoMetaByIso3.get(code) || {};
      const region = toRegion(geoMeta.continent);
      return {
        ...current,
        code,
        geo_code: String(current.iso2 || geoMeta.iso2 || "").toUpperCase(),
        iso2: String(current.iso2 || geoMeta.iso2 || "").toUpperCase(),
        name: current.name,
        node_type: "country",
        normalized_version: "v1",
        coordinates:
          current.coordinates && Number.isFinite(current.coordinates.lat) && Number.isFinite(current.coordinates.lng)
            ? current.coordinates
            : Number.isFinite(geoMeta.lat) && Number.isFinite(geoMeta.lng)
              ? { lat: geoMeta.lat, lng: geoMeta.lng }
              : null,
        parent_country: null,
        state_modifiers: null,
        sources: {
          wiki: current.sources?.wiki || null,
          wiki_truth: current.sources?.wiki_truth || null,
          citations: []
        },
        graph: {
          region,
          seo_cluster: resolveCluster(code, region),
          geo_neighbors: [],
          legal_similarity: [],
          cluster_links: [],
          same_country_states: [],
          federal_parent: null
        }
      };
    })
    .filter(Boolean);

  for (const entry of entries) {
    const wikiRow = wikiLegalityByIso.get(entry.iso2) || null;
    const wikiClaim = wikiClaimsByIso.get(entry.iso2) || null;
    const wikiRefs = wikiClaimRefsByIso.get(entry.iso2) || [];
    const notesMainArticles = Array.isArray(wikiClaim?.notes_main_articles) ? wikiClaim.notes_main_articles : [];
    const traversalPages = notesMainArticles
      .map((item) => wikiTraversalCache.get(String(item?.title || "").trim()))
      .filter(Boolean);
    const statusModel = deriveCountryStatusModel({
      geo: entry.iso2,
      countryName: entry.name,
      wikiRecStatus: wikiRow?.rec_status || wikiClaim?.wiki_rec || wikiClaim?.recreational_status || entry.legal_model?.recreational?.status,
      wikiMedStatus: wikiRow?.med_status || wikiClaim?.wiki_med || wikiClaim?.medical_status || entry.legal_model?.medical?.status,
      notes: wikiClaim?.notes_text || wikiClaim?.notes || wikiRow?.wiki_notes_hint || entry.notes_raw || "",
      rawNotes: wikiClaim?.notes_raw || wikiClaim?.notes_text || wikiRow?.wiki_notes_hint || entry.notes_raw || "",
      notesMainArticles,
      traversalPages,
      referenceSources: wikiRefs,
      sourceUrl: wikiClaim?.source_url || wikiRow?.source_url || null
    });
    entry.legal_model = statusModel;
    entry.notes_raw = String(
      wikiClaim?.notes_raw || wikiClaim?.notes_text || wikiRow?.wiki_notes_hint || entry.notes_raw || ""
    ).trim();
    entry.notes_normalized = statusModel.notes_normalized;
  }

  const entriesByCode = Object.fromEntries(entries.map((entry) => [entry.code, entry]));

  for (const entry of entries) {
    const others = entries.filter((candidate) => candidate.code !== entry.code);
    const geoCandidates = others
      .filter((candidate) => candidate.coordinates)
      .sort((left, right) => distanceSquared(entry, left) - distanceSquared(entry, right));
    const geoNeighbors = takeLinkRefs(geoCandidates, 3);

    const legalCandidates = others
      .filter(
        (candidate) =>
          candidate.legal_model?.recreational?.status === entry.legal_model?.recreational?.status ||
          candidate.legal_model?.recreational?.enforcement === entry.legal_model?.recreational?.enforcement ||
          candidate.legal_model?.medical?.status === entry.legal_model?.medical?.status
      )
      .sort((left, right) => distanceSquared(entry, left) - distanceSquared(entry, right));
    const legalExcluded = new Set(geoNeighbors.map((item) => item.code));
    const legalSimilarity = takeLinkRefs(legalCandidates, 3, legalExcluded);

    const clusterCandidates = others
      .filter(
        (candidate) =>
          candidate.graph.seo_cluster === entry.graph.seo_cluster || candidate.graph.region === entry.graph.region
      )
      .sort((left, right) => distanceSquared(entry, left) - distanceSquared(entry, right));
    const clusterExcluded = new Set([...geoNeighbors, ...legalSimilarity].map((item) => item.code));
    const clusterLinks = takeLinkRefs(clusterCandidates, 2, clusterExcluded);

    entry.graph.geo_neighbors = uniqueByCode(geoNeighbors);
    entry.graph.legal_similarity = uniqueByCode(legalSimilarity);
    entry.graph.cluster_links = uniqueByCode(clusterLinks);
    entry.graph.same_country_states = [];
    entry.graph.federal_parent = null;
    entry.related_names = entry.graph.geo_neighbors;
    entry.related_codes = entry.related_names.map((item) => item.code);
    entry.sources.citations = buildCountryCitations(entry);
    entry.hashes = computeHashes(entry);
  }

  return { entries, entriesByCode };
}

function buildStateEntries(usaEntry) {
  const centroids = loadUsStateCentroids();
  const lawsByGeo = loadUsStateLawByGeo();
  const wikiByGeo = loadUsStateWikiByGeo();
  const rawRowsByGeo = loadUsStateRawRowsByGeo();
  const parentRef = { code: "usa", name: usaEntry.name };
  const stateEntries = [];

  for (const [geo, wikiRow] of wikiByGeo.entries()) {
    const stateCode = geo.slice(3).toLowerCase();
    const code = `us-${stateCode}`;
    const rawRow = rawRowsByGeo.get(geo);
    const law = lawsByGeo.get(geo);
    const centroid = centroids[geo] || null;
    const fallbackRec = "ILLEGAL";
    const fallbackMed = "ILLEGAL";
    const recreationalStatus = law
      ? mapLawValueToStatus(law.recreational, fallbackRec)
      : parseStateRecStatusFromRaw(rawRow?.recreational_raw, fallbackRec);
    const medicalStatus = parseStateMedicalStatus(rawRow?.medical_raw, law?.medical, fallbackMed);
    const recreationalEnforcement = parseStateEnforcement(rawRow?.recreational_raw, recreationalStatus);
    const enforcementStrength = parseStateEnforcementStrength(rawRow?.recreational_raw, recreationalStatus);
    const name = normalizeStateTitleFromWikiUrl(wikiRow.wiki_page_url, geo);
    const facts = {
      possession_limit: law?.possession_limit || null,
      cultivation:
        law?.home_grow === "allowed"
          ? "Home grow allowed."
          : law?.home_grow === "illegal"
            ? "Home grow remains illegal."
            : null,
      penalty:
        law?.public_use === "illegal"
          ? "Public use remains illegal."
          : law?.cross_border === "illegal"
            ? "Cross-border transport remains illegal."
            : null
    };

    const entry = {
      code,
      geo_code: geo,
      iso2: geo,
      name,
      node_type: "state",
      normalized_version: "v1",
      legal_model: {
        recreational: {
          raw_status: recreationalStatus,
          status: recreationalStatus,
          enforcement: recreationalEnforcement,
          scope: recreationalStatus === "LEGAL" || recreationalStatus === "DECRIMINALIZED" || recreationalStatus === "TOLERATED" ? "PERSONAL_USE" : "NONE"
        },
        medical: {
          raw_status: medicalStatus,
          status: medicalStatus,
          enforcement: medicalStatus === "LEGAL" ? "MODERATE" : "STRICT",
          scope: medicalStatus === "LEGAL" ? "MEDICAL_ONLY" : "NONE",
          override_reason: null
        },
        distribution: {
          status:
            recreationalStatus === "LEGAL"
              ? "regulated"
              : recreationalStatus === "DECRIMINALIZED" || recreationalStatus === "TOLERATED"
                ? "restricted"
                : medicalStatus === "LEGAL"
                  ? "restricted"
                  : "illegal",
          scopes: {
            possession: recreationalStatus === "ILLEGAL" ? "illegal" : "restricted",
            use: recreationalStatus === "ILLEGAL" ? "illegal" : "restricted",
            sale: recreationalStatus === "LEGAL" ? "regulated" : "illegal",
            cultivation: law?.home_grow === "allowed" ? "regulated" : law?.home_grow === "illegal" ? "illegal" : null,
            import: "illegal",
            trafficking: "illegal"
          },
          enforcement: recreationalEnforcement === "MODERATE" ? "fine-based" : "standard",
          flags: [],
          modifiers: []
        },
        enforcement_flags: recreationalEnforcement === "MODERATE" ? ["fine_based"] : [],
        applied_rules: []
      },
      notes_normalized: "",
      notes_raw: String(rawRow?.recreational_raw || law?.recreational || "").trim(),
      facts,
      parent_country: parentRef,
      state_modifiers: {
        recreational: "override",
        medical: "override",
        enforcement_strength: enforcementStrength,
        federal_conflict: "Cannabis remains federally illegal in United States.",
        legalization_status:
          recreationalStatus === "LEGAL"
            ? "State legal"
            : medicalStatus === "LEGAL"
              ? "Medical only"
              : recreationalStatus === "DECRIMINALIZED"
                ? "State decriminalized"
                : "State illegal"
      },
      related_codes: [],
      related_names: [],
      graph: {
        region: "NA",
        seo_cluster: "USA_CLUSTER",
        geo_neighbors: [],
        legal_similarity: [],
        cluster_links: [],
        same_country_states: [],
        federal_parent: parentRef
      },
      coordinates:
        centroid && Number.isFinite(centroid.lat) && Number.isFinite(centroid.lon)
          ? { lat: Number(centroid.lat), lng: Number(centroid.lon) }
          : usaEntry.coordinates,
      sources: {
        wiki: wikiRow.wiki_page_url || null,
        wiki_truth: usaEntry.sources?.wiki_truth || null,
        citations: []
      },
      hashes: { code, content_hash: "", notes_hash: "", model_hash: "" },
      updated_at: String(law?.updated_at || usaEntry.updated_at || "2026-04-11")
    };

    entry.notes_normalized = formatStateNotes(entry);
    entry.sources.citations = uniqueByCode([
      law?.sources?.[0]
        ? {
            code: `source-${code}`,
            id: `official-${code}`,
            url: law.sources[0].url,
            title: law.sources[0].title,
            type: "external",
            weight: "low"
          }
        : null,
      entry.sources.wiki
        ? {
            code: `wiki-${code}`,
            id: `wiki-${code}`,
            url: entry.sources.wiki,
            title: `Wikipedia: ${entry.name}`,
            type: "external",
            weight: "low"
          }
        : null,
      entry.sources.wiki_truth
        ? {
            code: `wiki-truth-${code}`,
            id: `wiki-truth-${code}`,
            url: entry.sources.wiki_truth,
            title: "Wikipedia: Legality of cannabis",
            type: "external",
            weight: "low"
          }
        : null
    ]).map(({ code: _discard, ...citation }) => citation);

    stateEntries.push(entry);
  }

  for (const entry of stateEntries) {
    const others = stateEntries.filter((candidate) => candidate.code !== entry.code);
    const geoCandidates = others.sort((left, right) => distanceSquared(entry, left) - distanceSquared(entry, right));
    const geoNeighbors = takeLinkRefs(geoCandidates, 3);

    const legalCandidates = others
      .filter(
        (candidate) =>
          candidate.legal_model.recreational.status === entry.legal_model.recreational.status &&
          candidate.legal_model.medical.status === entry.legal_model.medical.status
      )
      .sort((left, right) => distanceSquared(entry, left) - distanceSquared(entry, right));
    const legalExcluded = new Set(geoNeighbors.map((item) => item.code));
    const legalSimilarity = takeLinkRefs(legalCandidates, 3, legalExcluded);

    const siblingCandidates = others.sort((left, right) => distanceSquared(entry, left) - distanceSquared(entry, right));
    const siblingExcluded = new Set([...geoNeighbors, ...legalSimilarity].map((item) => item.code));
    const sameCountryStates = takeLinkRefs(siblingCandidates, 3, siblingExcluded);

    entry.graph.geo_neighbors = uniqueByCode(geoNeighbors);
    entry.graph.legal_similarity = uniqueByCode(legalSimilarity);
    entry.graph.same_country_states = uniqueByCode(sameCountryStates);
    entry.graph.cluster_links = uniqueByCode([
      parentRef,
      ...takeLinkRefs(siblingCandidates, 1, new Set([...siblingExcluded, ...sameCountryStates.map((item) => item.code), parentRef.code]))
    ]);
    entry.related_names = uniqueByCode([entry.graph.federal_parent, ...entry.graph.same_country_states].filter(Boolean));
    entry.related_codes = entry.related_names.map((item) => item.code);
    entry.hashes = computeHashes(entry);
  }

  return stateEntries;
}

function buildEdges(entriesByCode, entries) {
  const edges = [];
  const edgeKey = new Set();
  for (const entry of entries) {
    const groups = [
      ["GEO_ADJACENCY", entry.graph.geo_neighbors],
      ["LEGAL_SIMILARITY", entry.graph.legal_similarity],
      ["CULTURAL_CLUSTER", entry.graph.cluster_links],
      ["SAME_COUNTRY_STATES", entry.graph.same_country_states]
    ];
    for (const [type, links] of groups) {
      for (const link of links) {
        const key = `${entry.code}:${link.code}:${type}`;
        if (edgeKey.has(key)) continue;
        edgeKey.add(key);
        edges.push({ from: entry.code, to: link.code, type });
      }
    }
    if (entry.graph.federal_parent) {
      const key = `${entry.code}:${entry.graph.federal_parent.code}:FEDERAL_PARENT_LINK`;
      if (!edgeKey.has(key)) {
        edgeKey.add(key);
        edges.push({ from: entry.code, to: entry.graph.federal_parent.code, type: "FEDERAL_PARENT_LINK" });
      }
    }
    for (const link of entry.graph.legal_similarity) {
      const target = entriesByCode[link.code];
      if (!target) continue;
      const left = entry.legal_model.recreational.status;
      const right = target.legal_model.recreational.status;
      if ([left, right].every((status) => ["TOLERATED", "DECRIMINALIZED", "LEGAL"].includes(status))) {
        const key = `${entry.code}:${link.code}:POLICY_CONTINUUM`;
        if (!edgeKey.has(key)) {
          edgeKey.add(key);
          edges.push({ from: entry.code, to: link.code, type: "POLICY_CONTINUUM" });
        }
      }
    }
  }
  return edges;
}

function main() {
  const { entries: countryEntries, entriesByCode: countryEntriesByCode } = buildCountryEntries();
  const usaEntry = countryEntriesByCode.usa;
  if (!usaEntry) throw new Error("USA_COUNTRY_ENTRY_MISSING");
  const stateEntries = buildStateEntries(usaEntry);
  const entries = [...countryEntries, ...stateEntries];
  const entriesByCode = Object.fromEntries(entries.map((entry) => [entry.code, entry]));
  const edges = buildEdges(entriesByCode, entries);

  for (const entry of entries) {
    if (!entry.notes_normalized?.trim()) throw new Error(`MISSING_NOTES_NORMALIZED:${entry.code}`);
    if (!entry.graph.seo_cluster?.trim()) throw new Error(`MISSING_CLUSTER:${entry.code}`);
    if (
      entry.graph.geo_neighbors.length +
        entry.graph.legal_similarity.length +
        entry.graph.cluster_links.length +
        entry.graph.same_country_states.length +
        (entry.graph.federal_parent ? 1 : 0) ===
      0
    ) {
      throw new Error(`ORPHAN_COUNTRY:${entry.code}`);
    }
    entry.hashes = computeHashes(entry);
    fs.writeFileSync(path.join(OUTPUT_DIR, `${entry.code}.json`), `${JSON.stringify(entry, null, 2)}\n`);
  }

  ensureDir(GRAPH_DIR);
  const nodes = entries.map((entry) => ({
    code: entry.code,
    region: entry.graph.region,
    neighbors: entry.graph.geo_neighbors.map((item) => item.code),
    legal_similarity: entry.graph.legal_similarity.map((item) => item.code),
    seo_cluster: entry.graph.seo_cluster
  }));
  fs.writeFileSync(GRAPH_PATH, `${JSON.stringify({ nodes, edges }, null, 2)}\n`);
  fs.writeFileSync(OUTPUT_INDEX_PATH, `${JSON.stringify(entries.map((entry) => entry.code).sort(), null, 2)}\n`);
  console.log(`COUNTRY_PAGE_STORAGE_OK countries=${countryEntries.length} states=${stateEntries.length} graph_nodes=${nodes.length} graph_edges=${edges.length}`);
}

main();
