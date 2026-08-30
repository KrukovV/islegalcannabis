import { describe, expect, it } from "vitest";
import { SOCIAL_SESSION_COOKIE, socialSessionCookie, validateSocialDisplayName } from "./identity";

describe("Social identity boundary", () => {
  it("normalizes a project pseudonym without accepting control or markup characters", () => {
    expect(validateSocialDisplayName("  Map   Reader  ")).toBe("Map Reader");
    expect(() => validateSocialDisplayName("x")).toThrow("SOCIAL_DISPLAY_NAME_INVALID");
    expect(() => validateSocialDisplayName("<admin>")).toThrow("SOCIAL_DISPLAY_NAME_INVALID");
  });

  it("keeps the opaque session credential HttpOnly and same-site", () => {
    const cookie = socialSessionCookie("opaque-session-token");
    expect(cookie).toContain(`${SOCIAL_SESSION_COOKIE}=opaque-session-token`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).not.toContain("displayName");
  });
});
