import fs from "node:fs";
import path from "node:path";

function readPayload() {
  const file = path.join(process.cwd(), "Reports", "checked", "last_checked.json");
  if (!fs.existsSync(file)) {
    console.error("ERROR: missing Reports/checked/last_checked.json");
    process.exit(1);
  }
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    console.error("ERROR: invalid Reports/checked/last_checked.json");
    process.exit(1);
  }
  if (!Array.isArray(payload)) {
    console.error("ERROR: checked payload must be an array");
    process.exit(1);
  }
  return payload;
}

function formatEntry(entry, { includeName }) {
  const flag = entry?.flag ?? "";
  const id = entry?.id ?? "UNKNOWN";
  const name = includeName ? entry?.name ?? "" : "";
  return [flag, id, name].filter(Boolean).join(" ").trim();
}

function sampleList(payload, count, includeName, maxLength = 180, prefix = "") {
  const entries = payload.slice(0, count).map((entry) =>
    formatEntry(entry, { includeName })
  );
  const sample = entries.length ? entries.join(", ") : "n/a";
  let line = `${prefix}${sample}`;
  if (line.length > maxLength) {
    line = line.slice(0, maxLength - 3).trimEnd() + "...";
  }
  return line;
}

const payload = readPayload();
const failedCount = payload.filter(
  (entry) => entry?.status === "error" || entry?.status === "failed"
).length;
const verifiedSourcesCount = payload.filter((entry) => {
  if (typeof entry?.verified_sources_present === "boolean") {
    return entry.verified_sources_present;
  }
  const count = Number(entry?.verified_sources_count ?? 0);
  return Number.isFinite(count) && count > 0;
}).length;

const lines = [
  `checked_count=${payload.length}`,
  `failed_count=${failedCount}`,
  `verified_sources_count=${verifiedSourcesCount}`,
  `verified_sources_present=${verifiedSourcesCount > 0 ? "true" : "false"}`,
  `checked_top5=${sampleList(payload, 5, true, 200)}`,
  `trace_top10=${sampleList(payload, 10, false, 200)}`,
  `checked_top10=${sampleList(payload, 10, true, 220)}`
];

process.stdout.write(lines.join("\n"));
