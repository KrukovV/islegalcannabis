import process from "node:process";
import postgres from "postgres";

const databaseUrl = process.env.SOCIAL_DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("SOCIAL_DATABASE_NOT_CONFIGURED");
const sql = postgres(databaseUrl, { max: 1, prepare: false });

try {
  const expired = await sql`
    WITH batch AS (
      SELECT id FROM social_discussions
      WHERE type = 'MAP' AND status = 'ACTIVE' AND expires_at <= now()
      ORDER BY expires_at ASC
      LIMIT 500
      FOR UPDATE SKIP LOCKED
    )
    UPDATE social_discussions discussions
    SET status = 'EXPIRED', updated_at = now()
    FROM batch WHERE discussions.id = batch.id
    RETURNING discussions.id
  `;
  const sessions = await sql`
    DELETE FROM social_sessions
    WHERE expires_at < now() - interval '7 days' OR revoked_at < now() - interval '7 days'
    RETURNING id
  `;
  const dmExpired = await sql`
    WITH batch AS (
      SELECT id FROM dm_relay_envelopes
      WHERE expires_at <= now() AND status NOT IN ('EXPIRED', 'FAILED_PERMANENT')
      ORDER BY expires_at ASC
      LIMIT 500
      FOR UPDATE SKIP LOCKED
    )
    UPDATE dm_relay_envelopes envelopes
    SET status = 'EXPIRED'
    FROM batch WHERE envelopes.id = batch.id
    RETURNING envelopes.id
  `;
  const dmPruned = await sql`
    DELETE FROM dm_relay_envelopes
    WHERE (status = 'READ' AND read_at < now() - interval '24 hours')
       OR (status IN ('EXPIRED', 'FAILED_PERMANENT') AND expires_at < now() - interval '7 days')
    RETURNING id
  `;
  const dmChallenges = await sql`
    DELETE FROM dm_device_challenges
    WHERE expires_at < now() - interval '1 day' OR consumed_at < now() - interval '1 day'
    RETURNING id
  `;
  await sql`DELETE FROM dm_delivery_attempts WHERE created_at < now() - interval '8 days'`;
  await sql`DELETE FROM social_user_rate_limits WHERE window_start < now() - interval '1 day'`;
  await sql`DELETE FROM social_cell_rate_limits WHERE window_start < now() - interval '1 day'`;
  process.stdout.write(`SOCIAL_CLEANUP_OK=1 map_expired=${expired.length} sessions_removed=${sessions.length} dm_expired=${dmExpired.length} dm_pruned=${dmPruned.length} dm_challenges_removed=${dmChallenges.length}\n`);
} finally {
  await sql.end({ timeout: 5 });
}
