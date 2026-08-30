import { randomUUID } from "node:crypto";
import process from "node:process";
import postgres from "postgres";

const databaseUrl = process.env.SOCIAL_DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("SOCIAL_DATABASE_NOT_CONFIGURED");

const sql = postgres(databaseUrl, { max: 1, prepare: false });
const ROLLBACK_AFTER_SMOKE = Symbol("ROLLBACK_AFTER_SMOKE");
let result = null;

function required(condition, code) {
  if (!condition) throw new Error(code);
}

try {
  const migrations = await sql`SELECT version FROM social_schema_migrations ORDER BY version`;
  for (const version of [
    "20260814_social_layer",
    "20260814_social_authorization",
    "20260814_social_public_slice",
    "20260814_dm_candidate",
    "20260814_dm_candidate_hardening",
  ]) {
    required(migrations.some((row) => row.version === version), `SOCIAL_MIGRATION_MISSING:${version}`);
  }

  const forbiddenLocationColumns = await sql`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (table_name LIKE 'social_%' OR table_name LIKE 'dm_%')
      AND column_name ~* '(latitude|longitude|accuracy|location_history|previous_cells|current_area|last_seen_location)'
  `;
  required(forbiddenLocationColumns.length === 0, "SOCIAL_RAW_LOCATION_SCHEMA_PRESENT");

  const rlsTables = await sql`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN (
        'social_discussions', 'social_comments', 'social_votes', 'social_reports', 'social_blocks', 'social_mutes',
        'dm_device_challenges', 'dm_devices', 'dm_relay_envelopes', 'dm_delivery_attempts'
      )
      AND rowsecurity = true
  `;
  required(rlsTables.length === 10, "SOCIAL_RLS_NOT_ENABLED");

  try {
    await sql.begin(async (tx) => {
      const suffix = randomUUID().slice(0, 12);
      const users = await tx`
        INSERT INTO social_users (display_name, display_name_key)
        VALUES (${`smoke-a-${suffix}`}, ${`smoke-a-${suffix}`}), (${`smoke-b-${suffix}`}, ${`smoke-b-${suffix}`})
        RETURNING id, display_name
      `;
      const [author, responder] = users;
      required(Boolean(author && responder), "SOCIAL_SMOKE_USERS_MISSING");

      await tx`SELECT set_config('app.social_user_id', ${author.id}, true)`;
      await tx`
        INSERT INTO social_user_profiles (user_id, display_name)
        VALUES (${author.id}, ${author.display_name})
      `;
      await tx`SELECT set_config('app.social_user_id', ${responder.id}, true)`;
      await tx`
        INSERT INTO social_user_profiles (user_id, display_name)
        VALUES (${responder.id}, ${responder.display_name})
      `;

      await tx`SELECT set_config('app.social_user_id', ${author.id}, true)`;
      const discussions = await tx`
        INSERT INTO social_discussions (
          type, author_id, geo_cell, geo_resolution, geo_query_cell, body, expires_at
        ) VALUES (
          'MAP', ${author.id}, '8428309ffffffff', 4, '8428309ffffffff', 'transactional Social smoke discussion', now() + interval '24 hours'
        )
        RETURNING id, expires_at
      `;
      const discussion = discussions[0];
      required(Boolean(discussion), "SOCIAL_SMOKE_DISCUSSION_MISSING");

      await tx`
        INSERT INTO social_discussions (
          type, author_id, geo_cell, geo_resolution, geo_query_cell, body, created_at, updated_at, expires_at
        ) VALUES (
          'MAP', ${author.id}, '8428309ffffffff', 4, '8428309ffffffff', 'expired transactional Social smoke discussion',
          now() - interval '25 hours', now() - interval '25 hours', now() - interval '1 hour'
        )
      `;

      await tx`SELECT set_config('app.social_user_id', ${responder.id}, true)`;
      await tx`
        INSERT INTO social_comments (discussion_id, author_id, body)
        VALUES (${discussion.id}, ${responder.id}, 'transactional Social smoke comment')
      `;
      await tx`
        INSERT INTO social_votes (target_type, target_id, user_id, value)
        VALUES ('DISCUSSION', ${discussion.id}, ${responder.id}, 1)
      `;

      const aggregate = await tx`
        SELECT reply_count, vote_score, expires_at > now() AS visible
        FROM social_discussions
        WHERE id = ${discussion.id}
      `;
      required(aggregate[0]?.reply_count === 1, "SOCIAL_REPLY_COUNT_TRIGGER_FAILED");
      required(aggregate[0]?.vote_score === 1, "SOCIAL_VOTE_SCORE_TRIGGER_FAILED");
      required(aggregate[0]?.visible === true, "SOCIAL_ACTIVE_MAP_VISIBILITY_FAILED");

      const expiredVisible = await tx`
        SELECT COUNT(*)::integer AS count
        FROM social_discussions
        WHERE author_id = ${author.id}
          AND type = 'MAP'
          AND status = 'ACTIVE'
          AND expires_at > now()
      `;
      required(expiredVisible[0]?.count === 1, "SOCIAL_EXPIRED_MAP_DISCUSSION_VISIBLE");

      const publicKey = "a".repeat(64);
      const messageId = "b".repeat(64);
      const devices = await tx`
        INSERT INTO dm_devices (user_id, messaging_public_key, device_label)
        VALUES (${responder.id}, ${publicKey}, 'transactional DM smoke device')
        RETURNING id
      `;
      await tx`
        INSERT INTO dm_relay_envelopes (
          message_id, recipient_device_id, recipient_public_key, gift_wrap, receipt_hash, expires_at
        ) VALUES (
          ${messageId}, ${devices[0].id}, ${publicKey},
          ${tx.json({ kind: 1059, tags: [["p", publicKey]], content: "A".repeat(132) })},
          ${"c".repeat(64)}, now() + interval '1 hour'
        )
      `;
      const dmRelay = await tx`
        SELECT status, gift_wrap::text LIKE '%transactional DM smoke%' AS leaked
        FROM dm_relay_envelopes WHERE message_id = ${messageId}
      `;
      required(dmRelay[0]?.status === "TRANSPORT_ACCEPTED", "DM_RELAY_INSERT_FAILED");
      required(dmRelay[0]?.leaked === false, "DM_RELAY_PLAINTEXT_LEAKED");

      result = {
        migrations: migrations.length,
        rlsTables: rlsTables.length,
        replyCount: aggregate[0].reply_count,
        voteScore: aggregate[0].vote_score,
        expiredRowsVisible: expiredVisible[0].count,
        dmRelayCiphertextOnly: true,
      };
      throw ROLLBACK_AFTER_SMOKE;
    });
  } catch (error) {
    if (error !== ROLLBACK_AFTER_SMOKE) throw error;
  }

  required(result !== null, "SOCIAL_SMOKE_RESULT_MISSING");
  process.stdout.write(`SOCIAL_DB_SMOKE_OK=1 migrations=${result.migrations} rls_tables=${result.rlsTables} reply_count=${result.replyCount} vote_score=${result.voteScore} expired_rows_visible=${result.expiredRowsVisible} dm_relay_ciphertext_only=${result.dmRelayCiphertextOnly ? 1 : 0} rollback=1 raw_gps_columns=0\n`);
} finally {
  await sql.end({ timeout: 5 });
}
