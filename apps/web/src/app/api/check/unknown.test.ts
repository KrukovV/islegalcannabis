import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/check verification status", () => {
  it("returns unknown response for ISO country without profile", async () => {
    const req = new Request("http://localhost/api/check?country=CA");
    const res = await GET(req);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.status.level).toBe("yellow");
    expect(json.status.label).toBe("Information requires verification");
    expect(json.profile).toBeNull();
  });
});
