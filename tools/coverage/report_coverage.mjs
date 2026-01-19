import fs from "node:fs";
import path from "node:path";

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

function main() {
  const isoPath = path.join(process.cwd(), "data", "iso3166", "iso3166-1.json");
  const lawsDir = path.join(process.cwd(), "data", "laws");
  const reportsDir = path.join(process.cwd(), "Reports");
  const checkpointsDir = path.join(process.cwd(), ".checkpoints");

  if (!fs.existsSync(isoPath)) {
    console.error(`Missing iso3166 source: ${isoPath}`);
    process.exit(1);
  }

  const isoRaw = JSON.parse(fs.readFileSync(isoPath, "utf8"));
  const total = Array.isArray(isoRaw.entries) ? isoRaw.entries.length : 0;

  const profiles = new Map();
  const lawsWorldDir = path.join(lawsDir, "world");
  const lawsEuDir = path.join(lawsDir, "eu");
  const worldFiles = listJsonFiles(lawsWorldDir);
  const euFiles = listJsonFiles(lawsEuDir);
  const lawFiles = [...worldFiles, ...euFiles];
  for (const file of listJsonFiles(lawsDir)) {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (parsed?.id) profiles.set(String(parsed.id).toUpperCase(), parsed);
  }

  let reviewedCount = 0;
  let needsReviewCount = 0;
  let provisionalCount = 0;
  let missingSourcesCount = 0;

  for (const profile of profiles.values()) {
    const sources = Array.isArray(profile?.sources) ? profile.sources : [];
    if (sources.length === 0) {
      missingSourcesCount += 1;
    }
    const status = String(profile.review_status || "").toLowerCase() ||
      (String(profile.status || "").toLowerCase() === "provisional" ? "provisional" : "");
    if (status === "provisional") {
      provisionalCount += 1;
    } else if (status === "needs_review") {
      needsReviewCount += 1;
    } else if (status === "reviewed" || status === "known" || status === "reviewed") {
      reviewedCount += 1;
    }
  }

  const lawsFilesWorld = worldFiles.length;
  const lawsFilesEu = euFiles.length;
  const lawsFilesTotal = lawFiles.length;
  const missingIso = Math.max(total - lawsFilesWorld, 0);
  const missingCount = Math.max(total - reviewedCount - needsReviewCount - provisionalCount, 0);

  const payload = {
    total,
    reviewed_count: reviewedCount,
    needs_review_count: needsReviewCount,
    provisional_count: provisionalCount,
    missing_count: missingCount,
    laws_files_world: lawsFilesWorld,
    laws_files_eu: lawsFilesEu,
    laws_files_total: lawsFilesTotal,
    missing_iso: missingIso,
    missing_sources: missingSourcesCount,
    updated_at: new Date().toISOString()
  };

  fs.mkdirSync(reportsDir, { recursive: true });
  fs.mkdirSync(checkpointsDir, { recursive: true });

  fs.writeFileSync(
    path.join(reportsDir, "coverage-latest.json"),
    JSON.stringify(payload, null, 2) + "\n"
  );
  fs.writeFileSync(
    path.join(checkpointsDir, "coverage-latest.json"),
    JSON.stringify(payload, null, 2) + "\n"
  );
}

main();
