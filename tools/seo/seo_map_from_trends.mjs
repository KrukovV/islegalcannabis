import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const metaPath = path.join(root, "Reports", "trends", "meta.json");
const trendsPath = path.join(root, "Reports", "trends", "top50_5y.json");
const outputDir = path.join(root, "data", "seo");
const outputPath = path.join(outputDir, "priority_countries.json");

function writeDraft(reason, source = "draft") {
  const meta = {
    source,
    timeframe: null,
    generatedAt: null,
    isReal: false,
    note: "draft priority",
    reason
  };
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({ meta, rows: [] }, null, 2));
  process.stdout.write(`Wrote ${outputPath}\n`);
}

if (!fs.existsSync(metaPath)) {
  writeDraft("missing meta", "skipped");
  process.exit(0);
}

const metaPayload = JSON.parse(fs.readFileSync(metaPath, "utf8"));
if (!metaPayload?.isReal) {
  writeDraft("draft priority", metaPayload?.source ?? "pending");
  process.exit(0);
}

if (!fs.existsSync(trendsPath)) {
  writeDraft("missing trends");
  process.exit(0);
}

const payload = JSON.parse(fs.readFileSync(trendsPath, "utf8"));
const rows = Array.isArray(payload)
  ? payload
  : Array.isArray(payload?.rows)
    ? payload.rows
    : [];
if (rows.length === 0) {
  writeDraft("empty trends");
  process.exit(0);
}

const source = metaPayload?.source ?? "pytrends";
const meta = {
  source,
  timeframe: metaPayload?.timeframe ?? payload?.meta?.timeframe ?? null,
  generatedAt: metaPayload?.generatedAt ?? payload?.meta?.generatedAt ?? null,
  isReal: true,
  note: "real trends"
};

const mapped = rows.map((entry, index) => ({
  rank: entry.rank ?? index + 1,
  iso2: entry.country_iso2 ?? entry.iso2 ?? null,
  score: entry.score ?? null,
  source: entry.source ?? "unknown"
}));

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify({ meta, rows: mapped }, null, 2));
process.stdout.write(`Wrote ${outputPath}\n`);
