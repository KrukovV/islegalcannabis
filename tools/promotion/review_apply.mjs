import fs from "node:fs";
import path from "node:path";

function parseArgs() {
  const args = process.argv.slice(2);
  const options = { file: "", root: process.cwd() };
  for (const arg of args) {
    if (arg.startsWith("--file=")) options.file = arg.split("=")[1];
    if (arg.startsWith("--root=")) options.root = arg.split("=")[1];
  }
  return options;
}

function main() {
  const { file, root } = parseArgs();
  if (!file) {
    console.error("Missing --file for review_apply.");
    process.exit(1);
  }
  const reviewPath = path.isAbsolute(file) ? file : path.join(root, file);
  if (!fs.existsSync(reviewPath)) {
    console.error(`Missing review file: ${reviewPath}`);
    process.exit(1);
  }

  const review = JSON.parse(fs.readFileSync(reviewPath, "utf8"));
  const code = String(review.id || path.basename(reviewPath).split(".")[0]).toUpperCase();
  const target = path.join(root, "data", "laws", "world", `${code}.json`);
  if (!fs.existsSync(target)) {
    console.error(`Missing profile: ${target}`);
    process.exit(1);
  }

  const parsed = JSON.parse(fs.readFileSync(target, "utf8"));
  if (parsed.review_status !== "needs_review") {
    console.error(`Profile not in needs_review: ${code}`);
    process.exit(1);
  }

  const updates = review.updates || {};
  const reviewSources = Array.isArray(review.review_sources)
    ? review.review_sources
    : Array.isArray(review.sources)
      ? review.sources
      : parsed.review_sources;
  const officialCount = (reviewSources || []).filter((source) => source.kind === "official").length;
  if (officialCount < 1) {
    console.error(`Reviewed profile requires at least one official source: ${code}`);
    process.exit(1);
  }
  const confidence = officialCount >= 2 ? "high" : "medium";
  const today = new Date().toISOString().slice(0, 10);
  const history = Array.isArray(parsed.review_status_history)
    ? parsed.review_status_history.slice()
    : [];
  history.push({ status: parsed.review_status || "needs_review", at: parsed.updated_at || today });
  history.push({ status: "reviewed", at: today });

  const next = {
    ...parsed,
    ...updates,
    review_sources: reviewSources,
    review_status: "reviewed",
    review_confidence: confidence,
    updated_at: today,
    review_status_history: history
  };

  fs.writeFileSync(target, JSON.stringify(next, null, 2) + "\n");
}

main();
