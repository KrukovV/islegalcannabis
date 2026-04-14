import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const COUNTRY_DIR = path.join(ROOT, "data", "countries");
const OUTPUT_PATH = path.join(ROOT, "data", "wiki", "cache", "seo_i18n_priority.json");
const LOCALES = ["es", "pt", "de", "fr", "nl"];
const PRIORITY_COUNTRY_CODES = new Set(["usa", "nld", "deu", "fra", "esp", "prt", "bra", "tha"]);
const USER_AGENT = "islegalcannabis/seo-i18n-priority";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function extractWikiTitle(url) {
  const raw = String(url || "").trim();
  if (!raw.includes("/wiki/")) return "";
  return decodeURIComponent(raw.split("/wiki/")[1]).replace(/_/g, " ").trim();
}

function buildWikiUrl(locale, title) {
  return `https://${locale}.wikipedia.org/wiki/${encodeURIComponent(String(title || "").trim().replace(/ /g, "_"))}`;
}

function getTargetCodes() {
  return fs
    .readdirSync(COUNTRY_DIR)
    .filter((fileName) => fileName.endsWith(".json"))
    .map((fileName) => fileName.replace(/\.json$/i, ""))
    .filter((code) => code.startsWith("us-") || PRIORITY_COUNTRY_CODES.has(code))
    .sort();
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT
    }
  });
  if (!response.ok) {
    throw new Error(`HTTP_${response.status}:${url}`);
  }
  return response.json();
}

async function fetchLanglinks(englishTitle) {
  const params = new URLSearchParams({
    action: "query",
    prop: "langlinks",
    titles: englishTitle,
    redirects: "1",
    lllimit: "max",
    format: "json",
    origin: "*"
  });
  const payload = await fetchJson(`https://en.wikipedia.org/w/api.php?${params.toString()}`);
  const pages = payload?.query?.pages && typeof payload.query.pages === "object" ? Object.values(payload.query.pages) : [];
  const page = pages[0] || {};
  const langlinks = Array.isArray(page?.langlinks) ? page.langlinks : [];
  return Object.fromEntries(
    langlinks
      .map((item) => [String(item?.lang || "").trim().toLowerCase(), String(item?.["*"] || "").trim()])
      .filter(([lang, title]) => LOCALES.includes(lang) && title)
  );
}

async function fetchSummary(locale, title) {
  const params = new URLSearchParams({
    action: "query",
    prop: "extracts|info",
    inprop: "url",
    redirects: "1",
    explaintext: "true",
    exintro: "1",
    titles: title,
    format: "json",
    origin: "*"
  });
  const payload = await fetchJson(`https://${locale}.wikipedia.org/w/api.php?${params.toString()}`);
  const pages = payload?.query?.pages && typeof payload.query.pages === "object" ? Object.values(payload.query.pages) : [];
  const page = pages[0] || {};
  if (page?.missing !== undefined || !page?.title) return null;
  const summary = String(page?.extract || "").trim();
  if (!summary) return null;
  const resolvedTitle = String(page.title || "").trim();
  return {
    title: resolvedTitle,
    summary,
    url: String(page?.canonicalurl || buildWikiUrl(locale, resolvedTitle)).trim()
  };
}

async function main() {
  const output = {
    generatedAt: new Date().toISOString(),
    locales: LOCALES,
    scope: {
      countries: Array.from(PRIORITY_COUNTRY_CODES).sort(),
      states: "us-*"
    },
    entries: {}
  };

  for (const code of getTargetCodes()) {
    const entry = readJson(path.join(COUNTRY_DIR, `${code}.json`));
    const englishTitle = extractWikiTitle(entry?.sources?.legal);
    if (!englishTitle) continue;
    const langlinks = await fetchLanglinks(englishTitle);
    const translations = {};
    for (const locale of LOCALES) {
      const localizedTitle = langlinks[locale];
      if (!localizedTitle) continue;
      try {
        const summary = await fetchSummary(locale, localizedTitle);
        if (!summary) continue;
        translations[locale] = summary;
      } catch (error) {
        console.warn(`SEO_I18N_FETCH_FAIL code=${code} locale=${locale} title=${localizedTitle} reason=${String(error?.message || error)}`);
      }
    }
    if (Object.keys(translations).length === 0) continue;
    output.entries[code] = {
      source: {
        title: englishTitle,
        url: String(entry?.sources?.legal || "").trim()
      },
      translations
    };
  }

  ensureDir(path.dirname(OUTPUT_PATH));
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`SEO_I18N_PRIORITY_OK entries=${Object.keys(output.entries).length} file=${OUTPUT_PATH}`);
}

await main();
