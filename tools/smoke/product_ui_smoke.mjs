import path from "node:path";
import { createRequire } from "node:module";

const ROOT = process.cwd();
const baseUrl = process.env.BASE_URL || "http://127.0.0.1:3000";

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
  return (
    checkModule.routeModule?.userland?.GET ??
    checkModule.GET ??
    checkModule.default?.GET ??
    null
  );
}

async function fetchJson(url, handler) {
  if (handler) {
    const res = await handler(new Request(url));
    return { status: res.status, json: await res.json() };
  }
  const res = await fetch(url);
  return { status: res.status, json: await res.json() };
}

async function run() {
  const useLocal = process.env.SMOKE_MODE === "local";
  const handler = useLocal ? await loadLocalHandler() : null;
  if (useLocal && !handler) {
    throw new Error("Local handler not available; run a build first.");
  }

  const cases = [
    { label: "DE", url: `${baseUrl}/api/check?country=DE`, id: "DE" },
    {
      label: "US-CA",
      url: `${baseUrl}/api/check?country=US&region=CA`,
      id: "US-CA"
    }
  ];

  for (const item of cases) {
    const { status, json } = await fetchJson(item.url, handler);
    if (status !== 200 || !json?.ok || json?.profile?.id !== item.id) {
      throw new Error(`FAIL ${item.label}`);
    }
    console.log(`OK ${item.label}`);
  }
}

run().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
