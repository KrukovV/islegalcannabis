CREATE POLICY social_profiles_public_read ON social_user_profiles
  FOR SELECT USING (true);

CREATE POLICY social_reports_moderator_read ON social_reports
  FOR SELECT USING (current_setting('app.social_role', true) IN ('MODERATOR', 'ADMIN'));

CREATE POLICY social_moderation_identity_insert ON social_moderation_actions
  FOR INSERT WITH CHECK (
    actor_id = social_actor_id()
    AND current_setting('app.social_role', true) IN ('MODERATOR', 'ADMIN')
  );
CREATE POLICY social_moderation_staff_read ON social_moderation_actions
  FOR SELECT USING (current_setting('app.social_role', true) IN ('MODERATOR', 'ADMIN'));
