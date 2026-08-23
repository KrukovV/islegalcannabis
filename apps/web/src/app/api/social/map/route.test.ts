import { latLngToCell } from "h3-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { parseSocialMapQuery } from "@/social/mapRequest";

describe("/api/social/map", () => {
  const safeCell = latLngToCell(40.7128, -74.006, 4);

  beforeEach(() => {
    vi.stubEnv("SOCIAL_PUBLIC_ENABLED", "0");
    vi.stubEnv("SOCIAL_DATABASE_URL", "");
    vi.stubEnv("DATABASE_URL", "");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("accepts only bounded H3 cells and never viewport coordinates", () => {
    expect(parseSocialMapQuery(new URL(`http://localhost/api/social/map?cells=${safeCell}&zoom=10`))).toEqual({ cells: [safeCell], zoom: 10 });
    expect(() => parseSocialMapQuery(new URL(`http://localhost/api/social/map?cells=${safeCell}&zoom=10&lat=40.7`)))
      .toThrow("SOCIAL_RAW_LOCATION_QUERY_FORBIDDEN");
    expect(() => parseSocialMapQuery(new URL(`http://localhost/api/social/map?cells=${safeCell}&zoom=10&west=-74.1&east=-73.9`)))
      .toThrow("SOCIAL_RAW_LOCATION_QUERY_FORBIDDEN");
  });

  it("fails closed while public Social storage is not configured", async () => {
    const response = await GET(new Request(`http://localhost/api/social/map?cells=${safeCell}&zoom=10`));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: { code: "SOCIAL_PUBLIC_DISABLED" } });
  });
});
