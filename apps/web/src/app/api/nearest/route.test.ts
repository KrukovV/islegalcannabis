import { describe, expect, it } from "vitest";
import { GET } from "./route";
import fs from "node:fs";
import path from "node:path";
import { findNearestAllowed } from "@/lib/geo/nearestAllowed";

describe("GET /api/nearest", () => {
  function pickNearestCandidate() {
    const root = path.resolve(__dirname, "../../../../../..");
    const dirs = [
      path.join(root, "data", "laws", "world"),
      path.join(root, "data", "laws", "eu"),
      path.join(root, "data", "laws", "us")
    ];
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue;
      for (const name of fs.readdirSync(dir)) {
        if (!name.endsWith(".json")) continue;
        const raw = fs.readFileSync(path.join(dir, name), "utf8");
        const profile = JSON.parse(raw);
        const result = findNearestAllowed(profile);
        if (result.nearest.length > 0) {
          return profile.id as string;
        }
      }
    }
    return null;
  }

  it("returns nearest allowed for non-allowed country", async () => {
    const id = pickNearestCandidate();
    if (!id) return;
    const [country, region] = id.split("-");
    const qs = new URLSearchParams({ country });
    if (region) qs.set("region", region);
    const req = new Request(`http://localhost/api/nearest?${qs.toString()}`);
    const res = await GET(req);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.from.id).toBe(id);
    expect(Array.isArray(json.nearest)).toBe(true);
    expect(json.nearest.length).toBeGreaterThan(0);
    json.nearest.forEach((item: { id?: string; status?: string; summary?: string; name?: string; flag?: string }) => {
      expect(typeof item.id).toBe("string");
      expect(typeof item.status).toBe("string");
      expect(typeof item.summary).toBe("string");
      expect(typeof item.name).toBe("string");
      expect(typeof item.flag).toBe("string");
    });
  });

  it("returns empty nearest for allowed status", async () => {
    const req = new Request("http://localhost/api/nearest?country=US&region=CA");
    const res = await GET(req);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.from.id).toBe("US-CA");
    expect(json.from.name).toContain("California");
    expect(Array.isArray(json.nearest)).toBe(true);
    expect(json.nearest.length).toBe(0);
  });
});
