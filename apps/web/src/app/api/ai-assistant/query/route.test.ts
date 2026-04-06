import { afterEach, describe, expect, it } from "vitest";
import { POST } from "./route";

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

describe("/api/ai-assistant/query", () => {
  it("rejects requests in production", async () => {
    process.env.NODE_ENV = "production";
    const response = await POST(
      new Request("http://127.0.0.1:3000/api/ai-assistant/query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "Germany travel", geo_hint: "DE" })
      })
    );

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("AI_DISABLED");
  });
});
