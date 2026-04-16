import { DEFAULT_AI_MODELS } from "./modelMetrics";
import { loadWorkingModelsStore, recordModelResult, updateWorkingModels } from "./modelHealth";
import type { LlmMessage } from "./prompt";

export type AIProviderName = "ollama" | "openai";

export type ProviderHealth = {
  provider: AIProviderName;
  connected: true;
  host: string;
  model: string;
  availableModels: string[];
  preferredModels?: string[];
};

export type ProviderGenerateResult = {
  text: string;
  partial: boolean;
  model: string;
  provider: AIProviderName;
  firstTokenMs?: number;
  responseMs?: number;
};

export class AIConnectionError extends Error {
  code: string;
  status: number;
  hint?: string;

  constructor(code: string, message: string, status = 503, hint?: string) {
    super(message);
    this.name = "AIConnectionError";
    this.code = code;
    this.status = status;
    this.hint = hint;
  }
}

const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
const OLLAMA_URL = `${OLLAMA_HOST}/api/chat`;
const OLLAMA_TAGS_URL = `${OLLAMA_HOST}/api/tags`;
const OLLAMA_UNLOAD_URL = `${OLLAMA_HOST}/api/generate`;
const OPENAI_MODEL = process.env.AI_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const OLLAMA_GENERATE_TIMEOUT_MS = Number(process.env.AI_TIMEOUT || 35000);
const EXTERNAL_GENERATE_TIMEOUT_MS = 8000;
const OLLAMA_FIRST_TOKEN_TIMEOUT_MS = Number(process.env.AI_FIRST_TOKEN_TIMEOUT || 20000);
const OLLAMA_STREAM_IDLE_MS = Number(process.env.AI_STREAM_IDLE || 8000);
const OLLAMA_STREAM_MIN_PARTIAL_CHARS = 40;
const OLLAMA_STREAM_RETRY_MIN_CHARS = 30;
const OLLAMA_STREAM_FLUSH_CHARS = 20;
const OLLAMA_STOP_TIMEOUT_MS = 1200;
const MODEL_HEALTH_TIMEOUT_MS = 5000;
const MODEL_HEALTH_MIN_CHARS = 10;
const MODEL_HEALTH_CACHE_MS = 10 * 60 * 1000;
let ollamaInferenceLock: Promise<void> = Promise.resolve();

async function withOllamaInferenceLock<T>(task: () => Promise<T>) {
  const previous = ollamaInferenceLock;
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  ollamaInferenceLock = previous
    .catch(() => undefined)
    .then(() => current);
  await previous.catch(() => undefined);
  try {
    return await task();
  } finally {
    release();
  }
}

function logModelDiag(input: {
  model: string;
  firstTokenMs?: number;
  didStartStream: boolean;
  didRetry: boolean;
  failReason?: string | null;
}) {
  console.warn(
    "AI_MODEL_DIAG",
    JSON.stringify({
      model: input.model,
      firstTokenMs: input.firstTokenMs ?? null,
      didStartStream: input.didStartStream,
      didRetry: input.didRetry,
      failReason: input.failReason || null
    })
  );
}

function stripThinking(text: string) {
  return String(text || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function isUnusableAssistantText(text: string) {
  const normalized = stripThinking(text).toLowerCase();
  if (!normalized) return true;
  if (normalized.length < OLLAMA_STREAM_RETRY_MIN_CHARS) return true;
  return (
    /i'?m sorry[, ]+but i can'?t assist with that/.test(normalized) ||
    /i can'?t assist with that/.test(normalized) ||
    /^not legal advice\.?$/.test(normalized) ||
    /^request failed\.?$/.test(normalized)
  );
}

function isRetryableOllamaError(error: unknown) {
  if (!(error instanceof AIConnectionError)) return false;
  return [
    "NO_TOKENS",
    "EMPTY_LLM_RESPONSE",
    "LLM_STREAM_STALLED",
    "LLM_GENERATE_FAILED",
    "NO_LLM"
  ].includes(error.code);
}

function resolveConfiguredProvider(): AIProviderName {
  const configured = String(process.env.AI_PROVIDER || "").trim().toLowerCase();
  if (configured === "ollama" || configured === "openai") {
    return configured;
  }
  if (process.env.OPENAI_API_KEY && process.env.NODE_ENV === "production") {
    return "openai";
  }
  return "ollama";
}

export function resolveAIProvider(): AIProviderName {
  return resolveConfiguredProvider();
}

function getPreferredModels() {
  return Array.from(new Set(DEFAULT_AI_MODELS.filter(Boolean)));
}

function sanitizeRequestedModels(models?: string[]) {
  return Array.from(new Set((models || []).map((item) => String(item || "").trim()).filter(Boolean)));
}

function pickAvailableModels(availableModels: string[], overrideModels?: string[]) {
  const exactRequested = sanitizeRequestedModels(overrideModels);
  if (exactRequested.length) {
    return exactRequested.filter((model) => availableModels.includes(model));
  }
  return getPreferredModels().filter((model) => availableModels.includes(model));
}

async function stopOllamaModel(modelName?: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OLLAMA_STOP_TIMEOUT_MS);
  try {
    await fetch(OLLAMA_UNLOAD_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: modelName || getPreferredModels()[0], keep_alive: 0 }),
      signal: controller.signal
    }).catch(() => null);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function readOllamaChunk(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const idlePromise = new Promise<{ idle: true }>((resolve) => setTimeout(() => resolve({ idle: true }), OLLAMA_STREAM_IDLE_MS));
  const readPromise = reader.read() as Promise<ReadableStreamReadResult<Uint8Array>>;
  return Promise.race([readPromise, idlePromise]);
}

function applyOllamaLine(
  rawLine: string,
  state: {
    hasToken: boolean;
    sawChunk: boolean;
    answer: string;
    emitBuffer: string;
    doneSeen: boolean;
    onDelta?: (_chunk: string) => void;
    onFirstToken: () => void;
  }
) {
  const line = rawLine.trim();
  if (!line) return state;
  const payload = JSON.parse(line) as { message?: { content?: string }; response?: string; done?: boolean };
  const chunk = String(payload.message?.content || payload.response || "");
  let { hasToken, sawChunk, answer, emitBuffer, doneSeen } = state;
  if (chunk) {
    hasToken = true;
    if (!sawChunk) state.onFirstToken();
    sawChunk = true;
    answer += chunk;
    emitBuffer += chunk;
    if (emitBuffer.length >= OLLAMA_STREAM_FLUSH_CHARS || /[.!?\n]$/.test(emitBuffer)) {
      state.onDelta?.(emitBuffer);
      emitBuffer = "";
    }
  }
  if (payload.done) {
    doneSeen = true;
  }
  return {
    ...state,
    hasToken,
    sawChunk,
    answer,
    emitBuffer,
    doneSeen
  };
}

async function runOllamaChat(
  model: string,
  messages: LlmMessage[],
  options: {
    onDelta?: (_chunk: string) => void;
    retryShortOnce?: boolean;
    fullTimeoutMs?: number;
    firstTokenTimeoutMs?: number;
    minPartialChars?: number;
    minUsableChars?: number;
    didRetry?: boolean;
  } = {}
): Promise<ProviderGenerateResult> {
  const controller = new AbortController();
  const startedAt = Date.now();
  let firstTokenAt = 0;
  const hardTimeoutId = setTimeout(() => controller.abort(), options.fullTimeoutMs || OLLAMA_GENERATE_TIMEOUT_MS);
  const firstTokenTimeoutId = setTimeout(() => controller.abort(), options.firstTokenTimeoutMs || OLLAMA_FIRST_TOKEN_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        stream: true,
        keep_alive: "5m",
        messages,
        options: {
          num_ctx: 1024,
          num_predict: 384,
          temperature: 0.85,
          top_p: 0.9
        }
      }),
      signal: controller.signal
    });
  } catch {
    clearTimeout(hardTimeoutId);
    throw new AIConnectionError("NO_LLM", "Ollama chat call failed.", 503, `Expected ${OLLAMA_URL}`);
  }
  if (!response.ok) {
    clearTimeout(hardTimeoutId);
    const body = await response.text().catch(() => "");
    throw new AIConnectionError("LLM_GENERATE_FAILED", "Ollama returned a non-OK response.", 503, body.slice(0, 200) || `HTTP ${response.status}`);
  }
  if (!response.body) {
    clearTimeout(hardTimeoutId);
    throw new AIConnectionError("EMPTY_LLM_RESPONSE", "Ollama returned an empty stream.", 503);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let lineBuffer = "";
  let answer = "";
  let emitBuffer = "";
  let hasToken = false;
  let sawChunk = false;
  let doneSeen = false;
  let idleBreak = false;
  let streamBroke = false;
  const onFirstToken = () => {
    if (!firstTokenAt) firstTokenAt = Date.now();
    clearTimeout(firstTokenTimeoutId);
  };
  try {
    while (true) {
      const next = await readOllamaChunk(reader);
      if ("idle" in next) {
        idleBreak = true;
        streamBroke = !doneSeen;
        break;
      }
      if (next.done) {
        doneSeen = true;
        break;
      }
      lineBuffer += decoder.decode(next.value, { stream: true });
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop() || "";
      for (const rawLine of lines) {
        ({ hasToken, sawChunk, answer, emitBuffer, doneSeen } = applyOllamaLine(rawLine, {
          hasToken,
          sawChunk,
          answer,
          emitBuffer,
          doneSeen,
          onDelta: options.onDelta,
          onFirstToken
        }));
        if (doneSeen) break;
      }
      if (doneSeen) break;
    }
    if (lineBuffer.trim()) {
      ({ hasToken, sawChunk, answer, emitBuffer, doneSeen } = applyOllamaLine(lineBuffer, {
        hasToken,
        sawChunk,
        answer,
        emitBuffer,
        doneSeen,
        onDelta: options.onDelta,
        onFirstToken
      }));
    }
  } finally {
    clearTimeout(hardTimeoutId);
    clearTimeout(firstTokenTimeoutId);
    if (idleBreak && !doneSeen) {
      await reader.cancel().catch(() => null);
    }
    if (!doneSeen) {
      controller.abort();
    }
  }

  const finalText = stripThinking(answer);
  const finalFirstTokenMs = firstTokenAt ? firstTokenAt - startedAt : undefined;
  const finalResponseMs = Date.now() - startedAt;
  const minUsableChars = options.minUsableChars || OLLAMA_STREAM_RETRY_MIN_CHARS;
  const minPartialChars = options.minPartialChars || OLLAMA_STREAM_MIN_PARTIAL_CHARS;
  if (!hasToken) {
    await stopOllamaModel(model);
    logModelDiag({
      model,
      firstTokenMs: finalFirstTokenMs,
      didStartStream: false,
      didRetry: Boolean(options.didRetry),
      failReason: "NO_TOKENS"
    });
    throw new AIConnectionError("NO_TOKENS", "Ollama returned no stream tokens.", 503, `Expected ${OLLAMA_URL}`);
  }
  if (doneSeen && !isUnusableAssistantText(finalText) && finalText.length >= minUsableChars) {
    if (emitBuffer) options.onDelta?.(emitBuffer);
    logModelDiag({
      model,
      firstTokenMs: finalFirstTokenMs,
      didStartStream: true,
      didRetry: Boolean(options.didRetry),
      failReason: null
    });
    return { text: finalText, partial: false, model, provider: "ollama", firstTokenMs: finalFirstTokenMs, responseMs: finalResponseMs };
  }
  if (!doneSeen && !streamBroke && finalText.length >= minPartialChars && !isUnusableAssistantText(finalText)) {
    if (emitBuffer) options.onDelta?.(emitBuffer);
    logModelDiag({
      model,
      firstTokenMs: finalFirstTokenMs,
      didStartStream: true,
      didRetry: Boolean(options.didRetry),
      failReason: null
    });
    return { text: finalText, partial: true, model, provider: "ollama", firstTokenMs: finalFirstTokenMs, responseMs: finalResponseMs };
  }
  if (options.retryShortOnce !== false && sawChunk) {
    await stopOllamaModel(model);
    return runOllamaChat(model, messages, { ...options, retryShortOnce: false, didRetry: true });
  }
  await stopOllamaModel(model);
  logModelDiag({
    model,
    firstTokenMs: finalFirstTokenMs,
    didStartStream: hasToken,
    didRetry: Boolean(options.didRetry),
    failReason: sawChunk ? "LLM_STREAM_STALLED" : "EMPTY_LLM_RESPONSE"
  });
  throw new AIConnectionError(
    sawChunk ? "LLM_STREAM_STALLED" : "EMPTY_LLM_RESPONSE",
    sawChunk ? "Ollama stream stalled before producing a usable answer." : "Ollama returned an empty response.",
    503,
    `Expected ${OLLAMA_URL}`
  );
}

async function runOpenAiChat(model: string, messages: LlmMessage[]): Promise<ProviderGenerateResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new AIConnectionError("NO_LLM", "External AI provider is not configured.", 503, "Missing OPENAI_API_KEY");
  }
  const controller = new AbortController();
  const timeoutPromise = new Promise<Response | null>((resolve) => setTimeout(() => {
    controller.abort();
    resolve(null);
  }, EXTERNAL_GENERATE_TIMEOUT_MS));
  try {
    const response = await Promise.race([
      fetch(`${OPENAI_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model,
          temperature: 0.9,
          top_p: 0.95,
          max_tokens: 384,
          messages
        }),
        signal: controller.signal
      }),
      timeoutPromise
    ]);
    if (!response) {
      throw new AIConnectionError("LLM_TIMEOUT", "External chat provider timed out.", 503);
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new AIConnectionError("LLM_GENERATE_FAILED", "External chat provider returned a non-OK response.", 503, body.slice(0, 200) || `HTTP ${response.status}`);
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const answer = stripThinking(String(payload.choices?.[0]?.message?.content || ""));
    if (!answer) {
      throw new AIConnectionError("EMPTY_LLM_RESPONSE", "External chat provider returned an empty response.", 503);
    }
    return { text: answer, partial: false, model, provider: "openai" };
  } catch (error) {
    if (error instanceof AIConnectionError) throw error;
    throw new AIConnectionError("NO_LLM", "External AI provider is not reachable.", 503);
  }
}

async function checkOllamaModelHealth(model: string) {
  try {
    const result = await runOllamaChat(
      model,
      [
        { role: "system", content: "Reply with one short friendly sentence." },
        { role: "user", content: "Say hello in one sentence." }
      ],
      {
        retryShortOnce: false,
        firstTokenTimeoutMs: MODEL_HEALTH_TIMEOUT_MS,
        fullTimeoutMs: MODEL_HEALTH_TIMEOUT_MS,
        minUsableChars: MODEL_HEALTH_MIN_CHARS,
        minPartialChars: MODEL_HEALTH_MIN_CHARS
      }
    );
    recordModelResult({
      model,
      success: true,
      firstTokenMs: result.firstTokenMs,
      responseMs: result.responseMs,
      length: result.text.length
    });
    return true;
  } catch {
    recordModelResult({ model, success: false, firstTokenMs: MODEL_HEALTH_TIMEOUT_MS, responseMs: MODEL_HEALTH_TIMEOUT_MS, length: 0 });
    return false;
  }
}

export async function verifyProviderConnection(overrideModels?: string[]): Promise<ProviderHealth> {
  const provider = resolveConfiguredProvider();
  if (provider === "openai") {
    if (!process.env.OPENAI_API_KEY) {
      throw new AIConnectionError("NO_LLM", "External AI provider is not configured.", 503, "Missing OPENAI_API_KEY");
    }
    return {
      provider,
      connected: true,
      host: OPENAI_BASE_URL,
      model: OPENAI_MODEL,
      availableModels: [OPENAI_MODEL]
    };
  }

  let response: Response;
  try {
    response = await fetch(OLLAMA_TAGS_URL, {
      method: "GET",
      signal: AbortSignal.timeout(3000)
    });
  } catch {
    throw new AIConnectionError("NO_LLM", "Ollama is not reachable.", 503, `Expected ${OLLAMA_TAGS_URL}`);
  }
  if (!response.ok) {
    throw new AIConnectionError("NO_LLM", "Ollama health check failed.", 503, `HTTP ${response.status}`);
  }
  const payload = (await response.json()) as { models?: Array<{ name?: string }> };
  const availableModels = (payload.models || []).map((item) => String(item.name || "").trim()).filter(Boolean);
  const exactRequested = sanitizeRequestedModels(overrideModels);
  if (exactRequested.length) {
    const exactAvailable = exactRequested.filter((model) => availableModels.includes(model));
    if (!exactAvailable.length) {
      throw new AIConnectionError(
        "MODEL_NOT_FOUND",
        "Requested Ollama model is not installed.",
        503,
        availableModels.length ? `Available: ${availableModels.join(", ")}` : "No local Ollama models reported."
      );
    }
    return {
      provider,
      connected: true,
      host: OLLAMA_HOST,
      model: exactAvailable[0],
      availableModels,
      preferredModels: exactAvailable
    };
  }
  const candidateModels = pickAvailableModels(availableModels, overrideModels);
  const existing = loadWorkingModelsStore();
  let workingModels: string[] = [];
  if (existing.updatedAt && (Date.now() - existing.updatedAt) < MODEL_HEALTH_CACHE_MS) {
    workingModels = candidateModels.filter((model) => existing.workingModels.includes(model));
  } else {
    for (const model of candidateModels) {
      if (await checkOllamaModelHealth(model)) {
        workingModels.push(model);
      }
    }
    updateWorkingModels(workingModels);
  }
  const preferredModels = workingModels.length ? pickAvailableModels(workingModels, overrideModels) : [];
  const model = preferredModels[0];
  if (!model) {
    throw new AIConnectionError(
      "MODEL_NOT_FOUND",
      "No working conversational Ollama model is currently available.",
      503,
      availableModels.length ? `Available: ${availableModels.join(", ")}` : "No local Ollama models reported."
    );
  }
  return {
    provider,
    connected: true,
    host: OLLAMA_HOST,
    model,
    availableModels,
    preferredModels
  };
}

export async function warmProviderModel(overrideModels?: string[]) {
  const health = await verifyProviderConnection(overrideModels);
  if (health.provider !== "ollama") {
    return { warmed: false, model: health.model, provider: health.provider };
  }
  const response = await fetch(OLLAMA_UNLOAD_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: health.model, prompt: "", keep_alive: "5m" })
  }).catch(() => null);
  if (!response?.ok) {
    throw new AIConnectionError("LLM_WARMUP_FAILED", "Ollama warmup failed.", 503, health.model);
  }
  return { warmed: true, model: health.model, provider: health.provider };
}

export async function generateWithProvider(
  messages: LlmMessage[],
  options: { overrideModels?: string[]; onDelta?: (_chunk: string) => void } = {}
): Promise<ProviderGenerateResult> {
  const health = await verifyProviderConnection(options.overrideModels);
  if (health.provider === "openai") {
    return runOpenAiChat(health.model, messages);
  }
  const model = health.model;
  let lastError: unknown = null;
  for (const attempt of [0, 1]) {
    try {
      if (attempt > 0) {
        await warmProviderModel([model]).catch(() => null);
      }
      const result = await withOllamaInferenceLock(() =>
        runOllamaChat(model, messages, {
          onDelta: options.onDelta,
          firstTokenTimeoutMs: OLLAMA_FIRST_TOKEN_TIMEOUT_MS,
          fullTimeoutMs: OLLAMA_GENERATE_TIMEOUT_MS,
          didRetry: attempt > 0
        })
      );
      recordModelResult({
        model,
        success: true,
        firstTokenMs: result.firstTokenMs,
        responseMs: result.responseMs,
        length: result.text.length
      });
      return result;
    } catch (error) {
      lastError = error;
      if (attempt === 0 && isRetryableOllamaError(error)) {
        continue;
      }
      recordModelResult({
        model,
        success: false,
        firstTokenMs: OLLAMA_FIRST_TOKEN_TIMEOUT_MS,
        responseMs: OLLAMA_GENERATE_TIMEOUT_MS,
        length: 0
      });
      break;
    }
  }
  if (lastError instanceof AIConnectionError) {
    throw lastError;
  }
  throw new AIConnectionError("LLM_GENERATE_FAILED", "The local companion model failed.", 503);
}
