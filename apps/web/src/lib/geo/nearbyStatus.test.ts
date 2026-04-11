import { describe, expect, it } from "vitest";
import { getLawProfile } from "@/lib/lawStore";
import { findNearbyStatus } from "./nearbyStatus";

describe("nearbyStatus social reality integration", () => {
  it("returns tolerated or moderated alternatives for France", () => {
    const profile = getLawProfile({ country: "FR" });
    expect(profile).toBeTruthy();
    const result = findNearbyStatus(profile!);
    expect(result?.nearby.length || 0).toBeGreaterThan(0);
    expect(result?.nearby.some((item) => item.status !== result.current.status)).toBe(true);
  });

  it("keeps social low-confidence jurisdictions out of weak-signal promotion", () => {
    const profile = getLawProfile({ country: "AE" });
    expect(profile).toBeTruthy();
    const result = findNearbyStatus(profile!);
    expect(result?.nearby.some((item) => item.id === "JP")).toBe(false);
  });

  it("returns nearby US state alternatives for Texas", () => {
    const profile = getLawProfile({ country: "US", region: "TX" });
    expect(profile).toBeTruthy();
    const result = findNearbyStatus(profile!);
    expect(result?.current.id).toBe("US-TX");
    expect(result?.nearby.length || 0).toBeGreaterThan(0);
    expect(result?.nearby.every((item) => item.id.startsWith("US-"))).toBe(true);
  });
});
