import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const webNextRoot = path.join(repoRoot, "apps", "web", ".next");
const pageBuildManifestPath = path.join(webNextRoot, "server", "app", "new-map", "page", "build-manifest.json");
const pageClientManifestPath = path.join(webNextRoot, "server", "app", "new-map", "page_client-reference-manifest.js");
const baselinePath = path.resolve(
  process.env.NEW_MAP_LOCAL_JS_BASELINE ||
    path.join(repoRoot, "data", "baselines", "new_map_js_city_quality_baseline.json")
);

function kib(bytes) {
  return Math.round((Number(bytes || 0) / 1024) * 10) / 10;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function addJsFile(files, filePath) {
  if (!filePath || !filePath.endsWith(".js")) return;
  files.add(filePath.replace(/^\/_next\//, "").replace(/^\/+/, ""));
}

function readPageJsFiles() {
  const files = new Set();
  const buildManifest = readJson(pageBuildManifestPath);
  for (const filePath of buildManifest.polyfillFiles || []) addJsFile(files, filePath);
  for (const filePath of buildManifest.rootMainFiles || []) addJsFile(files, filePath);

  const clientManifest = fs.readFileSync(pageClientManifestPath, "utf8");
  for (const match of clientManifest.matchAll(/\/_next\/static\/chunks\/[^"]+?\.js/g)) {
    addJsFile(files, match[0]);
  }
  return [...files].sort();
}

function measureFile(relativePath) {
  const absolutePath = path.join(webNextRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`MISSING_CHUNK:${relativePath}`);
  }
  const raw = fs.readFileSync(absolutePath);
  const gzip = zlib.gzipSync(raw, { level: 9 });
  return {
    path: relativePath,
    rawBytes: raw.length,
    gzipBytes: gzip.length
  };
}

function main() {
  const baseline = fs.existsSync(baselinePath) ? readJson(baselinePath) : {};
  const prodMaxKib = Number(process.env.NEW_MAP_LOCAL_JS_PROD_MAX_KIB || baseline.max_first_party_script_kib || 650);
  const localHeadroomKib = Number(process.env.NEW_MAP_LOCAL_JS_GZIP_HEADROOM_KIB || 25);
  const localMaxKib = Number(process.env.NEW_MAP_LOCAL_JS_MAX_GZIP_KIB || prodMaxKib + localHeadroomKib);
  const files = readPageJsFiles().map(measureFile);
  const gzipBytes = files.reduce((sum, file) => sum + file.gzipBytes, 0);
  const rawBytes = files.reduce((sum, file) => sum + file.rawBytes, 0);
  const top = [...files]
    .sort((a, b) => b.gzipBytes - a.gzipBytes)
    .slice(0, 8)
    .map((file) => `${path.basename(file.path)}:${kib(file.gzipBytes)}KiB`)
    .join(",");
  const ok = kib(gzipBytes) <= localMaxKib;

  console.log(
    [
      `NEW_MAP_LOCAL_JS_BUDGET_OK=${ok ? 1 : 0}`,
      `route_gzip_kib=${kib(gzipBytes)}`,
      `route_raw_kib=${kib(rawBytes)}`,
      `local_max_gzip_kib=${localMaxKib}`,
      `prod_gate_max_kib=${prodMaxKib}`,
      `chunks=${files.length}`,
      `top=${top || "-"}`
    ].join(" ")
  );

  if (!ok) process.exit(1);
}

main();
