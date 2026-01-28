import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.PROJECT_ROOT || process.cwd();
const SSOT_PATH = process.env.SSOT_PATH || path.join(ROOT, "Reports", "ci-final.txt");

if (!fs.existsSync(SSOT_PATH)) {
  process.exit(0);
}

const lines = fs.readFileSync(SSOT_PATH, "utf8").split("\n").filter((line) => line.length);
const lastIndexByKey = new Map();
const geoLocReplacement = new Map();
const keepUiCountry = process.env.SSOT_KEEP_UI_COUNTRY === "1";

const keyPrefixes = [
  "CI_RESULT ",
  "CI_STATUS=",
  "CI_QUALITY=",
  "PIPELINE_RC=",
  "FAIL_REASON=",
  "NET_MODE=",
  "EGRESS_TRUTH ",
  "WIKI_GATE_OK=",
  "NOTES_LIMITS ",
  "NOTES_STRICT_RESULT ",
  "NOTES5_STRICT_RESULT ",
  "NOTESALL_STRICT_RESULT ",
  "NOTES_WEAK_POLICY ",
  "NOTES_TOTAL ",
  "NOTES_PLACEHOLDER ",
  "WIKI_SYNC_ALL ",
  "OFFICIAL_BADGE_TOTALS ",
  "OFFICIAL_DOMAINS_TOTAL ",
  "OFFICIAL_SUMMARY ",
  "OFFICIAL_ALLOWLIST_SIZE ",
  "OFFICIAL_ALLOWLIST_GUARD_",
  "OFFICIAL_DIFF_TOP_MISSING ",
  "OFFICIAL_DIFF_TOP_MATCHED ",
  "OFFICIAL_DIFF_BY_GEO ",
  "OFFICIAL_GEO_TOP_MISSING ",
  "OFFICIAL_GEO_COVERAGE ",
  "OFFICIAL_COVERAGE ",
  "MAP_READY=",
  "GEO_LOC_LAST ",
  "UI_SMOKE_OK="
];

const getKey = (line) => {
  if (line.startsWith("UI_COUNTRY_OK ")) {
    if (!keepUiCountry) return "DROP_UI_COUNTRY";
    const match = line.match(/\bgeo=([A-Z-]+)/);
    if (match) return `UI_COUNTRY_OK geo=${match[1]}`;
  }
  if (line.startsWith("GEO_LOC_LAST ")) {
    return "GEO_LOC_LAST";
  }
  if (line.startsWith("GEO_LOC ")) {
    return "GEO_LOC_LAST";
  }
  for (const prefix of keyPrefixes) {
    if (line.startsWith(prefix)) return prefix;
  }
  return "";
};

lines.forEach((line, index) => {
  const key = getKey(line);
  if (!key) return;
  lastIndexByKey.set(key, index);
  if (key === "GEO_LOC_LAST" && line.startsWith("GEO_LOC ")) {
    geoLocReplacement.set(index, line.replace(/^GEO_LOC /, "GEO_LOC_LAST "));
  }
});

const filtered = [];
lines.forEach((line, index) => {
  const key = getKey(line);
  if (!key) {
    filtered.push(line);
    return;
  }
  if (key === "DROP_UI_COUNTRY") return;
  const lastIndex = lastIndexByKey.get(key);
  if (index !== lastIndex) return;
  if (key === "GEO_LOC_LAST" && geoLocReplacement.has(index)) {
    filtered.push(geoLocReplacement.get(index));
    return;
  }
  filtered.push(line);
});

const updated = `${filtered.join("\n")}\n`;
if (updated !== fs.readFileSync(SSOT_PATH, "utf8")) {
  fs.writeFileSync(SSOT_PATH, updated);
}
