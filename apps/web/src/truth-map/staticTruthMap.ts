import { createHash } from "node:crypto";
import { brotliDecompressSync } from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { findRepoRoot } from "@/lib/ssotDiff/ssotSnapshotStore";
import manifest from "./static-assets/manifest.json";

const STATIC_TRUTH_MAP_CACHE_CONTROL = "public, max-age=31536000, s-maxage=31536000, immutable";

type StaticAssetManifestEntry = {
  hash: string;
  file: string;
  byteLength: number;
  brotliByteLength: number;
};

const entries = manifest.assets as Record<StaticTruthMapLayer, StaticAssetManifestEntry>;

if (
  manifest.schemaVersion !== 1
  || !entries.countries
  || !entries["us-states"]
  || Object.values(entries).some((entry) => !/^[a-f0-9]{12}$/.test(entry.hash) || !entry.file.endsWith(".json.br"))
) {
  throw new Error("STATIC_TRUTH_MAP_MANIFEST_INVALID");
}

// The manifest is generated with the same content-addressed static mechanism
// used by the last working production map, then committed beside its Brotli
// payload. No production request reads an ignored local audit input.
export const STATIC_TRUTH_MAP_COUNTRIES_HASH = entries.countries.hash;
export const STATIC_TRUTH_MAP_US_STATES_HASH = entries["us-states"].hash;
export const STATIC_TRUTH_MAP_COUNTRIES_URL = `/static/truth-map/countries.${STATIC_TRUTH_MAP_COUNTRIES_HASH}.json.br`;
export const STATIC_TRUTH_MAP_US_STATES_URL = `/static/truth-map/us-states.${STATIC_TRUTH_MAP_US_STATES_HASH}.json.br`;

export function getStaticTruthMapRuntimeMeta() {
  return {
    generatedAt: "CONTENT_ADDRESSED_STATIC_TRUTH_MAP",
    datasetHash: `${STATIC_TRUTH_MAP_COUNTRIES_HASH}:${STATIC_TRUTH_MAP_US_STATES_HASH}`,
    finalSnapshotId: "FINAL_307_RECONCILIATION" as const
  };
}

export type StaticTruthMapLayer = "countries" | "us-states";

export type StaticTruthMapAsset = {
  layer: StaticTruthMapLayer;
  hash: string;
  url: string;
  json: string;
  brotli: Uint8Array;
  byteLength: number;
  brotliByteLength: number;
  cacheControl: string;
};

let assets: Partial<Record<StaticTruthMapLayer, StaticTruthMapAsset>> = {};

function urlForLayer(layer: StaticTruthMapLayer) {
  return layer === "countries" ? STATIC_TRUTH_MAP_COUNTRIES_URL : STATIC_TRUTH_MAP_US_STATES_URL;
}

function assetPath(layer: StaticTruthMapLayer) {
  return path.join(findRepoRoot(process.cwd()), "apps", "web", "src", "truth-map", "static-assets", entries[layer].file);
}

export function getStaticTruthMapAsset(layer: StaticTruthMapLayer): StaticTruthMapAsset {
  const existing = assets[layer];
  if (existing) return existing;

  const entry = entries[layer];
  const brotli = fs.readFileSync(assetPath(layer));
  const json = brotliDecompressSync(brotli).toString("utf8");
  const hash = createHash("sha256").update(json).digest("hex").slice(0, 12);
  if (
    hash !== entry.hash
    || Buffer.byteLength(json) !== entry.byteLength
    || brotli.byteLength !== entry.brotliByteLength
  ) {
    throw new Error(`STATIC_TRUTH_MAP_ASSET_INTEGRITY_FAIL layer=${layer}`);
  }

  const asset: StaticTruthMapAsset = {
    layer,
    hash,
    url: urlForLayer(layer),
    json,
    brotli,
    byteLength: Buffer.byteLength(json),
    brotliByteLength: brotli.byteLength,
    cacheControl: STATIC_TRUTH_MAP_CACHE_CONTROL
  };
  assets = { ...assets, [layer]: asset };
  return asset;
}
