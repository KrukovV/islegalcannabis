#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "artifacts/wiki_truth_second_pass");
const baselineJsonPath = path.join(outDir, "baseline.json");
const baselineMdPath = path.join(outDir, "baseline.md");

const rel = (p) => path.relative(root, p).replaceAll(path.sep, "/");
const abs = (p) => (path.isAbsolute(p) ? p : path.join(root, p));

function readTextMaybe(filePath) {
  try {
    return fs.readFileSync(abs(filePath), "utf8");
  } catch {
    return null;
  }
}

function readJson(filePath, fallback = null) {
  const text = readTextMaybe(filePath);
  return text ? JSON.parse(text) : fallback;
}

function sha256File(filePath) {
  try {
    return crypto.createHash("sha256").update(fs.readFileSync(abs(filePath))).digest("hex");
  } catch {
    return null;
  }
}

function sha256Object(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function git(args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "UNCONFIRMED";
  }
}

function listFilesRecursive(startPath, predicate) {
  const files = [];
  if (!startPath || !fs.existsSync(startPath)) return files;
  const stack = [startPath];
  while (stack.length) {
    const current = stack.pop();
    const stat = fs.statSync(current);
    if (stat.isDirectory()) {
      for (const child of fs.readdirSync(current)) stack.push(path.join(current, child));
      continue;
    }
    if (predicate(current)) files.push(current);
  }
  files.sort();
  return files;
}

function imageFile(filePath) {
  return /\.(png|jpe?g|webp)$/i.test(filePath);
}

function collectUrls(row) {
  const buckets = [
    ["directOfficialCannabisLawLinks", "direct"],
    ["officialContextLinks", "context_only"],
    ["supplementalOfficialLinks", "supplemental"],
    ["candidateLinksAwaitingVisualReview", "candidate_awaiting_review"],
  ];
  const out = [];
  for (const [field, kind] of buckets) {
    for (const item of row[field] || []) {
      if (!item?.url) continue;
      out.push({
        geo: row.geo,
        territory: row.territory,
        kind,
        title: item.title || null,
        url: item.url,
        sourceKind: item.sourceKind || item.source_kind || null,
        verification: item.verification || null,
        screenshotPath: item.screenshotPath || item.screenshot_path || null,
      });
    }
  }
  return out;
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function latestSnapshotFile() {
  const dir = abs("data/ssot_snapshots");
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((name) => name.endsWith(".json")).sort();
  const latest = files.at(-1);
  return latest ? path.join(dir, latest) : null;
}

const generatedAt = new Date().toISOString();
const geoList = readJson("data/reviews/geo-list-307.json", []);
const matrix = readJson("data/reviews/wiki-truth-cannabis-law-matrix-307.json", { counts: {}, rows: [] });
const visualReviews = readJson("data/official/cannabis_law_visual_reviews.audit.json", { rows: [] });
const ownership = readJson("data/ssot/official_link_ownership.json", { items: [], raw_registry_total: null });
const officialRegistry = readJson("data/official/official_domains.ssot.json", { domains: [] });
const statusAfter = readJson("data/status-engine/status_snapshot_after.json", { entries: [] });
const statusBefore = readJson("data/status-engine/status_snapshot_before.json", { entries: [] });
const latestSnapshot = latestSnapshotFile();

const statusAfterByGeo = new Map((statusAfter.entries || []).map((entry) => [entry.id, entry]));
const statusBeforeByGeo = new Map((statusBefore.entries || []).map((entry) => [entry.id, entry]));

const officialUrls = matrix.rows.flatMap(collectUrls);
const uniqueOfficialUrls = uniqueBy(officialUrls, (item) => item.url);
const directUrls = officialUrls.filter((item) => item.kind === "direct");
const contextUrls = officialUrls.filter((item) => item.kind === "context_only");
const supplementalUrls = officialUrls.filter((item) => item.kind === "supplemental");

const screenshotPaths = new Set();
for (const row of matrix.rows) {
  for (const screenshotPath of row.screenshotPaths || []) screenshotPaths.add(screenshotPath);
  for (const item of collectUrls(row)) if (item.screenshotPath) screenshotPaths.add(item.screenshotPath);
}
for (const row of visualReviews.rows || []) {
  for (const screenshotPath of row.screenshot_paths || []) screenshotPaths.add(screenshotPath);
  for (const item of row.verified_sources || []) if (item.screenshot_path) screenshotPaths.add(item.screenshot_path);
}

const referencedScreenshotHashes = [...screenshotPaths].sort().map((screenshotPath) => ({
  path: screenshotPath,
  exists: fs.existsSync(screenshotPath),
  sha256: fs.existsSync(screenshotPath) ? sha256File(screenshotPath) : null,
}));

const archiveRoot = visualReviews.archive_root || null;
const archiveScreenshots = listFilesRecursive(archiveRoot, imageFile).map((filePath) => ({
  path: filePath,
  relativeToArchive: archiveRoot ? path.relative(archiveRoot, filePath).replaceAll(path.sep, "/") : filePath,
  sha256: sha256File(filePath),
}));

const statusAndColorSnapshot = matrix.rows.map((row) => {
  const after = statusAfterByGeo.get(row.geo);
  const before = statusBeforeByGeo.get(row.geo);
  return {
    geo: row.geo,
    territory: row.territory,
    projectStatus: row.projectStatus || null,
    mapColor: after?.newColor || null,
    mapColorSource: after ? "data/status-engine/status_snapshot_after.json:newColor" : "UNCONFIRMED_NO_STATUS_ENGINE_ROW",
    statusEngine: after || null,
    previousStatusEngine: before || null,
  };
});

const sourceFiles = [
  "data/reviews/geo-list-307.json",
  "data/reviews/wiki-truth-cannabis-law-matrix-307.json",
  "data/official/cannabis_law_visual_reviews.audit.json",
  "data/official/official_domains.ssot.json",
  "data/ssot/official_link_ownership.json",
  "data/wiki/ssot_legality_table.json",
  "data/status-engine/status_snapshot_after.json",
  "data/status-engine/status_snapshot_before.json",
  "data/ssot_diffs.json",
  "cache/ssot_diff_pending.json",
  "cache/ssot_diff_cache.json",
];

const sourceHashes = Object.fromEntries(
  sourceFiles.map((filePath) => [
    filePath,
    {
      exists: fs.existsSync(abs(filePath)),
      sha256: sha256File(filePath),
    },
  ])
);
if (latestSnapshot) {
  sourceHashes[rel(latestSnapshot)] = {
    exists: true,
    sha256: sha256File(latestSnapshot),
  };
}

const baseline = {
  schemaVersion: 1,
  generatedAt,
  purpose: "Task 0 baseline before the repeated independent 307/307 cannabis-law visual audit.",
  localOnly: true,
  productionTouched: false,
  statusDataChanged: false,
  mapColorsChanged: false,
  git: {
    commit: git(["rev-parse", "HEAD"]),
    branch: git(["rev-parse", "--abbrev-ref", "HEAD"]),
    statusPorcelain: git(["status", "--porcelain"]),
  },
  build: {
    buildId: readTextMaybe(".next/BUILD_ID")?.trim() || "UNCONFIRMED",
  },
  snapshot: {
    latestSnapshotId: latestSnapshot ? path.basename(latestSnapshot, ".json") : "UNCONFIRMED",
    latestSnapshotPath: latestSnapshot ? rel(latestSnapshot) : null,
    latestSnapshotHash: latestSnapshot ? sha256File(latestSnapshot) : null,
  },
  hashes: {
    datasetHash: sha256Object({
      geoListHash: sha256File("data/reviews/geo-list-307.json"),
      matrixHash: sha256File("data/reviews/wiki-truth-cannabis-law-matrix-307.json"),
      visualReviewHash: sha256File("data/official/cannabis_law_visual_reviews.audit.json"),
    }),
    sourceFiles: sourceHashes,
    currentProjectStatusesHash: sha256Object(statusAndColorSnapshot.map((item) => ({ geo: item.geo, projectStatus: item.projectStatus }))),
    currentMapColorsHash: sha256Object(statusAndColorSnapshot.map((item) => ({ geo: item.geo, mapColor: item.mapColor }))),
    urlInventoryHash: sha256Object(uniqueOfficialUrls.map((item) => item.url).sort()),
    referencedScreenshotHashInventoryHash: sha256Object(referencedScreenshotHashes),
    archiveScreenshotHashInventoryHash: sha256Object(archiveScreenshots),
  },
  counts: {
    totalGeoCount: matrix.rows.length,
    manifestGeoCount: geoList.length,
    uniqueGeoCount: new Set(matrix.rows.map((row) => row.geo)).size,
    officialRegistryRawCount: officialRegistry.domains?.length ?? ownership.raw_registry_total ?? null,
    officialOwnershipRawCount: ownership.items?.length ?? null,
    officialUrlRecordsInMatrix: officialUrls.length,
    uniqueOfficialUrlsInMatrix: uniqueOfficialUrls.length,
    allPublishedOfficialLinks: matrix.counts.allPublishedOfficialLinks ?? null,
    directEvidenceUrlRecords: directUrls.length,
    directEvidenceRows: matrix.counts.visuallyVerifiedOfficialCannabisLaw ?? null,
    contextOnlyUrlRecords: contextUrls.length,
    contextOnlyRows: matrix.counts.officialContextOnly ?? null,
    supplementalOfficialUrlRecords: supplementalUrls.length,
    projectStatusMismatchRows: matrix.counts.projectStatusMismatch ?? null,
    geoWithoutProjectStatusRows: matrix.counts.noProjectStatus ?? null,
    visualReviewRows: visualReviews.rows?.length ?? null,
    matrixManualVisualReviewCompleteRows: matrix.counts.manualVisualReviewComplete ?? null,
    referencedScreenshotPaths: referencedScreenshotHashes.length,
    referencedScreenshotsExisting: referencedScreenshotHashes.filter((item) => item.exists).length,
    archiveScreenshotFiles: archiveScreenshots.length,
    statusEngineRows: statusAfter.entries?.length ?? null,
    statusColorRowsCoveredIn307Matrix: statusAndColorSnapshot.filter((item) => item.mapColor).length,
    statusColorRowsUnconfirmedIn307Matrix: statusAndColorSnapshot.filter((item) => !item.mapColor).length,
  },
  currentProjectStatusesAndMapColors: statusAndColorSnapshot,
  officialUrlInventory: uniqueOfficialUrls,
  referencedScreenshotHashes,
  archiveScreenshotHashes: archiveScreenshots,
  acceptanceFlagsAtBaseline: {
    TOTAL_GEO_COUNT: matrix.rows.length,
    PROCESSED_GEO_COUNT: 0,
    FRESH_SEARCH_COUNT: 0,
    FRESH_VISUAL_REVIEW_COUNT: 0,
    ALL_SCREENSHOTS_VISUALLY_READ: false,
    CANNABIS_FAMILY_EVIDENCE_PRESERVED: "UNCONFIRMED",
    NON_CANNABIS_FALSE_POSITIVES_FILTERED: "UNCONFIRMED",
    HUMAN_READABLE_WIKI_TRUTH: "UNCONFIRMED",
    CONTRADICTORY_SUMMARIES: "UNCONFIRMED",
    MIXED_MACHINE_LANGUAGE_SUMMARIES: "UNCONFIRMED",
    UNJUSTIFIED_MISMATCHES: "UNCONFIRMED",
    STATUS_DATA_CHANGED: false,
    MAP_COLORS_CHANGED: false,
    PRODUCTION_TOUCHED: false,
    GOAL_ACHIEVED: false,
  },
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(baselineJsonPath, `${JSON.stringify(baseline, null, 2)}\n`);

const md = `# Wiki Truth Second-Pass Baseline

Generated: ${generatedAt}

This is the local-only Task 0 baseline before the repeated independent 307/307 cannabis-law visual audit. It records the current state for later proof that SSOT statuses, map colors, screenshots, URLs, and evidence records were preserved.

## Source State

- Commit: ${baseline.git.commit}
- Branch: ${baseline.git.branch}
- Build id: ${baseline.build.buildId}
- Latest SSOT snapshot: ${baseline.snapshot.latestSnapshotId}
- Dataset hash: ${baseline.hashes.datasetHash}

## Counts

- GEO rows in matrix: ${baseline.counts.totalGeoCount}
- GEO rows in manifest: ${baseline.counts.manifestGeoCount}
- Unique GEO rows: ${baseline.counts.uniqueGeoCount}
- Protected official registry raw count: ${baseline.counts.officialRegistryRawCount}
- Official ownership raw count: ${baseline.counts.officialOwnershipRawCount}
- Official URL records in matrix: ${baseline.counts.officialUrlRecordsInMatrix}
- Unique official URLs in matrix: ${baseline.counts.uniqueOfficialUrlsInMatrix}
- Published official links reported by matrix: ${baseline.counts.allPublishedOfficialLinks}
- Direct evidence URL records: ${baseline.counts.directEvidenceUrlRecords}
- Direct evidence rows: ${baseline.counts.directEvidenceRows}
- Context-only URL records: ${baseline.counts.contextOnlyUrlRecords}
- Context-only rows: ${baseline.counts.contextOnlyRows}
- Supplemental official URL records: ${baseline.counts.supplementalOfficialUrlRecords}
- PROJECT_STATUS_MISMATCH rows: ${baseline.counts.projectStatusMismatchRows}
- GEO without project status: ${baseline.counts.geoWithoutProjectStatusRows}
- Visual review rows in current ledger: ${baseline.counts.visualReviewRows}
- Referenced screenshot paths: ${baseline.counts.referencedScreenshotPaths}
- Referenced screenshots existing on disk: ${baseline.counts.referencedScreenshotsExisting}
- Screenshot files in existing archive root: ${baseline.counts.archiveScreenshotFiles}
- Status/color rows covered in 307 matrix: ${baseline.counts.statusColorRowsCoveredIn307Matrix}
- Status/color rows UNCONFIRMED in 307 matrix: ${baseline.counts.statusColorRowsUnconfirmedIn307Matrix}

## Baseline Invariants

- STATUS_DATA_CHANGED=false
- MAP_COLORS_CHANGED=false
- PRODUCTION_TOUCHED=false
- GOAL_ACHIEVED=false

Full machine-readable inventories are stored in \`artifacts/wiki_truth_second_pass/baseline.json\`.
`;

fs.writeFileSync(baselineMdPath, md);

console.log(`BASELINE_JSON=${rel(baselineJsonPath)}`);
console.log(`BASELINE_MD=${rel(baselineMdPath)}`);
console.log(`TOTAL_GEO_COUNT=${baseline.counts.totalGeoCount}`);
console.log(`MANIFEST_GEO_COUNT=${baseline.counts.manifestGeoCount}`);
console.log(`UNIQUE_GEO_COUNT=${baseline.counts.uniqueGeoCount}`);
console.log(`UNIQUE_OFFICIAL_URLS=${baseline.counts.uniqueOfficialUrlsInMatrix}`);
console.log(`DIRECT_EVIDENCE_ROWS=${baseline.counts.directEvidenceRows}`);
console.log(`CONTEXT_ONLY_ROWS=${baseline.counts.contextOnlyRows}`);
console.log(`PROJECT_STATUS_MISMATCH_ROWS=${baseline.counts.projectStatusMismatchRows}`);
console.log(`GEO_WITHOUT_PROJECT_STATUS=${baseline.counts.geoWithoutProjectStatusRows}`);
console.log(`ARCHIVE_SCREENSHOT_FILES=${baseline.counts.archiveScreenshotFiles}`);
console.log("STATUS_DATA_CHANGED=false");
console.log("MAP_COLORS_CHANGED=false");
console.log("PRODUCTION_TOUCHED=false");
