import { describe, expect, it } from "vitest";
import { GET } from "./route";
import { getLawProfile } from "@/lib/lawStore";
import { hashLawProfile } from "@/lib/profileHash";
import {
  resetVerificationCacheForTests,
  setVerificationTimestampForTests
} from "@/lib/verification";

describe("GET /api/check cache", () => {
  it("returns cached response on hit within window", async () => {
    resetVerificationCacheForTests();
    const profile = getLawProfile({ country: "DE" });
    if (!profile) throw new Error("missing profile");
    const now = new Date();

    setVerificationTimestampForTests(profile.id, now.toISOString());

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error("fetch should not be called");
    };

    const cacheTs = encodeURIComponent(now.toISOString());
    const cacheProfileHash = encodeURIComponent(hashLawProfile(profile));
    const cacheVerifiedAt = encodeURIComponent(now.toISOString());
    const cacheApproxCell = encodeURIComponent("country:DE");
    const req = new Request(
      `http://localhost/api/check?country=DE&method=ip&confidence=low&cacheTs=${cacheTs}&cacheProfileHash=${cacheProfileHash}&cacheVerifiedAt=${cacheVerifiedAt}&cacheApproxCell=${cacheApproxCell}`
    );
    try {
      const res = await GET(req);
      const json = await res.json();
      expect(json.meta?.cacheHit).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("ignores stale cache outside window", async () => {
    resetVerificationCacheForTests();
    const profile = getLawProfile({ country: "DE" });
    if (!profile) throw new Error("missing profile");
    const past = new Date(Date.now() - 3 * 60 * 60 * 1000);

    const cacheTs = encodeURIComponent(past.toISOString());
    const cacheProfileHash = encodeURIComponent(hashLawProfile(profile));
    const cacheVerifiedAt = encodeURIComponent(past.toISOString());
    const cacheApproxCell = encodeURIComponent("country:DE");
    const req = new Request(
      `http://localhost/api/check?country=DE&method=ip&confidence=low&cacheTs=${cacheTs}&cacheProfileHash=${cacheProfileHash}&cacheVerifiedAt=${cacheVerifiedAt}&cacheApproxCell=${cacheApproxCell}`
    );
    const res = await GET(req);
    const json = await res.json();
    expect(json.meta?.cacheHit).toBe(false);
  });
});
