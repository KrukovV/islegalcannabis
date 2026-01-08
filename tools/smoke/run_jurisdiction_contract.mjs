import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const ROOT = process.cwd();

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    baseUrl: process.env.BASE_URL || "http://127.0.0.1:3000",
    timeoutMs: 5000
  };
  for (const arg of args) {
    if (arg.startsWith("--baseUrl=")) options.baseUrl = arg.split("=")[1];
    if (arg.startsWith("--timeoutMs=")) options.timeoutMs = Number(arg.split("=")[1]);
  }
  return options;
}

function buildCases() {
  const known = [
    { country: "US", region: "CA" },
    { country: "US", region: "NY" },
    { country: "US", region: "FL" },
    { country: "US", region: "TX" },
    { country: "US", region: "WA" },
    { country: "DE" },
    { country: "FR" },
    { country: "ES" },
    { country: "IT" },
    { country: "NL" }
  ];

  const unknown = [
    { country: "CA" },
    { country: "AU" },
    { country: "JP" },
    { country: "BR" },
    { country: "IN" },
    { country: "GB" },
    { country: "MX" },
    { country: "ZA" },
    { country: "TR" },
    { country: "AR" }
  ];

  const invalid = [
    { country: "ZZ" },
    { country: "AA" },
    { country: "FRA" },
    { country: "U1" },
    { country: "00" }
  ];

  return [
    ...known.map((item) => ({ ...item, expect: "known" })),
    ...unknown.map((item) => ({ ...item, expect: "unknown" })),
    ...invalid.map((item) => ({ ...item, expect: "invalid" }))
  ];
}

function buildUrl(baseUrl, params) {
  const query = new URLSearchParams();
  if (params.country !== undefined) query.set("country", params.country);
  if (params.region) query.set("region", params.region);
  return `${baseUrl}/api/check?${query.toString()}`;
}

async function loadLocalHandler() {
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

function isValidRequestId(value) {
  return typeof value === "string" && value.length > 6;
}

async function run() {
  const { baseUrl, timeoutMs } = parseArgs();
  const cases = buildCases();
  const localMode = process.env.SMOKE_MODE === "local";
  const { checkHandler } = localMode ? await loadLocalHandler() : { checkHandler: null };

  const results = [];
  let failed = 0;

  for (const item of cases) {
    const url = buildUrl(baseUrl, item);
    const start = Date.now();
    let status = 0;
    let json = null;
    let ok = false;
    let error = null;

    try {
      if (localMode && checkHandler) {
        const req = new Request(url);
        const res = await checkHandler(req);
        status = res.status;
        json = await res.json();
      } else {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        status = res.status;
        json = await res.json();
      }
      ok = Boolean(json?.ok);
    } catch (err) {
      error = err?.message ?? String(err);
    }

    const durationMs = Date.now() - start;
    const result = {
      country: item.country,
      region: item.region ?? null,
      expect: item.expect,
      httpStatus: status,
      ok,
      requestId: json?.requestId ?? null,
      metaRequestId: json?.meta?.requestId ?? null,
      statusLevel: json?.status?.level ?? null,
      errorCode: json?.error?.code ?? null,
      durationMs,
      error
    };

    let pass = true;
    if (!json || error) {
      pass = false;
    } else if (!isValidRequestId(json?.requestId) || !isValidRequestId(json?.meta?.requestId)) {
      pass = false;
    } else if (item.expect === "known") {
      const expectedKey = item.region ? `${item.country}-${item.region}` : item.country;
      pass =
        ok &&
        json?.profile?.id === expectedKey &&
        Array.isArray(json?.profile?.sources) &&
        Boolean(json?.profile?.updated_at);
    } else if (item.expect === "unknown") {
      pass = ok && json?.profile === null && json?.status?.level === "gray";
    } else if (item.expect === "invalid") {
      pass = !ok && json?.error?.code === "BAD_REQUEST";
    }

    results.push({ ...result, pass });
    if (!pass) failed += 1;
  }

  const summary = {
    total: results.length,
    passed: results.length - failed,
    failed
  };

  const reportsDir = path.join(ROOT, "Reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(reportsDir, `jurisdiction_contract_${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ summary, results }, null, 2));

  console.log(`Contract summary: ${summary.passed}/${summary.total} passed`);
  console.log(`Report: ${reportPath}`);

  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
