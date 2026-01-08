import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    ciStatus: process.env.CI_STATUS || "PASS",
    changedPaths: "",
    ciLog: "",
    coveragePath: ""
  };
  for (const arg of args) {
    if (arg.startsWith("--ciStatus=")) options.ciStatus = arg.split("=")[1];
    if (arg.startsWith("--changedPaths=")) options.changedPaths = arg.split("=")[1];
    if (arg.startsWith("--ciLog=")) options.ciLog = arg.split("=")[1];
    if (arg.startsWith("--coveragePath=")) options.coveragePath = arg.split("=")[1];
  }
  return options;
}

function readChangedPaths(changedPathsArg) {
  if (changedPathsArg) {
    return changedPathsArg
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  try {
    const output = execSync("git diff --name-only", {
      stdio: ["ignore", "pipe", "ignore"]
    })
      .toString()
      .trim();
    return output ? output.split("\n").filter(Boolean) : [];
  } catch {
    return [];
  }
}

function readCiLog(ciLogPath) {
  if (!ciLogPath) return "";
  if (!fs.existsSync(ciLogPath)) return "";
  return fs.readFileSync(ciLogPath, "utf8");
}

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

function readCoverage(coveragePath) {
  const resolvedPath =
    coveragePath && coveragePath.length > 0
      ? coveragePath
      : path.join(process.cwd(), "Reports", "coverage-latest.json");

  if (resolvedPath && fs.existsSync(resolvedPath)) {
    const raw = fs.readFileSync(resolvedPath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      total: Number(parsed.total ?? 0),
      reviewedCount: Number(parsed.reviewed_count ?? parsed.reviewedCount ?? 0),
      needsReviewCount: Number(parsed.needs_review_count ?? parsed.needsReviewCount ?? 0),
      provisionalCount: Number(parsed.provisional_count ?? parsed.provisionalCount ?? 0),
      uncoveredCount: Number(parsed.missing_count ?? parsed.uncoveredCount ?? 0)
    };
  }

  const root = process.cwd();
  const isoPath = path.join(root, "data", "iso3166", "iso3166-1.json");
  const lawsDir = path.join(root, "data", "laws");
  if (!fs.existsSync(isoPath)) {
    return { total: 0, reviewedCount: 0, provisionalCount: 0, uncoveredCount: 0 };
  }
  const isoRaw = JSON.parse(fs.readFileSync(isoPath, "utf8"));
  const isoCodes = (isoRaw.entries ?? []).map((entry) => entry.alpha2);
  const profiles = new Map();
  for (const file of listJsonFiles(lawsDir)) {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (parsed?.id) profiles.set(parsed.id, parsed);
  }

  let reviewedCount = 0;
  let provisionalCount = 0;
  let uncoveredCount = 0;
  for (const code of isoCodes) {
    const profile = profiles.get(code);
    if (!profile) {
      uncoveredCount += 1;
      continue;
    }
    if (profile.status === "known" || profile.status === "needs_review") {
      reviewedCount += 1;
    } else {
      provisionalCount += 1;
    }
  }

  return {
    total: isoCodes.length,
    reviewedCount,
    provisionalCount,
    uncoveredCount,
    needsReviewCount: 0
  };
}

function selectNext(ciStatus, changedPaths, ciLog, coverage) {
  if (coverage.uncoveredCount > 0) {
    return "Add next batch of 5 provisional ISO countries (conveyor)";
  }

  if (coverage.uncoveredCount === 0 && coverage.provisionalCount > 0) {
    return "Promote next provisional country to needs_review with sources";
  }

  if (coverage.uncoveredCount === 0 && coverage.provisionalCount === 0 && coverage.needsReviewCount > 0) {
    if (coverage.hasReviewFiles) {
      return "Apply next review to move needs_review to reviewed";
    }
    return "Prepare a review note for the next needs_review country";
  }

  if (
    coverage.uncoveredCount === 0 &&
    coverage.provisionalCount === 0 &&
    coverage.needsReviewCount === 0 &&
    coverage.reviewedCount > 0
  ) {
    return "Generate/validate SEO pages for newly reviewed jurisdictions";
  }

  if (ciStatus !== "PASS") {
    return `Fix ${ciLog || "root-cause"}`;
  }

  return "Add next batch of 5 provisional ISO countries (conveyor)";
}

function main() {
  const { ciStatus, changedPaths, ciLog, coveragePath } = parseArgs();
  const paths = readChangedPaths(changedPaths);
  const logText = readCiLog(ciLog);
  const coverage = readCoverage(coveragePath);
  const reviewDir = path.join(process.cwd(), "data", "reviews");
  const hasReviewFiles =
    process.env.CODEX_TEST_REVIEWS === "0"
      ? false
      : fs.existsSync(reviewDir) &&
        fs.readdirSync(reviewDir).some((name) => name.endsWith(".review.json"));

  const next = selectNext(ciStatus, paths, logText, {
    ...coverage,
    hasReviewFiles
  })
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);

  process.stdout.write("Next: 1) " + next + "\n");
}

main();
