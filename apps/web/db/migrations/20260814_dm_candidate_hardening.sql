CREATE OR REPLACE FUNCTION dm_assert_recipient_device_binding()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM dm_devices
    WHERE id = NEW.recipient_device_id
      AND messaging_public_key = NEW.recipient_public_key
      AND status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'DM_RECIPIENT_DEVICE_INVALID' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dm_recipient_device_binding_guard ON dm_relay_envelopes;
CREATE TRIGGER dm_recipient_device_binding_guard
BEFORE INSERT OR UPDATE OF recipient_device_id, recipient_public_key ON dm_relay_envelopes
FOR EACH ROW EXECUTE FUNCTION dm_assert_recipient_device_binding();

ALTER TABLE dm_relay_envelopes
  DROP CONSTRAINT IF EXISTS dm_relay_gift_wrap_envelope_shape;
ALTER TABLE dm_relay_envelopes
  ADD CONSTRAINT dm_relay_gift_wrap_envelope_shape CHECK (
    jsonb_typeof(gift_wrap) = 'object'
    AND (gift_wrap ->> 'kind')::integer = 1059
    AND jsonb_typeof(gift_wrap -> 'tags') = 'array'
    AND jsonb_typeof(gift_wrap -> 'content') = 'string'
    AND length(gift_wrap ->> 'content') BETWEEN 132 AND 65536
  );

INSERT INTO social_schema_migrations (version)
VALUES ('20260814_dm_candidate_hardening')
ON CONFLICT (version) DO NOTHING;
