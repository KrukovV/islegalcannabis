import { getResolution, latLngToCell } from "h3-js";
import { describe, expect, it } from "vitest";
import {
  assertNoRawLocationInSocialPayload,
  assertSafeSocialNetworkGeoAttachment,
  assertValidSocialGeoAttachment,
  chooseSocialGeoResolution,
  SOCIAL_MAX_PUBLIC_RESOLUTION,
  SOCIAL_MIN_PUBLIC_RESOLUTION,
  toSocialGeoAttachment,
} from "./privacy";

describe("PrivacyResolutionGuard", () => {
  it("does not use zoom to increase publication precision", () => {
    const sparseAtWorld = chooseSocialGeoResolution({ requestedMapZoom: 1 });
    const sparseAtLocal = chooseSocialGeoResolution({ requestedMapZoom: 15 });
    expect(sparseAtWorld).toBe(SOCIAL_MIN_PUBLIC_RESOLUTION);
    expect(sparseAtLocal).toBe(SOCIAL_MIN_PUBLIC_RESOLUTION);
  });

  it("requires trusted density and an aggregate crowd threshold before using a finer cell", () => {
    expect(chooseSocialGeoResolution({ requestedMapZoom: 15, populationDensityPerKm2: 2_000, activeParticipantCount: 7 }))
      .toBe(SOCIAL_MIN_PUBLIC_RESOLUTION);
    expect(chooseSocialGeoResolution({ requestedMapZoom: 1, populationDensityPerKm2: 2_000, activeParticipantCount: 8 }))
      .toBe(SOCIAL_MAX_PUBLIC_RESOLUTION);
  });

  it("converts raw browser coordinates locally and exposes only H3 fields", () => {
    const attachment = toSocialGeoAttachment(
      { latitude: 40.7128, longitude: -74.006 },
      { requestedMapZoom: 15, populationDensityPerKm2: 100, activeParticipantCount: 0 },
    );
    expect(Object.keys(attachment).sort()).toEqual(["geoCell", "geoQueryCell", "geoResolution"]);
    expect(getResolution(attachment.geoCell)).toBe(attachment.geoResolution);
    expect(attachment.geoResolution).toBe(SOCIAL_MIN_PUBLIC_RESOLUTION);
  });

  it("rejects raw location fields anywhere in a Social payload", () => {
    expect(() => assertNoRawLocationInSocialPayload({ discussion: { latitude: 1 } })).toThrow("SOCIAL_RAW_LOCATION_FIELD_FORBIDDEN");
    expect(() => assertNoRawLocationInSocialPayload({ trail: [{ previousCells: ["x"] }] })).toThrow("SOCIAL_RAW_LOCATION_FIELD_FORBIDDEN");
    expect(() => assertNoRawLocationInSocialPayload({ location: { coordinates: [-74.006, 40.7128] } })).toThrow("SOCIAL_RAW_LOCATION_FIELD_FORBIDDEN");
    expect(() => assertNoRawLocationInSocialPayload({ nearby: { exactDistance: 23, direction: "north" } })).toThrow("SOCIAL_RAW_LOCATION_FIELD_FORBIDDEN");
    expect(() => assertNoRawLocationInSocialPayload({ geo: { geoCell: "842a107ffffffff", geoResolution: 4 } })).not.toThrow();
  });

  it("rejects unsafe or mismatched H3 resolution claims from the network", () => {
    expect(() => assertValidSocialGeoAttachment({ geoCell: "842a107ffffffff", geoResolution: 6 })).toThrow("SOCIAL_GEO_RESOLUTION_MISMATCH");
    expect(() => assertValidSocialGeoAttachment({ geoCell: "842a107ffffffff", geoResolution: 7 })).toThrow("SOCIAL_GEO_RESOLUTION_UNSAFE");
    expect(() => assertSafeSocialNetworkGeoAttachment({
      geoCell: latLngToCell(40.7128, -74.006, SOCIAL_MAX_PUBLIC_RESOLUTION),
      geoResolution: SOCIAL_MAX_PUBLIC_RESOLUTION,
    })).toThrow("SOCIAL_GEO_RESOLUTION_UNTRUSTED");
  });
});
