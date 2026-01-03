import fs from "node:fs";
import path from "node:path";
import type { JurisdictionLawProfile } from "@islegal/shared";

export type JurisdictionKey = { country: string; region?: string };

const cache = new Map<string, JurisdictionLawProfile>();

export function normalizeKey(input: JurisdictionKey): string | null {
  const country = (input.country || "").trim().toUpperCase();
  const region = (input.region || "").trim().toUpperCase();

  if (!country) return null;

  if (country === "US") {
    if (!region) return null;
    return `US-${region}`;
  }

  return country;
}

function filePathForKey(key: string): string | null {
  const root = path.resolve(process.cwd(), "..", "..");

  if (key.startsWith("US-")) {
    const region = key.slice(3);
    return path.join(root, "data", "laws", "us", `${region}.json`);
  }

  return path.join(root, "data", "laws", "eu", `${key}.json`);
}

export function getLawProfile(input: JurisdictionKey): JurisdictionLawProfile | null {
  const key = normalizeKey(input);
  if (!key) return null;

  const cached = cache.get(key);
  if (cached) return cached;

  const fp = filePathForKey(key);
  if (!fp) return null;
  if (!fs.existsSync(fp)) return null;

  const raw = fs.readFileSync(fp, "utf-8");
  const parsed = JSON.parse(raw) as JurisdictionLawProfile;

  cache.set(key, parsed);
  return parsed;
}
