import fs from "node:fs";
import path from "node:path";
import {
  computeStatus,
  nearestLegalCountry,
  nearestLegalState
} from "@islegal/shared";
import type {
  GeoPoint,
  NearestCandidate,
  ResultViewModel,
  JurisdictionLawProfile
} from "@islegal/shared";
import { titleForJurisdiction } from "@/lib/jurisdictionTitle";
import countryCentroids from "../../../../../data/geo/country_centroids.json";
import usStateCentroids from "../../../../../data/geo/us_state_centroids.json";

type Centroid = { lat: number; lon: number; name: string };
type CentroidMap = Record<string, Centroid>;

const profileCache: { profiles: JurisdictionLawProfile[] | null } = {
  profiles: null
};

function loadProfiles(): JurisdictionLawProfile[] {
  if (profileCache.profiles) return profileCache.profiles;
  const root = path.resolve(process.cwd(), "..", "..");
  const euDir = path.join(root, "data", "laws", "eu");
  const usDir = path.join(root, "data", "laws", "us");
  const files: string[] = [];

  if (fs.existsSync(euDir)) {
    for (const name of fs.readdirSync(euDir)) {
      if (name.endsWith(".json")) files.push(path.join(euDir, name));
    }
  }

  if (fs.existsSync(usDir)) {
    for (const name of fs.readdirSync(usDir)) {
      if (name.endsWith(".json")) files.push(path.join(usDir, name));
    }
  }

  const profiles = files.map((fp) => {
    const raw = fs.readFileSync(fp, "utf-8");
    return JSON.parse(raw) as JurisdictionLawProfile;
  });

  profileCache.profiles = profiles;
  return profiles;
}

function buildCandidates(
  profiles: JurisdictionLawProfile[],
  centroids: CentroidMap,
  filter: (_profile: JurisdictionLawProfile) => boolean
): NearestCandidate[] {
  const items: NearestCandidate[] = [];
  for (const entry of profiles) {
    if (!filter(entry)) continue;
    const centroid = centroids[entry.id];
    if (!centroid) continue;
    const statusLevel = computeStatus(entry).level;
    items.push({
      jurisdictionKey: entry.id,
      statusLevel,
      point: { lat: centroid.lat, lon: centroid.lon }
    });
  }
  return items;
}

export function findNearestLegalForProfile(
  profile: JurisdictionLawProfile,
  fromPoint: GeoPoint
): ResultViewModel["nearestLegal"] | null {
  if (profile.status !== "known") return null;

  const profiles = loadProfiles();
  const countryItems = (countryCentroids as { items: CentroidMap }).items;
  const stateItems = (usStateCentroids as { items: CentroidMap }).items;
  if (profile.country === "US" && profile.region) {
    const candidates = buildCandidates(
      profiles,
      stateItems,
      (entry) => entry.country === "US" && Boolean(entry.region)
    );
    const nearest = nearestLegalState(fromPoint, candidates);
    if (!nearest) return null;
    const centroid = stateItems[nearest.jurisdictionKey];
    const title = centroid?.name
      ? `${centroid.name}, US`
      : titleForJurisdiction({
          country: "US",
          region: nearest.jurisdictionKey.slice(3)
        });
    return {
      title,
      jurisdictionKey: nearest.jurisdictionKey,
      distanceKm: nearest.distanceKm,
      approx: true
    };
  }

  const candidates = buildCandidates(
    profiles,
    countryItems,
    (entry) => !entry.region
  );
  const nearest = nearestLegalCountry(fromPoint, candidates);
  if (!nearest) return null;
  const centroid = countryItems[nearest.jurisdictionKey];
  const title =
    centroid?.name ??
    titleForJurisdiction({
      country: nearest.jurisdictionKey
    });
  return {
    title,
    jurisdictionKey: nearest.jurisdictionKey,
    distanceKm: nearest.distanceKm,
    approx: true
  };
}
