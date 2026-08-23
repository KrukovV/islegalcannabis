ALTER TABLE social_discussions
  ADD CONSTRAINT social_map_visibility_hard_max CHECK (
    type <> 'MAP'
    OR (expires_at IS NOT NULL AND expires_at <= created_at + interval '72 hours')
  );

-- Replies count as activity and may extend active MAP visibility, but never
-- beyond the 72-hour hard cap measured from original creation.
CREATE OR REPLACE FUNCTION social_refresh_reply_count() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  changed_discussion uuid := COALESCE(NEW.discussion_id, OLD.discussion_id);
BEGIN
  UPDATE social_discussions
  SET reply_count = (
    SELECT COUNT(*)::integer FROM social_comments
    WHERE discussion_id = changed_discussion AND status = 'ACTIVE'
  ),
  updated_at = now(),
  expires_at = CASE
    WHEN type = 'MAP' THEN LEAST(created_at + interval '72 hours', GREATEST(expires_at, now() + interval '24 hours'))
    ELSE expires_at
  END
  WHERE id = changed_discussion;
  RETURN NULL;
END;
$$;

CREATE INDEX social_comments_parent_idx ON social_comments (parent_comment_id)
  WHERE parent_comment_id IS NOT NULL;
CREATE INDEX social_reports_target_idx ON social_reports (target_type, target_id, created_at DESC);
CREATE INDEX social_moderation_target_idx ON social_moderation_actions (target_type, target_id, created_at DESC);
