import fs from "node:fs/promises";
import path from "node:path";
import { test, expect } from "@playwright/test";
import {
  ask,
  buildTurnResult,
  COUNTRIES,
  CULTURE_QUESTIONS,
  DIALOG_QUESTIONS,
  ensureArchiveDir,
  getInstalledModels,
  openChat,
  resetChat
} from "./benchmark.shared";

const MODEL = "alibayram/smollm3:latest";
const REPORT_PATH = path.resolve(process.cwd(), "../../Reports/smollm3-test.json");
const ARCHIVE_NAME = "smollm3";
const SMOLLM3_COUNTRIES = COUNTRIES.filter((item) =>
  ["Germany", "Netherlands", "Thailand", "Brazil", "Japan"].includes(item.name)
);

test.describe.configure({ mode: "serial", timeout: 1200000 });
test.skip(process.env.AI_E2E !== "1", "Manual live AI validation only.");

test("smollm3 live UI benchmark", async ({ page, request }) => {
  const installed = await getInstalledModels(request);
  test.skip(!installed.includes(MODEL), `${MODEL} is not installed in Ollama`);

  const archiveDir = await ensureArchiveDir(ARCHIVE_NAME);
  const turns = [];
  let previousAnswer: string | null = null;

  for (const country of SMOLLM3_COUNTRIES) {
    await openChat(page, MODEL, country.code);
    await resetChat(page, MODEL);

    for (const [index, prompt] of DIALOG_QUESTIONS.entries()) {
      const response = await ask(page, prompt);
      const turn = buildTurnResult({
        model: MODEL,
        prompt,
        answer: response.answer,
        firstTokenMs: response.firstTokenMs,
        totalMs: response.totalMs,
        country: country.name,
        previousAnswer
      });
      previousAnswer = response.answer;
      turns.push({ type: "dialog", country: country.name, turn: index + 1, ...turn });
      await page.screenshot({
        path: path.join(archiveDir, `smollm3-${country.name.toLowerCase().replace(/\s+/g, "-")}-q${index + 1}.png`),
        fullPage: true
      });
      expect(turn.answerLength).toBeGreaterThan(80);
      expect(turn.fallback).toBe(false);
    }
  }

  await openChat(page, MODEL, "deu");
  await resetChat(page, MODEL);
  previousAnswer = null;
  for (const [index, prompt] of CULTURE_QUESTIONS.entries()) {
    const response = await ask(page, prompt);
    const turn = buildTurnResult({
      model: MODEL,
      prompt,
      answer: response.answer,
      firstTokenMs: response.firstTokenMs,
      totalMs: response.totalMs,
      previousAnswer
    });
    previousAnswer = response.answer;
    turns.push({ type: "culture", turn: index + 1, ...turn });
    await page.screenshot({
      path: path.join(archiveDir, `smollm3-culture-q${index + 1}.png`),
      fullPage: true
    });
  }

  const successTurns = turns.filter((item) => item.success).length;
  const avgResponseTime = Math.round(turns.reduce((sum, item) => sum + item.totalMs, 0) / Math.max(turns.length, 1));
  const fallbacks = turns.filter((item) => item.fallback).length;
  const contextScore = turns.reduce((sum, item) => sum + item.contextScore, 0) / Math.max(turns.length, 1);
  const styleScore = turns.reduce((sum, item) => sum + (item.repeated ? 0 : 1), 0) / Math.max(turns.length, 1);

  await fs.writeFile(
    REPORT_PATH,
    JSON.stringify(
      {
        model: MODEL,
        successTurns,
        avgResponseTime,
        fallbacks,
        contextScore,
        styleScore,
        turns
      },
      null,
      2
    )
  );
});
