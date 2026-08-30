CREATE TABLE IF NOT EXISTS dm_device_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES social_users(id) ON DELETE CASCADE,
  nonce_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dm_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES social_users(id) ON DELETE CASCADE,
  messaging_public_key char(64) NOT NULL UNIQUE,
  device_label varchar(80) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CHECK (messaging_public_key ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS dm_devices_user_status_idx
  ON dm_devices (user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS dm_relay_envelopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id char(64) NOT NULL,
  recipient_device_id uuid NOT NULL REFERENCES dm_devices(id) ON DELETE CASCADE,
  recipient_public_key char(64) NOT NULL,
  gift_wrap jsonb NOT NULL,
  receipt_hash char(64) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'TRANSPORT_ACCEPTED'
    CHECK (status IN ('TRANSPORT_ACCEPTED', 'DELIVERED', 'READ', 'EXPIRED', 'FAILED_PERMANENT')),
  attempt_count smallint NOT NULL DEFAULT 1 CHECK (attempt_count BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  delivered_at timestamptz,
  read_at timestamptz,
  UNIQUE (message_id, recipient_device_id),
  CHECK (message_id ~ '^[0-9a-f]{64}$'),
  CHECK (recipient_public_key ~ '^[0-9a-f]{64}$'),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '7 days'),
  CHECK ((gift_wrap ->> 'kind')::integer = 1059),
  CHECK (jsonb_typeof(gift_wrap -> 'content') = 'string')
);

CREATE INDEX IF NOT EXISTS dm_relay_inbox_idx
  ON dm_relay_envelopes (recipient_device_id, status, created_at ASC)
  WHERE status IN ('TRANSPORT_ACCEPTED', 'DELIVERED');
CREATE INDEX IF NOT EXISTS dm_relay_expiry_idx
  ON dm_relay_envelopes (expires_at ASC)
  WHERE status NOT IN ('READ', 'EXPIRED', 'FAILED_PERMANENT');

CREATE TABLE IF NOT EXISTS dm_delivery_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id char(64) NOT NULL,
  recipient_device_id uuid NOT NULL REFERENCES dm_devices(id) ON DELETE CASCADE,
  transport varchar(16) NOT NULL CHECK (transport IN ('INTERNET')),
  attempt_no smallint NOT NULL CHECK (attempt_no BETWEEN 1 AND 5),
  result varchar(24) NOT NULL CHECK (result IN ('TRANSPORT_ACCEPTED', 'FAILED_RETRYABLE', 'FAILED_PERMANENT', 'EXPIRED')),
  failure_code varchar(80),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, recipient_device_id, attempt_no),
  CHECK (message_id ~ '^[0-9a-f]{64}$')
);

ALTER TABLE dm_device_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE dm_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE dm_relay_envelopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE dm_delivery_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dm_device_challenges_owner ON dm_device_challenges;
CREATE POLICY dm_device_challenges_owner ON dm_device_challenges
  FOR ALL USING (user_id::text = social_actor_id()) WITH CHECK (user_id::text = social_actor_id());

DROP POLICY IF EXISTS dm_devices_owner ON dm_devices;
CREATE POLICY dm_devices_owner ON dm_devices
  FOR SELECT USING (user_id::text = social_actor_id());

DROP POLICY IF EXISTS dm_devices_owner_update ON dm_devices;
CREATE POLICY dm_devices_owner_update ON dm_devices
  FOR UPDATE USING (user_id::text = social_actor_id()) WITH CHECK (user_id::text = social_actor_id());

DROP POLICY IF EXISTS dm_relay_recipient ON dm_relay_envelopes;
CREATE POLICY dm_relay_recipient ON dm_relay_envelopes
  FOR SELECT USING (
    recipient_device_id IN (
      SELECT id FROM dm_devices WHERE user_id::text = social_actor_id() AND status = 'ACTIVE'
    )
  );

DROP POLICY IF EXISTS dm_relay_recipient_update ON dm_relay_envelopes;
CREATE POLICY dm_relay_recipient_update ON dm_relay_envelopes
  FOR UPDATE USING (
    recipient_device_id IN (
      SELECT id FROM dm_devices WHERE user_id::text = social_actor_id() AND status = 'ACTIVE'
    )
  );

INSERT INTO social_schema_migrations (version)
VALUES ('20260814_dm_candidate')
ON CONFLICT (version) DO NOTHING;
