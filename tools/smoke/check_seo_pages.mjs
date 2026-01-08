import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const START_TOP25 = path.join(ROOT, "packages", "shared", "src", "top25.json");

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    baseUrl: process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000",
    count: 5,
    seed: "1"
  };
  for (const arg of args) {
    if (arg.startsWith("--baseUrl=")) options.baseUrl = arg.split("=")[1];
    if (arg.startsWith("--count=")) options.count = Number(arg.split("=")[1]);
    if (arg.startsWith("--seed=")) options.seed = arg.split("=")[1];
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

function loadStartTop25() {
  if (!fs.existsSync(START_TOP25)) {
    throw new Error(`Missing TOP25 source at ${START_TOP25}`);
  }
  const raw = JSON.parse(fs.readFileSync(START_TOP25, "utf8"));
  return raw;
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

async function fetchText(url) {
  const res = await fetch(url);
  return { status: res.status, text: await res.text() };
}

function lawPathForEntry(entry) {
  const base = path.join(ROOT, "data", "laws");
  if (entry.country === "US" && entry.region) {
    return path.join(base, "us", `${entry.region}.json`);
  }
  const euPath = path.join(base, "eu", `${entry.country}.json`);
  if (fs.existsSync(euPath)) return euPath;
  const worldPath = path.join(base, "world", `${entry.country}.json`);
  return worldPath;
}

function loadSitemapBody() {
  const sitemapPath = path.join(
    ROOT,
    "apps",
    "web",
    ".next",
    "server",
    "app",
    "sitemap.xml.body"
  );
  if (!fs.existsSync(sitemapPath)) return "";
  return fs.readFileSync(sitemapPath, "utf8");
}

async function run() {
  const { baseUrl, count, seed } = parseArgs();
  const localMode = process.env.SMOKE_MODE === "local";
  const entries = loadStartTop25();
  const picks = pickRandom(entries, Math.min(count, entries.length), seed);

  const sitemapBody = localMode
    ? loadSitemapBody()
    : (await fetchText(`${baseUrl}/sitemap.xml`)).text;

  let failed = 0;
  for (const entry of picks) {
    const slug = entry.slug;
    let ok = false;
    let inSitemap = false;

    if (localMode) {
      const lawPath = lawPathForEntry(entry);
      if (fs.existsSync(lawPath)) {
        const profile = JSON.parse(fs.readFileSync(lawPath, "utf8"));
        ok = Boolean(profile?.sources?.length && profile?.updated_at);
      }
      inSitemap = sitemapBody.includes(`/is-cannabis-legal-in-${slug}`);
    } else {
      const pageUrl = `${baseUrl}/is-cannabis-legal-in-${slug}`;
      const res = await fetchText(pageUrl);
      ok =
        res.status === 200 &&
        res.text.includes("<h1") &&
        res.text.includes('data-testid="sources"');
      inSitemap = sitemapBody.includes(`/is-cannabis-legal-in-${slug}`);
    }

    if (ok && inSitemap) {
      console.log(`[OK] ${slug}`);
    } else {
      failed += 1;
      console.log(
        `[FAIL] ${slug} -> sitemap=${inSitemap ? "yes" : "no"}`
      );
    }
  }

  console.log(`Summary: ${picks.length - failed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
