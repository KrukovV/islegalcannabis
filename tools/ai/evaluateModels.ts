import fs from "node:fs";
import path from "node:path";

type StreamEvent =
  | { type: "meta"; model?: string }
  | { type: "delta"; text?: string }
  | { type: "done"; ok?: boolean; answer?: string; model?: string; partial?: boolean; error?: { message?: string } };

type Scenario = {
  name: string;
  country: string;
  geo: string;
  prompts: string[];
  validators: Array<(answer: string) => boolean>;
};

type ScenarioMetrics = {
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

type ModelResult = {
  model: string;
  score: number;
  speed: number;
  stability: number;
  context: number;
  engagement: number;
  scenarios: ScenarioMetrics[];
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

const BASE_URL = process.env.AI_EVAL_BASE_URL || "http://127.0.0.1:3000";
const MODELS = (process.env.AI_EVAL_MODELS || "qwen2.5:1.5b,qwen2.5:3b,deepseek-coder:1.3b")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const METRICS_FILE = process.env.AI_MODEL_METRICS_FILE || path.resolve(process.cwd(), "data/ai/model_metrics.json");
const FIRST_TOKEN_TARGET_MS = 8000;
const FULL_RESPONSE_TARGET_MS = 25000;
const MIN_GOOD_ANSWER_LEN = 60;

function isUnusableAnswer(answer: string) {
  const normalized = String(answer || "").trim().toLowerCase();
  if (!normalized) return true;
  return (
    normalized.length < MIN_GOOD_ANSWER_LEN ||
    /i'?m sorry[, ]+but i can'?t assist with that/.test(normalized) ||
    /i can'?t assist with that/.test(normalized) ||
    /^not legal advice\.?$/.test(normalized) ||
    /^request failed\.?$/.test(normalized)
  );
}

const scenarios: Scenario[] = [
  ["Germany", "DE"],
  ["Netherlands", "NL"],
  ["Spain", "ES"],
  ["Portugal", "PT"],
  ["India", "IN"],
  ["Thailand", "TH"]
].map(([country, geo]) => ({
  name: String(country).toLowerCase(),
  country: String(country),
  geo: String(geo),
  prompts: [
    `Cannabis in ${country}`,
    "Is it legal?",
    "What about real life?",
    "Risk?",
    "Travel?",
    "Compare with Germany"
  ],
  validators: [
    (answer) => new RegExp(`\\b${country}\\b`, "i").test(answer),
    (answer) => /\blegal|illegal|decriminal|medical|recreational|restricted\b/i.test(answer),
    (answer) => /\breal|practice|street|social|enforcement|common\b/i.test(answer),
    (answer) => /\brisk|fine|prison|penalt|enforcement\b/i.test(answer),
    (answer) => /\btravel|airport|border|carry|customs\b/i.test(answer),
    (answer) =>
      /\bgermany\b/i.test(answer) &&
      (String(country) === "Germany" || new RegExp(`\\b${country}\\b`, "i").test(answer))
  ]
}));

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number) {
  return Number(value.toFixed(3));
}

function engagementPass(answer: string, previous: string | null) {
  const normalized = answer.trim().toLowerCase();
  if (normalized.length < MIN_GOOD_ANSWER_LEN) return false;
  if (previous && normalized === previous.trim().toLowerCase()) return false;
  return /important|nuance|careful|if you want|worth noting|interesting|best advice|risk|practice/i.test(answer) || normalized.length > 110;
}

function normalizeSpeed(avgFirstTokenMs: number, avgFullResponseMs: number, successRate: number) {
  if (successRate <= 0) return 0;
  const first = Math.max(0, 1 - avgFirstTokenMs / FIRST_TOKEN_TARGET_MS);
  const full = Math.max(0, 1 - avgFullResponseMs / FULL_RESPONSE_TARGET_MS);
  return round((first * 0.6 + full * 0.4) * successRate);
}

function normalizeStability(input: {
  streamBreaks: number;
  shortAnswers: number;
  repeatedAnswers: number;
  modelFallbacks: number;
  failedTurns: number;
  totalTurns: number;
}) {
  const penalty =
    input.streamBreaks * 0.15 +
    input.shortAnswers * 0.08 +
    input.repeatedAnswers * 0.08 +
    input.modelFallbacks * 0.05 +
    input.failedTurns * 0.2;
  const successRate = 1 - input.failedTurns / Math.max(input.totalTurns, 1);
  const raw = Math.max(0, successRate - penalty / Math.max(input.totalTurns, 1));
  return round(raw);
}

function computeFinalScore(result: Omit<ModelResult, "score">) {
  const totalTurns = scenarios.reduce((sum, scenario) => sum + scenario.prompts.length, 0);
  const successScore = Math.min(result.metrics.successTurns / Math.max(totalTurns, 1), 1);
  const lengthScore = Math.min(result.metrics.avgAnswerLength / 160, 1);
  return round(successScore * 0.4 + result.stability * 0.3 + result.speed * 0.2 + lengthScore * 0.1);
}

function parseNdjsonChunk(buffer: string) {
  const lines = buffer.split("\n");
  const rest = lines.pop() || "";
  const events: StreamEvent[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    try {
      events.push(JSON.parse(line) as StreamEvent);
    } catch {
      continue;
    }
  }
  return { rest, events };
}

async function warmModel(model: string) {
  await fetch(`${BASE_URL}/api/ai-assistant/query?warm=1&model=${encodeURIComponent(model)}`).catch(() => null);
}

async function resetDialog(model: string, geo: string) {
  await fetch(`${BASE_URL}/api/ai-assistant/query`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ai-reset": "1"
    },
    body: JSON.stringify({ message: "reset", model, geo_hint: geo })
  }).catch(() => null);
}

async function ask(model: string, geo: string, prompt: string) {
  const startedAt = Date.now();
  const response = await fetch(`${BASE_URL}/api/ai-assistant/query`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ai-stream": "1"
    },
    body: JSON.stringify({
      message: prompt,
      geo_hint: geo,
      model
    })
  });

  if (!response.ok || !response.body) {
    return {
      ok: false,
      answer: "",
      firstTokenMs: -1,
      fullResponseMs: Date.now() - startedAt,
      modelsAttempted: [] as string[],
      partial: false
    };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";
  let finalAnswer = "";
  let firstTokenMs = -1;
  const modelsAttempted: string[] = [];
  let partial = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parsed = parseNdjsonChunk(buffer);
    buffer = parsed.rest;
    for (const event of parsed.events) {
      if (event.type === "meta" && event.model) {
        modelsAttempted.push(event.model);
      }
      if (event.type === "delta") {
        const chunk = String(event.text || "");
        if (chunk && firstTokenMs < 0) {
          firstTokenMs = Date.now() - startedAt;
        }
        answer += chunk;
      }
      if (event.type === "done") {
        partial = Boolean(event.partial);
        finalAnswer = String(event.answer || answer || "");
        return {
          ok: Boolean(event.ok),
          answer: finalAnswer.trim(),
          firstTokenMs: firstTokenMs < 0 ? Date.now() - startedAt : firstTokenMs,
          fullResponseMs: Date.now() - startedAt,
          modelsAttempted,
          partial
        };
      }
    }
  }

  return {
    ok: false,
    answer: finalAnswer.trim() || answer.trim(),
    firstTokenMs: firstTokenMs < 0 ? Date.now() - startedAt : firstTokenMs,
    fullResponseMs: Date.now() - startedAt,
    modelsAttempted,
    partial
  };
}

async function runScenario(model: string, scenario: Scenario): Promise<ScenarioMetrics> {
  await warmModel(model);
  await resetDialog(model, scenario.geo);
  let previousAnswer: string | null = null;
  const firstTokenTimes: number[] = [];
  const fullResponseTimes: number[] = [];
  const answerLengths: number[] = [];
  let successTurns = 0;
  let streamBreaks = 0;
  let shortAnswers = 0;
  let repeatedAnswers = 0;
  let contextPasses = 0;
  let engagementPasses = 0;
  let modelFallbacks = 0;
  let failedTurns = 0;

  for (let index = 0; index < scenario.prompts.length; index += 1) {
    const result = await ask(model, scenario.geo, scenario.prompts[index]);
    const answer = result.answer;
    if (result.modelsAttempted.length > 1) {
      modelFallbacks += result.modelsAttempted.length - 1;
    }
    if (!result.ok || !answer || isUnusableAnswer(answer)) {
      failedTurns += 1;
      continue;
    }
    successTurns += 1;
    firstTokenTimes.push(result.firstTokenMs);
    fullResponseTimes.push(result.fullResponseMs);
    answerLengths.push(answer.length);
    if (result.firstTokenMs > FIRST_TOKEN_TARGET_MS) streamBreaks += 1;
    if (answer.length < MIN_GOOD_ANSWER_LEN || result.partial) shortAnswers += 1;
    if (previousAnswer && previousAnswer.trim().toLowerCase() === answer.trim().toLowerCase()) repeatedAnswers += 1;
    if (scenario.validators[index]?.(answer)) contextPasses += 1;
    if (engagementPass(answer, previousAnswer)) engagementPasses += 1;
    previousAnswer = answer;
  }

  return {
    name: scenario.name,
    turns: scenario.prompts.length,
    successTurns,
    avgFirstTokenMs: round(average(firstTokenTimes)),
    avgFullResponseMs: round(average(fullResponseTimes)),
    avgAnswerLength: round(average(answerLengths)),
    streamBreaks,
    shortAnswers,
    repeatedAnswers,
    contextPasses,
    engagementPasses,
    modelFallbacks,
    failedTurns
  };
}

async function evaluateModel(model: string): Promise<ModelResult> {
  const scenarioResults: ScenarioMetrics[] = [];
  for (const scenario of scenarios) {
    scenarioResults.push(await runScenario(model, scenario));
  }
  const totalTurns = scenarioResults.reduce((sum, scenario) => sum + scenario.turns, 0);
  const successTurns = scenarioResults.reduce((sum, scenario) => sum + scenario.successTurns, 0);
  const avgFirstTokenMs = average(scenarioResults.map((scenario) => scenario.avgFirstTokenMs));
  const avgFullResponseMs = average(scenarioResults.map((scenario) => scenario.avgFullResponseMs));
  const avgAnswerLength = average(scenarioResults.map((scenario) => scenario.avgAnswerLength));
  const streamBreaks = scenarioResults.reduce((sum, scenario) => sum + scenario.streamBreaks, 0);
  const shortAnswers = scenarioResults.reduce((sum, scenario) => sum + scenario.shortAnswers, 0);
  const repeatedAnswers = scenarioResults.reduce((sum, scenario) => sum + scenario.repeatedAnswers, 0);
  const contextPasses = scenarioResults.reduce((sum, scenario) => sum + scenario.contextPasses, 0);
  const engagementPasses = scenarioResults.reduce((sum, scenario) => sum + scenario.engagementPasses, 0);
  const modelFallbacks = scenarioResults.reduce((sum, scenario) => sum + scenario.modelFallbacks, 0);
  const failedTurns = scenarioResults.reduce((sum, scenario) => sum + scenario.failedTurns, 0);
  const successRate = successTurns / Math.max(totalTurns, 1);

  const speed = normalizeSpeed(avgFirstTokenMs, avgFullResponseMs, successRate);
  const stability = normalizeStability({
    streamBreaks,
    shortAnswers,
    repeatedAnswers,
    modelFallbacks,
    failedTurns,
    totalTurns
  });
  const context = round(contextPasses / Math.max(totalTurns, 1));
  const engagement = round(engagementPasses / Math.max(totalTurns, 1));

  const base: Omit<ModelResult, "score"> = {
    model,
    speed,
    stability,
    context,
    engagement,
    scenarios: scenarioResults,
    metrics: {
      avgFirstTokenMs: round(avgFirstTokenMs),
      avgFullResponseMs: round(avgFullResponseMs),
      avgAnswerLength: round(avgAnswerLength),
      streamBreaks,
      shortAnswers,
      repeatedAnswers,
      contextPassRate: context,
      engagementPassRate: engagement,
      modelFallbacks,
      failedTurns,
      successTurns
    }
  };

  return {
    ...base,
    score: computeFinalScore(base)
  };
}

async function main() {
  const results: ModelResult[] = [];
  for (const model of MODELS) {
    console.log(`AI_EVAL model=${model}`);
    results.push(await evaluateModel(model));
  }
  results.sort((left, right) => right.score - left.score);
  const payload = {
    generated_at: new Date().toISOString(),
    base_url: BASE_URL,
    best_model: results[0]?.model || null,
    fallback_chain: results.map((item) => item.model),
    models: results
  };
  fs.mkdirSync(path.dirname(METRICS_FILE), { recursive: true });
  fs.writeFileSync(METRICS_FILE, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error("AI_EVAL_FAILED", error);
  process.exitCode = 1;
});
