import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/check", () => {
  it("missing country -> 400 with code and requestId", async () => {
    const req = new Request("http://localhost/api/check");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error?.code).toBe("MISSING_COUNTRY");
    expect(json.requestId).toBeDefined();
  });
});
