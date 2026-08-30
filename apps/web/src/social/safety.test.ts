import { describe, expect, it } from "vitest";
import type { Discussion, SocialActor } from "./domain";
import { RuleModerationProvider } from "./safety";

const actor: SocialActor = { userId: "user-1", roles: ["USER"] };
const base: Discussion = {
  id: "discussion-1",
  type: "GEO",
  authorId: actor.userId,
  authorDisplayName: "Reader",
  geoId: "US-NY",
  geo: null,
  lawId: null,
  newsId: null,
  sourceId: null,
  title: null,
  body: "Useful community context",
  language: "en",
  createdAt: "2026-08-14T00:00:00.000Z",
  updatedAt: "2026-08-14T00:00:00.000Z",
  expiresAt: null,
  status: "ACTIVE",
  replyCount: 0,
  voteScore: 0,
  version: "1",
};

describe("Social moderation baseline", () => {
  it("allows ordinary content and rejects link floods and repetitive payloads", async () => {
    const moderation = new RuleModerationProvider();
    await expect(moderation.allowCreateDiscussion({ actor, discussion: base })).resolves.toEqual({ allowed: true });
    await expect(moderation.allowCreateDiscussion({
      actor,
      discussion: { ...base, body: "https://a.test https://b.test https://c.test https://d.test https://e.test" },
    })).resolves.toMatchObject({ allowed: false, code: "SOCIAL_TOO_MANY_LINKS" });
    await expect(moderation.allowCreateDiscussion({ actor, discussion: { ...base, body: "aaaaaaaaaaaaaaaaaaaa" } }))
      .resolves.toMatchObject({ allowed: false, code: "SOCIAL_REPETITIVE_CONTENT" });
  });
});
