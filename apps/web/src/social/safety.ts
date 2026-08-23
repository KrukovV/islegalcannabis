import type { Sql, TransactionSql } from "postgres";
import type { Discussion, SocialActor } from "./domain";
import type { ModerationProvider, RateLimitProvider } from "./providers";

export class RuleModerationProvider implements ModerationProvider {
  async allowCreateDiscussion({ discussion }: { actor: SocialActor; discussion: Discussion }) {
    const body = discussion.body.normalize("NFKC");
    const linkCount = (body.match(/https?:\/\//gi) || []).length;
    if (linkCount > 4) return { allowed: false, code: "SOCIAL_TOO_MANY_LINKS" };
    if (/(.)\1{15,}/u.test(body)) return { allowed: false, code: "SOCIAL_REPETITIVE_CONTENT" };
    if (/\p{C}/u.test(body)) return { allowed: false, code: "SOCIAL_CONTROL_CHARACTER_FORBIDDEN" };
    return { allowed: true };
  }
}

type RateRow = { event_count: number };

export class PostgresRateLimitProvider implements RateLimitProvider {
  constructor(private readonly _sql: Sql) {}

  private async consumeUser(tx: TransactionSql, actor: SocialActor, operation: string, limit: number) {
      const users = await tx<RateRow[]>`
        INSERT INTO social_user_rate_limits (user_id, operation, window_start, event_count)
        VALUES (${actor.userId}, ${operation}, now(), 1)
        ON CONFLICT (user_id, operation) DO UPDATE SET
          window_start = CASE
            WHEN social_user_rate_limits.window_start < now() - interval '5 minutes' THEN now()
            ELSE social_user_rate_limits.window_start
          END,
          event_count = CASE
            WHEN social_user_rate_limits.window_start < now() - interval '5 minutes' THEN 1
            ELSE social_user_rate_limits.event_count + 1
          END
        RETURNING event_count
      `;
      return Number(users[0]?.event_count) <= limit;
  }

  async allowAction(actor: SocialActor, operation: "COMMENT_CREATE" | "VOTE" | "REPORT", limit: number) {
    const allowed = await this._sql.begin((tx) => this.consumeUser(tx, actor, operation, limit));
    return allowed ? { allowed: true } : { allowed: false, code: "SOCIAL_USER_RATE_LIMITED" };
  }

  async allowPrivateMessageSend(actor: SocialActor) {
    const allowed = await this._sql.begin((tx) => this.consumeUser(tx, actor, "DM_SEND", 60));
    return allowed ? { allowed: true } : { allowed: false, code: "DM_SEND_RATE_LIMITED" };
  }

  async allowDiscussionCreate({ actor, geoCell }: { actor: SocialActor; geoCell: string | null }) {
    return this._sql.begin(async (tx) => {
      const userAllowed = await this.consumeUser(tx, actor, "DISCUSSION_CREATE", 12);
      if (!userAllowed) return { allowed: false, code: "SOCIAL_USER_RATE_LIMITED" };
      if (!geoCell) return { allowed: true };
      const cells = await tx<RateRow[]>`
        INSERT INTO social_cell_rate_limits (geo_query_cell, operation, window_start, event_count)
        VALUES (${geoCell}, 'DISCUSSION_CREATE', now(), 1)
        ON CONFLICT (geo_query_cell, operation) DO UPDATE SET
          window_start = CASE
            WHEN social_cell_rate_limits.window_start < now() - interval '5 minutes' THEN now()
            ELSE social_cell_rate_limits.window_start
          END,
          event_count = CASE
            WHEN social_cell_rate_limits.window_start < now() - interval '5 minutes' THEN 1
            ELSE social_cell_rate_limits.event_count + 1
          END
        RETURNING event_count
      `;
      return Number(cells[0]?.event_count) > 120
        ? { allowed: false, code: "SOCIAL_CELL_RATE_LIMITED" }
        : { allowed: true };
    });
  }
}
