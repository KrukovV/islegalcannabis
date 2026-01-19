import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const REPORT_PATH = path.join(ROOT, "Reports", "auto_learn", "last_run.json");

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function renderLine() {
  const payload = readJson(REPORT_PATH, null);
  if (!payload || typeof payload !== "object") {
    return "LEARNED_SOURCES(top5): n/a";
  }
  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  if (entries.length === 0) {
    return "LEARNED_SOURCES(top5): n/a";
  }
  const items = [];
  for (const entry of entries) {
    const iso2 = String(entry?.iso2 || "").toUpperCase();
    const finalUrl = String(entry?.law_page_url || entry?.final_url || "");
    let host = String(entry?.host || "");
    if (!host && finalUrl) {
      try {
        host = new URL(finalUrl).hostname;
      } catch {
        host = "";
      }
    }
    const snap = entry?.law_page_snapshot_path || entry?.snapshot_path ? "Y" : "N";
    if (iso2) {
      items.push(`${iso2} host=${host || "-"} snap=${snap}`);
    }
  }
  const out = items.slice(0, 5).join(" | ") || "n/a";
  return `LEARNED_SOURCES(top5): ${out}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(renderLine());
}
