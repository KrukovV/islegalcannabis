import fs from "node:fs";
import path from "node:path";

function findRepoRoot(startDir) {
  let current = startDir;
  for (let i = 0; i < 10; i += 1) {
    const candidate = path.join(current, "data", "iso3166", "iso3166-1.json");
    if (fs.existsSync(candidate)) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return startDir;
}

function loadIsoMap() {
  const root = findRepoRoot(process.cwd());
  const isoPath = path.join(root, "data", "iso3166", "iso3166-1.json");
  const payload = JSON.parse(fs.readFileSync(isoPath, "utf8"));
  const entries = Array.isArray(payload?.entries) ? payload.entries : [];
  const map = new Map();
  entries.forEach((entry) => {
    const alpha2 = String(entry?.alpha2 ?? entry?.id ?? "").toUpperCase();
    const name = entry?.name;
    if (alpha2 && name) {
      map.set(alpha2, { alpha2, name: String(name) });
    }
  });
  return map;
}

function flagForAlpha2(alpha2) {
  if (alpha2.length !== 2) return "🏳️";
  return String.fromCodePoint(
    ...alpha2.split("").map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65)
  );
}

const isoMap = loadIsoMap();

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
const expected = Number(process.env.CHECKED_EXPECTED || 0);
if (expected > 0 && payload.length < expected) {
  console.error("ERROR: checked payload incomplete");
  process.exit(1);
}

const allowedMethods = new Set(["gps", "ip", "manual", "test"]);
const failedCount = payload.filter(
  (entry) => entry?.status === "error" || entry?.status === "failed"
).length;
const okCount = payload.length - failedCount;
process.stdout.write(
  `Checked: sampled=${payload.length} expected=${expected} failed=${failedCount}\n`
);
process.stdout.write(`✅ OK=${okCount} ❌ FAIL=${failedCount}\n`);
process.stdout.write("Checked locations (top10):\n");

const items = payload.slice(0, 10);
items.forEach((entry) => {
  const id = entry?.id ?? "UNKNOWN";
  const [countryCode, regionCode] = String(id).split("-");
  const countryMeta = isoMap.get(String(countryCode ?? "").toUpperCase());
  const flag = countryMeta?.alpha2
    ? flagForAlpha2(countryMeta.alpha2)
    : "🏳️";
  const name = countryMeta
    ? regionCode
      ? `${countryMeta.name} / ${regionCode}`
      : countryMeta.name
    : entry?.name ?? "Unknown";
  const status = entry?.status ?? "checked";
  const method = typeof entry?.method === "string" ? entry.method.trim() : "";
  if (!allowedMethods.has(method)) {
    console.error(`ERROR: invalid method for ${id}`);
    process.exit(1);
  }
  process.stdout.write(`${flag} ${id} ${name} — ${status} (${method})\n`);
});

const failedItems = payload.filter(
  (entry) => entry?.status === "error" || entry?.status === "failed"
);
process.stdout.write("Failed examples (top5):\n");
if (failedItems.length === 0) {
  process.stdout.write("none\n");
} else {
  failedItems.slice(0, 5).forEach((entry) => {
    const flag = entry?.flag ?? "🏳️";
    const id = entry?.id ?? "UNKNOWN";
    const status = entry?.status ?? "unknown";
    const reason =
      entry?.reasonCode ?? entry?.reason ?? entry?.errorCode ?? "unknown_reason";
    process.stdout.write(`${flag} ${id} — reason=${reason} status=${status}\n`);
  });
}
