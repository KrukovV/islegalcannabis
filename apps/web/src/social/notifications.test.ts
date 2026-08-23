import { describe, expect, it, vi } from "vitest";
import { DisabledMinimalNotificationProvider, minimalNotificationPayload } from "./notifications";

describe("privacy-minimal notification boundary", () => {
  it("exposes only an opaque id and event type to push adapters", () => {
    const payload = minimalNotificationPayload({
      userId: crypto.randomUUID(),
      type: "DM_RECEIVED",
      opaqueEntityId: "a".repeat(64),
    });
    expect(payload).toEqual({ type: "DM_RECEIVED", opaqueEntityId: "a".repeat(64) });
    expect(JSON.stringify(payload)).not.toMatch(/plaintext|body|message|privateKey|secret|latitude|longitude|geoCell/i);
  });

  it("keeps the local candidate push-disabled while validating the safe shape", async () => {
    const provider = new DisabledMinimalNotificationProvider();
    const spy = vi.spyOn(console, "log");
    await provider.notify({ userId: crypto.randomUUID(), type: "DEVICE_SECURITY", opaqueEntityId: crypto.randomUUID() });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
