export const STORE_VISIBILITY_LEVELS = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  LOCAL: "LOCAL",
} as const;

export type StoreVisibilityLevel = (typeof STORE_VISIBILITY_LEVELS)[keyof typeof STORE_VISIBILITY_LEVELS];

// These are provisional product thresholds. They remain acceptance-pending
// until a populated, validated store projection has passed visual map review.
export const STORE_ZOOM_POLICY = {
  mediumMinZoom: 5.8,
  localMinZoom: 10.2,
} as const;

export const STORE_TYPES = [
  "ADULT_USE_RETAIL",
  "MEDICAL_DISPENSARY",
  "CANNABIS_PHARMACY",
  "AUTHORIZED_PHARMACY",
  "PATIENT_ACCESS_CENTER",
  "CANNABIS_CLUB",
  "OTHER_REGULATED_POINT",
] as const;

export type StoreType = (typeof STORE_TYPES)[number];

export function getStoreVisibilityLevel(zoom: number): StoreVisibilityLevel {
  if (!Number.isFinite(zoom) || zoom < STORE_ZOOM_POLICY.mediumMinZoom) return "LOW";
  if (zoom < STORE_ZOOM_POLICY.localMinZoom) return "MEDIUM";
  return "LOCAL";
}
