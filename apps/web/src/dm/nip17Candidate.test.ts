import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { describe, expect, it } from "vitest";
import {
  createDmDeviceRegistration,
  createDmGiftWrap,
  createDmGiftWrapFanout,
  createDmSubmissionAuthorization,
  validateDmDeviceRegistration,
  validateDmGiftWrap,
  validateDmSubmissionAuthorization,
  unwrapDmGiftWrap,
} from "./nip17Candidate";

describe("NIP-17/NIP-44/NIP-59 Internet DM candidate", () => {
  it("wraps plaintext for the recipient, exposes no GEO context, and verifies the complete chain", () => {
    const sender = generateSecretKey();
    const recipient = generateSecretKey();
    const recipientPublicKey = getPublicKey(recipient);
    const plaintext = "private vertical-slice message";
    const wrapped = createDmGiftWrap(sender, recipientPublicKey, plaintext);
    const serialized = JSON.stringify(wrapped.giftWrap);
    expect(serialized).not.toContain(plaintext);
    expect(serialized).not.toMatch(/latitude|longitude|accuracy|coordinates|geo_cell|geoId|lawId/i);
    expect(validateDmGiftWrap(wrapped.giftWrap, recipientPublicKey).kind).toBe(1059);
    expect(unwrapDmGiftWrap(wrapped.giftWrap, recipient, wrapped.messageId)).toMatchObject({
      messageId: wrapped.messageId,
      senderPublicKey: getPublicKey(sender),
      content: plaintext,
    });
  });

  it("uses one logical rumor id for multi-device fanout while wrapping separately for each device", () => {
    const sender = generateSecretKey();
    const first = generateSecretKey();
    const second = generateSecretKey();
    const fanout = createDmGiftWrapFanout(sender, [getPublicKey(first), getPublicKey(second)], "one logical message");
    expect(fanout.envelopes).toHaveLength(2);
    expect(unwrapDmGiftWrap(fanout.envelopes[0].giftWrap, first).messageId).toBe(fanout.messageId);
    expect(unwrapDmGiftWrap(fanout.envelopes[1].giftWrap, second).messageId).toBe(fanout.messageId);
  });

  it("fails closed for the wrong recipient and tampered outer signature", () => {
    const sender = generateSecretKey();
    const recipient = generateSecretKey();
    const wrapped = createDmGiftWrap(sender, getPublicKey(recipient), "tamper proof");
    expect(() => unwrapDmGiftWrap(wrapped.giftWrap, generateSecretKey())).toThrow();
    const tamperedContent = `${wrapped.giftWrap.content[0] === "A" ? "B" : "A"}${wrapped.giftWrap.content.slice(1)}`;
    expect(() => validateDmGiftWrap({ ...wrapped.giftWrap, content: tamperedContent }, getPublicKey(recipient)))
      .toThrow("DM_EVENT_SIGNATURE_INVALID");
  });

  it("binds device registration and relay submission to the signing messaging key", () => {
    const sender = generateSecretKey();
    const recipientPublicKey = getPublicKey(generateSecretKey());
    const challenge = "a".repeat(43);
    const registration = createDmDeviceRegistration(sender, challenge);
    expect(validateDmDeviceRegistration(registration, challenge).publicKey).toBe(getPublicKey(sender));
    const messageId = "b".repeat(64);
    const authorization = createDmSubmissionAuthorization(sender, messageId, recipientPublicKey);
    expect(validateDmSubmissionAuthorization(authorization, getPublicKey(sender), messageId, recipientPublicKey).kind).toBe(22_243);
    expect(() => validateDmSubmissionAuthorization(authorization, getPublicKey(generateSecretKey()), messageId, recipientPublicKey))
      .toThrow("DM_SUBMISSION_AUTH_INVALID");
  });
});
