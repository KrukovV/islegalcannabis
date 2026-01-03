import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/reverse-geocode", () => {
  it("invalid lat/lon -> 400 with code and requestId", async () => {
    const req = new Request("http://localhost/api/reverse-geocode?lat=bad&lon=oops");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error?.code).toBe("INVALID_COORDS");
    expect(json.requestId).toBeDefined();
  });
});
