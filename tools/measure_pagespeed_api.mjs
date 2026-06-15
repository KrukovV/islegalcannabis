import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");

function parseEnvAssignment(rawLine) {
  const line = String(rawLine || "").trim();
  if (!line || line.startsWith("#")) return null;
  const normalized = line.startsWith("export ") ? line.slice(7) : line;
  const eqIndex = normalized.indexOf("=");
  if (eqIndex <= 0) return null;
  const key = normalized.slice(0, eqIndex).trim();
  let value = normalized.slice(eqIndex + 1).trim();
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return { key, value };
}

async function loadLocalEnvFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const parsed = parseEnvAssignment(line);
      if (!parsed) continue;
      if (!(parsed.key in process.env)) {
        process.env[parsed.key] = parsed.value;
      }
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
}

function scoreTo100(raw) {
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return null;
  return Math.round(numeric * 100);
}

function metricValue(audits, id) {
  const value = audits?.[id]?.numericValue;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function metricDisplay(audits, id) {
  const value = audits?.[id]?.displayValue;
  return typeof value === "string" ? value : "";
}

function rel(filePath) {
  return path.relative(repoRoot, filePath);
}

await loadLocalEnvFile(path.join(repoRoot, ".env.prod.local"));
await loadLocalEnvFile(path.join(repoRoot, ".env.local"));

const apiKey = String(process.env.GOOGLE_PAGESPEED_API_KEY || "").trim();
if (!apiKey) {
  console.error("PAGESPEED_OK=0 reason=API_KEY_MISSING");
  process.exit(1);
}

const targetUrl = process.env.PAGESPEED_TARGET_URL || "https://www.islegal.info/new-map";
const strategy = (process.env.PAGESPEED_STRATEGY || "desktop").toLowerCase();
const locale = process.env.PAGESPEED_LOCALE || "en";
const categories = String(process.env.PAGESPEED_CATEGORIES || "performance")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const label = process.env.PAGESPEED_LABEL || `${strategy}-${Date.now()}`;
const reportsDir = process.env.PAGESPEED_OUT_DIR
  ? path.resolve(process.env.PAGESPEED_OUT_DIR)
  : path.join(repoRoot, "Reports", "pagespeed");

await fs.mkdir(reportsDir, { recursive: true });

const params = new URLSearchParams();
params.set("url", targetUrl);
params.set("strategy", strategy);
params.set("locale", locale);
for (const category of categories) {
  params.append("category", category);
}
params.set("key", apiKey);

const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`;
const response = await fetch(endpoint, {
  headers: {
    Accept: "application/json"
  }
});

const bodyText = await response.text();
let payload = {};
try {
  payload = JSON.parse(bodyText);
} catch {
  payload = { raw: bodyText };
}

const rawPath = path.join(reportsDir, `${label}.${strategy}.json`);
await fs.writeFile(rawPath, JSON.stringify(payload, null, 2) + "\n", "utf8");

if (!response.ok || payload?.error) {
  const status = response.status;
  const reason = String(payload?.error?.message || payload?.error?.status || `HTTP_${status}`);
  console.error(`PAGESPEED_OK=0 status=${status} reason=${JSON.stringify(reason)} report=${rel(rawPath)}`);
  process.exit(1);
}

const lighthouse = payload?.lighthouseResult || {};
const audits = lighthouse?.audits || {};
const categoriesResult = lighthouse?.categories || {};
const environment = lighthouse?.environment || {};

const summary = {
  fetched_at: new Date().toISOString(),
  target_url: targetUrl,
  final_url: payload?.id || targetUrl,
  strategy,
  locale,
  categories,
  status: response.status,
  score: scoreTo100(categoriesResult?.performance?.score),
  metrics: {
    first_contentful_paint_ms: metricValue(audits, "first-contentful-paint"),
    largest_contentful_paint_ms: metricValue(audits, "largest-contentful-paint"),
    total_blocking_time_ms: metricValue(audits, "total-blocking-time"),
    cumulative_layout_shift: metricValue(audits, "cumulative-layout-shift"),
    speed_index_ms: metricValue(audits, "speed-index"),
    interaction_to_next_paint_ms: metricValue(audits, "interaction-to-next-paint")
  },
  display_values: {
    first_contentful_paint: metricDisplay(audits, "first-contentful-paint"),
    largest_contentful_paint: metricDisplay(audits, "largest-contentful-paint"),
    total_blocking_time: metricDisplay(audits, "total-blocking-time"),
    cumulative_layout_shift: metricDisplay(audits, "cumulative-layout-shift"),
    speed_index: metricDisplay(audits, "speed-index"),
    interaction_to_next_paint: metricDisplay(audits, "interaction-to-next-paint")
  },
  lighthouse: {
    version: lighthouse?.lighthouseVersion || "",
    user_agent: environment?.networkUserAgent || ""
  }
};

const summaryPath = path.join(reportsDir, `${label}.${strategy}.summary.json`);
await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2) + "\n", "utf8");

console.log([
  "PAGESPEED_OK=1",
  `strategy=${strategy}`,
  `score=${summary.score ?? "-"}`,
  `fcp_ms=${summary.metrics.first_contentful_paint_ms ?? "-"}`,
  `lcp_ms=${summary.metrics.largest_contentful_paint_ms ?? "-"}`,
  `tbt_ms=${summary.metrics.total_blocking_time_ms ?? "-"}`,
  `cls=${summary.metrics.cumulative_layout_shift ?? "-"}`,
  `si_ms=${summary.metrics.speed_index_ms ?? "-"}`,
  `report=${rel(summaryPath)}`
].join(" "));
