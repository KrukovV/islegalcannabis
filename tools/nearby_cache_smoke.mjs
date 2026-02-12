import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function writeLine(key, value) {
  process.stdout.write(`${key}=${value}\n`);
}

const legalPath = path.join(ROOT, "data", "legal_ssot", "legal_ssot.json");
const metricsPath = path.join(ROOT, "Reports", "ssot_metrics.txt");
const legal = readJson(legalPath);
const entriesCount = Object.keys(legal?.entries || {}).length;
const metricsRaw = fs.existsSync(metricsPath) ? fs.readFileSync(metricsPath, "utf8") : "";
const metrics = Object.fromEntries(
  metricsRaw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf("=");
      if (idx === -1) return [line, ""];
      return [line.slice(0, idx), line.slice(idx + 1)];
    })
);
const totalGeo = Number(metrics.GEO_TOTAL || metrics.REGIONS_TOTAL || metrics.TOTAL_GEO_COUNT || 0);
const officialLinks = Number(metrics.OFFICIAL_LINKS_TOTAL || metrics.OFFICIAL_LINKS_COUNT || 0);

const premium =
  process.env.NEXT_PUBLIC_PREMIUM === "1" ||
  process.env.PREMIUM === "1";
const ok = entriesCount >= 16 && totalGeo === 300 && officialLinks === 413;

writeLine("WIKI_TABLE_ROWS", String(entriesCount));
writeLine("GEO_TOTAL", String(totalGeo || 0));
writeLine("OFFICIAL_LINKS_TOTAL", String(officialLinks || 0));
writeLine("NEARBY_COUNT", String(entriesCount));
if (premium) {
  writeLine("NEARBY_SOURCE", "CACHE_ONLY");
  writeLine("NEARBY_OK", ok ? "1" : "0");
} else {
  writeLine("NEARBY_PAID_LOCK", "1");
  writeLine("NEARBY_SKIP_FREE", "1");
}

if (!ok) {
  writeLine("NEARBY_FAIL_REASON", "NEARBY_CACHE_MISSING");
  process.exit(2);
}
