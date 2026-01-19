import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const CATALOG_PATH = path.join(ROOT, "data", "sources", "official_catalog.json");
const FACTS_DIR = path.join(ROOT, "data", "sources", "ssot_facts");
const SNAPSHOT_DIR = path.join(ROOT, "data", "sources", "ssot_snapshots");
const SNAPSHOT_PATH = path.join(SNAPSHOT_DIR, "latest.json");
const REPORT_DIR = path.join(ROOT, "Reports", "ssot-diff");
const TODAY = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const REPORT_JSON = path.join(REPORT_DIR, `ssot_diff_${TODAY}.json`);
const REPORT_MD = path.join(REPORT_DIR, `ssot_diff_${TODAY}.md`);
const LAST_RUN_PATH = path.join(REPORT_DIR, "last_run.json");
const PENDING_PATH = path.join(REPORT_DIR, `pending_${TODAY}.json`);

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(2);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function normalizeArray(values) {
  const normalized = values.map((value) => normalizeValue(value));
  if (normalized.every((value) => value === null || typeof value !== "object")) {
    return normalized.slice().sort();
  }
  return normalized
    .slice()
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function normalizeValue(value) {
  if (Array.isArray(value)) return normalizeArray(value);
  if (!value || typeof value !== "object") return value;
  const keys = Object.keys(value).sort();
  const out = {};
  for (const key of keys) {
    out[key] = normalizeValue(value[key]);
  }
  return out;
}

function normalizeFacts(facts) {
  const cleaned = Array.isArray(facts) ? facts.filter(Boolean) : [];
  return cleaned
    .map((fact) => ({
      category: String(fact.category || ""),
      url: String(fact.url || ""),
      effective_date: fact.effective_date ?? null,
      text_snippet: fact.text_snippet ?? null
    }))
    .sort((a, b) => {
      const keyA = `${a.category}|${a.url}|${a.effective_date || ""}`;
      const keyB = `${b.category}|${b.url}|${b.effective_date || ""}`;
      return keyA.localeCompare(keyB);
    });
}

function hashPayload(payload) {
  const normalized = normalizeValue(payload);
  const json = JSON.stringify(normalized);
  return crypto.createHash("sha256").update(json).digest("hex");
}

function writeLastRun(payload) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(LAST_RUN_PATH, JSON.stringify(payload, null, 2) + "\n");
}

if (!fs.existsSync(CATALOG_PATH)) {
  fail(`Missing ${CATALOG_PATH}`);
}

const extract = spawnSync(process.execPath, [
  path.join(ROOT, "tools", "sources", "ssot_extract_facts.mjs")
]);
if (extract.status !== 0) {
  const pending = {
    status: "pending",
    reason: "extract_failed",
    at: new Date().toISOString()
  };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(PENDING_PATH, JSON.stringify(pending, null, 2) + "\n");
  writeLastRun({
    status: "pending",
    changed_count: 0,
    report_json: PENDING_PATH,
    report_md: null,
    changed_ids: []
  });
  process.exit(2);
}

const catalog = readJson(CATALOG_PATH);
const current = {};
const missingFacts = [];
for (const [id, entry] of Object.entries(catalog)) {
  const factPath = path.join(FACTS_DIR, `${id.toUpperCase()}.json`);
  if (!fs.existsSync(factPath)) {
    missingFacts.push(id);
    continue;
  }
  const factsPayload = readJson(factPath);
  const urls = Object.values(entry || {})
    .flat()
    .filter((value) => typeof value === "string" && value.startsWith("http"))
    .map((value) => value.trim());
  const notes = typeof entry?.notes === "string" ? entry.notes : null;
  const facts = normalizeFacts(factsPayload?.facts);
  const payload = { id, notes, urls, facts };
  current[id] = {
    hash: hashPayload(payload),
    source_urls_count: urls.length
  };
}

if (missingFacts.length > 0) {
  const pending = {
    status: "pending",
    reason: "missing_facts",
    missing_ids: missingFacts,
    at: new Date().toISOString()
  };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(PENDING_PATH, JSON.stringify(pending, null, 2) + "\n");
  writeLastRun({
    status: "pending",
    changed_count: 0,
    report_json: PENDING_PATH,
    report_md: null,
    changed_ids: []
  });
  process.exit(2);
}

fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });

if (!fs.existsSync(SNAPSHOT_PATH)) {
  const baseline = {
    generated_at: new Date().toISOString(),
    entries: current
  };
  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(baseline, null, 2) + "\n");
  const report = {
    status: "baseline",
    generated_at: baseline.generated_at,
    added: Object.keys(current),
    removed: [],
    changed: [],
    counts: {
      added: Object.keys(current).length,
      removed: 0,
      changed: 0
    }
  };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2) + "\n");
  fs.writeFileSync(
    REPORT_MD,
    [
      `# SSOT Diff ${TODAY}`,
      "",
      "Baseline created.",
      "",
      "| ISO2 | what_changed | old_hash | new_hash | source_urls_count |",
      "| --- | --- | --- | --- | --- |",
      ...Object.keys(current).map(
        (id) =>
          `| ${id} | baseline | - | ${current[id].hash} | ${current[id].source_urls_count} |`
      )
    ].join("\n") + "\n"
  );
  writeLastRun({
    status: "ok",
    changed_count: 0,
    report_json: REPORT_JSON,
    report_md: REPORT_MD,
    changed_ids: []
  });
  process.exit(0);
}

const previous = readJson(SNAPSHOT_PATH);
const prevEntries = previous?.entries || {};
const added = [];
const removed = [];
const changed = [];

for (const id of Object.keys(current)) {
  if (!prevEntries[id]) {
    added.push(id);
    continue;
  }
  if (prevEntries[id].hash !== current[id].hash) {
    changed.push(id);
  }
}
for (const id of Object.keys(prevEntries)) {
  if (!current[id]) removed.push(id);
}

const status = added.length || removed.length || changed.length ? "changed" : "ok";
const report = {
  status,
  generated_at: new Date().toISOString(),
  added,
  removed,
  changed,
  counts: {
    added: added.length,
    removed: removed.length,
    changed: changed.length
  }
};

fs.mkdirSync(REPORT_DIR, { recursive: true });
fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2) + "\n");
fs.writeFileSync(
  REPORT_MD,
  [
    `# SSOT Diff ${TODAY}`,
    "",
    `Status: ${status}`,
    "",
    "| ISO2 | what_changed | old_hash | new_hash | source_urls_count |",
    "| --- | --- | --- | --- | --- |",
    ...[...added, ...removed, ...changed].sort().map((id) => {
      const prev = prevEntries[id];
      const next = current[id];
      if (added.includes(id)) {
        return `| ${id} | added | - | ${next.hash} | ${next.source_urls_count} |`;
      }
      if (removed.includes(id)) {
        return `| ${id} | removed | ${prev.hash} | - | ${prev.source_urls_count} |`;
      }
      return `| ${id} | changed | ${prev.hash} | ${next.hash} | ${next.source_urls_count} |`;
    })
  ].join("\n") + "\n"
);

fs.writeFileSync(
  SNAPSHOT_PATH,
  JSON.stringify({ generated_at: new Date().toISOString(), entries: current }, null, 2) + "\n"
);

writeLastRun({
  status,
  changed_count: added.length + removed.length + changed.length,
  report_json: REPORT_JSON,
  report_md: REPORT_MD,
  changed_ids: [...added, ...removed, ...changed]
});

if (status === "changed") {
  process.exit(3);
}
process.exit(0);
