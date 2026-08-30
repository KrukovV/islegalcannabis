import { describe, expect, it } from "vitest";
import { disabledPrivateTransport } from "./providers";

describe("disabled private transport", () => {
  it("has no active route and never claims a message is delivered", async () => {
    expect(disabledPrivateTransport.capabilities()).toMatchObject({ internet: false, nearby: false, offlineQueue: false });
    await expect(disabledPrivateTransport.send({
      messageId: "a".repeat(64),
      recipientDeviceId: crypto.randomUUID(),
      recipientPublicKey: "b".repeat(64),
      giftWrap: {},
      receiptToken: "c".repeat(40),
      senderDeviceId: crypto.randomUUID(),
      submissionAuthorization: {},
      expiresAt: "2026-08-15T00:00:00.000Z",
    })).rejects.toThrow("SOCIAL_DM_DISABLED");
  });
});
