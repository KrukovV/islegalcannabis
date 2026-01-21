import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function loadJson(relPath) {
  const filePath = path.join(ROOT, relPath);
  if (!fs.existsSync(filePath)) {
    return { ok: false, filePath, data: null };
  }
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return { ok: true, filePath, data };
  } catch (error) {
    return { ok: false, filePath, data: null, error };
  }
}

function describeShape(label, relPath, data) {
  const type = Array.isArray(data) ? "array" : typeof data;
  if (type === "array") {
    console.log(`SHAPE file=${relPath} type=array len=${data.length}`);
    return;
  }
  if (type === "object" && data) {
    const keys = Object.keys(data);
    const preview = keys.slice(0, 8).join(",");
    console.log(`SHAPE file=${relPath} type=object keys=${keys.length} sample=[${preview}]`);
    return;
  }
  console.log(`SHAPE file=${relPath} type=${type}`);
}

function extractMapContainer(mapData) {
  if (!mapData || typeof mapData !== "object") return { container: null, reason: "not_object" };
  if (mapData.items && typeof mapData.items === "object") return { container: mapData.items, reason: "items" };
  if (mapData.map && typeof mapData.map === "object") return { container: mapData.map, reason: "map" };
  if (mapData.data && typeof mapData.data === "object") return { container: mapData.data, reason: "data" };
  return { container: mapData, reason: "root" };
}

function indexClaims(claimsData) {
  const out = new Map();
  let countries = 0;
  let states = 0;
  if (Array.isArray(claimsData)) {
    for (const row of claimsData) {
      const key = row?.geo_key || row?.geo || row?.iso;
      if (!key) continue;
      out.set(key, row);
      if (row?.source === "states") states += 1;
      else countries += 1;
    }
  } else if (claimsData && typeof claimsData === "object") {
    const countriesObj = claimsData.countries;
    const statesObj = claimsData.states;
    if (countriesObj && typeof countriesObj === "object") {
      for (const [key, row] of Object.entries(countriesObj)) {
        out.set(key, row);
        countries += 1;
      }
    }
    if (statesObj && typeof statesObj === "object") {
      for (const [key, row] of Object.entries(statesObj)) {
        out.set(key, row);
        states += 1;
      }
    }
  }
  return { map: out, countries, states, total: out.size };
}

function inspect() {
  const files = [
    "data/wiki/wiki_claims.json",
    "data/wiki/wiki_claims_map.json",
    "data/wiki/wiki_claims.meta.json",
    "data/wiki/wiki_claim_baseline.json",
    "data/wiki/wiki_claims_enriched.json",
    "data/wiki/wiki_official_eval.json"
  ];

  const loaded = {};
  for (const relPath of files) {
    const result = loadJson(relPath);
    if (!result.ok) {
      console.log(`SHAPE file=${relPath} missing=1`);
      if (result.error) {
        console.log(`SHAPE_ERROR file=${relPath} error=${String(result.error?.message || "read_error")}`);
      }
      continue;
    }
    loaded[relPath] = result.data;
    describeShape("file", relPath, result.data);
  }

  const mapData = loaded["data/wiki/wiki_claims_map.json"];
  if (mapData) {
    const { container, reason } = extractMapContainer(mapData);
    const mapKeys = container && typeof container === "object" ? Object.keys(container) : [];
    console.log(`MAP_CONTAINER source=${reason}`);
    console.log(`MAP_GEO_COUNT=${mapKeys.length}`);
    console.log(`MAP_GEO_KEYS=${mapKeys.slice(0, 10).join(",")}`);
  }

  const claimsData = loaded["data/wiki/wiki_claims.json"];
  if (claimsData) {
    const { map, countries, states, total } = indexClaims(claimsData);
    console.log(`CLAIMS_COUNTRIES=${countries} CLAIMS_STATES=${states} TOTAL=${total}`);

    const mapDataLocal = loaded["data/wiki/wiki_claims_map.json"];
    if (mapDataLocal) {
      const { container } = extractMapContainer(mapDataLocal);
      const mapKeys = container && typeof container === "object" ? Object.keys(container) : [];
      const mapKeySet = new Set(mapKeys);
      const missing = [];
      const extra = [];

      for (const key of map.keys()) {
        if (!mapKeySet.has(key)) missing.push(key);
      }
      for (const key of mapKeys) {
        if (!map.has(key)) extra.push(key);
      }

      console.log(`MAP_KEYS=${mapKeys.length} MISSING_IN_MAP=${missing.length}`);
      if (missing.length) {
        console.log(`MISSING_IN_MAP_KEYS=${missing.slice(0, 50).join(",")}`);
        const sample = missing[0];
        const row = map.get(sample);
        if (row) {
          const source = row.source || row?.container || "-";
          const name = row.name_in_wiki || row.name || row.title || "-";
          const rowRef = row.row_ref || "-";
          console.log(`MISSING_IN_MAP_WHERE geo=${sample} source=${source} name=${name} row_ref=${rowRef}`);
        }
      }

      console.log(`EXTRA_IN_MAP=${extra.length}`);
      if (extra.length) {
        console.log(`EXTRA_IN_MAP_KEYS=${extra.slice(0, 50).join(",")}`);
      }

      if (mapKeys.length && total !== mapKeys.length) {
        console.log(`TOTAL_MISMATCH expected=${mapKeys.length} found=${total}`);
        process.exitCode = 1;
      }
    }
  }
}

inspect();
