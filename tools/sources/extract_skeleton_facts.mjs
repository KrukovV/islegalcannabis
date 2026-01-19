import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const SNAPSHOT_ROOT = path.join(ROOT, "data", "source_snapshots");
const OUTPUT_PATH = path.join(ROOT, "data", "legal_ssot", "legal_ssot.json");
const REPORT_PATH = path.join(ROOT, "Reports", "ssot", "ssot_entries_last.json");

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stableStringify(obj) {
  if (Array.isArray(obj)) {
    return `[${obj.map(stableStringify).join(",")}]`;
  }
  if (obj && typeof obj === "object") {
    const keys = Object.keys(obj).sort();
    return `{${keys.map((key) => JSON.stringify(key) + ":" + stableStringify(obj[key])).join(",")}}`;
  }
  return JSON.stringify(obj);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    snapshotsDir: SNAPSHOT_ROOT,
    outputPath: OUTPUT_PATH,
    smoke: false
  };
  for (let i = 0; i < args.length; i += 1) {
    const value = args[i + 1];
    if (args[i] === "--snapshots" && value) options.snapshotsDir = value;
    if (args[i] === "--output" && value) options.outputPath = value;
    if (args[i] === "--smoke") options.smoke = true;
  }
  if (options.smoke) {
    options.snapshotsDir = path.join(
      ROOT,
      "Reports",
      "sources",
      "source_snapshots_smoke"
    );
    options.outputPath = path.join(
      ROOT,
      "Reports",
      "ssot",
      "legal_ssot_smoke.json"
    );
  }
  return options;
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function listMetaFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  const isoDirs = fs.readdirSync(rootDir);
  const metaFiles = [];
  for (const iso2 of isoDirs) {
    const isoPath = path.join(rootDir, iso2);
    if (!fs.statSync(isoPath).isDirectory()) continue;
    for (const dayDir of fs.readdirSync(isoPath)) {
      const dayPath = path.join(isoPath, dayDir);
      if (!fs.statSync(dayPath).isDirectory()) continue;
      const metaPath = path.join(dayPath, "meta.json");
      if (fs.existsSync(metaPath)) metaFiles.push(metaPath);
    }
  }
  return metaFiles;
}

function buildEntries(metaFiles) {
  const entries = {};
  for (const metaPath of metaFiles) {
    const meta = readJson(metaPath);
    const items = Array.isArray(meta?.items) ? meta.items : [];
    for (const item of items) {
      const iso2 = String(item?.iso2 || "").toUpperCase();
      if (!iso2) continue;
      if (!entries[iso2]) {
        entries[iso2] = {
          recreational: null,
          medical: null,
          confidence: "low",
          sources: [],
          generated_at: new Date().toISOString()
        };
      }
      entries[iso2].sources.push({
        title: "Official source",
        url: item.url,
        snapshot: item.snapshot,
        sha256: item.sha256,
        evidence: "snapshot_present:true",
        source_type: "official",
        verified: item.type === "verified"
      });
    }
  }
  for (const entry of Object.values(entries)) {
    if (entry.sources.length > 1) entry.confidence = "medium";
    const hash = sha256(stableStringify(entry.sources));
    entry.content_hash = hash;
  }
  return entries;
}

function mergeEntries(existingEntries, nextEntries) {
  return { ...existingEntries, ...nextEntries };
}

function main() {
  const options = parseArgs();
  const metaFiles = listMetaFiles(options.snapshotsDir);
  const nextEntries = buildEntries(metaFiles);
  const existing = readJson(options.outputPath) || {};
  const output = {
    generated_at: new Date().toISOString(),
    entries: mergeEntries(existing.entries || {}, nextEntries)
  };

  fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
  fs.writeFileSync(options.outputPath, JSON.stringify(output, null, 2) + "\n");

  const report = {
    generated_at: output.generated_at,
    entries: Object.keys(output.entries).length,
    sources: Object.values(output.entries).reduce(
      (sum, entry) => sum + entry.sources.length,
      0
    )
  };
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n");
  console.log(
    `OK extract_skeleton_facts (entries=${report.entries}, sources=${report.sources})`
  );
}

main();
