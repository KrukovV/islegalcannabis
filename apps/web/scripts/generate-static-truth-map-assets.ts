import { createHash } from "node:crypto";
import { brotliCompressSync, constants as zlibConstants } from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { findRepoRoot } from "../src/lib/ssotDiff/ssotSnapshotStore";
import { buildStaticTruthMapSnapshot } from "../src/truth-map/truthMapStaticSnapshot";
import { buildTruthMapBootstrap } from "../src/truth-map/truthMapBootstrap";

type Layer = "countries" | "us-states";

const root = findRepoRoot(process.cwd());
const assetDirectory = path.join(root, "apps", "web", "src", "truth-map", "static-assets");
const manifestPath = path.join(assetDirectory, "manifest.json");

fs.mkdirSync(assetDirectory, { recursive: true });
let countriesJson = "";

const assets = (Object.keys({ countries: true, "us-states": true }) as Layer[]).reduce<Record<Layer, {
  hash: string;
  file: string;
  byteLength: number;
  brotliByteLength: number;
}>>((result, layer) => {
  const json = JSON.stringify(buildStaticTruthMapSnapshot(layer));
  if (layer === "countries") countriesJson = json;
  const brotli = brotliCompressSync(json, {
    params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 }
  });
  const hash = createHash("sha256").update(json).digest("hex").slice(0, 12);
  const file = `${layer}.${hash}.json.br`;
  fs.writeFileSync(path.join(assetDirectory, file), brotli);
  if (layer === "countries") {
    const publicDirectory = path.join(root, "apps", "web", "public", "geometry");
    fs.mkdirSync(publicDirectory, { recursive: true });
    fs.writeFileSync(path.join(publicDirectory, file), brotli);
  }
  result[layer] = {
    hash,
    file,
    byteLength: Buffer.byteLength(json),
    brotliByteLength: brotli.byteLength
  };
  return result;
}, {} as Record<Layer, { hash: string; file: string; byteLength: number; brotliByteLength: number }>);

const countriesBootstrapHash = createHash("sha256")
  .update(buildTruthMapBootstrap(countriesJson)).digest("hex").slice(0, 12);
fs.writeFileSync(manifestPath, `${JSON.stringify({ schemaVersion: 1, assets, countriesBootstrapHash }, null, 2)}\n`);
process.stdout.write(`PUBLIC_TRUTH_MAP_STATIC_ASSETS=OK countries=${assets.countries.hash} states=${assets["us-states"].hash}\n`);
