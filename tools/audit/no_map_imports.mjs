#!/usr/bin/env node
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const ARTIFACTS = path.join(ROOT, "Artifacts");
const bannedImportPaths = [
  "@/lib/mapRuntime/",
  "@/lib/map/",
  "@/app/_components/mapRuntime/",
  "@/app/api/" + "map/",
  "@/app/_components/NewMapLibreMap",
  "@/app/_components/NewLeafletMap",
  "@/components/LeafletMap",
  "@/lib/map/GeometryHoverResolver",
  "@/lib/map/PointerTracker",
  "@/lib/map/HoverLifecycleRevalidator",
  "@/lib/map/view/HoverOutlineProjector",
  "tools/diagnostics/chukotka_seam_audit",
  "tools/diagnostics/hover_",
  "tools/diagnostics/seam_",
  "tools/diagnostics/fast_sweep",
  "tools/diagnostics/generate_perf_report",
  "tools/playwright-smoke/ui_smoke",
  "tools/gates/home_fullscreen_contract_guard",
  "tools/gates/map_",
  "map" + "libre-gl",
  "leaf" + "let"
];
const scanRoots = [
  path.join(ROOT, "apps", "web", "src"),
  path.join(ROOT, "tools"),
  path.join(ROOT, "tests")
];
const allowedExtensions = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".json"]);
const allowedNewMapRoots = [
  path.join(ROOT, "apps", "web", "src", "new-map"),
  path.join(ROOT, "apps", "web", "src", "app", "new-map"),
  path.join(ROOT, "tools", "new-map")
];

function walk(target, files = []) {
  if (!fs.existsSync(target)) return files;
  const stat = fs.statSync(target);
  if (!stat.isDirectory()) {
    files.push(target);
    return files;
  }
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    if (["node_modules", ".next", "Artifacts", "Reports", "QUARANTINE"].includes(entry.name)) continue;
    const fullPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
      continue;
    }
    if (!allowedExtensions.has(path.extname(entry.name))) continue;
    files.push(fullPath);
  }
  return files;
}

function findMatches(file) {
  if (allowedNewMapRoots.some((root) => file.startsWith(root + path.sep) || file === root)) {
    return false;
  }
  const content = fs.readFileSync(file, "utf8");
  return bannedImportPaths.some((specifier) => {
    const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return (
      new RegExp(`\\bimport\\s*\\(\\s*["']${escaped}[^"']*["']\\s*\\)`).test(content) ||
      new RegExp(`\\bimport\\b[\\s\\S]*?\\bfrom\\s+["']${escaped}[^"']*["']`).test(content) ||
      new RegExp(`\\brequire\\(\\s*["']${escaped}[^"']*["']\\s*\\)`).test(content)
    );
  });
}

const files = scanRoots.flatMap((target) => walk(target));
const offendingFiles = files
  .filter((file) => findMatches(file))
  .map((file) => path.relative(ROOT, file))
  .sort();
const mapRouteExists = fs.existsSync(path.join(ROOT, "apps", "web", "src", "app", "api", "map"));
const mapRuntimeDirs = [
  path.join(ROOT, "apps", "web", "src", "lib", "mapRuntime"),
  path.join(ROOT, "apps", "web", "src", "lib", "map"),
  path.join(ROOT, "apps", "web", "src", "app", "_components", "mapRuntime")
];
const mapRuntimeRemoved = mapRuntimeDirs.every((dir) => !fs.existsSync(dir));
const payload = {
  generatedAt: new Date().toISOString(),
  mapRuntimeRemoved,
  mapImportsFound: offendingFiles.length,
  offendingFiles,
  mapRoutesRemoved: !mapRouteExists
};

await fsPromises.mkdir(ARTIFACTS, { recursive: true });
await fsPromises.writeFile(path.join(ARTIFACTS, "no-map-imports.json"), JSON.stringify(payload, null, 2));

console.log(`MAP_RUNTIME_REMOVED=${mapRuntimeRemoved ? 1 : 0}`);
console.log(`MAP_IMPORTS_FOUND=${offendingFiles.length}`);
console.log(`MAP_ROUTES_REMOVED=${mapRouteExists ? 0 : 1}`);

process.exit(mapRuntimeRemoved && offendingFiles.length === 0 && !mapRouteExists ? 0 : 1);
