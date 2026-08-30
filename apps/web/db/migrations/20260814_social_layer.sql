-- Social durable truth. No author location, raw GPS, accuracy or movement history
-- columns are permitted in this schema.
CREATE TABLE IF NOT EXISTS social_schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE social_discussion_type AS ENUM ('MAP', 'GEO', 'NEWS', 'LAW', 'EVENT');
CREATE TYPE social_content_status AS ENUM ('ACTIVE', 'HIDDEN', 'REMOVED', 'QUARANTINED', 'EXPIRED');
CREATE TYPE social_space_kind AS ENUM ('SYSTEM', 'COMMUNITY', 'PRIVATE_GROUP');

-- Project-owned pseudonymous identities. Session tokens are random 256-bit
-- bearer credentials; only their SHA-256 digests are stored.
CREATE TABLE social_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  display_name_key text NOT NULL UNIQUE,
  role text NOT NULL DEFAULT 'USER' CHECK (role IN ('USER', 'MODERATOR', 'ADMIN')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DELETED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (char_length(display_name) BETWEEN 2 AND 40)
);

CREATE TABLE social_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES social_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (char_length(token_hash) = 64)
);
CREATE INDEX social_sessions_active_idx ON social_sessions (token_hash, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE social_user_profiles (
  user_id text PRIMARY KEY,
  display_name text,
  bio text,
  discoverable_nearby boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- COMMUNITY creation remains disabled until its separate authorization policy
-- exists. SYSTEM spaces are never user-owned.
CREATE TABLE social_communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind social_space_kind NOT NULL,
  system_key text UNIQUE,
  owner_id text,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (kind = 'SYSTEM' AND owner_id IS NULL AND system_key IS NOT NULL)
    OR (kind IN ('COMMUNITY', 'PRIVATE_GROUP') AND owner_id IS NOT NULL AND system_key IS NULL)
  )
);

CREATE TABLE social_community_members (
  community_id uuid NOT NULL REFERENCES social_communities(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('MEMBER', 'MODERATOR', 'OWNER')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, user_id)
);

CREATE TABLE social_discussions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type social_discussion_type NOT NULL,
  author_id text NOT NULL,
  space_kind social_space_kind NOT NULL DEFAULT 'SYSTEM',
  community_id uuid REFERENCES social_communities(id) ON DELETE RESTRICT,
  geo_id text,
  geo_cell text,
  geo_resolution smallint,
  geo_query_cell text,
  -- Exact post locations are intentionally absent from this first slice. A
  -- future explicit-place feature can add PostGIS only when it is truly used.
  law_id text,
  news_id text,
  source_id text,
  title text,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 8000),
  language text NOT NULL DEFAULT 'und',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  status social_content_status NOT NULL DEFAULT 'ACTIVE',
  reply_count integer NOT NULL DEFAULT 0 CHECK (reply_count >= 0),
  vote_score integer NOT NULL DEFAULT 0,
  CONSTRAINT social_map_requires_cell CHECK (
    (type = 'MAP' AND geo_cell IS NOT NULL AND geo_resolution IS NOT NULL AND geo_query_cell IS NOT NULL)
    OR (type <> 'MAP' AND geo_cell IS NULL AND geo_resolution IS NULL AND geo_query_cell IS NULL)
  ),
  CONSTRAINT social_geo_resolution_is_privacy_bounded CHECK (
    geo_resolution IS NULL OR geo_resolution BETWEEN 4 AND 6
  ),
  CONSTRAINT social_discussion_space_consistency CHECK (
    (space_kind = 'SYSTEM' AND community_id IS NULL)
    OR (space_kind IN ('COMMUNITY', 'PRIVATE_GROUP') AND community_id IS NOT NULL)
  ),
  CONSTRAINT social_persistent_types_do_not_expire CHECK (
    (type IN ('GEO', 'NEWS', 'LAW') AND expires_at IS NULL)
    OR type IN ('MAP', 'EVENT')
  )
);

CREATE INDEX social_discussions_geo_query_active_idx ON social_discussions (geo_query_cell, created_at DESC)
  WHERE status = 'ACTIVE';
CREATE INDEX social_discussions_geo_cell_idx ON social_discussions (geo_cell);
CREATE INDEX social_discussions_geo_id_idx ON social_discussions (geo_id);
CREATE INDEX social_discussions_type_created_idx ON social_discussions (type, created_at DESC);
CREATE INDEX social_discussions_expiry_idx ON social_discussions (expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX social_discussions_law_idx ON social_discussions (law_id) WHERE law_id IS NOT NULL;
CREATE INDEX social_discussions_news_idx ON social_discussions (news_id) WHERE news_id IS NOT NULL;
CREATE INDEX social_discussions_status_idx ON social_discussions (status);
CREATE INDEX social_discussions_community_idx ON social_discussions (community_id) WHERE community_id IS NOT NULL;

CREATE TABLE social_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discussion_id uuid NOT NULL REFERENCES social_discussions(id) ON DELETE CASCADE,
  author_id text NOT NULL,
  parent_comment_id uuid REFERENCES social_comments(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 8000),
  status social_content_status NOT NULL DEFAULT 'ACTIVE',
  vote_score integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX social_comments_discussion_created_idx ON social_comments (discussion_id, created_at);

CREATE TABLE social_votes (
  target_type text NOT NULL CHECK (target_type IN ('DISCUSSION', 'COMMENT')),
  target_id uuid NOT NULL,
  user_id text NOT NULL,
  value smallint NOT NULL CHECK (value IN (-1, 1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (target_type, target_id, user_id)
);
CREATE INDEX social_votes_target_idx ON social_votes (target_type, target_id);

CREATE OR REPLACE FUNCTION social_refresh_vote_score() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  changed_type text := COALESCE(NEW.target_type, OLD.target_type);
  changed_id uuid := COALESCE(NEW.target_id, OLD.target_id);
  score integer;
BEGIN
  SELECT COALESCE(SUM(value), 0)::integer INTO score
  FROM social_votes WHERE target_type = changed_type AND target_id = changed_id;
  IF changed_type = 'DISCUSSION' THEN
    UPDATE social_discussions SET vote_score = score, updated_at = now() WHERE id = changed_id;
  ELSE
    UPDATE social_comments SET vote_score = score, updated_at = now() WHERE id = changed_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER social_votes_refresh_score
AFTER INSERT OR UPDATE OR DELETE ON social_votes
FOR EACH ROW EXECUTE FUNCTION social_refresh_vote_score();

CREATE OR REPLACE FUNCTION social_refresh_reply_count() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  changed_discussion uuid := COALESCE(NEW.discussion_id, OLD.discussion_id);
BEGIN
  UPDATE social_discussions
  SET reply_count = (
    SELECT COUNT(*)::integer FROM social_comments
    WHERE discussion_id = changed_discussion AND status = 'ACTIVE'
  ), updated_at = now()
  WHERE id = changed_discussion;
  RETURN NULL;
END;
$$;

CREATE TRIGGER social_comments_refresh_reply_count
AFTER INSERT OR UPDATE OF status OR DELETE ON social_comments
FOR EACH ROW EXECUTE FUNCTION social_refresh_reply_count();

CREATE TABLE social_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id text NOT NULL,
  target_type text NOT NULL CHECK (target_type IN ('DISCUSSION', 'COMMENT', 'USER')),
  target_id text NOT NULL,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE social_blocks (
  blocker_id text NOT NULL,
  blocked_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE TABLE social_mutes (
  muter_id text NOT NULL,
  muted_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (muter_id, muted_id),
  CHECK (muter_id <> muted_id)
);

CREATE TABLE social_moderation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id text NOT NULL,
  target_type text NOT NULL CHECK (target_type IN ('DISCUSSION', 'COMMENT', 'USER')),
  target_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('HIDE', 'REMOVE', 'SUSPEND_TEMPORARY', 'SUSPEND_PERMANENT', 'RESTORE')),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Current-window counters deliberately avoid per-user geo history: user and
-- cell limits are stored in separate rows and old windows are overwritten.
CREATE TABLE social_user_rate_limits (
  user_id text NOT NULL,
  operation text NOT NULL,
  window_start timestamptz NOT NULL,
  event_count integer NOT NULL CHECK (event_count >= 0),
  PRIMARY KEY (user_id, operation)
);

CREATE TABLE social_cell_rate_limits (
  geo_query_cell text NOT NULL,
  operation text NOT NULL,
  window_start timestamptz NOT NULL,
  event_count integer NOT NULL CHECK (event_count >= 0),
  PRIMARY KEY (geo_query_cell, operation)
);

CREATE OR REPLACE FUNCTION social_actor_id() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.social_user_id', true), '')
$$;

ALTER TABLE social_user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_community_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_discussions ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_mutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_moderation_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY social_public_active_discussions_read ON social_discussions
  FOR SELECT USING (status = 'ACTIVE' AND (expires_at IS NULL OR expires_at > now()));

CREATE POLICY social_public_active_comments_read ON social_comments
  FOR SELECT USING (
    status = 'ACTIVE' AND EXISTS (
      SELECT 1 FROM social_discussions
      WHERE social_discussions.id = social_comments.discussion_id
        AND social_discussions.status = 'ACTIVE'
        AND (social_discussions.expires_at IS NULL OR social_discussions.expires_at > now())
    )
  );

CREATE POLICY social_profiles_self_read ON social_user_profiles
  FOR SELECT USING (user_id = social_actor_id());
CREATE POLICY social_profiles_self_insert ON social_user_profiles
  FOR INSERT WITH CHECK (user_id = social_actor_id());
CREATE POLICY social_profiles_self_update ON social_user_profiles
  FOR UPDATE USING (user_id = social_actor_id()) WITH CHECK (user_id = social_actor_id());

CREATE POLICY social_discussions_identity_insert ON social_discussions
  FOR INSERT WITH CHECK (author_id = social_actor_id());
CREATE POLICY social_discussions_author_update ON social_discussions
  FOR UPDATE USING (author_id = social_actor_id()) WITH CHECK (author_id = social_actor_id());
CREATE POLICY social_discussions_author_delete ON social_discussions
  FOR DELETE USING (author_id = social_actor_id());

CREATE POLICY social_comments_identity_insert ON social_comments
  FOR INSERT WITH CHECK (author_id = social_actor_id());
CREATE POLICY social_comments_author_update ON social_comments
  FOR UPDATE USING (author_id = social_actor_id()) WITH CHECK (author_id = social_actor_id());
CREATE POLICY social_comments_author_delete ON social_comments
  FOR DELETE USING (author_id = social_actor_id());

CREATE POLICY social_votes_identity_all ON social_votes
  FOR ALL USING (user_id = social_actor_id()) WITH CHECK (user_id = social_actor_id());
CREATE POLICY social_votes_public_read ON social_votes
  FOR SELECT USING (
    (target_type = 'DISCUSSION' AND EXISTS (
      SELECT 1 FROM social_discussions
      WHERE id = target_id AND status = 'ACTIVE' AND (expires_at IS NULL OR expires_at > now())
    ))
    OR (target_type = 'COMMENT' AND EXISTS (
      SELECT 1 FROM social_comments
      WHERE id = target_id AND status = 'ACTIVE'
    ))
  );
CREATE POLICY social_reports_identity_insert ON social_reports
  FOR INSERT WITH CHECK (reporter_id = social_actor_id());
CREATE POLICY social_blocks_identity_all ON social_blocks
  FOR ALL USING (blocker_id = social_actor_id()) WITH CHECK (blocker_id = social_actor_id());
CREATE POLICY social_mutes_identity_all ON social_mutes
  FOR ALL USING (muter_id = social_actor_id()) WITH CHECK (muter_id = social_actor_id());

INSERT INTO social_schema_migrations (version)
VALUES ('20260814_social_layer')
ON CONFLICT (version) DO NOTHING;
