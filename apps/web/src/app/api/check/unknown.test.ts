import { describe, expect, it } from "vitest";
import { STATUS_BANNERS } from "@islegal/shared";
import { GET } from "./route";

describe("GET /api/check verification status", () => {
  it("returns unknown response for ISO country without profile", async () => {
    const req = new Request("http://localhost/api/check?country=AF");
    const res = await GET(req);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.status.level).toBe("gray");
    expect(json.status.label).toBe(STATUS_BANNERS.needs_review.title);
    expect(json.profile).toBeNull();
  });
});
