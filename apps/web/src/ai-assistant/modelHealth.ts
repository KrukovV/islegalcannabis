import fs from "node:fs";
import path from "node:path";
import { DEFAULT_AI_MODELS } from "./modelMetrics";

export type ModelStats = {
  name: string;
  successTurns: number;
  failTurns: number;
  avgFirstTokenMs: number;
  avgResponseMs: number;
  avgLength: number;
  lastUsedAt: number;
};

export type ModelRole = "primary" | "fallback" | "candidate";

export type WorkingModelsStore = {
  updatedAt: number;
  workingModels: string[];
  stats: Record<string, ModelStats>;
  roles?: Record<string, ModelRole>;
};

const DEFAULT_HEALTH_FILE = path.resolve(process.cwd(), "data/ai/working_models.json");

function getHealthFile() {
  return process.env.AI_WORKING_MODELS_FILE || DEFAULT_HEALTH_FILE;
}

function ensureDir(file: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function avg(current: number, next: number, count: number) {
  if (!Number.isFinite(current) || current <= 0 || count <= 1) return next;
  return ((current * (count - 1)) + next) / count;
}

function createEmpty(name: string): ModelStats {
  return {
    name,
    successTurns: 0,
    failTurns: 0,
    avgFirstTokenMs: 0,
    avgResponseMs: 0,
    avgLength: 0,
    lastUsedAt: 0
  };
}

export function createEmptyWorkingModelsStore(): WorkingModelsStore {
  return {
    updatedAt: 0,
    workingModels: [],
    stats: {},
    roles: {}
  };
}

export function loadWorkingModelsStore(): WorkingModelsStore {
  const file = getHealthFile();
  if (!fs.existsSync(file)) return createEmptyWorkingModelsStore();
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<WorkingModelsStore>;
    return {
      updatedAt: Number(parsed.updatedAt || 0),
      workingModels: Array.isArray(parsed.workingModels) ? parsed.workingModels.filter(Boolean) : [],
      stats: parsed.stats && typeof parsed.stats === "object" ? parsed.stats as Record<string, ModelStats> : {},
      roles: parsed.roles && typeof parsed.roles === "object" ? parsed.roles as Record<string, ModelRole> : {}
    };
  } catch {
    return createEmptyWorkingModelsStore();
  }
}

export function saveWorkingModelsStore(store: WorkingModelsStore) {
  const file = getHealthFile();
  ensureDir(file);
  fs.writeFileSync(file, JSON.stringify(store, null, 2));
}

export function updateWorkingModels(workingModels: string[]) {
  const store = loadWorkingModelsStore();
  store.updatedAt = Date.now();
  store.workingModels = Array.from(new Set(workingModels.filter(Boolean)));
  saveWorkingModelsStore(store);
  return store;
}

export function setModelRole(model: string, role: ModelRole) {
  const store = loadWorkingModelsStore();
  store.roles = store.roles || {};
  store.roles[model] = role;
  store.updatedAt = Date.now();
  saveWorkingModelsStore(store);
  return store;
}

export function recordModelResult(input: {
  model: string;
  success: boolean;
  firstTokenMs?: number;
  responseMs?: number;
  length?: number;
}) {
  const store = loadWorkingModelsStore();
  const current = store.stats[input.model] || createEmpty(input.model);
  const nextSuccessTurns = current.successTurns + (input.success ? 1 : 0);
  const nextFailTurns = current.failTurns + (input.success ? 0 : 1);
  const successCount = Math.max(nextSuccessTurns, 1);
  current.successTurns = nextSuccessTurns;
  current.failTurns = nextFailTurns;
  if (input.success && Number.isFinite(input.firstTokenMs) && input.firstTokenMs! > 0) {
    current.avgFirstTokenMs = avg(current.avgFirstTokenMs, input.firstTokenMs!, successCount);
  }
  if (input.success && Number.isFinite(input.responseMs) && input.responseMs! > 0) {
    current.avgResponseMs = avg(current.avgResponseMs, input.responseMs!, successCount);
  }
  if (input.success && Number.isFinite(input.length) && input.length! > 0) {
    current.avgLength = avg(current.avgLength, input.length!, successCount);
  }
  current.lastUsedAt = Date.now();
  store.stats[input.model] = current;
  cleanupModels(store);
  saveWorkingModelsStore(store);
  return current;
}

export function getModelScore(stats: ModelStats) {
  const successRate = stats.successTurns / (stats.successTurns + stats.failTurns + 1);
  const speedScore = 1 / ((stats.avgFirstTokenMs || 10000) + 1);
  const lengthScore = Math.min((stats.avgLength || 0) / 200, 1);
  return (0.5 * successRate) + (0.3 * speedScore) + (0.2 * lengthScore);
}

export function getBestModel(models: string[]) {
  return getFallbackChain(models)[0] || Array.from(new Set(models.filter(Boolean)))[0] || DEFAULT_AI_MODELS[0];
}

export function getFallbackChain(models: string[]) {
  const store = loadWorkingModelsStore();
  const requested = Array.from(new Set(models.filter(Boolean)));
  return [...requested].sort((left, right) => {
    const leftScore = getModelScore(store.stats[left] || createEmpty(left));
    const rightScore = getModelScore(store.stats[right] || createEmpty(right));
    if (rightScore !== leftScore) return rightScore - leftScore;
    return requested.indexOf(left) - requested.indexOf(right);
  });
}

export function getKnownWorkingModels(models: string[]) {
  const store = loadWorkingModelsStore();
  const requested = Array.from(new Set(models.filter(Boolean)));
  const working = requested.filter((model) => store.workingModels.includes(model));
  return working.length ? working : requested;
}

function cleanupModels(store: WorkingModelsStore) {
  for (const item of Object.values(store.stats)) {
    if (item.successTurns === 0 && item.failTurns > 5) {
      delete store.stats[item.name];
      store.workingModels = store.workingModels.filter((model) => model !== item.name);
      if (store.roles) delete store.roles[item.name];
    }
  }
}
