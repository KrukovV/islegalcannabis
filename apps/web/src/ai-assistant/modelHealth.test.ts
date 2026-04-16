import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createEmptyWorkingModelsStore,
  getBestModel,
  getFallbackChain,
  loadWorkingModelsStore,
  recordModelResult,
  updateWorkingModels
} from "./modelHealth";

const originalFile = process.env.AI_WORKING_MODELS_FILE;

function createTempFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-working-models-"));
  return path.join(dir, "working_models.json");
}

afterEach(() => {
  if (originalFile === undefined) {
    delete process.env.AI_WORKING_MODELS_FILE;
  } else {
    process.env.AI_WORKING_MODELS_FILE = originalFile;
  }
});

describe("modelHealth", () => {
  it("loads empty store when file does not exist", () => {
    process.env.AI_WORKING_MODELS_FILE = createTempFile();
    expect(loadWorkingModelsStore()).toEqual(createEmptyWorkingModelsStore());
  });

  it("persists working models and scores fallback chain from real results", () => {
    process.env.AI_WORKING_MODELS_FILE = createTempFile();
    updateWorkingModels(["qwen2.5:1.5b"]);
    recordModelResult({
      model: "qwen2.5:1.5b",
      success: true,
      firstTokenMs: 900,
      responseMs: 2400,
      length: 180
    });

    const chain = getFallbackChain(["qwen2.5:1.5b"]);
    expect(chain[0]).toBe("qwen2.5:1.5b");
    expect(getBestModel(["qwen2.5:1.5b"])).toBe("qwen2.5:1.5b");
    expect(loadWorkingModelsStore().workingModels).toEqual(["qwen2.5:1.5b"]);
  });
});
