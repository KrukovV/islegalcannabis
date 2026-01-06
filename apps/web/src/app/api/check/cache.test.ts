import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { getLawProfile } from "@/lib/lawStore";
import { hashLawProfile } from "@/lib/profileHash";
import {
  resetVerificationCacheForTests,
  setVerificationTimestampForTests
} from "@/lib/verification";

describe("GET /api/check cache", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns cached response on hit within window", async () => {
    resetVerificationCacheForTests();
    const profile = getLawProfile({ country: "DE" });
    if (!profile) throw new Error("missing profile");
    const now = new Date();

    setVerificationTimestampForTests(profile.id, now.toISOString());

    vi.stubGlobal("fetch", async () => {
      throw new Error("fetch should not be called");
    });

    const cacheTs = encodeURIComponent(now.toISOString());
    const cacheProfileHash = encodeURIComponent(hashLawProfile(profile));
    const cacheVerifiedAt = encodeURIComponent(now.toISOString());
    const cacheApproxCell = encodeURIComponent("country:DE");
    const req = new Request(
      `http://localhost/api/check?country=DE&method=ip&confidence=low&cacheTs=${cacheTs}&cacheProfileHash=${cacheProfileHash}&cacheVerifiedAt=${cacheVerifiedAt}&cacheApproxCell=${cacheApproxCell}`
    );
    const res = await GET(req);
    const json = await res.json();
    expect(json.meta?.cacheHit).toBe(true);
  });

  it("skips verification when cacheVerifiedAt is recent", async () => {
    resetVerificationCacheForTests();
    const profile = getLawProfile({ country: "DE" });
    if (!profile) throw new Error("missing profile");
    const now = new Date();

    vi.stubGlobal("fetch", async () => {
      throw new Error("fetch should not be called");
    });

    const cacheTs = encodeURIComponent(now.toISOString());
    const cacheProfileHash = encodeURIComponent(hashLawProfile(profile));
    const cacheVerifiedAt = encodeURIComponent(now.toISOString());
    const cacheApproxCell = encodeURIComponent("country:DE");
    const req = new Request(
      `http://localhost/api/check?country=DE&method=ip&confidence=low&cacheTs=${cacheTs}&cacheProfileHash=${cacheProfileHash}&cacheVerifiedAt=${cacheVerifiedAt}&cacheApproxCell=${cacheApproxCell}`
    );
    const res = await GET(req);
    const json = await res.json();
    expect(json.meta?.cacheHit).toBe(true);
  });

  it("verifies when cacheVerifiedAt is older than 5 hours", async () => {
    resetVerificationCacheForTests();
    const profile = getLawProfile({ country: "DE" });
    if (!profile) throw new Error("missing profile");
    const now = new Date();
    const old = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls += 1;
      return new Response(null, {
        status: 200,
        headers: {
          etag: "v1",
          "last-modified": "x",
          "content-length": "1"
        }
      });
    });

    const cacheTs = encodeURIComponent(now.toISOString());
    const cacheProfileHash = encodeURIComponent(hashLawProfile(profile));
    const cacheVerifiedAt = encodeURIComponent(old.toISOString());
    const cacheApproxCell = encodeURIComponent("country:DE");
    const req = new Request(
      `http://localhost/api/check?country=DE&method=ip&confidence=low&cacheTs=${cacheTs}&cacheProfileHash=${cacheProfileHash}&cacheVerifiedAt=${cacheVerifiedAt}&cacheApproxCell=${cacheApproxCell}`
    );
    const res = await GET(req);
    const json = await res.json();
    expect(json.meta?.cacheHit).toBe(true);
    expect(calls).toBeGreaterThan(0);
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
