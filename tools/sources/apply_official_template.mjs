import fs from "node:fs";
import path from "node:path";

const registryPath = path.join(
  process.cwd(),
  "data",
  "sources",
  "official_registry.json"
);

if (!fs.existsSync(registryPath)) {
  console.error("ERROR: missing data/sources/official_registry.json");
  process.exit(1);
}

const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));

const roots = [
  path.join(process.cwd(), "data", "laws", "us"),
  path.join(process.cwd(), "data", "laws", "eu"),
  path.join(process.cwd(), "data", "laws", "world")
];

function normalizeDomain(domain) {
  if (typeof domain !== "string") return null;
  const trimmed = domain.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

let updated = 0;

for (const root of roots) {
  if (!fs.existsSync(root)) continue;
  const files = fs.readdirSync(root).filter((file) => file.endsWith(".json"));
  for (const file of files) {
    const filePath = path.join(root, file);
    const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const sources = Array.isArray(payload?.sources) ? payload.sources : [];
    if (sources.length > 0) continue;
    const id = typeof payload?.id === "string" ? payload.id : "";
    const country =
      typeof payload?.country === "string"
        ? payload.country
        : id.includes("-")
          ? id.split("-")[0]
          : id;
    const domains = registry?.[String(country).toUpperCase()];
    if (!Array.isArray(domains) || domains.length === 0) continue;
    const url = normalizeDomain(domains[0]);
    if (!url) continue;
    payload.sources = [{ title: "Official source", url }];
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + "\n");
    updated += 1;
  }
}

console.log(`OK applied official sources to ${updated} files`);
