import { expect, test, type Page } from "@playwright/test";

const FORBIDDEN_PATTERNS = [/в целом картина такая/i, /overall picture/i, /i may not have context/i];
const MODEL_OVERRIDE_STORAGE_KEY = "ai_model_override";
const MODELS = (process.env.AI_E2E_MODELS || "qwen3:4b,qwen2.5:1.5b,llama3.2:3b,smollm3:3b,phi-4-mini:3.8b")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const PRIMARY_MODEL = process.env.AI_E2E_PRIMARY_MODEL || "qwen3:4b";

test.describe.configure({ mode: "serial", timeout: 240000 });
test.skip(process.env.AI_E2E !== "1", "Manual local AI validation only.");

async function openChat(page: Page, url: string, model: string) {
  await page.request.post("/api/ai-assistant/query", {
    headers: {
      "content-type": "application/json",
      "x-ai-reset": "1"
    },
    data: { message: "reset", geo_hint: "DE", model }
  }).catch(() => null);
  await page.goto(url);
  await page.evaluate(
    ([key, value]) => window.localStorage.setItem(key, value),
    [MODEL_OVERRIDE_STORAGE_KEY, model]
  );
  await page.request.get(`/api/ai-assistant/query?warm=1&model=${encodeURIComponent(model)}`).catch(() => null);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const input = page.locator('[data-ai-input="1"]').first();
  await expect(input).toBeVisible();
  const clearButton = page.locator('button[aria-label="Clear AI chat"]').first();
  if (await clearButton.isVisible().catch(() => false)) {
    await clearButton.click();
  }
  return input;
}

test(`6-turn legal dialogue holds context :: ${PRIMARY_MODEL}`, async ({ page }) => {
  await openChat(page, "/new-map", PRIMARY_MODEL);
  const answers = [
    await ask(page, "Germany cannabis?"),
    await ask(page, "And medical?"),
    await ask(page, "And risks?"),
    await ask(page, "Compare with Netherlands"),
    await ask(page, "Where safer?"),
    await ask(page, "Why?")
  ];

  expect(answers[0].firstTokenMs).toBeLessThan(8500);
  expect(answers[0].answer.toLowerCase()).toContain("germany");
  expect(answers[1].answer.toLowerCase()).toMatch(/medical|patient|prescription/);
  expect(answers[2].answer.toLowerCase()).toMatch(/risk|fine|prison|penalt|enforcement/);
  expect(answers[3].answer.toLowerCase()).toContain("germany");
  expect(answers[3].answer.toLowerCase()).toMatch(/netherlands|dutch/);
  expect(answers[4].answer.toLowerCase()).toMatch(/safer|stricter|looser|risk/);
  expect(answers[5].answer.length).toBeGreaterThan(60);
});

async function ask(page: Page, prompt: string) {
  const input = page.locator('[data-ai-input="1"]').first();
  const beforeCount = await page.locator('[data-ai-message-text="assistant"]').count();
  await input.fill(prompt);
  const start = Date.now();
  await input.press("Enter");
  const answerText = page.locator('[data-ai-message-text="assistant"]').nth(beforeCount);
  await expect.poll(async () => {
    const text = (await answerText.textContent() || "").trim();
    return text.length;
  }, { timeout: 20000 }).toBeGreaterThan(0);
  const firstTokenMs = Date.now() - start;
  await expect.poll(async () => {
    const submit = await page.locator('button[aria-label="Submit AI query"]').textContent();
    return (submit || "").trim();
  }, { timeout: 25000 }).not.toBe("…");
  await expect.poll(async () => {
    const text = (await answerText.textContent() || "").trim();
    return text.length;
  }, { timeout: 25000 }).toBeGreaterThan(40);
  const answer = (await answerText.innerText()).trim();
  expect(answer.length).toBeGreaterThan(40);
  expect(answer).not.toMatch(/Секунду, модель думает чуть дольше обычного|Give me a second, the model is taking longer than usual|Request failed/i);
  for (const pattern of FORBIDDEN_PATTERNS) {
    expect(answer).not.toMatch(pattern);
  }
  await page.waitForTimeout(1200);
  return { answer, firstTokenMs };
}

for (const model of MODELS) {
  test(`legal flow keeps context across 4 turns :: ${model}`, async ({ page }) => {
    await openChat(page, "/new-map", model);
    const first = await ask(page, "Is cannabis legal in Germany?");
    const second = await ask(page, "What about medical?");
    const third = await ask(page, "Compare with Netherlands");
    const fourth = await ask(page, "And for tourists?");

    expect(first.firstTokenMs).toBeLessThan(8500);
    expect(first.answer.toLowerCase()).toContain("germany");
    expect(second.answer.toLowerCase()).toMatch(/medical|patient|prescription/);
    expect(third.answer.toLowerCase()).toContain("netherlands");
    expect(third.answer.toLowerCase()).toContain("germany");
    expect(fourth.answer.toLowerCase()).toMatch(/tourist|travel|airport|border/);
  });

  test(`travel flow stays in the same jurisdiction until comparison :: ${model}`, async ({ page }) => {
    await openChat(page, "/new-map", model);
    const first = await ask(page, "Can I take weed through airport in Dubai?");
    const second = await ask(page, "What about small amounts?");
    const third = await ask(page, "Compare with Thailand");
    const fourth = await ask(page, "Best advice?");

    expect(first.firstTokenMs).toBeLessThan(8500);
    expect(first.answer.toLowerCase()).toMatch(/dubai|uae|airport|dxb/);
    expect(second.answer.toLowerCase()).not.toContain("russia");
    expect(third.answer.toLowerCase()).toContain("thailand");
    expect(fourth.answer.toLowerCase()).toMatch(/advice|best|safer|avoid|risk/);
  });

  test(`culture flow stays cultural across 4 turns :: ${model}`, async ({ page }) => {
    await openChat(page, "/new-map", model);
    const first = await ask(page, "Who is Bob Marley?");
    const second = await ask(page, "Why is he connected to cannabis?");
    const third = await ask(page, "What is Rastafari?");
    const fourth = await ask(page, "What about Snoop Dogg?");

    expect(first.firstTokenMs).toBeLessThan(8500);
    expect(first.answer.toLowerCase()).toContain("marley");
    expect(second.answer.toLowerCase()).toMatch(/cannabis|ganja|symbol/);
    expect(third.answer.toLowerCase()).toContain("rastafari");
    expect(fourth.answer.toLowerCase()).toContain("snoop");
    expect(second.answer.toLowerCase()).not.toMatch(/\billegal\b|\blegal\b|\bdistribution\b|\bmedical\b/);
    expect(third.answer.toLowerCase()).not.toMatch(/\billegal\b|\blegal\b|\bdistribution\b|\bmedical\b/);
  });
}
