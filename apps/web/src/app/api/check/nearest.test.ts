import { describe, expect, it, vi } from "vitest";

describe("GET /api/check nearest legal", () => {
  it("returns nearestLegal when red status and coords are provided", async () => {
    const { GET } = await import("./route");
    const req = new Request(
      "http://localhost/api/check?country=US&region=TX&method=gps&confidence=high&approxLat=31.9686&approxLon=-99.9018"
    );
    const res = await GET(req);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.viewModel.nearestLegal).toBeTruthy();
  });

  it("returns null nearestLegal when coords are missing", async () => {
    const { GET } = await import("./route");
    const req = new Request(
      "http://localhost/api/check?country=US&region=TX&method=gps&confidence=high"
    );
    const res = await GET(req);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.viewModel.nearestLegal).toBeUndefined();
  });

  it("does not return nearestLegal for unknown status", async () => {
    vi.resetModules();
    const profile = {
      id: "DE",
      country: "DE",
      medical: "restricted",
      recreational: "illegal",
      possession_limit: "Not specified",
      public_use: "illegal",
      home_grow: "illegal",
      cross_border: "illegal",
      risks: ["public_use"],
      sources: [{ title: "Example", url: "https://example.com" }],
      updated_at: "2024-01-01",
      verified_at: null,
      confidence: "low",
      status: "unknown"
    };

    vi.doMock("@/lib/lawStore", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/lawStore")>();
      return {
        ...actual,
        getLawProfile: () => profile,
        normalizeKey: () => "DE"
      };
    });

    const { GET } = await import("./route");
    const req = new Request(
      "http://localhost/api/check?country=DE&method=gps&confidence=high&approxLat=51.1657&approxLon=10.4515"
    );
    const res = await GET(req);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.viewModel.nearestLegal).toBeUndefined();
    vi.resetModules();
  });
});
