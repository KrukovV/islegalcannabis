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

  it("returns nearby alternatives for illegal status", async () => {
    const req = new Request("http://localhost/api/nearby?country=FR");
    const res = await GET(req);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.current.id).toBe("FR");
    expect(Array.isArray(json.nearby)).toBe(true);
    expect(json.nearby.length).toBeGreaterThan(0);
    for (const item of json.nearby) {
      expect(item.status).not.toBe(json.current.status);
    }
  });

  it("returns ok response for legal status", async () => {
    const req = new Request("http://localhost/api/nearby?country=US&region=CA");
    const res = await GET(req);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.current.id).toBe("US-CA");
    expect(Array.isArray(json.nearby)).toBe(true);
    expect(json.nearby.length).toBeLessThanOrEqual(5);
  });
});
