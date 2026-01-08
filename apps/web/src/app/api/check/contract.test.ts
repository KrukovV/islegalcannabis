import { describe, expect, it } from "vitest";
import { GET } from "./route";

const STATUS_LEVELS = new Set(["green", "yellow", "red", "gray"]);

describe("GET /api/check contract", () => {
  it("returns known profile for US-CA", async () => {
    const req = new Request("http://localhost/api/check?country=US&region=CA");
    const res = await GET(req);
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.profile?.id).toBe("US-CA");
    expect(json.profile?.sources?.length).toBeGreaterThan(0);
    expect(json.profile?.updated_at).toBeTruthy();
    expect(STATUS_LEVELS.has(json.status?.level)).toBe(true);
  });

  it("returns known profile for DE", async () => {
    const req = new Request("http://localhost/api/check?country=DE");
    const res = await GET(req);
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.profile?.id).toBe("DE");
    expect(json.profile?.sources?.length).toBeGreaterThan(0);
    expect(json.profile?.updated_at).toBeTruthy();
    expect(STATUS_LEVELS.has(json.status?.level)).toBe(true);
  });

  it("returns BAD_REQUEST for invalid country", async () => {
    const req = new Request("http://localhost/api/check?country=ZZ");
    const res = await GET(req);
    const json = await res.json();

    expect(json.ok).toBe(false);
    expect(json.error?.code).toBe("BAD_REQUEST");
  });
});
