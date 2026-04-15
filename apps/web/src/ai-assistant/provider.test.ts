import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveAIProvider, verifyProviderConnection } from "./provider";

const originalProvider = process.env.AI_PROVIDER;
const originalNodeEnv = process.env.NODE_ENV;
const originalApiKey = process.env.OPENAI_API_KEY;
const originalFetch = global.fetch;

afterEach(() => {
  if (originalProvider === undefined) delete process.env.AI_PROVIDER;
  else process.env.AI_PROVIDER = originalProvider;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalApiKey;
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("provider", () => {
  it("defaults to ollama when no explicit provider is configured", () => {
    delete process.env.AI_PROVIDER;
    delete process.env.OPENAI_API_KEY;
    process.env.NODE_ENV = "production";
    expect(resolveAIProvider()).toBe("ollama");
  });

  it("uses openai in production when key is configured", () => {
    delete process.env.AI_PROVIDER;
    process.env.OPENAI_API_KEY = "test-key";
    process.env.NODE_ENV = "production";
    expect(resolveAIProvider()).toBe("openai");
  });

  it("respects explicit ollama override", () => {
    process.env.AI_PROVIDER = "ollama";
    process.env.OPENAI_API_KEY = "test-key";
    process.env.NODE_ENV = "production";
    expect(resolveAIProvider()).toBe("ollama");
  });

  it("uses the exact requested model without consulting working-model cache", async () => {
    process.env.AI_PROVIDER = "ollama";
    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          models: [{ name: "qwen2.5:1.5b" }, { name: "deepseek-coder:1.3b" }]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    ) as typeof fetch;

    const health = await verifyProviderConnection(["deepseek-coder:1.3b"]);
    expect(health.model).toBe("deepseek-coder:1.3b");
    expect(health.preferredModels).toEqual(["deepseek-coder:1.3b"]);
  });
});
