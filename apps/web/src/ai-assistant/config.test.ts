import { afterEach, describe, expect, it } from "vitest";
import { isAssistantChatEnabled } from "./config";

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

describe("ai-assistant config", () => {
  it("disables chat in production", () => {
    process.env.NODE_ENV = "production";
    expect(isAssistantChatEnabled()).toBe(false);
  });

  it("keeps chat enabled outside production", () => {
    process.env.NODE_ENV = "development";
    expect(isAssistantChatEnabled()).toBe(true);
  });
});
