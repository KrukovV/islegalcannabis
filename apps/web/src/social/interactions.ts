import type { Sql } from "postgres";
import type { Comment, Report, SocialActor } from "./domain";

type CommentRow = {
  id: string;
  discussion_id: string;
  author_id: string;
  author_display_name: string | null;
  parent_comment_id: string | null;
  body: string;
  status: Comment["status"];
  vote_score: number;
  created_at: Date;
  updated_at: Date;
};

function toComment(row: CommentRow): Comment {
  return {
    id: row.id,
    discussionId: row.discussion_id,
    authorId: row.author_id,
    authorDisplayName: row.author_display_name || "Community member",
    parentCommentId: row.parent_comment_id,
    body: row.body,
    status: row.status,
    voteScore: Number(row.vote_score),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function validateCommentBody(value: unknown) {
  if (typeof value !== "string") throw new Error("SOCIAL_COMMENT_BODY_INVALID");
  const body = value.normalize("NFKC").trim();
  if (body.length < 1 || body.length > 8_000 || /\p{C}/u.test(body)) {
    throw new Error("SOCIAL_COMMENT_BODY_INVALID");
  }
  return body;
}

export class PostgresSocialInteractionRepository {
  constructor(private readonly _sql: Sql) {}

  async listComments(discussionId: string, cursor: string | null, limit: number, viewerId: string | null = null) {
    const safeCursor = cursor && Number.isFinite(Date.parse(cursor)) ? cursor : null;
    const rows = await this._sql<CommentRow[]>`
      SELECT comments.id, comments.discussion_id, comments.author_id,
        users.display_name AS author_display_name, comments.parent_comment_id,
        comments.body, comments.status, comments.vote_score,
        comments.created_at, comments.updated_at
      FROM social_comments comments
      LEFT JOIN social_users users ON users.id::text = comments.author_id
      WHERE comments.discussion_id = ${discussionId}
        AND comments.status = 'ACTIVE'
        AND (${safeCursor}::timestamptz IS NULL OR comments.created_at > ${safeCursor}::timestamptz)
        AND NOT EXISTS (
          SELECT 1 FROM social_blocks
          WHERE blocker_id = ${viewerId} AND blocked_id = comments.author_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM social_mutes
          WHERE muter_id = ${viewerId} AND muted_id = comments.author_id
        )
      ORDER BY comments.created_at ASC, comments.id ASC
      LIMIT ${Math.min(Math.max(limit, 1), 100)}
    `;
    return rows.map(toComment);
  }

  async createComment(actor: SocialActor & { displayName?: string }, discussionId: string, parentCommentId: string | null, body: string) {
    return this._sql.begin(async (tx) => {
      await tx`SELECT set_config('app.social_user_id', ${actor.userId}, true)`;
      const target = await tx<Array<{ id: string }>>`
        SELECT id FROM social_discussions
        WHERE id = ${discussionId} AND status = 'ACTIVE' AND (expires_at IS NULL OR expires_at > now())
        LIMIT 1
      `;
      if (!target[0]) throw new Error("SOCIAL_DISCUSSION_NOT_FOUND");
      if (parentCommentId) {
        const parent = await tx<Array<{ id: string }>>`
          SELECT id FROM social_comments
          WHERE id = ${parentCommentId} AND discussion_id = ${discussionId} AND status = 'ACTIVE'
          LIMIT 1
        `;
        if (!parent[0]) throw new Error("SOCIAL_PARENT_COMMENT_INVALID");
      }
      const rows = await tx<CommentRow[]>`
        INSERT INTO social_comments (discussion_id, author_id, parent_comment_id, body)
        VALUES (${discussionId}, ${actor.userId}, ${parentCommentId}, ${body})
        RETURNING id, discussion_id, author_id, ${actor.displayName || "Community member"}::text AS author_display_name, parent_comment_id, body, status,
          vote_score, created_at, updated_at
      `;
      const discussions = await tx<Array<{ geo_query_cell: string | null; updated_at: Date }>>`
        SELECT geo_query_cell, updated_at FROM social_discussions WHERE id = ${discussionId}
      `;
      return {
        comment: toComment(rows[0]),
        queryCell: discussions[0]?.geo_query_cell || null,
        version: `${discussions[0]?.updated_at.toISOString() || ""}:${discussionId}`,
      };
    });
  }

  async setVote(actor: SocialActor, targetType: "DISCUSSION" | "COMMENT", targetId: string, value: -1 | 0 | 1) {
    return this._sql.begin(async (tx) => {
      await tx`SELECT set_config('app.social_user_id', ${actor.userId}, true)`;
      const exists = targetType === "DISCUSSION"
        ? await tx<Array<{ id: string }>>`SELECT id FROM social_discussions WHERE id = ${targetId} AND status = 'ACTIVE' AND (expires_at IS NULL OR expires_at > now())`
        : await tx<Array<{ id: string }>>`SELECT id FROM social_comments WHERE id = ${targetId} AND status = 'ACTIVE'`;
      if (!exists[0]) throw new Error("SOCIAL_VOTE_TARGET_NOT_FOUND");
      if (value === 0) {
        await tx`DELETE FROM social_votes WHERE target_type = ${targetType} AND target_id = ${targetId} AND user_id = ${actor.userId}`;
      } else {
        await tx`
          INSERT INTO social_votes (target_type, target_id, user_id, value)
          VALUES (${targetType}, ${targetId}, ${actor.userId}, ${value})
          ON CONFLICT (target_type, target_id, user_id) DO UPDATE
          SET value = EXCLUDED.value, updated_at = now()
        `;
      }
      const rows = targetType === "DISCUSSION"
        ? await tx<Array<{ vote_score: number; discussion_id: string; geo_query_cell: string | null; updated_at: Date }>>`
          SELECT vote_score, id AS discussion_id, geo_query_cell, updated_at
          FROM social_discussions WHERE id = ${targetId}
        `
        : await tx<Array<{ vote_score: number; discussion_id: string; geo_query_cell: string | null; updated_at: Date }>>`
          SELECT comments.vote_score, discussions.id AS discussion_id, discussions.geo_query_cell, discussions.updated_at
          FROM social_comments comments
          JOIN social_discussions discussions ON discussions.id = comments.discussion_id
          WHERE comments.id = ${targetId}
        `;
      const updated = rows[0];
      if (!updated) throw new Error("SOCIAL_VOTE_TARGET_NOT_FOUND");
      return {
        voteScore: Number(updated.vote_score),
        discussionId: updated.discussion_id,
        queryCell: updated.geo_query_cell,
        version: `${updated.updated_at.toISOString()}:${updated.discussion_id}`,
      };
    });
  }

  async createReport(actor: SocialActor, targetType: Report["targetType"], targetId: string, reason: string) {
    return this._sql.begin(async (tx) => {
      await tx`SELECT set_config('app.social_user_id', ${actor.userId}, true)`;
      const rows = await tx<Array<{ id: string; created_at: Date }>>`
        INSERT INTO social_reports (reporter_id, target_type, target_id, reason)
        VALUES (${actor.userId}, ${targetType}, ${targetId}, ${reason})
        RETURNING id, created_at
      `;
      return { id: rows[0].id, createdAt: rows[0].created_at.toISOString() };
    });
  }
}
