import { expect, test } from "playwright/test";

test.describe.configure({ timeout: 120000 });

function extractAnswerText(payload: unknown) {
  const record = payload as { ok?: boolean; answer?: string; model?: string; llm_connected?: boolean };
  return {
    ok: record.ok === true,
    answer: String(record.answer || "").trim(),
    model: String(record.model || "").trim(),
    llmConnected: record.llm_connected === true
  };
}

test("ai assistant health confirms real local LLM connectivity", async ({ request }) => {
  const response = await request.get("/api/ai-assistant/query");
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  expect(payload.ok).toBe(true);
  expect(payload.llm_connected).toBe(true);
  expect(typeof payload.model).toBe("string");
  expect(payload.model.length).toBeGreaterThan(0);
});

test("ai assistant returns a live model answer instead of a canned missing-llm fallback", async ({ request }) => {
  const response = await request.post("/api/ai-assistant/query", {
    data: {
      message: "What is 420? Reply in two short sentences.",
      geo_hint: "JM"
    }
  });
  expect(response.ok()).toBeTruthy();
  const payload = extractAnswerText(await response.json());
  expect(payload.ok).toBe(true);
  expect(payload.llmConnected).toBe(true);
  expect(payload.model.length).toBeGreaterThan(0);
  expect(payload.answer.length).toBeGreaterThan(30);
  expect(payload.answer).not.toContain("Unknown.");
  expect(payload.answer).not.toContain("The current SSOT context does not identify");
});
