import fs from "node:fs";
import path from "node:path";
import { TOP25 } from "@islegal/shared";
import { borderNearest, levelFromStatus } from "@islegal/shared";
import type { NearestBorderLevel, NearestBorderResult } from "@islegal/shared";
import { buildTripStatusCode } from "@/lib/tripStatus";
import { getLawProfile } from "@/lib/lawStore";

type Centroid = { lat: number; lon: number; name: string };

let adm0Cache: Record<string, Centroid> | null = null;
let adm1Cache: Record<string, Centroid> | null = null;

function repoRoot() {
  return path.resolve(process.cwd(), "..", "..");
}

function loadAdm0(): Record<string, Centroid> {
  if (adm0Cache) return adm0Cache;
  const file = path.join(repoRoot(), "data", "centroids", "adm0.json");
  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  adm0Cache = (payload?.items ?? {}) as Record<string, Centroid>;
  return adm0Cache ?? {};
}

function loadAdm1(): Record<string, Centroid> {
  if (adm1Cache) return adm1Cache;
  const file = path.join(repoRoot(), "data", "centroids", "us_adm1.json");
  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  adm1Cache = (payload?.items ?? {}) as Record<string, Centroid>;
  return adm1Cache ?? {};
}

function centroidForKey(country: string, region?: string): Centroid | null {
  if (country === "US" && region) {
    return loadAdm1()[`US-${region}`] ?? null;
  }
  return loadAdm0()[country] ?? null;
}

function nameForKey(country: string, region?: string): string {
  if (country === "US" && region) {
    const state = loadAdm1()[`US-${region}`]?.name ?? region;
    return `United States / ${state}`;
  }
  return loadAdm0()[country]?.name ?? country;
}

function levelFromProfile(
  profile: ReturnType<typeof getLawProfile>
): NearestBorderLevel {
  if (!profile) return "red";
  const statusCode = buildTripStatusCode(profile);
  return levelFromStatus(statusCode);
}

export function findNearestBetterBorder(input: {
  country: string;
  region?: string;
}): NearestBorderResult | null {
  const currentProfile = getLawProfile({ country: input.country, region: input.region });
  if (!currentProfile) return null;
  const currentCentroid = centroidForKey(input.country, input.region);
  if (!currentCentroid) return null;

  const currentLevel = levelFromProfile(currentProfile);
  if (currentLevel === "green") return null;

  const candidates = TOP25.map((entry) => {
    const profile = getLawProfile({
      country: entry.country,
      region: entry.region
    });
    const centroid = centroidForKey(entry.country, entry.region);
    if (!profile || !centroid) return null;
    const level = levelFromProfile(profile);
    return {
      id: profile.id,
      name: nameForKey(entry.country, entry.region),
      level,
      lat: centroid.lat,
      lon: centroid.lon,
      sourcesCount: Array.isArray(profile.sources) ? profile.sources.length : 0
    };
  }).filter(Boolean) as Array<{
    id: string;
    name: string;
    level: NearestBorderLevel;
    lat: number;
    lon: number;
    sourcesCount: number;
  }>;

  return borderNearest(
    { level: currentLevel, lat: currentCentroid.lat, lon: currentCentroid.lon },
    candidates
  );
}
