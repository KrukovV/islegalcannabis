import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST, resetParaphraseRateLimitForTests } from "./route";

const originalKey = process.env.OPENAI_API_KEY;

function makeRequest() {
  return new Request("http://localhost/api/paraphrase", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-real-ip": "1.2.3.4"
    },
    body: JSON.stringify({ country: "US", region: "CA", locale: "en" })
  });
}

beforeEach(() => {
  resetParaphraseRateLimitForTests();
  delete process.env.OPENAI_API_KEY;
});

afterEach(() => {
  resetParaphraseRateLimitForTests();
  if (originalKey) {
    process.env.OPENAI_API_KEY = originalKey;
  } else {
    delete process.env.OPENAI_API_KEY;
  }
});

describe("POST /api/paraphrase rate limit", () => {
  it("returns 429 after 10 requests per minute per IP", async () => {
    for (let i = 0; i < 10; i += 1) {
      const response = await POST(makeRequest());
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.requestId).toBeDefined();
    }

    const blocked = await POST(makeRequest());
    expect(blocked.status).toBe(429);
    const blockedJson = await blocked.json();
    expect(blockedJson.error?.code).toBe("RATE_LIMITED");
    expect(blockedJson.requestId).toBeDefined();
  });
});
