import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DEFAULT_SSOT_PATH = path.join(ROOT, "data", "legal_ssot", "legal_ssot.json");
const DEFAULT_LAWS_DIR = path.join(ROOT, "data", "laws");
const REPORT_PATH = path.join(ROOT, "Reports", "promotion", "auto_apply_verified.json");

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    ssotPath: DEFAULT_SSOT_PATH,
    lawsDir: DEFAULT_LAWS_DIR,
    reportPath: REPORT_PATH
  };
  for (let i = 0; i < args.length; i += 1) {
    const value = args[i + 1];
    if (args[i] === "--ssot" && value) options.ssotPath = value;
    if (args[i] === "--laws" && value) options.lawsDir = value;
    if (args[i] === "--report" && value) options.reportPath = value;
  }
  return options;
}

function resolveProfilePath(lawsDir, iso2) {
  const upper = iso2.toUpperCase();
  const euPath = path.join(lawsDir, "eu", `${upper}.json`);
  if (fs.existsSync(euPath)) return euPath;
  const worldPath = path.join(lawsDir, "world", `${upper}.json`);
  if (fs.existsSync(worldPath)) return worldPath;
  return null;
}

function hasEvidence(entry) {
  const evidence = Array.isArray(entry?.evidence) ? entry.evidence : [];
  return evidence.some(
    (item) => typeof item?.locator === "string" && item.locator.trim().length > 0
  );
}

function main() {
  const options = parseArgs();
  const payload = readJson(options.ssotPath);
  const entries = payload?.entries || payload || {};
  const report = {
    generated_at: new Date().toISOString(),
    promoted: [],
    rejected: []
  };

  for (const [iso2, entry] of Object.entries(entries)) {
    if (!entry || typeof entry !== "object") continue;
    const confidence = String(entry.confidence || "").toLowerCase();
    if (confidence !== "high" || !hasEvidence(entry)) {
      report.rejected.push({ id: iso2.toUpperCase(), reason: "missing_evidence" });
      continue;
    }
    const profilePath = resolveProfilePath(options.lawsDir, iso2);
    if (!profilePath) {
      report.rejected.push({ id: iso2.toUpperCase(), reason: "missing_profile" });
      continue;
    }
    const profile = readJson(profilePath);
    if (!profile) {
      report.rejected.push({ id: iso2.toUpperCase(), reason: "missing_profile" });
      continue;
    }
    const today = new Date().toISOString().slice(0, 10);
    const history = Array.isArray(profile.review_status_history)
      ? profile.review_status_history
      : [];
    history.push({ status: "known", at: today });
    const next = {
      ...profile,
      status: "known",
      review_status: "known",
      review_status_history: history,
      verified_at: profile.verified_at || today,
      updated_at: today
    };
    fs.writeFileSync(profilePath, JSON.stringify(next, null, 2) + "\n");
    report.promoted.push(iso2.toUpperCase());
  }

  fs.mkdirSync(path.dirname(options.reportPath), { recursive: true });
  fs.writeFileSync(options.reportPath, JSON.stringify(report, null, 2) + "\n");
  console.log(
    `OK auto_apply_verified (promoted=${report.promoted.length}, rejected=${report.rejected.length})`
  );
}

main();
