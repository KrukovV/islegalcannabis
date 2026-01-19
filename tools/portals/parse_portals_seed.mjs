import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const INPUT_PATH = path.join(ROOT, "data", "sources", "portals_seed.txt");
const OUTPUT_PATH = path.join(ROOT, "data", "sources", "portals_seed.parsed.json");

function cleanLine(line) {
  return String(line || "").replace(/›/g, "").trim();
}

function normalizeUrl(raw) {
  const trimmed = cleanLine(raw);
  if (!trimmed) return null;
  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }
  candidate = candidate.replace(/^http:\/\//i, "https://");
  try {
    const parsed = new URL(candidate);
    const origin = parsed.origin.toLowerCase();
    let pathname = parsed.pathname || "/";
    if (!pathname.endsWith("/")) pathname += "/";
    return `${origin}${pathname}`;
  } catch {
    return null;
  }
}

function extractDomain(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function extractUrls(text) {
  const matches = text.match(
    /(https?:\/\/[^\s)]+|www\.[^\s)]+|[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s)]*)?)/gi
  );
  return matches ? matches.map((item) => item.replace(/[.,]+$/g, "")) : [];
}

function extractNote(text) {
  if (!text) return "";
  const noteMatch = text.match(/\\(([^)]+)\\)/);
  return noteMatch ? noteMatch[1].trim() : "";
}

if (!fs.existsSync(INPUT_PATH)) {
  console.error(`ERROR: missing seed file ${INPUT_PATH}`);
  process.exit(1);
}

const lines = fs
  .readFileSync(INPUT_PATH, "utf8")
  .split(/\r?\n/)
  .map(cleanLine)
  .filter((line) => line.length > 0);

const entries = [];
let currentRegion = "";
const seen = new Set();

for (const line of lines) {
  if (line.endsWith(":")) {
    currentRegion = line.replace(/:$/, "");
    continue;
  }
  let sep = " — ";
  if (!line.includes(sep)) sep = " – ";
  if (!line.includes(sep)) sep = " - ";
  if (!line.includes(sep)) continue;
  const parts = line.split(sep);
  const countryRaw = cleanLine(parts[0].replace(/^-\\s*/, ""));
  const urlsRaw = cleanLine(parts.slice(1).join(" "));
  const countryNote = extractNote(countryRaw);
  const countryLine = countryRaw.split(/\r?\n/).pop() || "";
  let countryName = cleanLine(countryLine.replace(/\\([^)]*\\)/g, ""));
  countryName = cleanLine(countryName.replace(/^.*?:\s*/s, "").replace(/^-\s*/, ""));
  const urlNote = extractNote(urlsRaw);
  const note = [countryNote, urlNote].filter(Boolean).join("; ");
  const urlCandidates = extractUrls(urlsRaw);
  for (const urlRaw of urlCandidates) {
    const url = normalizeUrl(urlRaw);
    if (!url) continue;
    const domain = extractDomain(url);
    if (!domain) continue;
    const key = `${countryName.toLowerCase()}|${domain}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({
      region: currentRegion,
      country_name: countryName,
      lang: "",
      domain,
      url,
      note,
      url_raw: urlRaw
    });
  }
}

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(entries, null, 2) + "\n");
console.log(`OK parse_portals_seed entries=${entries.length}`);
