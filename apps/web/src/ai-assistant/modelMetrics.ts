import fs from "node:fs";
import path from "node:path";

export type ModelScenarioMetrics = {
  name: string;
  turns: number;
  successTurns: number;
  avgFirstTokenMs: number;
  avgFullResponseMs: number;
  avgAnswerLength: number;
  streamBreaks: number;
  shortAnswers: number;
  repeatedAnswers: number;
  contextPasses: number;
  engagementPasses: number;
  modelFallbacks: number;
  failedTurns: number;
};

export type ModelEvaluationRecord = {
  model: string;
  score: number;
  speed: number;
  stability: number;
  context: number;
  engagement: number;
  scenarios: ModelScenarioMetrics[];
  metrics: {
    avgFirstTokenMs: number;
    avgFullResponseMs: number;
    avgAnswerLength: number;
    streamBreaks: number;
    shortAnswers: number;
    repeatedAnswers: number;
    contextPassRate: number;
    engagementPassRate: number;
    modelFallbacks: number;
    failedTurns: number;
    successTurns: number;
  };
};

export type ModelMetricsStore = {
  generated_at: string | null;
  base_url: string | null;
  best_model: string | null;
  fallback_chain: string[];
  models: ModelEvaluationRecord[];
};

const DEFAULT_METRICS_FILE = path.resolve(process.cwd(), "data/ai/model_metrics.json");

export const DEFAULT_AI_MODELS = [
  "qwen2.5:1.5b",
  "llama3.2:3b",
  "mistral:7b-instruct",
  "qwen2.5:3b"
] as const;

function getMetricsFile() {
  return process.env.AI_MODEL_METRICS_FILE || DEFAULT_METRICS_FILE;
}

function ensureMetricsDir(file: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

export function createEmptyModelMetricsStore(): ModelMetricsStore {
  return {
    generated_at: null,
    base_url: null,
    best_model: null,
    fallback_chain: [...DEFAULT_AI_MODELS],
    models: []
  };
}

export function loadModelMetricsStore(): ModelMetricsStore {
  const file = getMetricsFile();
  if (!fs.existsSync(file)) {
    return createEmptyModelMetricsStore();
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<ModelMetricsStore>;
    return {
      generated_at: parsed.generated_at || null,
      base_url: parsed.base_url || null,
      best_model: parsed.best_model || null,
      fallback_chain: Array.isArray(parsed.fallback_chain) ? parsed.fallback_chain.filter(Boolean) : [...DEFAULT_AI_MODELS],
      models: Array.isArray(parsed.models) ? parsed.models : []
    };
  } catch {
    return createEmptyModelMetricsStore();
  }
}

export function saveModelMetricsStore(store: ModelMetricsStore) {
  const file = getMetricsFile();
  ensureMetricsDir(file);
  fs.writeFileSync(file, JSON.stringify(store, null, 2));
}

export function rankModelsByMetrics(models: string[]) {
  const requested = Array.from(new Set(models.filter(Boolean)));
  const store = loadModelMetricsStore();
  const scoreMap = new Map(store.models.map((item) => [item.model, item.score]));
  const ordered = requested
    .map((model, index) => ({
      model,
      index,
      score: typeof scoreMap.get(model) === "number" ? scoreMap.get(model)! : -1
    }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.index - right.index;
    })
    .map((item) => item.model);
  return ordered;
}

export function getBestModels(limit = 3) {
  const store = loadModelMetricsStore();
  const ranked = Array.from(
    new Set([
      ...store.fallback_chain.filter(Boolean),
      ...store.models
        .slice()
        .sort((left, right) => right.score - left.score)
        .map((item) => item.model),
      ...DEFAULT_AI_MODELS
    ])
  );
  return ranked.slice(0, Math.max(limit, 1));
}
