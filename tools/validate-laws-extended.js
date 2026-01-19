const fs = require("node:fs");
const path = require("node:path");

function listJsonFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listJsonFiles(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      if (entry.name === "schema.json") continue;
      files.push(fullPath);
    }
  }
  return files;
}

function fail(message) {
  console.error(`ERROR: validate-laws-extended: ${message}`);
  process.exit(1);
}

const lawsDir = path.join(process.cwd(), "data", "laws");
const files = listJsonFiles(lawsDir);
const statusRank = { provisional: 1, needs_review: 2, reviewed: 3 };
const allowedStatus = new Set(Object.keys(statusRank));
const allowedConfidence = new Set(["low", "medium", "high"]);

for (const file of files) {
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  if (parsed.review_status) {
    if (!allowedStatus.has(parsed.review_status)) {
      fail(`invalid review_status in ${file}`);
    }
  }
  if (parsed.review_confidence) {
    if (!allowedConfidence.has(parsed.review_confidence)) {
      fail(`invalid review_confidence in ${file}`);
    }
  }

  if (parsed.review_status === "reviewed") {
    const sources = Array.isArray(parsed.review_sources) ? parsed.review_sources : [];
    const officialCount = sources.filter((source) => source.kind === "official").length;
    if (officialCount < 1) {
      fail(`reviewed requires official source in ${file}`);
    }
  }

  if (Array.isArray(parsed.review_status_history) && parsed.review_status_history.length > 0) {
    let lastRank = 0;
    for (const entry of parsed.review_status_history) {
      if (!entry?.status || !statusRank[entry.status]) {
        fail(`invalid review_status_history in ${file}`);
      }
      const rank = statusRank[entry.status];
      if (rank < lastRank) {
        fail(`review_status_history downgrade in ${file}`);
      }
      lastRank = rank;
    }
    if (parsed.review_status && statusRank[parsed.review_status] < lastRank) {
      fail(`review_status downgrade in ${file}`);
    }
  }
}
