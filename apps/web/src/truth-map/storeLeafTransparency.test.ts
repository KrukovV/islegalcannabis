import { describe, expect, it } from "vitest";
import { buildStoreLeafTransparencyCollection, getStoreLeafTransparency } from "./storeLeafTransparency";

describe("Why no leaf transparency", () => {
  it("accounts for all saved Store Truth records across all 307 GEO without exposing record locations", () => {
    const collection = buildStoreLeafTransparencyCollection();
    expect(collection.geoCount).toBe(307);
    expect(collection.rows).toHaveLength(307);
    expect(collection.summary.savedRecords).toBe(collection.summary.visibleLeaves + collection.summary.blockedRecords);
    expect(collection.summary.geosWithBlockedRecords).toBe(collection.rows.filter((row) => row.blockedRecords > 0).length);
    expect(collection.payloadSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(collection)).not.toContain("latitude");
    expect(JSON.stringify(collection)).not.toContain("longitude");
    expect(JSON.stringify(collection)).not.toContain("canonical_store_id");
  });

  it("keeps blocked Store records distinct from a claim that no store exists", () => {
    const blocked = buildStoreLeafTransparencyCollection().rows.filter((row) => row.blockedRecords > 0);
    expect(blocked.length).toBeGreaterThan(0);
    expect(blocked.every((row) => row.interpretation.includes("does not mean"))).toBe(true);
    expect(blocked.every((row) => Object.values(row.blockedByCategory).some((count) => count > 0))).toBe(true);
    expect(getStoreLeafTransparency("not-a-geo")).toBeNull();
  });
});
