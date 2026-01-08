import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ISO_PATH = path.join(ROOT, "data", "iso3166", "iso3166-1.json");

function parseArgs() {
  const args = process.argv.slice(2);
  const options = { baseUrl: "", seed: 1337, count: 20 };
  for (const arg of args) {
    if (arg.startsWith("--baseUrl=")) options.baseUrl = arg.split("=")[1];
    if (arg.startsWith("--seed=")) options.seed = Number(arg.split("=")[1]);
    if (arg.startsWith("--count=")) options.count = Number(arg.split("=")[1]);
  }
  return options;
}

function seededShuffle(values, seed) {
  const list = [...values];
  let state = seed >>> 0;
  for (let i = list.length - 1; i > 0; i -= 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const j = state % (i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function loadIsoCodes() {
  const raw = JSON.parse(fs.readFileSync(ISO_PATH, "utf8"));
  return (raw.entries ?? []).map((entry) => entry.alpha2);
}

async function fetchJson(url) {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  const { baseUrl, seed, count } = parseArgs();
  const port = process.env.SMOKE_PORT || "3000";
  const base = baseUrl || `http://127.0.0.1:${port}`;

  const isoCodes = loadIsoCodes();
  const sample = seededShuffle(isoCodes, seed).slice(0, count);

  let failed = 0;
  for (const code of sample) {
    const { status, json } = await fetchJson(
      `${base}/api/check?country=${encodeURIComponent(code)}`
    );
    const ok = json?.ok === true;
    const requestId = json?.meta?.requestId;
    if (!ok || typeof requestId !== "string" || status >= 500) {
      console.log(`[FAIL] ${code} -> http=${status}`);
      failed += 1;
    } else {
      console.log(`[OK] ${code} requestId=${String(requestId).slice(0, 8)}`);
    }
  }

  const invalid = await fetchJson(`${base}/api/check?country=ZZ`);
  if (invalid.json?.ok !== false || invalid.json?.error?.code !== "BAD_REQUEST") {
    console.log("[FAIL] ZZ invalid iso did not return BAD_REQUEST");
    failed += 1;
  } else {
    console.log("[OK] ZZ invalid iso");
  }

  if (failed > 0) {
    console.log(`Summary: ${sample.length + 1 - failed} passed, ${failed} failed`);
    process.exit(1);
  }

  console.log(`Summary: ${sample.length + 1} passed, 0 failed`);
}

main().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
