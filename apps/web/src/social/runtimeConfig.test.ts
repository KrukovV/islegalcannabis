import { describe, expect, it } from "vitest";
import { getSocialRuntimeConfig } from "./runtimeConfig";

describe("Social kill switches", () => {
  it("fails DM/BLE closed when durable storage and identity are absent", () => {
    const config = getSocialRuntimeConfig({ DM_ENABLED: "true", BLE_DM_ENABLED: "true" });
    expect(config.publicSocialEnabled).toBe(false);
    expect(config.geoChatEnabled).toBe(false);
    expect(config.dmEnabled).toBe(false);
    expect(config.bleDmEnabled).toBe(false);
  });

  it("enables Internet DM only behind explicit durable identity gates and never implies BLE", () => {
    const config = getSocialRuntimeConfig({
      SOCIAL_DATABASE_URL: "postgres://social.example/islegal",
      SOCIAL_USER_IDENTITY_ENABLED: "true",
      SOCIAL_IDENTITY_MODE: "pseudonymous_session",
      DM_ENABLED: "true",
      BLE_DM_ENABLED: "true",
    });
    expect(config.dmEnabled).toBe(true);
    expect(config.bleDmEnabled).toBe(false);
    expect(config.publicSocialEnabled).toBe(false);
  });

  it("requires explicit public, database, GeoChat, and identity gates", () => {
    const config = getSocialRuntimeConfig({
      SOCIAL_PUBLIC_ENABLED: "true",
      SOCIAL_DATABASE_URL: "postgres://social.example/islegal",
      GEOCHAT_ENABLED: "true",
      SOCIAL_USER_IDENTITY_ENABLED: "true",
      SOCIAL_IDENTITY_MODE: "pseudonymous_session",
    });
    expect(config.publicSocialEnabled).toBe(true);
    expect(config.geoChatEnabled).toBe(true);
    expect(config.nearbyEnabled).toBe(false);
  });
});
