import { describe, expect, it } from "vitest";
import {
  MAP_DISCUSSION_DEFAULT_TTL_MS,
  resolveDiscussionExpiry,
  validateDiscussionInput,
} from "./domain";

describe("Social discussion lifecycle", () => {
  it("gives MAP discussions a 24-hour active-map visibility default", () => {
    const now = new Date("2026-08-14T00:00:00.000Z");
    expect(resolveDiscussionExpiry({ type: "MAP", body: "Area update", geo: { geoCell: "842a107ffffffff", geoResolution: 4 } }, now))
      .toBe(new Date(now.getTime() + MAP_DISCUSSION_DEFAULT_TTL_MS).toISOString());
  });

  it("keeps LAW, NEWS, and GEO knowledge discussions durable", () => {
    expect(resolveDiscussionExpiry({ type: "LAW", lawId: "law-1", body: "Evidence discussion" })).toBeNull();
    expect(resolveDiscussionExpiry({ type: "NEWS", newsId: "news-1", body: "News discussion" })).toBeNull();
    expect(resolveDiscussionExpiry({ type: "GEO", geoId: "US-NY", body: "Geo discussion" })).toBeNull();
  });

  it("rejects a MAP discussion that has no privacy-safe H3 attachment", () => {
    expect(() => validateDiscussionInput({ type: "MAP", body: "Missing area" })).toThrow("SOCIAL_MAP_GEO_CELL_REQUIRED");
  });

  it("rejects a non-MAP H3 attachment and malformed event expiry", () => {
    expect(() => validateDiscussionInput({ type: "LAW", lawId: "law-1", body: "Wrong area", geo: { geoCell: "842a107ffffffff", geoResolution: 4 } }))
      .toThrow("SOCIAL_GEO_ATTACHMENT_TYPE_INVALID");
    expect(() => validateDiscussionInput({ type: "EVENT", body: "Event", eventEndsAt: "not-a-date" }))
      .toThrow("SOCIAL_EVENT_EXPIRY_INVALID");
  });
});
