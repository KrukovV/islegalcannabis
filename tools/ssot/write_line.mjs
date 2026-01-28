import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SSOT_PATH = path.join(ROOT, "Reports", "ci-final.txt");
const GEO_HISTORY_PATH =
  process.env.GEO_LOC_HISTORY_PATH || path.join(ROOT, "Reports", "geo_loc_history.txt");

export function writeSsotLine(line, { runId = "", dedupePrefix = "" } = {}) {
  fs.mkdirSync(path.dirname(SSOT_PATH), { recursive: true });
  const existing = fs.existsSync(SSOT_PATH) ? fs.readFileSync(SSOT_PATH, "utf8") : "";
  const lines = existing.split("\n").filter((entry) => entry.length);
  let filtered = lines;
  if (dedupePrefix) {
    if (process.env.SSOT_LAST_ONLY === "1" && line.startsWith(dedupePrefix)) {
      const isGeoLoc = dedupePrefix === "GEO_LOC ";
      const lastOnlyLine = isGeoLoc ? line.replace(/^GEO_LOC /, "GEO_LOC_LAST ") : line;
      fs.mkdirSync(path.dirname(GEO_HISTORY_PATH), { recursive: true });
      fs.appendFileSync(GEO_HISTORY_PATH, `${line}\n`);
      filtered = lines.filter((entry) => {
        if (entry.startsWith(dedupePrefix)) return false;
        if (isGeoLoc && entry.startsWith("GEO_LOC_LAST ")) return false;
        return true;
      });
      if (!filtered.includes(lastOnlyLine)) {
        filtered.push(lastOnlyLine);
      }
      fs.writeFileSync(SSOT_PATH, `${filtered.join("\n")}\n`);
      return true;
    }
    const lastByRun = new Map();
    for (const entry of lines) {
      if (!entry.startsWith(dedupePrefix)) continue;
      const match = entry.match(/\brun=([^\s]+)/);
      if (match) {
        lastByRun.set(match[1], entry);
      }
    }
    filtered = filtered.filter((entry) => {
      if (!entry.startsWith(dedupePrefix)) return true;
      const match = entry.match(/\brun=([^\s]+)/);
      if (!match) return true;
      return lastByRun.get(match[1]) === entry;
    });
    if (runId) {
      filtered = filtered.filter((entry) => {
        if (!entry.startsWith(dedupePrefix)) return true;
        return !entry.includes(`run=${runId}`);
      });
    }
  }
  if (filtered.includes(line)) return false;
  filtered.push(line);
  fs.writeFileSync(SSOT_PATH, `${filtered.join("\n")}\n`);
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const line = process.argv.slice(2).join(" ");
  if (!line) {
    console.error("USAGE: write_line.mjs <line>");
    process.exit(1);
  }
  writeSsotLine(line);
  console.log(line);
}
