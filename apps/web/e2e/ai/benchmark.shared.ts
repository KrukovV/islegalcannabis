import fs from "node:fs/promises";
import path from "node:path";
import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const MODEL_OVERRIDE_STORAGE_KEY = "ai_model_override";
export const CHAT_STORAGE_KEY = "ai_chat_history";

export const FORBIDDEN_PATTERNS = [
  /Request failed/i,
  /The local companion model failed/i,
  /модель не ответила, попробуй ещё раз/i,
  /No working conversational Ollama model is currently available/i,
  /assistant temporarily unavailable/i,
  /I don't know/i,
  /cannot assist/i,
  /can't assist/i,
  /try again/i
];

export const COUNTRIES = [
  { code: "deu", name: "Germany", promptName: "Germany" },
  { code: "nld", name: "Netherlands", promptName: "Netherlands" },
  { code: "tha", name: "Thailand", promptName: "Thailand" },
  { code: "bra", name: "Brazil", promptName: "Brazil" },
  { code: "jpn", name: "Japan", promptName: "Japan" },
  { code: "can", name: "Canada", promptName: "Canada" }
] as const;

export const DIALOG_QUESTIONS = [
  "What is cannabis law here?",
  "And real-life enforcement?",
  "Can I travel with it?",
  "What about airports?",
  "Compare with Netherlands",
  "So is it safe?"
] as const;

export const CULTURE_QUESTIONS = [
  "What is 420?",
  "Best weed movies?",
  "Who is Snoop Dogg?",
  "What is Rastafari?",
  "Origin of cannabis culture?"
] as const;

export function getArchiveDir(name: string) {
  return path.join(process.env.HOME || "", "islegalcannabis_archive", name);
}

export async function ensureArchiveDir(name: string) {
  const dir = getArchiveDir(name);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function getInstalledModels(request: APIRequestContext) {
  const response = await request.get("http://127.0.0.1:11434/api/tags");
  if (!response.ok()) return [];
  const payload = await response.json() as { models?: Array<{ name?: string }> };
  return (payload.models || []).map((item) => String(item.name || "").trim()).filter(Boolean);
}

export async function openChat(page: Page, model: string, countryCode = "deu") {
  await page.goto(`/c/${countryCode}`, { waitUntil: "domcontentloaded" });
  await page.evaluate(async ([modelKey, modelValue, chatKey]) => {
    window.localStorage.setItem(modelKey, modelValue);
    window.localStorage.removeItem(chatKey);
    await fetch("/api/ai-assistant/query", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ai-reset": "1"
      },
      body: JSON.stringify({ message: "reset", model: modelValue })
    }).catch(() => null);
  }, [MODEL_OVERRIDE_STORAGE_KEY, model, CHAT_STORAGE_KEY]);
  await page.reload({ waitUntil: "domcontentloaded" });
  const expand = page.getByTestId("new-map-ai-expand");
  if (await expand.isVisible().catch(() => false)) {
    await expand.click();
  }
  const input = page.locator('[data-ai-input="1"]').first();
  await expect(input).toBeVisible();
  await expect(input).toBeEnabled({ timeout: 15000 });
  await page.waitForTimeout(1200);
}

export async function resetChat(page: Page, model: string) {
  await page.request.post("/api/ai-assistant/query", {
    headers: {
      "content-type": "application/json",
      "x-ai-reset": "1"
    },
    data: { message: "reset", model }
  }).catch(() => null);
  const clearButton = page.locator('button[aria-label="Clear AI chat"]').first();
  if (await clearButton.isVisible().catch(() => false)) {
    await clearButton.click();
  }
  await page.evaluate(([chatKey]) => {
    window.localStorage.removeItem(chatKey);
  }, [CHAT_STORAGE_KEY]);
  await page.waitForTimeout(500);
}

export async function ask(page: Page, prompt: string) {
  const input = page.locator('[data-ai-input="1"]').first();
  const beforeAssistantCount = await page.locator('[data-ai-message="assistant"]').count();
  const beforeUserCount = await page.locator('[data-ai-message="user"]').count();
  await input.fill(prompt);
  const startedAt = Date.now();
  await input.press("Enter");

  const answerRow = page.locator('[data-ai-message="assistant"]').nth(beforeAssistantCount);
  const answerText = answerRow.locator('[data-ai-message-text="assistant"]');

  await expect(page.locator('[data-ai-message="user"]')).toHaveCount(beforeUserCount + 1);
  await expect.poll(async () => ((await answerText.textContent()) || "").trim().length, { timeout: 15000 }).toBeGreaterThan(0);
  const firstTokenMs = Date.now() - startedAt;

  await expect.poll(async () => {
    return await page.locator('[data-ai-message="assistant"][data-streaming="true"]').count();
  }, { timeout: 45000 }).toBe(0);

  await expect.poll(async () => ((await answerText.textContent()) || "").trim().length, { timeout: 45000 }).toBeGreaterThan(80);

  const answer = (await answerText.innerText()).trim();
  return {
    answer,
    firstTokenMs,
    totalMs: Date.now() - startedAt
  };
}

export function hasForbiddenFallback(answer: string) {
  return FORBIDDEN_PATTERNS.some((pattern) => pattern.test(answer));
}

export function scoreContext(prompt: string, answer: string, countryName?: string) {
  const text = answer.toLowerCase();
  if (/compare with netherlands/i.test(prompt)) {
    return Number(text.includes("netherlands"));
  }
  if (/airport|travel|safe|enforcement/i.test(prompt)) {
    return Number(/airport|border|travel|customs|risk|fine|prison|police|enforcement/i.test(answer));
  }
  if (/420|movies|snoop|rastafari|culture/i.test(prompt)) {
    return Number(/420|movie|film|snoop|rastafari|culture|reggae|history/i.test(answer));
  }
  if (countryName) {
    return Number(text.includes(countryName.toLowerCase()));
  }
  return 0;
}

export function buildTurnResult(input: {
  model: string;
  prompt: string;
  answer: string;
  firstTokenMs: number;
  totalMs: number;
  country?: string;
  previousAnswer?: string | null;
}) {
  const fallback = hasForbiddenFallback(input.answer);
  const repeated = Boolean(input.previousAnswer && input.previousAnswer.trim() === input.answer.trim());
  const contextScore = scoreContext(input.prompt, input.answer, input.country);
  return {
    ...input,
    fallback,
    repeated,
    answerLength: input.answer.length,
    success: input.answer.length > 80 && !fallback && !repeated,
    contextScore
  };
}
