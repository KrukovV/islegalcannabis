import fs from "node:fs";
import path from "node:path";

export type CatalogEntry = {
  country: string;
  kind: "iso3166-1";
  target: boolean;
  hasLawProfile: boolean;
  lastVerifiedAt: string | null;
  status: "pending" | "known" | "unknown" | "needs_review";
  notes: string[];
  sources: { title: string; url: string }[];
};

let catalogCache: CatalogEntry[] | null = null;

function catalogPath() {
  const root = path.resolve(process.cwd(), "..", "..");
  return path.join(root, "data", "jurisdictions", "catalog.json");
}

function loadCatalog(): CatalogEntry[] {
  if (catalogCache) return catalogCache;
  const fp = catalogPath();
  if (!fs.existsSync(fp)) {
    catalogCache = [];
    return catalogCache;
  }
  const raw = fs.readFileSync(fp, "utf-8");
  catalogCache = JSON.parse(raw) as CatalogEntry[];
  return catalogCache;
}

export function getCatalogEntry(country: string): CatalogEntry | null {
  const code = country.trim().toUpperCase();
  if (!code) return null;
  const catalog = loadCatalog();
  return catalog.find((entry) => entry.country === code) ?? null;
}
