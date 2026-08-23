import { latLngToCell } from "h3-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { parseCreateDiscussionPayload } from "@/social/discussionRequest";

describe("/api/social/discussions", () => {
  const safeCell = latLngToCell(40.7128, -74.006, 4);

  beforeEach(() => {
    vi.stubEnv("SOCIAL_PUBLIC_ENABLED", "0");
    vi.stubEnv("GEOCHAT_ENABLED", "0");
    vi.stubEnv("SOCIAL_DATABASE_URL", "");
    vi.stubEnv("DATABASE_URL", "");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("rejects raw GPS and exact public-place fields before persistence", () => {
    expect(() => parseCreateDiscussionPayload({ type: "MAP", body: "hello", latitude: 40.7 })).toThrow("SOCIAL_RAW_LOCATION_FIELD_FORBIDDEN");
    expect(() => parseCreateDiscussionPayload({ type: "MAP", body: "hello", postLocation: { latitude: 40.7, longitude: -74 } }))
      .toThrow("SOCIAL_RAW_LOCATION_FIELD_FORBIDDEN");
  });

  it("accepts only the safe cell shape and keeps writes disabled without real identity/moderation", async () => {
    expect(parseCreateDiscussionPayload({ type: "MAP", body: "Area update", geo: { geoCell: safeCell, geoResolution: 4 } }))
      .toMatchObject({ type: "MAP", geo: { geoCell: safeCell, geoResolution: 4 } });
    expect(() => parseCreateDiscussionPayload({
      type: "MAP",
      body: "Unsafe precision",
      geo: { geoCell: latLngToCell(40.7128, -74.006, 5), geoResolution: 5 },
    })).toThrow("SOCIAL_GEO_RESOLUTION_UNTRUSTED");
    const response = await POST(new Request("http://localhost/api/social/discussions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "MAP", body: "Area update", geo: { geoCell: safeCell, geoResolution: 4 } }),
    }));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: { code: "SOCIAL_WRITE_DISABLED" } });
  });
});
