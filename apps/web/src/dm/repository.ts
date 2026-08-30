import { createHash, randomBytes } from "node:crypto";
import type { Sql } from "postgres";
import type { SocialActor } from "@/social/domain";

const MAX_DM_RELAY_ATTEMPTS = 5;

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export type DmDevice = {
  id: string;
  publicKey: string;
  label: string;
  status: "ACTIVE" | "REVOKED";
  createdAt: string;
  revokedAt: string | null;
};

function deviceRow(row: { id: string; messaging_public_key: string; device_label: string; status: "ACTIVE" | "REVOKED"; created_at: Date; revoked_at: Date | null }): DmDevice {
  return {
    id: row.id,
    publicKey: row.messaging_public_key,
    label: row.device_label,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    revokedAt: row.revoked_at?.toISOString() || null,
  };
}

export class PostgresDmRepository {
  private readonly sql: Sql;

  constructor(sql: Sql) {
    this.sql = sql;
  }

  async issueChallenge(actor: SocialActor) {
    const challenge = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 5 * 60 * 1_000).toISOString();
    await this.sql.begin(async (tx) => {
      await tx`SELECT set_config('app.social_user_id', ${actor.userId}, true)`;
      await tx`DELETE FROM dm_device_challenges WHERE user_id::text = ${actor.userId} AND (expires_at <= now() OR consumed_at IS NOT NULL)`;
      await tx`
        INSERT INTO dm_device_challenges (user_id, nonce_hash, expires_at)
        VALUES (${actor.userId}, ${sha256(challenge)}, ${expiresAt})
      `;
    });
    return { challenge, expiresAt };
  }

  async registerDevice(actor: SocialActor, challenge: string, publicKey: string, label: string) {
    return this.sql.begin(async (tx) => {
      await tx`SELECT set_config('app.social_user_id', ${actor.userId}, true)`;
      const consumed = await tx`
        UPDATE dm_device_challenges SET consumed_at = now()
        WHERE user_id::text = ${actor.userId}
          AND nonce_hash = ${sha256(challenge)}
          AND consumed_at IS NULL
          AND expires_at > now()
        RETURNING id
      `;
      if (!consumed[0]) throw new Error("DM_DEVICE_CHALLENGE_INVALID");
      const existing = await tx<Array<{ id: string; user_id: string; status: "ACTIVE" | "REVOKED" }>>`
        SELECT id, user_id, status FROM dm_devices WHERE messaging_public_key = ${publicKey}
      `;
      if (existing[0] && String(existing[0].user_id) !== actor.userId) throw new Error("DM_DEVICE_KEY_ALREADY_BOUND");
      const rows = await tx<Array<{ id: string; messaging_public_key: string; device_label: string; status: "ACTIVE" | "REVOKED"; created_at: Date; revoked_at: Date | null }>>`
        INSERT INTO dm_devices (user_id, messaging_public_key, device_label)
        VALUES (${actor.userId}, ${publicKey}, ${label})
        ON CONFLICT (messaging_public_key) DO UPDATE
        SET device_label = EXCLUDED.device_label, last_seen_at = now()
        RETURNING id, messaging_public_key, device_label, status, created_at, revoked_at
      `;
      if (rows[0].status !== "ACTIVE") throw new Error("DM_DEVICE_REVOKED");
      return deviceRow(rows[0]);
    });
  }

  async listDevices(actor: SocialActor) {
    const rows = await this.sql<Array<{ id: string; messaging_public_key: string; device_label: string; status: "ACTIVE" | "REVOKED"; created_at: Date; revoked_at: Date | null }>>`
      SELECT id, messaging_public_key, device_label, status, created_at, revoked_at
      FROM dm_devices WHERE user_id::text = ${actor.userId}
      ORDER BY created_at ASC
    `;
    return rows.map(deviceRow);
  }

  async revokeDevice(actor: SocialActor, deviceId: string) {
    const rows = await this.sql<Array<{ id: string }>>`
      UPDATE dm_devices SET status = 'REVOKED', revoked_at = now(), last_seen_at = now()
      WHERE id::text = ${deviceId} AND user_id::text = ${actor.userId} AND status = 'ACTIVE'
      RETURNING id
    `;
    return rows[0] || null;
  }

  async resolveRecipient(displayName: string) {
    const displayNameKey = displayName.normalize("NFKC").trim().toLocaleLowerCase("en-US");
    const rows = await this.sql<Array<{ display_name: string; id: string; messaging_public_key: string; device_label: string }>>`
      SELECT users.display_name, devices.id, devices.messaging_public_key, devices.device_label
      FROM social_users users
      JOIN dm_devices devices ON devices.user_id = users.id AND devices.status = 'ACTIVE'
      WHERE users.display_name_key = ${displayNameKey} AND users.status = 'ACTIVE'
      ORDER BY devices.created_at ASC
      LIMIT 8
    `;
    return rows.map((row) => ({
      displayName: row.display_name,
      deviceId: row.id,
      publicKey: row.messaging_public_key,
      label: row.device_label,
    }));
  }

  async resolveSender(publicKey: string) {
    const rows = await this.sql<Array<{ display_name: string; messaging_public_key: string }>>`
      SELECT users.display_name, devices.messaging_public_key
      FROM dm_devices devices
      JOIN social_users users ON users.id = devices.user_id AND users.status = 'ACTIVE'
      WHERE devices.messaging_public_key = ${publicKey}
      LIMIT 1
    `;
    return rows[0]
      ? { displayName: rows[0].display_name, publicKey: rows[0].messaging_public_key }
      : null;
  }

  async activeDeviceForActor(actor: SocialActor, deviceId: string) {
    const rows = await this.sql<Array<{ id: string; messaging_public_key: string }>>`
      SELECT id, messaging_public_key FROM dm_devices
      WHERE id::text = ${deviceId} AND user_id::text = ${actor.userId} AND status = 'ACTIVE'
      LIMIT 1
    `;
    return rows[0] || null;
  }

  async activeRecipientDevice(deviceId: string, publicKey: string) {
    const rows = await this.sql<Array<{ id: string; user_id: string }>>`
      SELECT id, user_id FROM dm_devices
      WHERE id::text = ${deviceId} AND messaging_public_key = ${publicKey} AND status = 'ACTIVE'
      LIMIT 1
    `;
    return rows[0] || null;
  }

  async submitEnvelope(input: {
    messageId: string;
    recipientDeviceId: string;
    recipientPublicKey: string;
    giftWrap: unknown;
    receiptToken: string;
    expiresAt: string;
  }) {
    return this.sql.begin(async (tx) => {
      const existing = await tx<Array<{ id: string; receipt_hash: string; status: string; attempt_count: number }>>`
        SELECT id, receipt_hash, status, attempt_count
        FROM dm_relay_envelopes
        WHERE message_id = ${input.messageId} AND recipient_device_id = ${input.recipientDeviceId}
        FOR UPDATE
      `;
      const receiptHash = sha256(input.receiptToken);
      if (existing[0]) {
        if (existing[0].receipt_hash !== receiptHash) throw new Error("DM_DUPLICATE_RECEIPT_MISMATCH");
        if (existing[0].status === "TRANSPORT_ACCEPTED" || existing[0].status === "DELIVERED") {
          const nextAttempt = Math.min(MAX_DM_RELAY_ATTEMPTS, existing[0].attempt_count + 1);
          await tx`UPDATE dm_relay_envelopes SET attempt_count = ${nextAttempt} WHERE id = ${existing[0].id}`;
          await tx`
            INSERT INTO dm_delivery_attempts (message_id, recipient_device_id, transport, attempt_no, result)
            VALUES (${input.messageId}, ${input.recipientDeviceId}, 'INTERNET', ${nextAttempt}, 'TRANSPORT_ACCEPTED')
            ON CONFLICT DO NOTHING
          `;
        }
        return { messageId: input.messageId, state: existing[0].status, duplicate: true };
      }
      const rows = await tx<Array<{ status: string }>>`
        INSERT INTO dm_relay_envelopes (
          message_id, recipient_device_id, recipient_public_key, gift_wrap, receipt_hash, expires_at
        ) VALUES (
          ${input.messageId}, ${input.recipientDeviceId}, ${input.recipientPublicKey}, ${tx.json(JSON.parse(JSON.stringify(input.giftWrap)))},
          ${receiptHash}, ${input.expiresAt}
        ) RETURNING status
      `;
      await tx`
        INSERT INTO dm_delivery_attempts (message_id, recipient_device_id, transport, attempt_no, result)
        VALUES (${input.messageId}, ${input.recipientDeviceId}, 'INTERNET', 1, 'TRANSPORT_ACCEPTED')
      `;
      return { messageId: input.messageId, state: rows[0].status, duplicate: false };
    });
  }

  async inbox(actor: SocialActor, deviceId: string) {
    const device = await this.activeDeviceForActor(actor, deviceId);
    if (!device) throw new Error("DM_DEVICE_NOT_AUTHORIZED");
    await this.sql`UPDATE dm_devices SET last_seen_at = now() WHERE id = ${deviceId}`;
    const rows = await this.sql<Array<{ message_id: string; recipient_device_id: string; gift_wrap: Record<string, unknown>; status: "TRANSPORT_ACCEPTED" | "DELIVERED" | "READ"; expires_at: Date }>>`
      SELECT message_id, recipient_device_id, gift_wrap, status, expires_at
      FROM dm_relay_envelopes
      WHERE recipient_device_id = ${deviceId}
        AND status IN ('TRANSPORT_ACCEPTED', 'DELIVERED')
        AND expires_at > now()
      ORDER BY created_at ASC
      LIMIT 200
    `;
    return rows.map((row) => ({
      messageId: row.message_id,
      recipientDeviceId: row.recipient_device_id,
      giftWrap: row.gift_wrap,
      status: row.status,
      expiresAt: row.expires_at.toISOString(),
    }));
  }

  async acknowledge(actor: SocialActor, deviceId: string, messageId: string, state: "DELIVERED" | "READ") {
    const device = await this.activeDeviceForActor(actor, deviceId);
    if (!device) throw new Error("DM_DEVICE_NOT_AUTHORIZED");
    const rows = state === "DELIVERED"
      ? await this.sql`
        UPDATE dm_relay_envelopes
        SET status = CASE WHEN status = 'TRANSPORT_ACCEPTED' THEN 'DELIVERED' ELSE status END,
            delivered_at = COALESCE(delivered_at, now())
        WHERE message_id = ${messageId} AND recipient_device_id = ${deviceId}
          AND status IN ('TRANSPORT_ACCEPTED', 'DELIVERED', 'READ') AND expires_at > now()
        RETURNING status
      `
      : await this.sql`
        UPDATE dm_relay_envelopes
        SET status = 'READ', delivered_at = COALESCE(delivered_at, now()), read_at = COALESCE(read_at, now())
        WHERE message_id = ${messageId} AND recipient_device_id = ${deviceId}
          AND status IN ('TRANSPORT_ACCEPTED', 'DELIVERED', 'READ') AND expires_at > now()
        RETURNING status
      `;
    if (!rows[0]) throw new Error("DM_MESSAGE_NOT_FOUND");
    return { messageId, state: rows[0].status };
  }

  async receipt(messageId: string, receiptToken: string) {
    const rows = await this.sql<Array<{ status: string; expires_at: Date }>>`
      SELECT status, expires_at FROM dm_relay_envelopes
      WHERE message_id = ${messageId} AND receipt_hash = ${sha256(receiptToken)}
      LIMIT 1
    `;
    if (!rows[0]) throw new Error("DM_RECEIPT_NOT_FOUND");
    return { messageId, state: rows[0].status, expiresAt: rows[0].expires_at.toISOString() };
  }
}
