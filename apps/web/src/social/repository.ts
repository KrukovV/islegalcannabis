import type { Sql } from "postgres";
import type { Discussion, MapDiscussionActivity } from "./domain";
import type { SocialDiscussionRepository } from "./providers";

type DiscussionRow = {
  id: string;
  type: Discussion["type"];
  author_id: string;
  author_display_name: string | null;
  geo_id: string | null;
  geo_cell: string | null;
  geo_resolution: number | null;
  geo_query_cell: string | null;
  law_id: string | null;
  news_id: string | null;
  source_id: string | null;
  title: string | null;
  body: string;
  language: string;
  created_at: Date;
  updated_at: Date;
  expires_at: Date | null;
  status: Discussion["status"];
  reply_count: number;
  vote_score: number;
};

function dateValue(value: Date | string | null) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toDiscussion(row: DiscussionRow): Discussion {
  return {
    id: row.id,
    type: row.type,
    authorId: row.author_id,
    authorDisplayName: row.author_display_name || "Community member",
    geoId: row.geo_id,
    geo: row.geo_cell && row.geo_resolution !== null && row.geo_query_cell
      ? { geoCell: row.geo_cell, geoResolution: row.geo_resolution, geoQueryCell: row.geo_query_cell }
      : null,
    lawId: row.law_id,
    newsId: row.news_id,
    sourceId: row.source_id,
    title: row.title,
    body: row.body,
    language: row.language,
    createdAt: dateValue(row.created_at) || "",
    updatedAt: dateValue(row.updated_at) || "",
    expiresAt: dateValue(row.expires_at),
    status: row.status,
    replyCount: Number(row.reply_count),
    voteScore: Number(row.vote_score),
    version: `${dateValue(row.updated_at) || ""}:${row.id}`,
  };
}

export class PostgresSocialDiscussionRepository implements SocialDiscussionRepository {
  constructor(private readonly _sql: Sql) {}

  async listDiscussions(input: {
    type: Discussion["type"];
    queryCells?: string[];
    geoId?: string | null;
    lawId?: string | null;
    newsId?: string | null;
    viewerId?: string | null;
    cursor?: string | null;
    sort: "NEW" | "TOP";
    limit: number;
  }) {
    const cursor = input.cursor && Number.isFinite(Date.parse(input.cursor)) ? input.cursor : null;
    const rows = await this._sql<DiscussionRow[]>`
      SELECT discussions.id, discussions.type, discussions.author_id,
        users.display_name AS author_display_name, discussions.geo_id,
        discussions.geo_cell, discussions.geo_resolution, discussions.geo_query_cell,
        discussions.law_id, discussions.news_id, discussions.source_id,
        discussions.title, discussions.body, discussions.language,
        discussions.created_at, discussions.updated_at, discussions.expires_at,
        discussions.status, discussions.reply_count, discussions.vote_score
      FROM social_discussions discussions
      LEFT JOIN social_users users ON users.id::text = discussions.author_id
      WHERE discussions.type = ${input.type}
        AND discussions.status = 'ACTIVE'
        AND (discussions.expires_at IS NULL OR discussions.expires_at > now())
        AND (${cursor}::timestamptz IS NULL OR discussions.created_at < ${cursor}::timestamptz)
        AND NOT EXISTS (
          SELECT 1 FROM social_blocks
          WHERE blocker_id = ${input.viewerId || null} AND blocked_id = discussions.author_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM social_mutes
          WHERE muter_id = ${input.viewerId || null} AND muted_id = discussions.author_id
        )
        AND (
          (${input.type} = 'MAP' AND discussions.geo_query_cell = ANY(string_to_array(${(input.queryCells || []).join(",")}::text, ',')))
          OR (${input.type} = 'GEO' AND discussions.geo_id = ${input.geoId || null})
          OR (${input.type} = 'LAW' AND discussions.law_id = ${input.lawId || null})
          OR (${input.type} = 'NEWS' AND discussions.news_id = ${input.newsId || null})
          OR (${input.type} = 'EVENT' AND discussions.geo_id = ${input.geoId || null})
        )
      ORDER BY
        CASE WHEN ${input.sort} = 'TOP' THEN (discussions.vote_score * 4 + discussions.reply_count * 2) END DESC,
        discussions.created_at DESC,
        discussions.id DESC
      LIMIT ${Math.min(Math.max(input.limit, 1), 50)}
    `;
    return rows.map(toDiscussion);
  }

  async listActiveMapDiscussions(input: { queryCells: string[]; cursor?: string | null; limit: number }) {
    const rows = await this._sql<DiscussionRow[]>`
      SELECT discussions.id, discussions.type, discussions.author_id,
        users.display_name AS author_display_name, discussions.geo_id,
        discussions.geo_cell, discussions.geo_resolution, discussions.geo_query_cell,
        discussions.law_id, discussions.news_id, discussions.source_id,
        discussions.title, discussions.body, discussions.language,
        discussions.created_at, discussions.updated_at, discussions.expires_at,
        discussions.status, discussions.reply_count, discussions.vote_score
      FROM social_discussions discussions
      LEFT JOIN social_users users ON users.id::text = discussions.author_id
      WHERE discussions.type = 'MAP'
        AND discussions.status = 'ACTIVE'
        AND discussions.expires_at > now()
        AND discussions.geo_query_cell = ANY(string_to_array(${input.queryCells.join(",")}::text, ','))
      ORDER BY discussions.updated_at DESC, discussions.id DESC
      LIMIT ${Math.min(Math.max(input.limit, 1), 100)}
    `;
    return rows.map(toDiscussion);
  }

  async listActiveMapActivity(input: { queryCells: string[]; limit: number }): Promise<MapDiscussionActivity[]> {
    const rows = await this._sql<Array<{
      geo_cell: string;
      geo_resolution: number;
      active_discussion_count: number;
      latest_activity_at: Date;
    }>>`
      SELECT geo_cell, geo_resolution, COUNT(*)::integer AS active_discussion_count,
        MAX(updated_at) AS latest_activity_at
      FROM social_discussions
      WHERE type = 'MAP'
        AND status = 'ACTIVE'
        AND expires_at > now()
        AND geo_query_cell = ANY(string_to_array(${input.queryCells.join(",")}::text, ','))
      GROUP BY geo_cell, geo_resolution
      ORDER BY latest_activity_at DESC, active_discussion_count DESC, geo_cell ASC
      LIMIT ${Math.min(Math.max(input.limit, 1), 200)}
    `;
    return rows.map((row) => ({
      geoCell: row.geo_cell,
      geoResolution: Number(row.geo_resolution),
      activeDiscussionCount: Number(row.active_discussion_count),
      latestActivityAt: dateValue(row.latest_activity_at) || "",
    }));
  }

  async createDiscussion(input: Discussion) {
    return this._sql.begin(async (tx) => {
      await tx`SELECT set_config('app.social_user_id', ${input.authorId}, true)`;
      const rows = await tx<DiscussionRow[]>`
        INSERT INTO social_discussions (
          id, type, author_id, geo_id, geo_cell, geo_resolution, geo_query_cell,
          law_id, news_id, source_id, title, body, language, created_at, updated_at,
          expires_at, status, reply_count, vote_score
        ) VALUES (
          ${input.id}, ${input.type}, ${input.authorId}, ${input.geoId}, ${input.geo?.geoCell || null},
          ${input.geo?.geoResolution || null}, ${input.geo?.geoQueryCell || null}, ${input.lawId},
          ${input.newsId}, ${input.sourceId}, ${input.title}, ${input.body}, ${input.language},
          ${input.createdAt}, ${input.updatedAt}, ${input.expiresAt}, ${input.status},
          ${input.replyCount}, ${input.voteScore}
        )
        RETURNING id, type, author_id, NULL::text AS author_display_name, geo_id, geo_cell, geo_resolution, geo_query_cell,
          law_id, news_id, source_id, title, body, language, created_at, updated_at,
          expires_at, status, reply_count, vote_score
      `;
      return { ...toDiscussion(rows[0]), authorDisplayName: input.authorDisplayName };
    });
  }
}
