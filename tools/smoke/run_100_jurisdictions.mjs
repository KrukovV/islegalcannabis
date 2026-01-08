import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const ROOT = process.cwd();
const TOP25_PATH = path.join(ROOT, "packages", "shared", "src", "top25.json");
const ISO_PATH = path.join(ROOT, "data", "iso3166", "iso3166-1.json");
const US_LAWS_DIR = path.join(ROOT, "data", "laws", "us");

function parseArgs() {
  const args = process.argv.slice(2);
  const port = process.env.PORT || process.env.SMOKE_PORT || "3000";
  const options = {
    baseUrl: `http://127.0.0.1:${port}`,
    seed: "1337",
    count: 100,
    timeoutMs: 5000
  };
  for (const arg of args) {
    if (arg.startsWith("--baseUrl=")) options.baseUrl = arg.split("=")[1];
    if (arg.startsWith("--seed=")) options.seed = arg.split("=")[1];
    if (arg.startsWith("--count=")) options.count = Number(arg.split("=")[1]);
    if (arg.startsWith("--timeoutMs=")) options.timeoutMs = Number(arg.split("=")[1]);
  }
  return options;
}

function seededRandom(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return (h >>> 0) / 4294967296;
  };
}

function pickRandom(items, count, seed) {
  const list = items.slice();
  const rng = seededRandom(seed);
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list.slice(0, count);
}

function loadTop25() {
  if (!fs.existsSync(TOP25_PATH)) {
    throw new Error(`Missing TOP25 source at ${TOP25_PATH}`);
  }
  const parsed = JSON.parse(fs.readFileSync(TOP25_PATH, "utf-8"));
  return parsed;
}

function loadIsoList() {
  if (!fs.existsSync(ISO_PATH)) {
    throw new Error(`Missing ISO list at ${ISO_PATH}`);
  }
  const data = JSON.parse(fs.readFileSync(ISO_PATH, "utf-8"));
  return Array.isArray(data.entries)
    ? data.entries.map((entry) => entry.alpha2)
    : [];
}

function loadUsStates() {
  if (!fs.existsSync(US_LAWS_DIR)) return [];
  return fs
    .readdirSync(US_LAWS_DIR)
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.replace(/\.json$/, ""));
}

function buildEdgeCases() {
  const burst = Array.from({ length: 10 }, (_, i) => ({
    name: `Burst DE ${i + 1}`,
    country: "DE"
  }));

  const fixed = [
    { name: "Germany", country: "DE" },
    { name: "US-CA", country: "US", region: "CA" },
    { name: "US-NY", country: "US", region: "NY" },
    { name: "US-FL", country: "US", region: "FL" },
    { name: "US-TX", country: "US", region: "TX" },
    { name: "Netherlands", country: "NL" },
    { name: "France", country: "FR" },
    { name: "Spain", country: "ES" },
    { name: "Italy", country: "IT" },
    { name: "Sweden", country: "SE" },
    { name: "Unknown country", country: "ZZ" },
    { name: "Missing country", country: "" },
    { name: "Invalid country length", country: "FRA" },
    { name: "Unknown EU code", country: "AA" },
    { name: "Whitespace country", country: "  NL  " },
    { name: "Lowercase country", country: "fr" },
    { name: "US without region", country: "US" },
    { name: "Region only", country: "", region: "CA" },
    { name: "Unknown region", country: "US", region: "ZZ" },
    { name: "US empty region", country: "US", region: "" },
    { name: "US numeric region", country: "US", region: "12" },
    { name: "PT with region", country: "PT", region: "01" },
    { name: "IT with region", country: "IT", region: "RM" },
    { name: "Canada ISO", country: "CA" },
    { name: "Japan ISO", country: "JP" },
    { name: "Australia ISO", country: "AU" },
    { name: "Brazil ISO", country: "BR" },
    { name: "India ISO", country: "IN" },
    { name: "Mexico ISO", country: "MX" },
    { name: "UK ISO", country: "GB" },
    { name: "South Africa ISO", country: "ZA" }
  ];

  return [...fixed, ...burst].slice(0, 40);
}

function buildRandomCases(seed, count) {
  const iso = loadIsoList().map((code) => ({ name: code, country: code }));
  const usStates = loadUsStates().map((state) => ({
    name: `US-${state}`,
    country: "US",
    region: state
  }));
  const pool = [...iso, ...usStates];
  return pickRandom(pool, count, seed);
}

function buildUrl(baseUrl, params) {
  const query = new URLSearchParams();
  if (params.country !== undefined) query.set("country", params.country);
  if (params.region !== undefined && params.region !== "") query.set("region", params.region);
  return `${baseUrl}/api/check?${query.toString()}`;
}

function validatePayload(json) {
  if (json?.ok === true) {
    if (typeof json?.requestId !== "string") return false;
    if (typeof json?.meta?.requestId !== "string") return false;
    if (typeof json?.meta?.appVersion !== "string") return false;
    if (typeof json?.meta?.apiVersion !== "string") return false;
    if (typeof json?.meta?.dataSchemaVersion !== "number") return false;
    const profile = json.profile;
    if (profile === null) {
      if (typeof json?.status?.level !== "string") return false;
      if (typeof json?.verification?.status !== "string") return false;
      return true;
    }
    if (!profile) return false;
    if (!profile.id || !profile.country) return false;
    if (!profile.risks || !Array.isArray(profile.risks)) return false;
    if (!profile.sources || !Array.isArray(profile.sources)) return false;
    if (!profile.updated_at) return false;
    return true;
  }
  if (json?.ok === false) {
    if (typeof json?.requestId !== "string") return false;
    if (typeof json?.meta?.requestId !== "string") return false;
    if (typeof json?.meta?.appVersion !== "string") return false;
    if (typeof json?.meta?.apiVersion !== "string") return false;
    if (typeof json?.meta?.dataSchemaVersion !== "number") return false;
    if (!json?.error?.code || !json?.error?.message) return false;
    return true;
  }
  return false;
}

async function loadLocalHandlers() {
  process.chdir(path.join(ROOT, "apps", "web"));
  const require = createRequire(import.meta.url);
  const checkPath = path.join(
    ROOT,
    "apps",
    "web",
    ".next",
    "server",
    "app",
    "api",
    "check",
    "route.js"
  );
  const checkModule = require(checkPath);
  const checkHandler =
    checkModule.routeModule?.userland?.GET ??
    checkModule.GET ??
    checkModule.default?.GET ??
    null;
  if (!checkHandler) {
    throw new Error("Failed to load local API handler from .next output.");
  }
  return { checkHandler };
}

function formatTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(
    date.getDate()
  )}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function ensureReportsDir() {
  const dir = path.join(ROOT, "Reports");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  return dir;
}

async function run() {
  const { baseUrl, seed, count, timeoutMs } = parseArgs();
  const localMode = process.env.SMOKE_MODE === "local";
  const writeReports =
    process.env.SMOKE_EXTENDED === "1" ||
    process.argv.includes("--writeReports=1");
  const { checkHandler } = localMode ? await loadLocalHandlers() : { checkHandler: null };

  const edgeCases = buildEdgeCases();
  const randomCount = Math.max(0, count - edgeCases.length);
  const randomCases = buildRandomCases(seed, randomCount);
  const cases = [...edgeCases, ...randomCases].slice(0, count);

  const results = [];
  let passed = 0;
  let failed = 0;

  for (const item of cases) {
    const url = buildUrl(baseUrl, item);
    const startedAt = Date.now();
    let httpStatus = 0;
    let json = null;

    try {
      if (localMode && checkHandler) {
        const req = new Request(url);
        const res = await checkHandler(req);
        httpStatus = res.status;
        json = await res.json();
      } else {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        httpStatus = res.status;
        json = await res.json();
      }
    } catch (err) {
      failed += 1;
      results.push({
        case: item,
        httpStatus,
        ok: false,
        status: "request_failed",
        requestId: null,
        durationMs: Date.now() - startedAt
      });
      console.log(`[FAIL] ${item.name} -> request failed`);
      continue;
    }

    const validPayload = validatePayload(json);
    const isServerError = httpStatus >= 500;
    const requestId =
      typeof json?.requestId === "string"
        ? json.requestId.slice(0, 8)
        : "n/a";
    const status =
      json?.meta?.statusCode ??
      json?.status?.label ??
      "unknown";
    const pass = !isServerError && validPayload;

    if (pass) {
      passed += 1;
      console.log(
        `[OK] ${item.country || "??"}${item.region ? `-${item.region}` : ""} -> status=${status} requestId=${requestId}`
      );
    } else {
      failed += 1;
      console.log(
        `[FAIL] ${item.country || "??"}${item.region ? `-${item.region}` : ""} -> http=${httpStatus} requestId=${requestId} message=${json?.error?.message ?? "n/a"}`
      );
    }

    results.push({
      case: item,
      httpStatus,
      ok: Boolean(json?.ok),
      status,
      requestId: typeof json?.requestId === "string" ? json.requestId : null,
      durationMs: Date.now() - startedAt
    });
  }

  let jsonPath = null;
  let mdPath = null;
  if (writeReports) {
    const reportsDir = ensureReportsDir();
    const stamp = formatTimestamp();
    jsonPath = path.join(reportsDir, `smoke_100_${stamp}.json`);
    mdPath = path.join(reportsDir, `smoke_100_${stamp}.md`);

    fs.writeFileSync(
      jsonPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          baseUrl,
          seed,
          count: cases.length,
          passCount: passed,
          failCount: failed,
          results
        },
        null,
        2
      )
    );

    const failures = results.filter((r) => r.ok === false || r.httpStatus >= 500).slice(0, 5);
    const mdLines = [
      `# Smoke 100 Report`,
      ``,
      `- Generated: ${new Date().toISOString()}`,
      `- Base URL: ${baseUrl}`,
      `- Seed: ${seed}`,
      `- Total: ${cases.length}`,
      `- Passed: ${passed}`,
      `- Failed: ${failed}`,
      ``,
      `## Top Failures`,
      ``,
      `| case | http | ok | requestId |`,
      `| --- | --- | --- | --- |`,
      ...failures.map((f) => {
        const label = `${f.case.country || "??"}${f.case.region ? `-${f.case.region}` : ""}`;
        return `| ${label} | ${f.httpStatus} | ${f.ok} | ${f.requestId ?? "n/a"} |`;
      })
    ];
    fs.writeFileSync(mdPath, mdLines.join("\n"));
  }

  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  if (writeReports && jsonPath && mdPath) {
    console.log(`Report JSON: ${jsonPath}`);
    console.log(`Report MD: ${mdPath}`);
  }

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
