import type { NostrEvent, UnsignedEvent } from "nostr-tools/core";
import { decrypt, getConversationKey } from "nostr-tools/nip44";
import { createRumor, createSeal, createWrap } from "nostr-tools/nip59";
import { finalizeEvent, getEventHash, getPublicKey, verifyEvent } from "nostr-tools/pure";

export const DM_RUMOR_KIND = 14;
export const DM_SEAL_KIND = 13;
export const DM_GIFT_WRAP_KIND = 1059;
export const DM_DEVICE_REGISTRATION_KIND = 22_242;
export const DM_SUBMISSION_AUTH_KIND = 22_243;
export const MAX_DM_PLAINTEXT_BYTES = 8 * 1024;
export const MAX_DM_GIFT_WRAP_BYTES = 64 * 1024;

function assertHexKey(value: string) {
  if (!/^[0-9a-f]{64}$/.test(value)) throw new Error("DM_MESSAGING_PUBLIC_KEY_INVALID");
  return value;
}

function eventFromUnknown(value: unknown): NostrEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("DM_EVENT_INVALID");
  const raw = value as Record<string, unknown>;
  if (typeof raw.content !== "string" || raw.content.length > MAX_DM_GIFT_WRAP_BYTES) throw new Error("DM_EVENT_CONTENT_INVALID");
  if (!Array.isArray(raw.tags) || !raw.tags.every((tag) => Array.isArray(tag) && tag.every((item) => typeof item === "string"))) {
    throw new Error("DM_EVENT_TAGS_INVALID");
  }
  const event: NostrEvent = {
    id: typeof raw.id === "string" ? raw.id : "",
    pubkey: typeof raw.pubkey === "string" ? raw.pubkey : "",
    created_at: typeof raw.created_at === "number" ? raw.created_at : Number.NaN,
    kind: typeof raw.kind === "number" ? raw.kind : Number.NaN,
    tags: raw.tags as string[][],
    content: raw.content,
    sig: typeof raw.sig === "string" ? raw.sig : "",
  };
  if (!verifyEvent(event)) throw new Error("DM_EVENT_SIGNATURE_INVALID");
  return event;
}

function parseEncryptedJson(payload: string, privateKey: Uint8Array, publicKey: string) {
  const plaintext = decrypt(payload, getConversationKey(privateKey, publicKey));
  return JSON.parse(plaintext) as unknown;
}

function decodeBase64(value: string) {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new Error("DM_GIFT_WRAP_CIPHERTEXT_INVALID");
  }
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new Error("DM_GIFT_WRAP_CIPHERTEXT_INVALID");
  }
}

export function createDmGiftWrap(senderPrivateKey: Uint8Array, recipientPublicKey: string, message: string) {
  const fanout = createDmGiftWrapFanout(senderPrivateKey, [recipientPublicKey], message);
  return {
    messageId: fanout.messageId,
    senderPublicKey: fanout.senderPublicKey,
    giftWrap: fanout.envelopes[0].giftWrap,
  };
}

export function createDmGiftWrapFanout(senderPrivateKey: Uint8Array, recipientPublicKeys: string[], message: string) {
  const recipients = [...new Set(recipientPublicKeys.map(assertHexKey))];
  if (recipients.length < 1 || recipients.length > 8) throw new Error("DM_RECIPIENT_COUNT_INVALID");
  const messageBytes = new TextEncoder().encode(message);
  if (messageBytes.length < 1 || messageBytes.length > MAX_DM_PLAINTEXT_BYTES) throw new Error("DM_MESSAGE_SIZE_INVALID");
  const rumor = createRumor({
    kind: DM_RUMOR_KIND,
    content: message,
    tags: recipients.map((publicKey) => ["p", publicKey]),
  }, senderPrivateKey);
  return {
    messageId: rumor.id,
    senderPublicKey: rumor.pubkey,
    envelopes: recipients.map((recipientPublicKey) => {
      const seal = createSeal(rumor, senderPrivateKey, recipientPublicKey);
      return { recipientPublicKey, giftWrap: createWrap(seal, recipientPublicKey) };
    }),
  };
}

export function createDmDeviceRegistration(senderPrivateKey: Uint8Array, challenge: string) {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(challenge)) throw new Error("DM_DEVICE_CHALLENGE_INVALID");
  return finalizeEvent({
    kind: DM_DEVICE_REGISTRATION_KIND,
    created_at: Math.floor(Date.now() / 1_000),
    tags: [["t", "islegal-dm-device-registration"]],
    content: challenge,
  }, senderPrivateKey);
}

export function createDmSubmissionAuthorization(senderPrivateKey: Uint8Array, messageId: string, recipientPublicKey: string) {
  if (!/^[0-9a-f]{64}$/.test(messageId)) throw new Error("DM_MESSAGE_ID_INVALID");
  assertHexKey(recipientPublicKey);
  return finalizeEvent({
    kind: DM_SUBMISSION_AUTH_KIND,
    created_at: Math.floor(Date.now() / 1_000),
    tags: [["p", recipientPublicKey], ["e", messageId]],
    content: "islegal-dm-submit",
  }, senderPrivateKey);
}

export function validateDmDeviceRegistration(value: unknown, challenge: string) {
  const event = eventFromUnknown(value);
  if (event.kind !== DM_DEVICE_REGISTRATION_KIND || event.content !== challenge) throw new Error("DM_DEVICE_REGISTRATION_INVALID");
  if (!event.tags.some((tag) => tag[0] === "t" && tag[1] === "islegal-dm-device-registration")) {
    throw new Error("DM_DEVICE_REGISTRATION_INVALID");
  }
  if (Math.abs(Date.now() / 1_000 - event.created_at) > 5 * 60) throw new Error("DM_DEVICE_REGISTRATION_EXPIRED");
  return { publicKey: assertHexKey(event.pubkey), event };
}

export function validateDmSubmissionAuthorization(
  value: unknown,
  senderPublicKey: string,
  messageId: string,
  recipientPublicKey: string,
) {
  const event = eventFromUnknown(value);
  if (event.pubkey !== senderPublicKey || event.kind !== DM_SUBMISSION_AUTH_KIND || event.content !== "islegal-dm-submit") {
    throw new Error("DM_SUBMISSION_AUTH_INVALID");
  }
  if (!event.tags.some((tag) => tag[0] === "e" && tag[1] === messageId)) throw new Error("DM_SUBMISSION_AUTH_INVALID");
  if (!event.tags.some((tag) => tag[0] === "p" && tag[1] === recipientPublicKey)) throw new Error("DM_SUBMISSION_AUTH_INVALID");
  if (Math.abs(Date.now() / 1_000 - event.created_at) > 5 * 60) throw new Error("DM_SUBMISSION_AUTH_EXPIRED");
  return event;
}

export function validateDmGiftWrap(value: unknown, recipientPublicKey: string) {
  const giftWrap = eventFromUnknown(value);
  if (giftWrap.kind !== DM_GIFT_WRAP_KIND) throw new Error("DM_GIFT_WRAP_KIND_INVALID");
  const recipientTags = giftWrap.tags.filter((tag) => tag[0] === "p");
  if (recipientTags.length !== 1 || recipientTags[0][1] !== recipientPublicKey) throw new Error("DM_GIFT_WRAP_RECIPIENT_INVALID");
  const decoded = decodeBase64(giftWrap.content);
  if (decoded.length < 99 || decoded[0] !== 2) throw new Error("DM_GIFT_WRAP_CIPHERTEXT_INVALID");
  return giftWrap;
}

export function unwrapDmGiftWrap(value: unknown, recipientPrivateKey: Uint8Array, expectedMessageId?: string) {
  const recipientPublicKey = getPublicKey(recipientPrivateKey);
  const giftWrap = validateDmGiftWrap(value, recipientPublicKey);
  const seal = eventFromUnknown(parseEncryptedJson(giftWrap.content, recipientPrivateKey, giftWrap.pubkey));
  if (seal.kind !== DM_SEAL_KIND || seal.tags.length !== 0) throw new Error("DM_SEAL_INVALID");
  const rumor = parseEncryptedJson(seal.content, recipientPrivateKey, seal.pubkey) as UnsignedEvent & { id?: string };
  if (!rumor || rumor.kind !== DM_RUMOR_KIND || typeof rumor.id !== "string" || getEventHash(rumor) !== rumor.id) {
    throw new Error("DM_RUMOR_INVALID");
  }
  if (rumor.pubkey !== seal.pubkey) throw new Error("DM_RUMOR_SENDER_MISMATCH");
  if (!rumor.tags.some((tag) => tag[0] === "p" && tag[1] === recipientPublicKey)) throw new Error("DM_RUMOR_RECIPIENT_INVALID");
  if (expectedMessageId && rumor.id !== expectedMessageId) throw new Error("DM_MESSAGE_ID_MISMATCH");
  if (new TextEncoder().encode(rumor.content).length > MAX_DM_PLAINTEXT_BYTES) throw new Error("DM_MESSAGE_SIZE_INVALID");
  return {
    messageId: rumor.id,
    senderPublicKey: rumor.pubkey,
    content: rumor.content,
    createdAt: new Date(rumor.created_at * 1_000).toISOString(),
  };
}
