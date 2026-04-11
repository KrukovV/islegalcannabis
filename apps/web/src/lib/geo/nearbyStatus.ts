import type { JurisdictionLawProfile, ResultStatusLevel } from "@islegal/shared";
import { computeStatus, haversineKm } from "@islegal/shared";
import {
  getNearbyDisplayStatus,
  getSocialReality,
  includeBySocialReality,
  socialRealityEntries,
  type SocialRealityEntity
} from "@/data/socialRealityIndex";

type NearbyDisplayStatus = ResultStatusLevel | "orange" | "blue";

type NearbyEntry = {
  id: string;
  name?: string;
  status: NearbyDisplayStatus;
  summary: string;
  distanceKm: number;
  score: number;
};

type NearbyResult = {
  current: { id: string; status: ResultStatusLevel; summary: string };
  nearby: Array<{ id: string; status: NearbyDisplayStatus; summary: string; name?: string }>;
};

function buildSummary(profile: JurisdictionLawProfile) {
  const status = computeStatus(profile);
  return { status: status.level, summary: status.label };
}

function baseStatusAllowed(status: string) {
  return status === "green" || status === "yellow" || status === "blue";
}

function entryScore(distanceKm: number, status: NearbyDisplayStatus, confidenceScore: number) {
  const statusBonus =
    status === "green" ? 180 :
    status === "yellow" ? 120 :
    status === "blue" ? 100 :
    status === "orange" ? 70 :
    0;
  return distanceKm - statusBonus - confidenceScore * 100;
}

function buildEntrySummary(entity: SocialRealityEntity, displayStatus: NearbyDisplayStatus) {
  if (displayStatus === "orange" && entity.note_summary) {
    return entity.note_summary;
  }
  if (displayStatus === "yellow" && entity.note_summary) {
    return entity.note_summary;
  }
  if (displayStatus === "green") {
    return entity.note_summary || "Cannabis is legally available here.";
  }
  return entity.note_summary || "Illegal or highly restricted.";
}

function buildNearby(
  currentKey: string,
  currentPoint: { lat: number; lon: number },
  candidates: SocialRealityEntity[]
): NearbyEntry[] {
  const items: NearbyEntry[] = [];
  for (const candidate of candidates) {
    const id = candidate.id.toUpperCase();
    if (id === currentKey) continue;
    if (!candidate.coordinates) continue;

    const socialReality = getSocialReality(id);
    const socialIncluded = includeBySocialReality(id);
    const displayStatus = getNearbyDisplayStatus(candidate.base_status, id);
    if (!baseStatusAllowed(candidate.base_status) && !socialIncluded) {
      continue;
    }

    const distanceKm = haversineKm(currentPoint, {
      lat: candidate.coordinates.lat,
      lon: candidate.coordinates.lng
    });

    items.push({
      id,
      name: candidate.display_name,
      status: displayStatus,
      summary: buildEntrySummary(candidate, displayStatus),
      distanceKm,
      score: entryScore(distanceKm, displayStatus, socialReality?.confidence_score || 0)
    });
  }

  return items.sort((a, b) => a.score - b.score || a.distanceKm - b.distanceKm);
}

function resolveCurrentCoordinates(profile: JurisdictionLawProfile) {
  const current = getSocialReality(profile.id.toUpperCase());
  if (!current?.coordinates) return null;
  return { lat: current.coordinates.lat, lon: current.coordinates.lng };
}

function listCandidates(profile: JurisdictionLawProfile) {
  if (profile.country === "US" && profile.region) {
    return socialRealityEntries.filter((entry) => entry.country === "US" && entry.region);
  }
  return socialRealityEntries.filter((entry) => entry.entity_type === "country");
}

export function findNearbyStatus(profile: JurisdictionLawProfile): NearbyResult | null {
  const currentId = profile.id.toUpperCase();
  const currentSummary = buildSummary(profile);
  const current = {
    id: currentId,
    status: currentSummary.status,
    summary: currentSummary.summary
  };

  const currentPoint = resolveCurrentCoordinates(profile);
  if (!currentPoint) {
    return { current, nearby: [] };
  }

  const nearby = buildNearby(currentId, currentPoint, listCandidates(profile))
    .slice(0, 5)
    .map(({ id, status, summary, name }) => ({ id, status, summary, name }));

  return { current, nearby };
}
