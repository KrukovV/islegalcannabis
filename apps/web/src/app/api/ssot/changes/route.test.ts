import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("/api/ssot/changes", () => {
  it("returns ssot diff payload", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toHaveProperty("generated_at");
    expect(Array.isArray(payload.last_24h)).toBe(true);
    expect(Array.isArray(payload.last_7d)).toBe(true);
    expect(Array.isArray(payload.pending)).toBe(true);
  });
});
