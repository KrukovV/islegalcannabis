import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const ROOT = process.cwd();
const TOP25_PATH = path.join(ROOT, "packages", "shared", "src", "top25.json");

function parseArgs() {
  const args = process.argv.slice(2);
  const options = { baseUrl: "http://127.0.0.1:3000", n: 50, seed: "1" };
  for (const arg of args) {
    if (arg.startsWith("--baseUrl=")) options.baseUrl = arg.split("=")[1];
    if (arg.startsWith("--n=")) options.n = Number(arg.split("=")[1]);
    if (arg.startsWith("--seed=")) options.seed = arg.split("=")[1];
  }
  return options;
}

function loadTop25() {
  if (!fs.existsSync(TOP25_PATH)) {
    throw new Error(`Missing TOP25 source at ${TOP25_PATH}`);
  }
  const parsed = JSON.parse(fs.readFileSync(TOP25_PATH, "utf-8"));
  return parsed;
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

function buildCases(top25, seed) {
  const topCases = pickRandom(top25, 25, seed).map((entry) => ({
    name: entry.displayName ?? entry.slug,
    country: entry.country,
    region: entry.region,
    expectOk: true
  }));

  const edgeCases = [
    { name: "Germany (country only)", country: "DE", expectOk: true },
    { name: "Unknown country", country: "ZZ", expectOk: false },
    { name: "US without region", country: "US", expectOk: false },
    { name: "Region only", country: "", region: "CA", expectOk: false },
    { name: "Lowercase country", country: "fr", expectOk: true },
    { name: "Whitespace country", country: "  NL  ", expectOk: true },
    { name: "EU without region", country: "ES", expectOk: true },
    { name: "US empty region", country: "US", region: "", expectOk: false },
    { name: "Unknown region", country: "US", region: "ZZ", expectOk: false },
    { name: "Invalid country length", country: "FRA", expectOk: false },
    { name: "Unknown EU code", country: "AA", expectOk: false },
    { name: "PT with region", country: "PT", region: "01", expectOk: true },
    { name: "IT with region", country: "IT", region: "RM", expectOk: true },
    { name: "US numeric region", country: "US", region: "12", expectOk: false },
    { name: "Empty country", country: "", expectOk: false }
  ];

  const boundaryCases = [
    { name: "US-CA", country: "US", region: "CA", expectOk: true },
    { name: "US-NY", country: "US", region: "NY", expectOk: true },
    { name: "US-FL", country: "US", region: "FL", expectOk: true },
    { name: "US-TX", country: "US", region: "TX", expectOk: true },
    { name: "US-WA", country: "US", region: "WA", expectOk: true },
    { name: "France", country: "FR", expectOk: true },
    { name: "Spain", country: "ES", expectOk: true },
    { name: "Italy", country: "IT", expectOk: true },
    { name: "Netherlands", country: "NL", expectOk: true },
    { name: "Sweden", country: "SE", expectOk: true }
  ];

  return [...topCases, ...edgeCases, ...boundaryCases].slice(0, 50);
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

async function run() {
  const { baseUrl, n, seed } = parseArgs();
  const localMode = process.env.SMOKE_MODE === "local";
  let serverProcess = null;
  let killTimer = null;

  try {
    const top25 = loadTop25();
    const cases = buildCases(top25, seed).slice(0, n);
    const { checkHandler } = localMode ? await loadLocalHandlers() : { checkHandler: null };

    let passed = 0;
    let failed = 0;

    for (const item of cases) {
      const url = buildUrl(baseUrl, item);
      let status = "n/a";
      let meta = {};
      let ok = false;
      let httpStatus = 0;
      let json = null;

      try {
        if (localMode && checkHandler) {
          const req = new Request(url);
          const res = await checkHandler(req);
          httpStatus = res.status;
          json = await res.json();
        } else {
          const res = await fetch(url);
          httpStatus = res.status;
          json = await res.json();
        }
      } catch (err) {
        failed += 1;
        console.log(`[FAIL] ${item.name} -> request failed`);
        continue;
      }

      ok = Boolean(json?.ok);
      status = json?.meta?.statusCode ?? json?.status?.label ?? "unknown";
      meta = json?.meta ?? {};

      const validPayload = validatePayload(json);
      const hasStatusCode = Boolean(json?.meta?.statusCode);
      const isServerError = httpStatus >= 500;

      let pass = false;
      if (item.expectOk) {
        pass = ok && hasStatusCode && validPayload && !isServerError;
      } else {
        pass = !isServerError && (!ok || !hasStatusCode || !validPayload);
      }

    const requestId =
      typeof json?.requestId === "string"
        ? json.requestId.slice(0, 8)
        : "n/a";

    if (pass) {
      passed += 1;
      console.log(
        `[OK] ${item.country || "??"}${item.region ? `-${item.region}` : ""} -> status=${status} requestId=${requestId} cacheHit=${meta.cacheHit ?? "n/a"} verifiedFresh=${meta.verifiedFresh ?? "n/a"}`
      );
    } else {
      failed += 1;
      console.log(
        `[FAIL] ${item.country || "??"}${item.region ? `-${item.region}` : ""} -> http=${httpStatus} requestId=${requestId} message=${json?.error?.message ?? "n/a"}`
      );
    }
  }

    console.log(`\nSummary: ${passed} passed, ${failed} failed`);
    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    if (serverProcess) {
      serverProcess.kill("SIGTERM");
      killTimer = setTimeout(() => {
        if (serverProcess) {
          serverProcess.kill("SIGKILL");
        }
      }, 2000);
      await new Promise((resolve) => {
        serverProcess.on("exit", resolve);
      });
      if (killTimer) clearTimeout(killTimer);
      serverProcess = null;
    }
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
