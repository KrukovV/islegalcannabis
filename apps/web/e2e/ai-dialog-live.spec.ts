import { expect, test, type Locator, type Page } from "@playwright/test";

const MODEL_OVERRIDE_STORAGE_KEY = "ai_model_override";
const MODELS = (process.env.AI_DIALOG_MODELS || "qwen2.5:1.5b")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const COUNTRIES = [
  "Germany",
  "Netherlands",
  "Spain",
  "Portugal",
  "India",
  "Thailand"
] as const;
const COUNTRY_GEO: Record<(typeof COUNTRIES)[number], { iso2: string; lat: number; lng: number }> = {
  Germany: { iso2: "DE", lat: 52.52, lng: 13.405 },
  Netherlands: { iso2: "NL", lat: 52.3676, lng: 4.9041 },
  Spain: { iso2: "ES", lat: 40.4168, lng: -3.7038 },
  Portugal: { iso2: "PT", lat: 38.7223, lng: -9.1393 },
  India: { iso2: "IN", lat: 28.6139, lng: 77.209 },
  Thailand: { iso2: "TH", lat: 13.7563, lng: 100.5018 }
};
const FORBIDDEN_PATTERNS = [
  /Request failed/i,
  /The local companion model failed/i,
  /модель не ответила, попробуй ещё раз/i,
  /Give me a second, the model is taking longer than usual/i,
  /Секунду, модель думает чуть дольше обычного/i
];

test.describe.configure({ mode: "serial", timeout: 900000 });
test.skip(process.env.AI_E2E !== "1", "Manual live AI validation only.");

function buildCountryPrompts(country: string) {
  return [
    `Cannabis in ${country}`,
    "Is it legal?",
    "What about real life?",
    "Risk?",
    "Travel with it?",
    "Compare with Germany"
  ] as const;
}

async function resetChat(page: Page, model: string) {
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
  await page.evaluate(() => {
    window.localStorage.removeItem("ai_chat_history");
  });
}

async function setCountryGeo(page: Page, country: (typeof COUNTRIES)[number]) {
  const geo = COUNTRY_GEO[country];
  await page.evaluate((payload) => {
    window.localStorage.setItem("geo", JSON.stringify({
      iso2: payload.iso2,
      lat: payload.lat,
      lng: payload.lng,
      source: "gps"
    }));
  }, geo);
  await page.reload({ waitUntil: "domcontentloaded" });
  const input = page.locator('[data-ai-input="1"]').first();
  await expect(input).toBeVisible();
  await expect(input).toBeEnabled({ timeout: 15000 });
  await page.waitForTimeout(3000);
}

async function openChat(page: Page, model: string) {
  await page.goto("/new-map");
  await page.evaluate(([modelKey, modelValue]) => {
    window.localStorage.setItem(modelKey, modelValue);
  }, [MODEL_OVERRIDE_STORAGE_KEY, model]);
  await page.reload({ waitUntil: "domcontentloaded" });
  const input = page.locator('[data-ai-input="1"]').first();
  await expect(input).toBeVisible();
  await expect(input).toBeEnabled({ timeout: 15000 });
  await page.waitForTimeout(5000);
  await resetChat(page, model);
  return input;
}

async function waitForStreamingDone(page: Page) {
  await expect.poll(async () => {
    return await page.locator('[data-ai-message="assistant"][data-streaming="true"]').count();
  }, { timeout: 45000 }).toBe(0);
}

async function ask(page: Page, prompt: string) {
  const input = page.locator('[data-ai-input="1"]').first();
  const beforeAssistantCount = await page.locator('[data-ai-message="assistant"]').count();
  const beforeUserCount = await page.locator('[data-ai-message="user"]').count();
  await input.fill(prompt);
  const startedAt = Date.now();
  await input.press("Enter");
  const answerRow = page.locator('[data-ai-message="assistant"]').nth(beforeAssistantCount);
  const answerText = answerRow.locator('[data-ai-message-text="assistant"]');

  await expect(page.locator('[data-ai-message="user"]')).toHaveCount(beforeUserCount + 1);
  await expect.poll(async () => {
    const text = (await answerText.textContent() || "").trim();
    return text.length;
  }, { timeout: 25000 }).toBeGreaterThan(0);

  const firstTokenMs = Date.now() - startedAt;
  await waitForStreamingDone(page);
  await expect.poll(async () => {
    const submit = await page.locator('button[aria-label="Submit AI query"]').textContent();
    return (submit || "").trim();
  }, { timeout: 45000 }).not.toBe("…");

  await expect.poll(async () => {
    const text = (await answerText.textContent() || "").trim();
    return text.length;
  }, { timeout: 45000 }).toBeGreaterThan(80);

  const answer = (await answerText.innerText()).trim();
  expect(answer.length).toBeGreaterThan(80);
  for (const pattern of FORBIDDEN_PATTERNS) {
    expect(answer).not.toMatch(pattern);
  }
  return { answer, firstTokenMs };
}

async function assertCountryThread(thread: Locator, country: string) {
  const assistantMessages = thread.locator('[data-ai-message="assistant"]');
  const userMessages = thread.locator('[data-ai-message="user"]');
  await expect(assistantMessages).toHaveCount(6);
  await expect(userMessages).toHaveCount(6);

  const messages = await assistantMessages.locator('[data-ai-message-text="assistant"]').allInnerTexts();
  for (const message of messages) {
    expect(message.trim().length).toBeGreaterThan(80);
    for (const pattern of FORBIDDEN_PATTERNS) {
      expect(message).not.toMatch(pattern);
    }
  }

  const lower = messages.map((item) => item.toLowerCase());
  const joined = lower.join("\n");
  expect(lower[0] || "").toContain(country.toLowerCase());
  expect(lower[1] || "").toMatch(/legal|illegal|decriminal|medical|recreational|restricted/);
  expect(lower[3] || "").toMatch(/risk|fine|prison|penalt|enforcement/);
  expect(lower[4] || "").toMatch(/travel|border|airport|carry|customs/);
  expect(lower[5] || "").toContain("germany");
  if (country !== "Germany") {
    expect(lower[5] || "").toContain(country.toLowerCase());
  }
  expect(joined).not.toMatch(/request failed|all conversational local models failed|norway|noreg/);
}

for (const model of MODELS) {
  test(`live 6x6 dialogue restores real UI conversation :: ${model}`, async ({ page }) => {
    await openChat(page, model);

    for (const country of COUNTRIES) {
      await setCountryGeo(page, country);
      await resetChat(page, model);
      const answers = [];
      for (const prompt of buildCountryPrompts(country)) {
        answers.push(await ask(page, prompt));
      }

      const thread = page.locator('[data-testid="new-map-ai-answer"]').first();
      await expect(thread.locator('[data-ai-message="assistant"]')).toHaveCount(6);
      await expect(thread.locator('[data-ai-message="user"]')).toHaveCount(6);
      await assertCountryThread(thread, country);

      for (const entry of answers) {
        expect(entry.firstTokenMs).toBeGreaterThan(0);
        expect(entry.answer.trim().length).toBeGreaterThan(80);
      }
    }
  });
}
