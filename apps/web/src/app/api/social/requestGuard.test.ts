import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { rejectRawSocialRequestLocation } from "./requestGuard";

const routePaths = [
  "account/route.ts",
  "comments/[id]/route.ts",
  "discussions/[id]/comments/route.ts",
  "discussions/[id]/route.ts",
  "discussions/route.ts",
  "events/route.ts",
  "map/route.ts",
  "moderation/route.ts",
  "relationships/route.ts",
  "reports/route.ts",
  "session/route.ts",
  "votes/route.ts",
  "dm/devices/challenge/route.ts",
  "dm/devices/route.ts",
  "dm/devices/[id]/route.ts",
  "dm/recipients/route.ts",
  "dm/relay/send/route.ts",
  "dm/relay/inbox/route.ts",
  "dm/relay/ack/route.ts",
  "dm/relay/receipt/route.ts",
];

describe("Social API raw-location request guard", () => {
  it("rejects raw location query fields before an endpoint can use or log its normal flow", async () => {
    expect(rejectRawSocialRequestLocation("request-safe", new Request("http://localhost/api/social/events?cells=8428309ffffffff"))).toBeNull();
    const response = rejectRawSocialRequestLocation("request-raw", new Request("http://localhost/api/social/events?cells=8428309ffffffff&latitude=40.7"));
    expect(response?.status).toBe(400);
    await expect(response?.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "SOCIAL_RAW_LOCATION_FIELD_FORBIDDEN:query.latitude" },
    });
  });

  it("requires every public Social route to apply the query guard", () => {
    for (const routePath of routePaths) {
      const source = fs.readFileSync(path.join(process.cwd(), "src", "app", "api", "social", routePath), "utf8");
      expect(source, routePath).toContain("rejectRawSocialRequestLocation(requestId, request)");
    }
  });
});
