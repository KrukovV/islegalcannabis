import { createRequestId, errorResponse, okResponse } from "@/lib/api/response";
import { AIConnectionError, answerWithAssistant, buildContext, verifyAssistantLlmConnection } from "@/ai-assistant/aiRuntime";
import { rememberDialog, resetDialogState } from "@/ai-assistant/dialog";
import { buildMessages } from "@/ai-assistant/prompt";
import { retrieveTopChunks } from "@/ai-assistant/rag";
import type { AIRequest } from "@/ai-assistant/types";

export const runtime = "nodejs";
const AI_ENABLE_PROD = process.env.AI_ENABLE_PROD === "1";
const AI_PROVIDER = process.env.AI_PROVIDER || (process.env.NODE_ENV === "production" ? "openai" : "ollama");
const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
const OLLAMA_URL = `${OLLAMA_HOST}/api/chat`;
const OLLAMA_STREAM_TIMEOUT_MS = 12000;
const MIN_PARTIAL_WORDS = 24;

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 1000;
const rateLimiter = new Map<string, RateLimitEntry>();

function getClientIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip") || "unknown";
}

function checkRateLimit(ip: string) {
  const now = Date.now();
  const current = rateLimiter.get(ip);
  if (!current || now > current.resetAt) {
    rateLimiter.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (current.count >= RATE_LIMIT) return false;
  current.count += 1;
  return true;
}

function sanitizeMessage(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 500);
}

function sanitizeGeoHint(value: string | null | undefined) {
  const hint = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}(?:-[A-Z]{2})?$/.test(hint) ? hint : undefined;
}

function sanitizeLanguage(value: string | null | undefined) {
  const hint = String(value || "en").trim().slice(0, 2).toLowerCase();
  return /^[a-z]{2}$/.test(hint) ? hint : "en";
}

function countWords(text: string) {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

function isUsablePartialAnswer(text: string) {
  const trimmed = String(text || "").trim();
  return trimmed.length >= 140 || countWords(trimmed) >= MIN_PARTIAL_WORDS;
}

function streamEvent(data: Record<string, unknown>) {
  return new TextEncoder().encode(`${JSON.stringify(data)}\n`);
}

async function streamOllamaResponse(requestId: string, message: string, geoHint: string | undefined, language: string) {
  const contextChunks = retrieveTopChunks(message, geoHint, 5);
  const context = buildContext(message, geoHint, contextChunks, language);
  const messages = buildMessages({ query: message, context });
  const health = await verifyAssistantLlmConnection();
  const fallbackAnswer = context.language === "ru"
    ? "Секунду, модель думает чуть дольше обычного. Попробуй ещё раз."
    : "Give me a second, the model is taking longer than usual. Please try once more.";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(streamEvent({ type: "meta", requestId, model: health.model }));
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), OLLAMA_STREAM_TIMEOUT_MS);
      let answer = "";
      let sentAny = false;
      try {
        const response = await fetch(OLLAMA_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model: health.model,
            stream: true,
            keep_alive: "5m",
            messages,
            options: {
              num_ctx: 1024,
              num_predict: 192,
              temperature: 0.7
            }
          }),
          signal: abortController.signal
        });
        if (!response.ok || !response.body) {
          throw new Error(`OLLAMA_STREAM_FAILED:${response.status}`);
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line) continue;
            const payload = JSON.parse(line) as { message?: { content?: string }; done?: boolean };
            const chunk = String(payload.message?.content || "");
            if (chunk) {
              answer += chunk;
              sentAny = true;
              controller.enqueue(streamEvent({ type: "delta", text: chunk }));
            }
            if (payload.done) {
              break;
            }
          }
        }
        clearTimeout(timeoutId);
        if (answer.trim()) {
          rememberDialog(context, answer.trim());
          controller.enqueue(streamEvent({
            type: "done",
            ok: true,
            answer: answer.trim(),
            sources: context.sources,
            safety_note: context.language === "ru" ? "Не юридическая консультация." : "Not legal advice.",
            llm_connected: true,
            model: health.model
          }));
        } else {
          controller.enqueue(streamEvent({
            type: "done",
            ok: true,
            answer: fallbackAnswer,
            sources: context.sources,
            safety_note: context.language === "ru" ? "Не юридическая консультация." : "Not legal advice.",
            llm_connected: false,
            model: health.model
          }));
        }
      } catch {
        clearTimeout(timeoutId);
        const acceptedPartial = sentAny && isUsablePartialAnswer(answer);
        const finalAnswer = acceptedPartial ? answer.trim() : fallbackAnswer;
        if (finalAnswer) {
          rememberDialog(context, finalAnswer);
        }
        controller.enqueue(streamEvent({
          type: "done",
          ok: true,
          answer: finalAnswer,
          sources: context.sources,
          safety_note: context.language === "ru" ? "Не юридическая консультация." : "Not legal advice.",
          llm_connected: acceptedPartial,
          model: health.model
        }));
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

export async function POST(req: Request) {
  const requestId = createRequestId(req);
  if (process.env.NODE_ENV === "production" && !AI_ENABLE_PROD) {
    return errorResponse(requestId, 403, "AI_DISABLED", "AI assistant is disabled in production.");
  }
  if (req.headers.get("x-ai-reset") === "1") {
    resetDialogState();
  }
  let body: AIRequest;
  try {
    body = (await req.json()) as AIRequest;
  } catch {
    return errorResponse(requestId, 400, "INVALID_JSON", "Invalid JSON body.");
  }

  const message = sanitizeMessage(body.message);
  if (!message) {
    return errorResponse(requestId, 400, "MISSING_MESSAGE", "Missing message.");
  }

  if (!checkRateLimit(getClientIp(req))) {
    return errorResponse(requestId, 429, "RATE_LIMITED", "Rate limit exceeded.");
  }

  const geoHint = sanitizeGeoHint(body.geo_hint);
  const language = sanitizeLanguage(req.headers.get("accept-language"));
  const wantsStream = req.headers.get("x-ai-stream") === "1";
  if (wantsStream && AI_PROVIDER === "ollama") {
    try {
      return await streamOllamaResponse(requestId, message, geoHint, language);
    } catch (error) {
      if (error instanceof AIConnectionError) {
        return errorResponse(requestId, error.status, error.code, error.message, error.hint);
      }
      return errorResponse(requestId, 500, "AI_RUNTIME_FAILED", "AI runtime failed.");
    }
  }
  const context = retrieveTopChunks(message, geoHint, 5);
  let result;
  try {
    result = await answerWithAssistant(message, geoHint, context, language);
  } catch (error) {
    if (error instanceof AIConnectionError) {
      return errorResponse(requestId, error.status, error.code, error.message, error.hint);
    }
    return errorResponse(requestId, 500, "AI_RUNTIME_FAILED", "AI runtime failed.");
  }

  return okResponse(requestId, result);
}

export async function GET(req: Request) {
  const requestId = createRequestId(req);
  if (process.env.NODE_ENV === "production" && !AI_ENABLE_PROD) {
    return errorResponse(requestId, 403, "AI_DISABLED", "AI assistant is disabled in production.");
  }
  try {
    const health = await verifyAssistantLlmConnection();
    return okResponse(requestId, {
      llm_connected: true,
      model: health.model,
      host: health.host,
      available_models: health.availableModels
    });
  } catch (error) {
    if (error instanceof AIConnectionError) {
      return errorResponse(requestId, error.status, error.code, error.message, error.hint);
    }
    return errorResponse(requestId, 500, "AI_RUNTIME_FAILED", "AI runtime failed.");
  }
}
