import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CANDIDATES_PATH = path.join(ROOT, "Reports", "seo", "top50_candidates.json");
const REGISTRY_PATH = path.join(ROOT, "data", "sources", "sources_registry.json");
const OUT_DIR = path.join(ROOT, "Reports", "review_queue");

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(CANDIDATES_PATH)) {
  fail(`Missing ${CANDIDATES_PATH}`);
}
if (!fs.existsSync(REGISTRY_PATH)) {
  fail(`Missing ${REGISTRY_PATH}`);
}

const report = JSON.parse(fs.readFileSync(CANDIDATES_PATH, "utf8"));
const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
const candidates = Array.isArray(report?.candidates) ? report.candidates : [];

if (candidates.length === 0) {
  fail("top50_candidates.json must include candidates");
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const checklist = [
  "medical",
  "recreational",
  "decriminalized",
  "public_use",
  "possession",
  "cultivation",
  "sale",
  "effective_date",
  "notes"
];

for (const entry of candidates) {
  const id = String(entry?.id || "").toUpperCase();
  if (!id) continue;
  const label = String(entry?.label || id);
  const sources = Array.isArray(registry?.[id]) ? registry[id] : [];
  const lines = [];
  lines.push(`# Review Packet: ${label} (${id})`);
  lines.push("");
  lines.push("## Official sources");
  if (sources.length === 0) {
    lines.push("- None (no official sources in registry)");
  } else {
    for (const source of sources) {
      const title = String(source?.title || "Official source");
      const url = String(source?.url || "");
      lines.push(`- [${title}](${url})`);
    }
  }
  lines.push("");
  lines.push("## Checklist");
  for (const item of checklist) {
    lines.push(`- [ ] ${item}`);
  }
  lines.push("");

  const outPath = path.join(OUT_DIR, `${id}.md`);
  fs.writeFileSync(outPath, lines.join("\n") + "\n");
}

console.log(`OK review packets (${candidates.length})`);
