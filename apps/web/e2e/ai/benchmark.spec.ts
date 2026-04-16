import fs from "node:fs/promises";
import path from "node:path";
import { test } from "@playwright/test";
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

const MODELS = [
  "qwen2.5:1.5b"
];
const REPORT_PATH = path.resolve(process.cwd(), "../../Reports/model-benchmark.json");
const ARCHIVE_NAME = "ai-benchmark";

test.describe.configure({ mode: "serial", timeout: 1800000 });
test.skip(process.env.AI_E2E !== "1", "Manual live AI validation only.");

test("live UI model benchmark", async ({ page, request }) => {
  const installed = await getInstalledModels(request);
  const archiveDir = await ensureArchiveDir(ARCHIVE_NAME);
  const report: Record<string, unknown> = {};

  for (const model of MODELS) {
    if (!installed.includes(model)) {
      report[model] = { available: false };
      continue;
    }

    const turns = [];
    let previousAnswer: string | null = null;

    for (const country of COUNTRIES) {
      await openChat(page, model, country.code);
      await resetChat(page, model);
      previousAnswer = null;

      for (const [index, prompt] of DIALOG_QUESTIONS.entries()) {
        const response = await ask(page, prompt);
        const turn = buildTurnResult({
          model,
          prompt,
          answer: response.answer,
          firstTokenMs: response.firstTokenMs,
          totalMs: response.totalMs,
          country: country.name,
          previousAnswer
        });
        previousAnswer = response.answer;
        turns.push({ type: "dialog", country: country.name, turn: index + 1, ...turn });
        await page.waitForTimeout(500);
        await page.screenshot({
          path: path.join(
            archiveDir,
            `${model.replace(/[/:.]+/g, "-")}-${country.name.toLowerCase().replace(/\s+/g, "-")}-q${index + 1}.png`
          ),
          fullPage: true
        });
      }
    }

    await openChat(page, model, "deu");
    await resetChat(page, model);
    previousAnswer = null;
    for (const [index, prompt] of CULTURE_QUESTIONS.entries()) {
      const response = await ask(page, prompt);
      const turn = buildTurnResult({
        model,
        prompt,
        answer: response.answer,
        firstTokenMs: response.firstTokenMs,
        totalMs: response.totalMs,
        previousAnswer
      });
      previousAnswer = response.answer;
      turns.push({ type: "culture", turn: index + 1, ...turn });
      await page.waitForTimeout(500);
      await page.screenshot({
        path: path.join(archiveDir, `${model.replace(/[/:.]+/g, "-")}-culture-q${index + 1}.png`),
        fullPage: true
      });
    }

    const success = turns.filter((item) => item.success).length;
    const avgTime = Math.round(turns.reduce((sum, item) => sum + item.totalMs, 0) / Math.max(turns.length, 1));
    const maxTime = Math.max(...turns.map((item) => item.totalMs), 0);
    const fallbacks = turns.filter((item) => item.fallback).length;
    const repetition = turns.filter((item) => item.repeated).length;
    const context = turns.reduce((sum, item) => sum + item.contextScore, 0) / Math.max(turns.length, 1);
    const successRate = success / Math.max(turns.length, 1);
    const speed = 1 / Math.max(avgTime, 1);
    const score = (0.4 * successRate) + (0.3 * speed) + (0.3 * context);

    report[model] = {
      available: true,
      success,
      avgTime,
      maxTime,
      fallbacks,
      repetition,
      context,
      score,
      turns
    };
  }

  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2));
});
