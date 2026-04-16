import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createEmptyModelMetricsStore, loadModelMetricsStore, rankModelsByMetrics, saveModelMetricsStore } from "./modelMetrics";

const originalFile = process.env.AI_MODEL_METRICS_FILE;

function createTempFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-model-metrics-"));
  return path.join(dir, "model_metrics.json");
}

afterEach(() => {
  if (originalFile === undefined) {
    delete process.env.AI_MODEL_METRICS_FILE;
  } else {
    process.env.AI_MODEL_METRICS_FILE = originalFile;
  }
});

describe("modelMetrics", () => {
  it("loads empty store when file does not exist", () => {
    process.env.AI_MODEL_METRICS_FILE = createTempFile();
    expect(loadModelMetricsStore()).toEqual(createEmptyModelMetricsStore());
  });

  it("ranks models by stored score and keeps unknowns in default order", () => {
    process.env.AI_MODEL_METRICS_FILE = createTempFile();
    saveModelMetricsStore({
      generated_at: "2026-04-15T00:00:00.000Z",
      base_url: "http://127.0.0.1:3000",
      best_model: "qwen2.5:1.5b",
      fallback_chain: ["qwen2.5:1.5b"],
      models: [
        {
          model: "qwen2.5:1.5b",
          score: 0.82,
          speed: 0.8,
          stability: 0.8,
          context: 0.85,
          engagement: 0.83,
          scenarios: [],
          metrics: {
            avgFirstTokenMs: 1200,
            avgFullResponseMs: 5200,
            avgAnswerLength: 140,
            streamBreaks: 0,
            shortAnswers: 0,
            repeatedAnswers: 0,
            contextPassRate: 1,
            engagementPassRate: 1,
            modelFallbacks: 0,
            failedTurns: 0,
            successTurns: 12
          }
        },
      ]
    });

    expect(rankModelsByMetrics(["qwen2.5:1.5b", "qwen2.5:3b"])).toEqual(["qwen2.5:1.5b", "qwen2.5:3b"]);
  });
});
