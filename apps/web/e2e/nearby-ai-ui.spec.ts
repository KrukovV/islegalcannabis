import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test.describe.configure({ mode: "serial", timeout: 240000 });
test.skip(process.env.NEARBY_E2E !== "1", "Manual nearby AI UI validation only.");

test.use({
  trace: "on",
  permissions: ["geolocation"],
  geolocation: { latitude: 52.52, longitude: 13.405 }
});

const screenshotDir =
  process.env.NEARBY_SCREENSHOT_DIR ||
  path.join(os.homedir(), "islegalcannabis_archive", "nearby-ai-ui");

async function saveShot(page: Page, name: string) {
  fs.mkdirSync(screenshotDir, { recursive: true });
  await page.screenshot({ path: path.join(screenshotDir, `${name}.png`), fullPage: true });
}

async function openChat(page: Page, url: string, geoHint = "DE") {
  await page.request.post("/api/ai-assistant/query", {
    headers: {
      "content-type": "application/json",
      "x-ai-reset": "1"
    },
    data: { message: "reset", geo_hint: geoHint }
  }).catch(() => null);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.removeItem("ai_chat_history")).catch(() => null);
  await page.reload({ waitUntil: "domcontentloaded" });
  const input = page.locator('[data-ai-input="1"]').first();
  await expect(input).toBeVisible();
  const clearButton = page.locator('button[aria-label="Clear AI chat"]').first();
  if (await clearButton.isVisible().catch(() => false)) {
    await clearButton.click();
  }
  return input;
}

async function ask(page: Page, prompt: string, screenshotName: string) {
  const input = page.locator('[data-ai-input="1"]').first();
  const beforeCount = await page.locator('[data-ai-message-text="assistant"]').count();
  await input.fill(prompt);
  await input.press("Enter");
  const answerText = page.locator('[data-ai-message-text="assistant"]').nth(beforeCount);
  await expect.poll(async () => ((await answerText.textContent()) || "").trim().length, { timeout: 15000 }).toBeGreaterThan(60);
  await page.waitForTimeout(800);
  const answer = ((await answerText.innerText()) || "").trim();
  await saveShot(page, screenshotName);
  expect(answer).toContain("Closest places where cannabis is possible");
  expect(answer).toMatch(/~\d+ km/);
  expect(answer).toContain("Risk:");
  expect(answer).toContain("Crossing borders with cannabis is illegal in most countries.");
  expect(answer.toLowerCase()).not.toContain("i don't know");
  expect(answer.toLowerCase()).not.toContain("request failed");
  return answer;
}

async function askGreeting(page: Page, prompt: string, screenshotName: string) {
  const input = page.locator('[data-ai-input="1"]').first();
  const beforeCount = await page.locator('[data-ai-message-text="assistant"]').count();
  await input.fill(prompt);
  await input.press("Enter");
  const answerText = page.locator('[data-ai-message-text="assistant"]').nth(beforeCount);
  await expect.poll(async () => ((await answerText.textContent()) || "").trim().length, { timeout: 15000 }).toBeGreaterThan(20);
  await page.waitForTimeout(800);
  const answer = ((await answerText.innerText()) || "").trim();
  await saveShot(page, screenshotName);
  expect(answer.toLowerCase()).not.toContain("request failed");
  expect(answer).toMatch(/Все норм|All good/);
  return answer;
}

test("geo and selected-country nearby flows return engine output, distances, risk, warning", async ({ page }) => {
  let checkCount = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/check")) checkCount += 1;
  });

  await openChat(page, "/c/deu", "DE");
  const geoAnswer = await ask(page, "where can I smoke near me", "nearby-01-germany-geo");
  expect(geoAnswer).toMatch(/Netherlands|Czech|Austria|Luxembourg|Belgium|Switzerland|France|Denmark|Poland/);
  if (geoAnswer.includes("Netherlands") && geoAnswer.includes("Spain")) {
    expect(geoAnswer.indexOf("Netherlands")).toBeLessThan(geoAnswer.indexOf("Spain"));
  }
  expect(checkCount).toBeLessThanOrEqual(10);

  const semantic = await ask(page, "how do I get to nearest place where weed is tolerated", "nearby-02-germany-semantic");
  expect(semantic).toMatch(/Tolerated|Limited|Legal|Mostly allowed/);
  expect(semantic.toLowerCase()).not.toContain("generic");

  await openChat(page, "/c/deu", "DE");
  const selectedCountry = await ask(page, "nearest tolerated place without GPS?", "nearby-03-germany-selected");
  expect(selectedCountry).toMatch(/Germany|Netherlands|Czech|Austria|Luxembourg|Belgium|Switzerland|France|Denmark|Poland/);
});

test("iran nearby flow keeps limited/tolerated/current signals visible", async ({ page }) => {
  await openChat(page, "/c/irn", "IR");
  const answer = await ask(page, "where can I smoke near me", "nearby-04-iran");
  expect(answer).toContain("Iran");
  expect(answer).toMatch(/Limited|Tolerated|Risk:/);
  expect(answer.toLowerCase()).not.toContain("everything illegal");
});

test("slang nearby prompts still use engine output", async ({ page }) => {
  await openChat(page, "/c/deu", "DE");
  const answer = await ask(page, "yo bro where weed at", "nearby-05-slang");
  expect(answer).toContain("Got you.");
  expect(answer).toContain("Closest places where cannabis is possible");
  expect(answer).toMatch(/Netherlands|Czech|Austria|Luxembourg|Belgium|Switzerland|France|Denmark|Poland/);
});

test("slang greeting gets a human response without forcing nearby", async ({ page }) => {
  await openChat(page, "/c/deu", "DE");
  const answer = await askGreeting(page, "Еу, как сам?", "nearby-06-slang-greeting");
  expect(answer).toBe("Все норм 🙂");
  expect(answer).not.toContain("где рядом можно");
  expect(answer).not.toMatch(/Closest places|Risk:|Netherlands|Czech/i);
});
