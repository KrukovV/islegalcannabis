import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/nearby", () => {
  const prevPremium = process.env.NEXT_PUBLIC_PREMIUM;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_PREMIUM = "1";
  });
  afterEach(() => {
    if (prevPremium === undefined) {
      delete process.env.NEXT_PUBLIC_PREMIUM;
    } else {
      process.env.NEXT_PUBLIC_PREMIUM = prevPremium;
    }
  });

  it("returns truth-ranked nearby alternatives for France", async () => {
    const req = new Request("http://localhost/api/nearby?country=FR");
    const res = await GET(req);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.current.geo).toBe("FR");
    expect(Array.isArray(json.nearby)).toBe(true);
    expect(json.nearby.length).toBeGreaterThan(0);
    expect(typeof json.warning).toBe("string");
    expect(
      json.nearby[0].access.truthScore >= 0.3 || ["limited", "tolerated"].includes(json.nearby[0].access.type)
    ).toBe(true);
    expect(json.warning).toBe("Crossing borders with cannabis is illegal in most countries.");
    expect(typeof json.nearby[0].distance.raw_km).toBe("number");
    expect(typeof json.nearby[0].distance.effective_km).toBe("number");
    expect(["geo", "border", "access"]).toContain(json.nearby[0].distance.type);
  });

  it("returns US state candidates for California", async () => {
    const req = new Request("http://localhost/api/nearby?country=US&region=CA");
    const res = await GET(req);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.current.geo).toBe("US-CA");
    expect(Array.isArray(json.nearby)).toBe(true);
    expect(json.nearby.length).toBeLessThanOrEqual(5);
    expect(json.nearby.every((item: { geo: string }) => item.geo.startsWith("US-"))).toBe(true);
  });
});
