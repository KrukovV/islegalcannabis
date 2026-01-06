import { describe, expect, it } from "vitest";
import { GET } from "./route";
import { getLawProfile } from "@/lib/lawStore";
import { hashLawProfile } from "@/lib/profileHash";
import { addCachedCheck, resetNearbyCacheForTests } from "@/lib/nearbyCache";
import {
  resetVerificationCacheForTests,
  setVerificationTimestampForTests
} from "@/lib/verification";

describe("GET /api/check cache", () => {
  it("returns cached response on hit within window", async () => {
    resetNearbyCacheForTests();
    resetVerificationCacheForTests();
    const profile = getLawProfile({ country: "DE" });
    if (!profile) throw new Error("missing profile");
    const now = new Date();

    addCachedCheck({
      ts: now.toISOString(),
      jurisdictionKey: profile.id,
      country: profile.country,
      region: profile.region,
      statusCode: "recreational_legal",
      statusLevel: "green",
      profileHash: hashLawProfile(profile),
      verifiedAt: profile.verified_at ?? undefined,
      lawUpdatedAt: profile.updated_at,
      sources: profile.sources,
      location: { method: "ip", confidence: "low" },
      approxCell: "country:DE"
    });

    setVerificationTimestampForTests(profile.id, now.toISOString());

    const req = new Request(
      "http://localhost/api/check?country=DE&method=ip&confidence=low"
    );
    const res = await GET(req);
    const json = await res.json();
    expect(json.meta?.cacheHit).toBe(true);
  });

  it("ignores stale cache outside window", async () => {
    resetNearbyCacheForTests();
    resetVerificationCacheForTests();
    const profile = getLawProfile({ country: "DE" });
    if (!profile) throw new Error("missing profile");
    const past = new Date(Date.now() - 3 * 60 * 60 * 1000);

    addCachedCheck({
      ts: past.toISOString(),
      jurisdictionKey: profile.id,
      country: profile.country,
      region: profile.region,
      statusCode: "recreational_legal",
      statusLevel: "green",
      profileHash: hashLawProfile(profile),
      verifiedAt: profile.verified_at ?? undefined,
      lawUpdatedAt: profile.updated_at,
      sources: profile.sources,
      location: { method: "ip", confidence: "low" },
      approxCell: "country:DE"
    });

    const req = new Request(
      "http://localhost/api/check?country=DE&method=ip&confidence=low"
    );
    const res = await GET(req);
    const json = await res.json();
    expect(json.meta?.cacheHit).toBe(false);
  });
});
