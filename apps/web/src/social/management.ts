import type { Sql } from "postgres";
import type { SocialActor } from "./domain";

export type SocialRelation = "BLOCK" | "MUTE";

export class PostgresSocialManagementRepository {
  constructor(private readonly _sql: Sql) {}

  async removeOwnDiscussion(actor: SocialActor, discussionId: string) {
    return this._sql.begin(async (tx) => {
      await tx`SELECT set_config('app.social_user_id', ${actor.userId}, true)`;
      const rows = await tx<Array<{ id: string; geo_query_cell: string | null; updated_at: Date }>>`
        UPDATE social_discussions SET status = 'REMOVED', updated_at = now()
        WHERE id = ${discussionId} AND author_id = ${actor.userId} AND status = 'ACTIVE'
        RETURNING id, geo_query_cell, updated_at
      `;
      return rows[0] || null;
    });
  }

  async removeOwnComment(actor: SocialActor, commentId: string) {
    return this._sql.begin(async (tx) => {
      await tx`SELECT set_config('app.social_user_id', ${actor.userId}, true)`;
      const rows = await tx<Array<{ id: string; discussion_id: string }>>`
        UPDATE social_comments SET status = 'REMOVED', body = '[deleted]', updated_at = now()
        WHERE id = ${commentId} AND author_id = ${actor.userId} AND status = 'ACTIVE'
        RETURNING id, discussion_id
      `;
      const removed = rows[0];
      if (!removed) return null;
      const discussions = await tx<Array<{ geo_query_cell: string | null; updated_at: Date }>>`
        SELECT geo_query_cell, updated_at FROM social_discussions WHERE id = ${removed.discussion_id}
      `;
      return {
        ...removed,
        queryCell: discussions[0]?.geo_query_cell || null,
        version: `${discussions[0]?.updated_at.toISOString() || ""}:${removed.discussion_id}`,
      };
    });
  }

  async setRelation(actor: SocialActor, relation: SocialRelation, targetUserId: string, active: boolean) {
    if (targetUserId === actor.userId) throw new Error("SOCIAL_RELATION_SELF_FORBIDDEN");
    return this._sql.begin(async (tx) => {
      await tx`SELECT set_config('app.social_user_id', ${actor.userId}, true)`;
      const user = await tx<Array<{ id: string }>>`SELECT id FROM social_users WHERE id::text = ${targetUserId} AND status = 'ACTIVE'`;
      if (!user[0]) throw new Error("SOCIAL_USER_NOT_FOUND");
      if (relation === "BLOCK") {
        if (active) await tx`INSERT INTO social_blocks (blocker_id, blocked_id) VALUES (${actor.userId}, ${targetUserId}) ON CONFLICT DO NOTHING`;
        else await tx`DELETE FROM social_blocks WHERE blocker_id = ${actor.userId} AND blocked_id = ${targetUserId}`;
      } else {
        if (active) await tx`INSERT INTO social_mutes (muter_id, muted_id) VALUES (${actor.userId}, ${targetUserId}) ON CONFLICT DO NOTHING`;
        else await tx`DELETE FROM social_mutes WHERE muter_id = ${actor.userId} AND muted_id = ${targetUserId}`;
      }
      return { relation, targetUserId, active };
    });
  }

  async moderate(actor: SocialActor, targetType: "DISCUSSION" | "COMMENT" | "USER", targetId: string, action: "HIDE" | "REMOVE" | "RESTORE", reason: string) {
    if (!actor.roles.some((role) => role === "MODERATOR" || role === "ADMIN")) {
      throw new Error("SOCIAL_MODERATOR_REQUIRED");
    }
    return this._sql.begin(async (tx) => {
      await tx`SELECT set_config('app.social_user_id', ${actor.userId}, true)`;
      await tx`SELECT set_config('app.social_role', ${actor.roles[0] || "USER"}, true)`;
      let discussionId: string | null = null;
      let queryCell: string | null = null;
      let version: string | null = null;
      if (targetType === "DISCUSSION") {
        const status = action === "RESTORE" ? "ACTIVE" : action === "HIDE" ? "HIDDEN" : "REMOVED";
        const rows = await tx<Array<{ id: string; geo_query_cell: string | null; updated_at: Date }>>`
          UPDATE social_discussions SET status = ${status}, updated_at = now()
          WHERE id = ${targetId}
          RETURNING id, geo_query_cell, updated_at
        `;
        if (!rows[0]) throw new Error("SOCIAL_MODERATION_TARGET_NOT_FOUND");
        discussionId = rows[0].id;
        queryCell = rows[0].geo_query_cell;
        version = `${rows[0].updated_at.toISOString()}:${rows[0].id}`;
      } else if (targetType === "COMMENT") {
        const status = action === "RESTORE" ? "ACTIVE" : action === "HIDE" ? "HIDDEN" : "REMOVED";
        const rows = await tx<Array<{ id: string; discussion_id: string }>>`
          UPDATE social_comments SET status = ${status}, updated_at = now()
          WHERE id = ${targetId}
          RETURNING id, discussion_id
        `;
        if (!rows[0]) throw new Error("SOCIAL_MODERATION_TARGET_NOT_FOUND");
        const discussions = await tx<Array<{ id: string; geo_query_cell: string | null; updated_at: Date }>>`
          SELECT id, geo_query_cell, updated_at FROM social_discussions WHERE id = ${rows[0].discussion_id}
        `;
        discussionId = discussions[0]?.id || null;
        queryCell = discussions[0]?.geo_query_cell || null;
        version = discussionId ? `${discussions[0]?.updated_at.toISOString() || ""}:${discussionId}` : null;
      } else {
        const status = action === "RESTORE" ? "ACTIVE" : "SUSPENDED";
        const rows = await tx<Array<{ id: string }>>`UPDATE social_users SET status = ${status}, updated_at = now() WHERE id::text = ${targetId} RETURNING id`;
        if (!rows[0]) throw new Error("SOCIAL_MODERATION_TARGET_NOT_FOUND");
      }
      const rows = await tx<Array<{ id: string; created_at: Date }>>`
        INSERT INTO social_moderation_actions (actor_id, target_type, target_id, action, reason)
        VALUES (${actor.userId}, ${targetType}, ${targetId}, ${action}, ${reason})
        RETURNING id, created_at
      `;
      return {
        id: rows[0].id,
        createdAt: rows[0].created_at.toISOString(),
        discussionId,
        queryCell,
        version,
      };
    });
  }

  async deleteAccount(actor: SocialActor) {
    const anonymizedId = `deleted-${crypto.randomUUID()}`;
    await this._sql.begin(async (tx) => {
      await tx`UPDATE social_discussions SET author_id = ${anonymizedId} WHERE author_id = ${actor.userId}`;
      await tx`UPDATE social_comments SET author_id = ${anonymizedId} WHERE author_id = ${actor.userId}`;
      await tx`UPDATE social_reports SET reporter_id = ${anonymizedId} WHERE reporter_id = ${actor.userId}`;
      await tx`UPDATE social_moderation_actions SET actor_id = ${anonymizedId} WHERE actor_id = ${actor.userId}`;
      await tx`DELETE FROM social_votes WHERE user_id = ${actor.userId}`;
      await tx`DELETE FROM social_blocks WHERE blocker_id = ${actor.userId} OR blocked_id = ${actor.userId}`;
      await tx`DELETE FROM social_mutes WHERE muter_id = ${actor.userId} OR muted_id = ${actor.userId}`;
      await tx`DELETE FROM social_user_rate_limits WHERE user_id = ${actor.userId}`;
      await tx`DELETE FROM social_user_profiles WHERE user_id = ${actor.userId}`;
      await tx`DELETE FROM social_sessions WHERE user_id::text = ${actor.userId}`;
      await tx`DELETE FROM social_users WHERE id::text = ${actor.userId}`;
    });
    return anonymizedId;
  }
}
