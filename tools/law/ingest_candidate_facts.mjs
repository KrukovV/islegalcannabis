import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LAWS_DIR = path.join(ROOT, "data", "laws");

function readArg(name, fallback = "") {
  const idx = process.argv.indexOf(name);
  if (idx !== -1) return process.argv[idx + 1] ?? fallback;
  const prefixed = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (prefixed) return prefixed.slice(name.length + 1);
  return fallback;
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function findProfilePath(iso2) {
  const worldPath = path.join(LAWS_DIR, "world", `${iso2}.json`);
  const euPath = path.join(LAWS_DIR, "eu", `${iso2}.json`);
  if (fs.existsSync(worldPath)) return worldPath;
  if (fs.existsSync(euPath)) return euPath;
  return "";
}

function main() {
  const iso2 = readArg("--iso2").toUpperCase();
  const factsPath = readArg("--facts");
  if (!iso2 || !factsPath) {
    console.error("ERROR: missing --iso2 or --facts");
    process.exit(1);
  }

  const facts = readJson(factsPath);
  if (!facts || !Array.isArray(facts.evidence) || facts.evidence.length === 0) {
    console.log(JSON.stringify({ updated: false, reason: "NO_EVIDENCE" }));
    return;
  }

  const rec = String(facts.status_recreational || "unknown");
  const med = String(facts.status_medical || "unknown");
  if (rec === "unknown" && med === "unknown") {
    console.log(JSON.stringify({ updated: false, reason: "ALL_UNKNOWN" }));
    return;
  }

  const profilePath = findProfilePath(iso2);
  if (!profilePath) {
    console.log(JSON.stringify({ updated: false, reason: "PROFILE_MISSING" }));
    return;
  }

  const profile = readJson(profilePath) || {};
  const reviewStatus = String(profile.review_status || "").toLowerCase();
  if (reviewStatus === "known" || reviewStatus === "reviewed") {
    console.log(JSON.stringify({ updated: false, reason: "ALREADY_REVIEWED" }));
    return;
  }

  const next = { ...profile };
  next.review_status = "needs_review";
  next.candidate_facts = {
    path: factsPath,
    evidence: facts.evidence,
    generated_at: facts.generated_at || new Date().toISOString()
  };
  fs.writeFileSync(profilePath, JSON.stringify(next, null, 2) + "\n");
  console.log(JSON.stringify({ updated: true, reason: "NEEDS_REVIEW" }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
