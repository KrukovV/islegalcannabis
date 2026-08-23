import postgres, { type Sql } from "postgres";
import { latLngToCell } from "h3-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Discussion, SocialActor } from "./domain";
import { createSocialIdentity, getSocialIdentity, SOCIAL_SESSION_COOKIE } from "./identity";
import { PostgresSocialInteractionRepository } from "./interactions";
import { PostgresSocialManagementRepository } from "./management";
import { PostgresRealtimeProvider, SOCIAL_POSTGRES_CHANNEL } from "./realtime";
import { PostgresSocialDiscussionRepository } from "./repository";

const databaseUrl = process.env.SOCIAL_TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("Social PostgreSQL vertical slice", () => {
  let sql: Sql;
  let listenerSql: Sql;
  const discussionIds: string[] = [];
  const userIds: string[] = [];
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  beforeAll(() => {
    sql = postgres(databaseUrl!, { max: 3, prepare: false });
    listenerSql = postgres(databaseUrl!, { max: 1, prepare: false });
  });

  afterAll(async () => {
    if (discussionIds.length > 0) {
      await sql`DELETE FROM social_reports WHERE target_id = ANY(${sql.array(discussionIds)})`;
      await sql`DELETE FROM social_moderation_actions WHERE target_id = ANY(${sql.array(discussionIds)})`;
      await sql`DELETE FROM social_discussions WHERE id = ANY(${sql.array(discussionIds)}::uuid[])`;
    }
    if (userIds.length > 0) {
      await sql`DELETE FROM social_blocks WHERE blocker_id = ANY(${sql.array(userIds)}) OR blocked_id = ANY(${sql.array(userIds)})`;
      await sql`DELETE FROM social_mutes WHERE muter_id = ANY(${sql.array(userIds)}) OR muted_id = ANY(${sql.array(userIds)})`;
      await sql`DELETE FROM social_user_rate_limits WHERE user_id = ANY(${sql.array(userIds)})`;
      await sql`DELETE FROM social_user_profiles WHERE user_id = ANY(${sql.array(userIds)})`;
      await sql`DELETE FROM social_users WHERE id = ANY(${sql.array(userIds)}::uuid[])`;
    }
    await listenerSql.end({ timeout: 5 });
    await sql.end({ timeout: 5 });
  });

  it("accepts a cold first single-cell viewport query", async () => {
    const coldCell = latLngToCell(0, 0, 4);
    await expect(new PostgresSocialDiscussionRepository(sql).listActiveMapActivity({
      queryCells: [coldCell],
      limit: 1,
    })).resolves.toEqual(expect.any(Array));
  });

  it("commits MAP and LAW truth, authorizes interactions, reconciles realtime, and stores no raw GPS columns", async () => {
    const aliceCreated = await createSocialIdentity(sql, `Alice ${suffix}`);
    const bobCreated = await createSocialIdentity(sql, `Bob ${suffix}`);
    userIds.push(aliceCreated.identity.userId, bobCreated.identity.userId);
    const aliceRequest = new Request("http://localhost", {
      headers: { cookie: `${SOCIAL_SESSION_COOKIE}=${aliceCreated.token}` },
    });
    await expect(getSocialIdentity(sql, aliceRequest)).resolves.toMatchObject({
      userId: aliceCreated.identity.userId,
      displayName: `Alice ${suffix}`,
    });

    const repository = new PostgresSocialDiscussionRepository(sql);
    const now = new Date();
    const geoCell = latLngToCell(40.7128, -74.006, 4);
    const mapDiscussion: Discussion = {
      id: crypto.randomUUID(),
      type: "MAP",
      authorId: aliceCreated.identity.userId,
      authorDisplayName: aliceCreated.identity.displayName,
      geoId: null,
      geo: { geoCell, geoResolution: 4, geoQueryCell: geoCell },
      lawId: null,
      newsId: null,
      sourceId: null,
      title: "Privacy-safe area update",
      body: "Raw coordinates stayed in the browser.",
      language: "en",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      status: "ACTIVE",
      replyCount: 0,
      voteScore: 0,
      version: `${now.toISOString()}:new`,
    };
    discussionIds.push(mapDiscussion.id);
    const savedMap = await repository.createDiscussion(mapDiscussion);
    expect(savedMap.geo).toEqual({ geoCell, geoResolution: 4, geoQueryCell: geoCell });

    const lawDiscussion: Discussion = {
      ...mapDiscussion,
      id: crypto.randomUUID(),
      type: "LAW",
      geo: null,
      lawId: "law-integration",
      expiresAt: null,
      title: "Persistent law discussion",
    };
    discussionIds.push(lawDiscussion.id);
    await repository.createDiscussion(lawDiscussion);
    await expect(repository.listDiscussions({ type: "LAW", lawId: "law-integration", sort: "NEW", limit: 10 }))
      .resolves.toEqual(expect.arrayContaining([expect.objectContaining({ id: lawDiscussion.id, expiresAt: null })]));

    const interactions = new PostgresSocialInteractionRepository(sql);
    const comment = await interactions.createComment(bobCreated.identity, mapDiscussion.id, null, "Second user reply");
    const nested = await interactions.createComment(aliceCreated.identity, mapDiscussion.id, comment.comment.id, "Nested answer");
    expect(nested.comment.parentCommentId).toBe(comment.comment.id);
    await expect(interactions.setVote(bobCreated.identity, "DISCUSSION", mapDiscussion.id, 1)).resolves.toMatchObject({
      voteScore: 1,
      discussionId: mapDiscussion.id,
      queryCell: geoCell,
      version: expect.stringContaining(mapDiscussion.id),
    });
    await expect(interactions.createReport(bobCreated.identity, "DISCUSSION", mapDiscussion.id, "Integration review"))
      .resolves.toMatchObject({ id: expect.any(String) });

    const management = new PostgresSocialManagementRepository(sql);
    await expect(management.removeOwnDiscussion(bobCreated.identity, mapDiscussion.id)).resolves.toBeNull();
    await management.setRelation(bobCreated.identity, "BLOCK", aliceCreated.identity.userId, true);
    await expect(repository.listDiscussions({
      type: "MAP", queryCells: [geoCell], viewerId: bobCreated.identity.userId, sort: "NEW", limit: 10,
    })).resolves.not.toEqual(expect.arrayContaining([expect.objectContaining({ id: mapDiscussion.id })]));

    const moderator: SocialActor = { userId: bobCreated.identity.userId, roles: ["MODERATOR"] };
    await sql`UPDATE social_users SET role = 'MODERATOR' WHERE id = ${bobCreated.identity.userId}`;
    await expect(management.moderate(moderator, "DISCUSSION", lawDiscussion.id, "HIDE", "Integration moderation"))
      .resolves.toMatchObject({ id: expect.any(String) });
    await expect(repository.listDiscussions({ type: "LAW", lawId: "law-integration", sort: "NEW", limit: 10 }))
      .resolves.not.toEqual(expect.arrayContaining([expect.objectContaining({ id: lawDiscussion.id })]));

    const realtimeEvent = {
      id: crypto.randomUUID(),
      type: "DISCUSSION_UPDATED" as const,
      discussionId: mapDiscussion.id,
      version: "integration-version",
      queryCell: geoCell,
    };
    const received = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("SOCIAL_REALTIME_TIMEOUT")), 2_000);
      void listenerSql.listen(SOCIAL_POSTGRES_CHANNEL, (payload) => {
        clearTimeout(timeout);
        resolve(payload);
      }).then(() => new PostgresRealtimeProvider(sql).publish(geoCell, realtimeEvent));
    });
    await expect(received).resolves.toContain(mapDiscussion.id);

    const forbiddenColumns = await sql<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name LIKE 'social_%'
        AND regexp_replace(lower(column_name), '[^a-z]', '', 'g') = ANY(${sql.array([
          "latitude", "longitude", "accuracy", "gps", "locationhistory", "previouscells", "userlocation", "authorlocation",
        ])})
    `;
    expect(forbiddenColumns).toEqual([]);
  }, 15_000);
});
