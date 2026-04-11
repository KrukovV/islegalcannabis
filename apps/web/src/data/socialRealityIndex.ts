import socialRealityGlobal from "../../../../data/generated/socialReality.global.json";
import { deriveNearbyDisplayStatus } from "./socialRealityExtractor";

export type SocialRealityEntity = (typeof socialRealityGlobal.entries)[number];

const entities = socialRealityGlobal.entries as SocialRealityEntity[];

export const socialRealityEntries = entities;

export const socialRealityIndex: Record<string, SocialRealityEntity> = Object.fromEntries(
  entities.map((entry) => [entry.id, entry])
);

export function getSocialReality(id: string | null | undefined): SocialRealityEntity | null {
  if (!id) return null;
  return socialRealityIndex[String(id).toUpperCase()] || null;
}

export function includeBySocialReality(id: string | null | undefined) {
  const entity = getSocialReality(id);
  if (!entity) return false;
  return entity.confidence_score > 0.55;
}

export function getNearbyDisplayStatus(baseStatus: string, id: string | null | undefined) {
  const entity = getSocialReality(id);
  return deriveNearbyDisplayStatus(baseStatus, entity);
}

