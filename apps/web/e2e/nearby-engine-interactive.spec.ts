import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial", timeout: 180000 });
test.skip(process.env.NEARBY_E2E !== "1", "Manual nearby-engine validation only.");

async function openChat(page: Page, url: string) {
  await page.request.post("/api/ai-assistant/query", {
    headers: {
      "content-type": "application/json",
      "x-ai-reset": "1"
    },
    data: { message: "reset", geo_hint: "DE" }
  }).catch(() => null);
  await page.goto(url);
  const input = page.locator('[data-ai-input="1"]').first();
  await expect(input).toBeVisible();
  const clearButton = page.locator('button[aria-label="Clear AI chat"]').first();
  if (await clearButton.isVisible().catch(() => false)) {
    await clearButton.click();
  }
  return input;
}

async function ask(page: Page, prompt: string) {
  const input = page.locator('[data-ai-input="1"]').first();
  const beforeCount = await page.locator('[data-ai-message-text="assistant"]').count();
  const start = Date.now();
  await input.fill(prompt);
  await input.press("Enter");
  const answerText = page.locator('[data-ai-message-text="assistant"]').nth(beforeCount);
  await expect.poll(async () => ((await answerText.textContent()) || "").trim().length, { timeout: 10000 }).toBeGreaterThan(40);
  const firstTokenMs = Date.now() - start;
  const answer = ((await answerText.innerText()) || "").trim();
  expect(answer).toContain("illegal in most countries");
  return { answer, firstTokenMs };
}

test("geo-first nearby flow from Germany stays distance-based", async ({ page }) => {
  await openChat(page, "/c/deu");
  const first = await ask(page, "where can I smoke near me");
  const second = await ask(page, "how do I get to nearest place where weed is tolerated");
  const third = await ask(page, "and what about borders?");
  const fourth = await ask(page, "which option is safer?");

  expect(first.firstTokenMs).toBeLessThan(3000);
  expect(first.answer).toMatch(/km/);
  expect(first.answer).toMatch(/Netherlands|Austria|Czech|Luxembourg|Belgium/);
  expect(second.answer.toLowerCase()).toMatch(/tolerated|limited|mostly allowed/);
  expect(third.answer.toLowerCase()).toContain("illegal in most countries");
  expect(fourth.answer.toLowerCase()).toMatch(/risk|safer|warning/);
});

test("iran flow stays honest and not empty", async ({ page }) => {
  await openChat(page, "/c/irn");
  const first = await ask(page, "where can I smoke near me");
  const second = await ask(page, "and in real life?");
  const third = await ask(page, "what is the risk on the way?");
  const fourth = await ask(page, "so is everything strict?");

  expect(first.answer.toLowerCase()).not.toContain("no options");
  expect(first.answer.toLowerCase()).toMatch(/limited|tolerated|risk/);
  expect(second.answer.toLowerCase()).toMatch(/fine|enforcement|practice|risk/);
  expect(third.answer.toLowerCase()).toContain("border");
  expect(fourth.answer.toLowerCase()).not.toContain("everything is strict");
});

test("selected-country fallback works without gps on Thailand route", async ({ page }) => {
  await openChat(page, "/c/tha");
  const first = await ask(page, "where can I smoke near me");
  const second = await ask(page, "nearest tolerated place?");
  const third = await ask(page, "and distance?");
  const fourth = await ask(page, "best warning?");

  expect(first.answer).toMatch(/km/);
  expect(first.answer).toMatch(/Cambodia|Laos|Myanmar|Thailand/);
  expect(second.answer.toLowerCase()).toMatch(/limited|tolerated|mostly allowed|legal/);
  expect(third.answer.toLowerCase()).toContain("km");
  expect(fourth.answer.toLowerCase()).toContain("illegal in most countries");
});
