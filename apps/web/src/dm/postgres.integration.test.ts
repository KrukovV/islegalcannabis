import postgres, { type Sql } from "postgres";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSocialIdentity } from "@/social/identity";
import {
  createDmDeviceRegistration,
  createDmGiftWrap,
  createDmSubmissionAuthorization,
  unwrapDmGiftWrap,
  validateDmDeviceRegistration,
  validateDmSubmissionAuthorization,
} from "./nip17Candidate";
import { PostgresDmRepository } from "./repository";

const databaseUrl = process.env.SOCIAL_TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("private-message PostgreSQL vertical slice", () => {
  let sql: Sql;
  const userIds: string[] = [];
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  beforeAll(() => {
    sql = postgres(databaseUrl!, { max: 3, prepare: false });
  });

  afterAll(async () => {
    if (userIds.length > 0) await sql`DELETE FROM social_users WHERE id = ANY(${sql.array(userIds)}::uuid[])`;
    await sql.end({ timeout: 5 });
  });

  it("registers separate device keys, relays ciphertext offline, deduplicates, receipts, reads, and revokes", async () => {
    const alice = await createSocialIdentity(sql, `DM Alice ${suffix}`);
    const bob = await createSocialIdentity(sql, `DM Bob ${suffix}`);
    userIds.push(alice.identity.userId, bob.identity.userId);
    const repository = new PostgresDmRepository(sql);
    const aliceKey = generateSecretKey();
    const bobKey = generateSecretKey();

    const aliceChallenge = await repository.issueChallenge(alice.identity);
    const aliceRegistration = validateDmDeviceRegistration(
      createDmDeviceRegistration(aliceKey, aliceChallenge.challenge),
      aliceChallenge.challenge,
    );
    const aliceDevice = await repository.registerDevice(alice.identity, aliceChallenge.challenge, aliceRegistration.publicKey, "Alice browser");

    const bobChallenge = await repository.issueChallenge(bob.identity);
    const bobRegistration = validateDmDeviceRegistration(
      createDmDeviceRegistration(bobKey, bobChallenge.challenge),
      bobChallenge.challenge,
    );
    const bobDevice = await repository.registerDevice(bob.identity, bobChallenge.challenge, bobRegistration.publicKey, "Bob browser");

    await expect(repository.activeDeviceForActor(bob.identity, aliceDevice.id)).resolves.toBeNull();
    await expect(repository.resolveRecipient(bob.identity.displayName)).resolves.toEqual([
      expect.objectContaining({ deviceId: bobDevice.id, publicKey: getPublicKey(bobKey) }),
    ]);

    const plaintext = `ciphertext-only ${suffix}`;
    const wrapped = createDmGiftWrap(aliceKey, getPublicKey(bobKey), plaintext);
    const authorization = createDmSubmissionAuthorization(aliceKey, wrapped.messageId, getPublicKey(bobKey));
    validateDmSubmissionAuthorization(authorization, getPublicKey(aliceKey), wrapped.messageId, getPublicKey(bobKey));
    const receiptToken = `receipt_${"c".repeat(40)}`;
    const expiresAt = new Date(Date.now() + 60 * 60 * 1_000).toISOString();
    const input = {
      messageId: wrapped.messageId,
      recipientDeviceId: bobDevice.id,
      recipientPublicKey: getPublicKey(bobKey),
      giftWrap: wrapped.giftWrap,
      receiptToken,
      expiresAt,
    };
    await expect(repository.submitEnvelope(input)).resolves.toMatchObject({ state: "TRANSPORT_ACCEPTED", duplicate: false });
    await expect(repository.submitEnvelope(input)).resolves.toMatchObject({ state: "TRANSPORT_ACCEPTED", duplicate: true });

    const persisted = await sql<Array<{ serialized: string; sender_columns: number }>>`
      SELECT gift_wrap::text AS serialized,
        (SELECT COUNT(*)::integer FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'dm_relay_envelopes'
            AND column_name IN ('sender_user_id', 'sender_device_id', 'plaintext', 'body', 'geo_id', 'geo_cell')) AS sender_columns
      FROM dm_relay_envelopes
      WHERE message_id = ${wrapped.messageId} AND recipient_device_id = ${bobDevice.id}
    `;
    expect(persisted[0].serialized).not.toContain(plaintext);
    expect(persisted[0].sender_columns).toBe(0);

    const inbox = await repository.inbox(bob.identity, bobDevice.id);
    expect(inbox).toHaveLength(1);
    expect(unwrapDmGiftWrap(inbox[0].giftWrap, bobKey, wrapped.messageId).content).toBe(plaintext);
    await expect(repository.acknowledge(bob.identity, bobDevice.id, wrapped.messageId, "DELIVERED"))
      .resolves.toMatchObject({ state: "DELIVERED" });
    await expect(repository.acknowledge(bob.identity, bobDevice.id, wrapped.messageId, "READ"))
      .resolves.toMatchObject({ state: "READ" });
    await expect(repository.receipt(wrapped.messageId, receiptToken)).resolves.toMatchObject({ state: "READ" });
    await expect(repository.inbox(bob.identity, bobDevice.id)).resolves.toEqual([]);

    const expiring = createDmGiftWrap(aliceKey, getPublicKey(bobKey), "bounded offline queue");
    await repository.submitEnvelope({
      ...input,
      messageId: expiring.messageId,
      giftWrap: expiring.giftWrap,
      receiptToken: `expiry_${"d".repeat(40)}`,
    });
    await sql`
      UPDATE dm_relay_envelopes
      SET created_at = now() - interval '2 hours', expires_at = now() - interval '1 hour'
      WHERE message_id = ${expiring.messageId} AND recipient_device_id = ${bobDevice.id}
    `;
    await expect(repository.inbox(bob.identity, bobDevice.id)).resolves.toEqual([]);

    const tooLong = createDmGiftWrap(aliceKey, getPublicKey(bobKey), "unbounded queue must fail");
    await expect(repository.submitEnvelope({
      ...input,
      messageId: tooLong.messageId,
      giftWrap: tooLong.giftWrap,
      receiptToken: `toolong_${"e".repeat(40)}`,
      expiresAt: new Date(Date.now() + 8 * 24 * 60 * 60 * 1_000).toISOString(),
    })).rejects.toThrow();

    await expect(repository.revokeDevice(bob.identity, bobDevice.id)).resolves.toMatchObject({ id: bobDevice.id });
    await expect(repository.inbox(bob.identity, bobDevice.id)).rejects.toThrow("DM_DEVICE_NOT_AUTHORIZED");
  }, 20_000);
});
