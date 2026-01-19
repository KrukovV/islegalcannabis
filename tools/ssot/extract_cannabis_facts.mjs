import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DEFAULT_SNAPSHOTS = path.join(ROOT, "data", "source_snapshots");
const DEFAULT_OUTPUT = path.join(ROOT, "data", "legal_ssot", "legal_ssot.json");
const REPORT_PATH = path.join(ROOT, "Reports", "ssot", "extract_cannabis_facts.json");

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    snapshotsDir: DEFAULT_SNAPSHOTS,
    outputPath: DEFAULT_OUTPUT
  };
  for (let i = 0; i < args.length; i += 1) {
    const value = args[i + 1];
    if (args[i] === "--snapshots" && value) options.snapshotsDir = value;
    if (args[i] === "--output" && value) options.outputPath = value;
  }
  return options;
}

function stripTags(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findStatusEvidence(text, label) {
  const regex = new RegExp(`${label}\\s*[:\\-]\\s*(allowed|restricted|illegal)`, "i");
  const match = text.match(regex);
  if (!match || match.index === undefined) return null;
  const status = match[1].toLowerCase();
  const start = Math.max(0, match.index - 40);
  const end = Math.min(text.length, match.index + match[0].length + 40);
  const quote = text.slice(start, end).trim().slice(0, 160);
  return { status, quote };
}

function latestSnapshotDir(rootDir, iso2) {
  const isoPath = path.join(rootDir, iso2);
  if (!fs.existsSync(isoPath)) return null;
  const dayDirs = fs
    .readdirSync(isoPath)
    .filter((dir) => fs.statSync(path.join(isoPath, dir)).isDirectory())
    .sort();
  if (dayDirs.length === 0) return null;
  return path.join(isoPath, dayDirs[dayDirs.length - 1]);
}

function buildEntryFromMeta(iso2, metaPath) {
  const meta = readJson(metaPath);
  const items = Array.isArray(meta?.items) ? meta.items : [];
  const evidence = [];
  const sources = [];
  let recreational = "unknown";
  let medical = "unknown";

  for (const item of items) {
    if (!item?.snapshot || !item?.url) continue;
    sources.push(String(item.url));
    const snapshotRef = String(item.snapshot);
    const locator = item.locator || "";
    const textExcerpt = typeof item.text_excerpt === "string" ? item.text_excerpt : "";
    const ext = snapshotRef.toLowerCase().endsWith(".pdf") ? "pdf" : "html";
    if (ext === "html" && fs.existsSync(snapshotRef)) {
      const html = fs.readFileSync(snapshotRef, "utf8");
      const plain = stripTags(html);
      const rec = findStatusEvidence(plain, "recreational");
      const med = findStatusEvidence(plain, "medical");
      if (rec && recreational === "unknown") recreational = rec.status;
      if (med && medical === "unknown") medical = med.status;
      const snippet = rec?.quote || med?.quote;
      if (snippet) {
        evidence.push({
          snapshotRef,
          url: String(item.url),
          locator: "section=body",
          quote: snippet.slice(0, 160)
        });
      }
    } else if (ext === "pdf" && textExcerpt) {
      const plain = textExcerpt.trim();
      const rec = findStatusEvidence(plain, "recreational");
      const med = findStatusEvidence(plain, "medical");
      if (rec && recreational === "unknown") recreational = rec.status;
      if (med && medical === "unknown") medical = med.status;
      const snippet = rec?.quote || med?.quote || plain.slice(0, 160);
      evidence.push({
        snapshotRef,
        url: String(item.url),
        locator: locator || "page=1",
        quote: snippet.slice(0, 160)
      });
    }
  }

  const hasEvidence = evidence.some((item) => item.locator && item.quote);
  const confidence = hasEvidence ? "high" : sources.length > 0 ? "medium" : "low";

  return {
    iso2,
    recreational_status: recreational,
    medical_status: medical,
    evidence,
    sources,
    confidence,
    generated_at: new Date().toISOString()
  };
}

function main() {
  const options = parseArgs();
  const entries = {};
  if (!fs.existsSync(options.snapshotsDir)) {
    fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
    fs.writeFileSync(
      options.outputPath,
      JSON.stringify({ generated_at: new Date().toISOString(), entries }, null, 2) + "\n"
    );
    return;
  }

  const isoDirs = fs
    .readdirSync(options.snapshotsDir)
    .filter((dir) =>
      fs.statSync(path.join(options.snapshotsDir, dir)).isDirectory()
    )
    .sort();

  for (const iso2 of isoDirs) {
    const latestDir = latestSnapshotDir(options.snapshotsDir, iso2);
    if (!latestDir) continue;
    const metaPath = path.join(latestDir, "meta.json");
    if (!fs.existsSync(metaPath)) continue;
    entries[iso2.toUpperCase()] = buildEntryFromMeta(iso2.toUpperCase(), metaPath);
  }

  const output = {
    generated_at: new Date().toISOString(),
    entries
  };
  const existing = readJson(options.outputPath) || {};
  const merged = {
    generated_at: output.generated_at,
    entries: { ...(existing.entries || existing), ...entries }
  };

  fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
  fs.writeFileSync(options.outputPath, JSON.stringify(merged, null, 2) + "\n");

  const report = {
    generated_at: output.generated_at,
    entries: Object.keys(entries).length,
    entry_ids: Object.keys(entries).sort()
  };
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n");
  console.log(`OK extract_cannabis_facts (entries=${report.entries})`);
}

main();
