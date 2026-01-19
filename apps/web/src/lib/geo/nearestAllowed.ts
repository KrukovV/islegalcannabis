import fs from "node:fs";
import path from "node:path";
import { computeStatus, haversineKm } from "@islegal/shared";
import type {
  JurisdictionLawProfile,
  ResultStatusLevel
} from "@islegal/shared";
import countryCentroids from "../../../../../data/geo/country_centroids.json";
import usStateCentroids from "../../../../../data/geo/us_state_centroids.json";

type Centroid = { lat: number; lon: number; name: string };
type CentroidMap = Record<string, Centroid>;

type NearestItem = {
  id: string;
  status: ResultStatusLevel;
  summary: string;
  distanceKm: number;
};

type NearestResult = {
  current: { id: string; status: ResultStatusLevel; summary: string };
  nearest: Array<{ id: string; status: ResultStatusLevel; summary: string }>;
};

function readProfiles(dir: string): JurisdictionLawProfile[] {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((name) => name.endsWith(".json"));
  return files.map((name) => {
    const raw = fs.readFileSync(path.join(dir, name), "utf8");
    return JSON.parse(raw) as JurisdictionLawProfile;
  });
}

function listCountryProfiles(root: string) {
  const worldDir = path.join(root, "data", "laws", "world");
  const euDir = path.join(root, "data", "laws", "eu");
  const seen = new Set<string>();
  const profiles: JurisdictionLawProfile[] = [];
  for (const profile of readProfiles(worldDir)) {
    const id = profile.id.toUpperCase();
    if (profile.region) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    profiles.push(profile);
  }
  for (const profile of readProfiles(euDir)) {
    const id = profile.id.toUpperCase();
    if (profile.region) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    profiles.push(profile);
  }
  return profiles;
}

function listStateProfiles(root: string) {
  const usDir = path.join(root, "data", "laws", "us");
  return readProfiles(usDir).filter((profile) => profile.country === "US");
}

function centroidFor(key: string, map: CentroidMap): Centroid | null {
  const item = map[key];
  if (!item) return null;
  return item;
}

function isAllowed(profile: JurisdictionLawProfile) {
  return (
    profile.recreational === "allowed" || profile.medical === "allowed"
  );
}

function buildSummary(profile: JurisdictionLawProfile) {
  const status = computeStatus(profile);
  return { status: status.level, summary: status.label };
}

function buildNearest(
  currentKey: string,
  currentPoint: { lat: number; lon: number },
  candidates: JurisdictionLawProfile[],
  centroidMap: CentroidMap
): NearestItem[] {
  const items: NearestItem[] = [];
  for (const profile of candidates) {
    const id = profile.id.toUpperCase();
    if (id === currentKey) continue;
    if (!isAllowed(profile)) continue;
    const centroid = centroidFor(id, centroidMap);
    if (!centroid) continue;
    const { status, summary } = buildSummary(profile);
    const distanceKm = haversineKm(currentPoint, {
      lat: centroid.lat,
      lon: centroid.lon
    });
    items.push({ id, status, summary, distanceKm });
  }
  return items.sort((a, b) => a.distanceKm - b.distanceKm);
}

export function findNearestAllowed(
  profile: JurisdictionLawProfile
): NearestResult {
  const root = path.resolve(process.cwd(), "..", "..");
  const currentId = profile.id.toUpperCase();
  const currentSummary = buildSummary(profile);
  const current = {
    id: currentId,
    status: currentSummary.status,
    summary: currentSummary.summary
  };

  if (isAllowed(profile)) {
    return { current, nearest: [] };
  }

  if (profile.country === "US" && profile.region) {
    const items = (usStateCentroids as { items: CentroidMap }).items;
    const centroid = centroidFor(currentId, items);
    if (!centroid) return { current, nearest: [] };
    const candidates = listStateProfiles(root);
    const nearest = buildNearest(
      currentId,
      { lat: centroid.lat, lon: centroid.lon },
      candidates,
      items
    )
      .slice(0, 3)
      .map(({ id, status, summary }) => ({ id, status, summary }));
    return { current, nearest };
  }

  const items = (countryCentroids as { items: CentroidMap }).items;
  const centroid = centroidFor(currentId, items);
  if (!centroid) return { current, nearest: [] };
  const candidates = listCountryProfiles(root);
  const nearest = buildNearest(
    currentId,
    { lat: centroid.lat, lon: centroid.lon },
    candidates,
    items
  )
    .slice(0, 3)
    .map(({ id, status, summary }) => ({ id, status, summary }));

  return { current, nearest };
}
