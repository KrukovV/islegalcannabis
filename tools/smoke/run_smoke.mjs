import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const ROOT = process.cwd();
const FIXTURES_PATH = path.join(ROOT, "tools", "smoke", "fixtures.json");
const DEFAULT_PORT = Number(process.env.SMOKE_PORT ?? "3000");

function parseArgs() {
  const args = process.argv.slice(2);
  const options = { mode: "mock", count: null, seed: null };
  for (const arg of args) {
    if (arg.startsWith("--mode=")) options.mode = arg.split("=")[1];
    if (arg.startsWith("--count=")) options.count = Number(arg.split("=")[1]);
    if (arg.startsWith("--seed=")) options.seed = arg.split("=")[1];
  }
  return options;
}

function loadFixtures() {
  if (!fs.existsSync(FIXTURES_PATH)) {
    throw new Error(`Missing fixtures file at ${FIXTURES_PATH}`);
  }
  const raw = fs.readFileSync(FIXTURES_PATH, "utf-8");
  return JSON.parse(raw);
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

function pickFixtures(fixtures, count, seed) {
  if (!count || count >= fixtures.length) return fixtures;
  const items = fixtures.slice();
  if (seed) {
    const rng = seededRandom(seed);
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
  }
  return items.slice(0, count);
}

function buildUrl(pathname) {
  return `http://localhost:${DEFAULT_PORT}${pathname}`;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function isServerUp() {
  try {
    const res = await fetchWithTimeout(
      buildUrl("/api/check?country=DE"),
      {},
      1200
    );
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForServer(retries = 30) {
  for (let i = 0; i < retries; i += 1) {
    if (await isServerUp()) return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

async function startServer() {
  const build = spawn("npm", ["run", "web:build"], {
    stdio: "inherit",
    cwd: ROOT
  });
  await new Promise((resolve, reject) => {
    build.on("exit", (code) => (code === 0 ? resolve() : reject(new Error("build failed"))));
  });

  const child = spawn("npm", ["-w", "apps/web", "run", "start"], {
    stdio: "inherit",
    cwd: ROOT,
    env: { ...process.env, PORT: String(DEFAULT_PORT) }
  });

  const ready = await waitForServer();
  if (!ready) {
    child.kill("SIGTERM");
    throw new Error("server_start_failed");
  }
  return child;
}

function formatStatus(checkJson) {
  const statusCode = checkJson?.meta?.statusCode;
  const label = checkJson?.status?.label;
  return statusCode ?? label ?? "unknown";
}

async function run() {
  const { mode, count, seed } = parseArgs();
  const fixtures = loadFixtures();
  const cases = pickFixtures(fixtures, count, seed);

  let serverProcess = null;
  let useLocalHandlers = false;
  if (!(await isServerUp())) {
    try {
      serverProcess = await startServer();
    } catch {
      console.log("[warn] server start failed; falling back to in-process handlers");
      useLocalHandlers = true;
    }
  }

  let reverseHandler = null;
  let checkHandler = null;
  if (useLocalHandlers) {
    process.chdir(path.join(ROOT, "apps", "web"));
    const require = createRequire(import.meta.url);
    const reversePath = path.join(
      ROOT,
      "apps",
      "web",
      ".next",
      "server",
      "app",
      "api",
      "reverse-geocode",
      "route.js"
    );
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
    const reverseModule = require(reversePath);
    const checkModule = require(checkPath);
    reverseHandler =
      reverseModule.routeModule?.userland?.GET ??
      reverseModule.GET ??
      reverseModule.default?.GET ??
      null;
    checkHandler =
      checkModule.routeModule?.userland?.GET ??
      checkModule.GET ??
      checkModule.default?.GET ??
      null;
    if (!reverseHandler || !checkHandler) {
      throw new Error("Failed to load local API handlers from .next output.");
    }
  }

  const failures = [];
  let passed = 0;

  for (const item of cases) {
    if (mode === "live") {
      await new Promise((resolve) => setTimeout(resolve, 1100));
    }

    let reverseJson;
    try {
      const reversePath = `/api/reverse-geocode?lat=${item.lat}&lon=${item.lon}&mode=${mode}`;
      if (useLocalHandlers && reverseHandler) {
        const req = new Request(`http://local${reversePath}`);
        const reverseRes = await reverseHandler(req);
        reverseJson = await reverseRes.json();
        if (!reverseRes.ok || !reverseJson.ok) {
          throw new Error("reverse_geocode_failed");
        }
      } else {
        const reverseUrl = buildUrl(reversePath);
        const reverseRes = await fetchWithTimeout(reverseUrl, {}, 5000);
        reverseJson = await reverseRes.json();
        if (!reverseRes.ok || !reverseJson.ok) {
          throw new Error("reverse_geocode_failed");
        }
      }
    } catch (err) {
      failures.push({ name: item.name, reason: "reverse_geocode_failed" });
      console.log(`[FAIL] ${item.name} -> reverse-geocode failed`);
      continue;
    }

    const country = reverseJson.country;
    const region = reverseJson.region;
    const jurisdictionKey = region ? `${country}-${region}` : country;

    if (country !== item.expectedCountry) {
      failures.push({ name: item.name, reason: "country_mismatch" });
      console.log(`[FAIL] ${item.name} -> country ${country} expected ${item.expectedCountry}`);
      continue;
    }
    if (item.expectedRegion && region !== item.expectedRegion) {
      failures.push({ name: item.name, reason: "region_mismatch" });
      console.log(`[FAIL] ${item.name} -> region ${region} expected ${item.expectedRegion}`);
      continue;
    }

    let checkJson;
    try {
      const params = new URLSearchParams({ country });
      if (region) params.set("region", region);
      const checkPath = `/api/check?${params.toString()}`;
      if (useLocalHandlers && checkHandler) {
        const req = new Request(`http://local${checkPath}`);
        const checkRes = await checkHandler(req);
        checkJson = await checkRes.json();
        if (!checkRes.ok || !checkJson.ok) {
          throw new Error("check_failed");
        }
      } else {
        const checkUrl = buildUrl(checkPath);
        const checkRes = await fetchWithTimeout(checkUrl, {}, 5000);
        checkJson = await checkRes.json();
        if (!checkRes.ok || !checkJson.ok) {
          throw new Error("check_failed");
        }
      }
    } catch {
      failures.push({ name: item.name, reason: "check_failed" });
      console.log(`[FAIL] ${item.name} -> check failed`);
      continue;
    }

    const statusText = formatStatus(checkJson);
    const cacheHit = checkJson?.meta?.cacheHit ?? "n/a";
    const verifiedFresh = checkJson?.meta?.verifiedFresh ?? "n/a";

    passed += 1;
    console.log(
      `[OK] ${item.name} -> ${jurisdictionKey} -> status=${statusText} (cacheHit=${cacheHit} verifiedFresh=${verifiedFresh})`
    );
  }

  console.log(`\nSummary: ${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    for (const fail of failures) {
      console.log(`- ${fail.name}: ${fail.reason}`);
    }
  }

  if (serverProcess) {
    serverProcess.kill("SIGTERM");
  }

  if (failures.length) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
