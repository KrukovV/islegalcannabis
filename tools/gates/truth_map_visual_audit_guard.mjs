#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const EXPECTED_TOTAL = 307;
const MANIFEST_PATH = path.resolve(ROOT, process.env.TRUTH_MAP_VISUAL_AUDIT_MANIFEST || "Artifacts/truth-map-visual-audit/manifest.json");
const GEO_LIST_PATH = path.resolve(ROOT, process.env.TRUTH_MAP_VISUAL_AUDIT_GEO_LIST || "data/reviews/geo-list-307.json");
const DISPLAY_POLICY_PATH = path.resolve(ROOT, "data/reviews/truth-map-display-policy.v1.json");
const ARCHIVE_ROOT = path.resolve(process.env.TRUTH_MAP_VISUAL_AUDIT_ARCHIVE_ROOT || path.join(process.env.HOME || "", "islegalcannabis_archive", "truth-map-visual-audit"));
const FRESHNESS_TARGETS = [
  "apps/web/src/truth-map/TruthMapRoot.tsx",
  "apps/web/src/truth-map/truthMapSource.ts",
  "apps/web/src/app/truth-map/page.tsx",
  "apps/web/e2e/truth-map.visual-audit.spec.ts",
  "data/reviews/truth-map-display-policy.v1.json",
];

function fail(reason, details = {}) {
  process.stdout.write(`${JSON.stringify({ ok: false, reason, ...details }, null, 2)}\n`);
  process.stdout.write(`TRUTH_MAP_VISUAL_AUDIT_GUARD=FAIL reason=${reason}\n`);
  process.exit(1);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizedGeoList(value) {
  if (!Array.isArray(value)) return null;
  const geos = value.map((geo) => String(geo || "").trim().toUpperCase());
  return geos.every(Boolean) && new Set(geos).size === geos.length ? geos : null;
}

if (!fs.existsSync(MANIFEST_PATH)) fail("MANIFEST_MISSING", { manifest: path.relative(ROOT, MANIFEST_PATH) });
if (!fs.existsSync(GEO_LIST_PATH)) fail("CANONICAL_GEO_LIST_MISSING", { geo_list: path.relative(ROOT, GEO_LIST_PATH) });
if (!fs.existsSync(DISPLAY_POLICY_PATH)) fail("DISPLAY_POLICY_MISSING", { policy: path.relative(ROOT, DISPLAY_POLICY_PATH) });

const manifest = readJson(MANIFEST_PATH);
const canonicalGeos = normalizedGeoList(readJson(GEO_LIST_PATH));
if (!canonicalGeos || canonicalGeos.length !== EXPECTED_TOTAL) fail("CANONICAL_GEO_LIST_INVALID");
const displayPolicy = readJson(DISPLAY_POLICY_PATH);
const polarGreyGeos = normalizedGeoList(displayPolicy.polarDisplayGreyGeos);
if (
  displayPolicy.schemaVersion !== 1
  || displayPolicy.route !== "/truth-map"
  || displayPolicy.canonicalUniverse !== "data/reviews/geo-list-307.json"
  || displayPolicy.legalTruthMutationAllowed !== false
  || displayPolicy.ssotMutationAllowed !== false
  || displayPolicy.productionMutationAllowed !== false
  || displayPolicy.displayUncoloredAllowed !== false
  || displayPolicy.nonPolarGreyAllowed !== false
  || !polarGreyGeos
  || polarGreyGeos.length !== 1
  || polarGreyGeos[0] !== "AQ"
) fail("POLAR_GREY_POLICY_INVALID");
if (manifest.schemaVersion !== 1 || manifest.route !== "/truth-map") fail("ROUTE_OR_SCHEMA_INVALID", { route: manifest.route, schemaVersion: manifest.schemaVersion });

const requestedGeos = normalizedGeoList(manifest.requestedGeos);
if (!requestedGeos || requestedGeos.length !== EXPECTED_TOTAL) fail("REQUESTED_GEO_SET_INVALID", { count: requestedGeos?.length ?? null });
const canonicalSet = new Set(canonicalGeos);
if (!requestedGeos.every((geo) => canonicalSet.has(geo)) || canonicalGeos.some((geo) => !requestedGeos.includes(geo))) {
  fail("REQUESTED_GEO_SET_NOT_CANONICAL");
}

const rows = Array.isArray(manifest.rows) ? manifest.rows : [];
if (manifest.captured !== EXPECTED_TOTAL || !Array.isArray(manifest.missing) || manifest.missing.length !== 0 || rows.length !== EXPECTED_TOTAL) {
  fail("CAPTURE_COUNT_INVALID", { captured: manifest.captured, missing: manifest.missing, rows: rows.length });
}

const rowGeos = normalizedGeoList(rows.map((row) => row?.geo));
if (!rowGeos || rowGeos.length !== EXPECTED_TOTAL || rowGeos.some((geo) => !canonicalSet.has(geo)) || canonicalGeos.some((geo) => !rowGeos.includes(geo))) {
  fail("ROW_GEO_SET_NOT_CANONICAL");
}

const invalidRows = rows.flatMap((row) => {
  const screenshot = String(row?.popupScreenshot || "").trim();
  const resolved = screenshot ? path.resolve(screenshot) : "";
  const insideArchive = resolved === ARCHIVE_ROOT || resolved.startsWith(`${ARCHIVE_ROOT}${path.sep}`);
  const insideRepo = resolved === ROOT || resolved.startsWith(`${ROOT}${path.sep}`);
  const valid = row?.status === "CAPTURED" && insideArchive && !insideRepo && Boolean(resolved) && fs.existsSync(resolved) && fs.statSync(resolved).size > 0;
  return valid ? [] : [{ geo: row?.geo || null, status: row?.status || null, screenshot: screenshot || null }];
});
if (invalidRows.length > 0) fail("CAPTURE_ARTIFACT_INVALID", { count: invalidRows.length, sample: invalidRows.slice(0, 12) });

const manifestMtime = fs.statSync(MANIFEST_PATH).mtimeMs;
const staleAgainst = FRESHNESS_TARGETS
  .map((file) => path.join(ROOT, file))
  .filter((file) => fs.existsSync(file) && fs.statSync(file).mtimeMs > manifestMtime)
  .map((file) => path.relative(ROOT, file));
if (staleAgainst.length > 0) fail("MANIFEST_STALE", { stale_against: staleAgainst });

process.stdout.write(`${JSON.stringify({
  ok: true,
  route: manifest.route,
  requested: requestedGeos.length,
  captured: manifest.captured,
  TRUTH_MAP_POLAR_GREY_POLICY: "PASS",
  TRUTH_MAP_NONPOLAR_GREY_GEOS: 0,
  TRUTH_MAP_UNCOLORED_GEOS: 0,
  TRUTH_MAP_DISPLAY_UNIVERSE: `${EXPECTED_TOTAL}/${EXPECTED_TOTAL}`,
  external_archive: ARCHIVE_ROOT,
}, null, 2)}\n`);
process.stdout.write("TRUTH_MAP_POLAR_GREY_POLICY=PASS\n");
process.stdout.write("TRUTH_MAP_NONPOLAR_GREY_GEOS=0\n");
process.stdout.write("TRUTH_MAP_UNCOLORED_GEOS=0\n");
process.stdout.write(`TRUTH_MAP_DISPLAY_UNIVERSE=${EXPECTED_TOTAL}/${EXPECTED_TOTAL}\n`);
process.stdout.write("TRUTH_MAP_VISUAL_AUDIT_GUARD=PASS\n");
