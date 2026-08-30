import { cellToParent, getResolution, latLngToCell } from "h3-js";
import type { SocialGeoAttachment } from "./domain";

export const SOCIAL_QUERY_BUCKET_RESOLUTION = 4;
export const SOCIAL_MIN_PUBLIC_RESOLUTION = 4;
export const SOCIAL_MAX_PUBLIC_RESOLUTION = 6;
/**
 * Until an authenticated aggregate-crowd provider exists, the API accepts
 * only the coarsest public cell. The domain supports finer cells, but a
 * client-provided crowd claim must never relax server-side privacy policy.
 */
export const SOCIAL_NETWORK_MAX_PUBLIC_RESOLUTION = SOCIAL_QUERY_BUCKET_RESOLUTION;
export const SOCIAL_MIN_TRUSTED_ACTIVE_PARTICIPANTS = 8;

export type GeoPrivacyContext = {
  requestedMapZoom: number;
  populationDensityPerKm2?: number | null;
  activeParticipantCount?: number | null;
};

export type BrowserGeoPoint = {
  latitude: number;
  longitude: number;
};

const FORBIDDEN_SOCIAL_FIELDS = new Set([
  "latitude",
  "longitude",
  "lat",
  "lng",
  "lon",
  "accuracy",
  "accuracym",
  "altitude",
  "heading",
  "bearing",
  "speed",
  "gps",
  "coordinate",
  "coordinates",
  "position",
  "currentlocation",
  "exactlocation",
  "exactdistance",
  "distance",
  "direction",
  "locationhistory",
  "previouscells",
  "userlocation",
  "authorlocation",
  "geohash",
]);

function hasTrustedPopulationSignal(context: GeoPrivacyContext) {
  return Number.isFinite(context.populationDensityPerKm2) && Number(context.populationDensityPerKm2) >= 200;
}

function hasTrustedCrowdSignal(context: GeoPrivacyContext) {
  return Number.isInteger(context.activeParticipantCount) && Number(context.activeParticipantCount) >= SOCIAL_MIN_TRUSTED_ACTIVE_PARTICIPANTS;
}

/**
 * Zoom is deliberately ignored. It belongs to presentation, not privacy.
 * Without both independent density and aggregate crowd signals the only safe
 * output is the sparse-area fallback bucket.
 */
export function chooseSocialGeoResolution(context: GeoPrivacyContext) {
  if (!hasTrustedPopulationSignal(context) || !hasTrustedCrowdSignal(context)) {
    return SOCIAL_MIN_PUBLIC_RESOLUTION;
  }
  return Number(context.populationDensityPerKm2) >= 1_500
    ? SOCIAL_MAX_PUBLIC_RESOLUTION
    : SOCIAL_MIN_PUBLIC_RESOLUTION + 1;
}

export function toSocialGeoAttachment(point: BrowserGeoPoint, context: GeoPrivacyContext): SocialGeoAttachment {
  if (!Number.isFinite(point.latitude) || point.latitude < -90 || point.latitude > 90) {
    throw new Error("SOCIAL_GEO_LATITUDE_INVALID");
  }
  if (!Number.isFinite(point.longitude) || point.longitude < -180 || point.longitude > 180) {
    throw new Error("SOCIAL_GEO_LONGITUDE_INVALID");
  }
  const geoResolution = chooseSocialGeoResolution(context);
  const geoCell = latLngToCell(point.latitude, point.longitude, geoResolution);
  return {
    geoCell,
    geoResolution,
    geoQueryCell: cellToParent(geoCell, SOCIAL_QUERY_BUCKET_RESOLUTION),
  };
}

export function assertValidSocialGeoAttachment(geo: Pick<SocialGeoAttachment, "geoCell" | "geoResolution">): SocialGeoAttachment {
  if (!geo.geoCell || !Number.isInteger(geo.geoResolution)) throw new Error("SOCIAL_GEO_ATTACHMENT_INVALID");
  if (geo.geoResolution < SOCIAL_MIN_PUBLIC_RESOLUTION || geo.geoResolution > SOCIAL_MAX_PUBLIC_RESOLUTION) {
    throw new Error("SOCIAL_GEO_RESOLUTION_UNSAFE");
  }
  if (getResolution(geo.geoCell) !== geo.geoResolution) throw new Error("SOCIAL_GEO_RESOLUTION_MISMATCH");
  return {
    geoCell: geo.geoCell,
    geoResolution: geo.geoResolution,
    geoQueryCell: cellToParent(geo.geoCell, SOCIAL_QUERY_BUCKET_RESOLUTION),
  };
}

export function assertSafeSocialNetworkGeoAttachment(geo: Pick<SocialGeoAttachment, "geoCell" | "geoResolution">): SocialGeoAttachment {
  const attachment = assertValidSocialGeoAttachment(geo);
  if (attachment.geoResolution > SOCIAL_NETWORK_MAX_PUBLIC_RESOLUTION) {
    throw new Error("SOCIAL_GEO_RESOLUTION_UNTRUSTED");
  }
  return attachment;
}

export function assertNoRawLocationInSocialPayload(value: unknown, path = "payload"): void {
  if (value === null || value === undefined || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoRawLocationInSocialPayload(item, `${path}[${index}]`));
    return;
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.replace(/[^a-z]/gi, "").toLowerCase();
    if (FORBIDDEN_SOCIAL_FIELDS.has(normalized)) {
      throw new Error(`SOCIAL_RAW_LOCATION_FIELD_FORBIDDEN:${path}.${key}`);
    }
    assertNoRawLocationInSocialPayload(nested, `${path}.${key}`);
  }
}
