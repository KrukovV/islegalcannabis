import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("/api/truth-map/countries", () => {
  it("serves the current independent proposal layer without cache", async () => {
    const response = await GET();
    const payload = await response.json();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.meta.finalSnapshotId).toBe("FINAL_307_RECONCILIATION");
    expect(payload.meta.rowsTotal).toBe(307);
    expect(payload.features.some((feature: { properties?: { geo?: string; truthColor?: string } }) => feature.properties?.geo === "AF" && feature.properties.truthColor === "UNKNOWN")).toBe(true);
  });
});
