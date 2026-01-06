import { describe, expect, it } from "vitest";
import {
  resetVerificationCacheForTests,
  setVerificationTimestampForTests,
  verifyJurisdictionFreshness
} from "./verification";

describe("verification", () => {
  it("skips network when verified within window", async () => {
    resetVerificationCacheForTests();
    const now = new Date("2025-01-06T10:00:00Z");
    setVerificationTimestampForTests("DE", new Date("2025-01-06T08:30:00Z").toISOString());
    const fetchFn = async () => {
      throw new Error("should not fetch");
    };

    const result = await verifyJurisdictionFreshness(
      "DE",
      [{ url: "https://example.com" }],
      now,
      fetchFn
    );
    expect(result.fresh).toBe(true);
    expect(result.needsReview).toBe(false);
  });

  it("marks needs_review when headers change after window", async () => {
    resetVerificationCacheForTests();
    const now = new Date("2025-01-06T10:00:00Z");
    let call = 0;
    const fetchFn = async () => {
      call += 1;
      return {
        ok: true,
        etag: call === 1 ? "v1" : "v2",
        lastModified: "x",
        contentLength: "1"
      };
    };

    await verifyJurisdictionFreshness(
      "DE",
      [{ url: "https://example.com/a" }],
      new Date("2025-01-06T01:00:00Z"),
      fetchFn
    );

    const result = await verifyJurisdictionFreshness(
      "DE",
      [{ url: "https://example.com/a" }],
      now,
      fetchFn
    );
    expect(result.fresh).toBe(false);
    expect(result.needsReview).toBe(true);
  });
});
