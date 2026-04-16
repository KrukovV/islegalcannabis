import { createRequestId, errorResponse, okResponse } from "@/lib/api/response";
import { answerWithAssistant, buildContext, buildDeterministicRetryInstruction, generateAnswer, needsOutputRetry, normalizeAnswer } from "@/ai-assistant/aiRuntime";
import { isGlobalCultureQuery, isProductRiskQuery, isSmallAmountRiskQuery, rememberDialog, resetDialogState } from "@/ai-assistant/dialog";
import { buildMessages } from "@/ai-assistant/prompt";
import { AIConnectionError, generateWithProvider, resolveAIProvider, verifyProviderConnection, warmProviderModel } from "@/ai-assistant/provider";
import { loadWorkingModelsStore } from "@/ai-assistant/modelHealth";
import { retrieveMemory, saveMemory, scoreMemory } from "@/ai-assistant/memory";
import { retrieveTopChunks } from "@/ai-assistant/rag";
import type { AIRequest } from "@/ai-assistant/types";

export const runtime = "nodejs";
const AI_ENABLE_PROD = process.env.AI_ENABLE_PROD === "1";

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
  if (!ip || ip === "unknown" || ip === "::1" || ip === "127.0.0.1") {
    return true;
  }
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

function sanitizeModelOverride(value: string | null | undefined) {
  const model = String(value || "").trim();
  return /^[a-z0-9_.:-]+$/i.test(model) ? model : undefined;
}

function shouldUseNearbyTruth(message: string, context: ReturnType<typeof buildContext>) {
  return Boolean(
    context.nearby &&
      (
        context.intent === "nearby" ||
        context.history.lastIntent === "nearby" ||
        /near me|nearest|nearby|closest|distance|safer|which option|tolerated|around me|border|what about borders|risk on the way|in real life|ближайш|рядом|куда ближе|что ближе|какой вариант безопаснее|границ|риск/i.test(
          message
        )
      )
  );
}

function sanitizeCoordinate(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function streamEvent(data: Record<string, unknown>) {
  return new TextEncoder().encode(`${JSON.stringify(data)}\n`);
}

async function streamOllamaResponse(
  requestId: string,
  message: string,
  geoHint: string | undefined,
  coords: { lat?: number; lng?: number } | undefined,
  language: string,
  modelOverride?: string
) {
  const contextChunks = retrieveTopChunks(message, geoHint, 5);
  const baseContext = buildContext(message, geoHint, coords, contextChunks, language);
  const memoryMatches = retrieveMemory(
    message,
    baseContext.intent,
    baseContext.location.geoHint || undefined,
    baseContext.history.lastLocation || baseContext.location.geoHint || undefined
  ).map((item) => ({
    query: item.query,
      answer: item.answer,
      score: item.score
  }));
  const context = buildContext(message, geoHint, coords, contextChunks, language, memoryMatches);
  if (context.compare?.name && /compare|safer|why/i.test(message)) {
    const answer = generateAnswer(context);
    rememberDialog(context, answer);
    if (answer.length > 60) {
      saveMemory({
        query: message,
        intent: context.intent,
        location: context.location.geoHint || undefined,
        answer,
        score: scoreMemory(answer, Boolean(context.history.lastIntent), Boolean(memoryMatches.length))
      });
    }
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(streamEvent({ type: "meta", requestId, model: "compare-engine" }));
        controller.enqueue(streamEvent({ type: "delta", text: answer }));
        controller.enqueue(streamEvent({
          type: "done",
          ok: true,
          answer,
          sources: context.sources,
          safety_note: context.language === "ru" ? "Не юридическая консультация." : "Not legal advice.",
          llm_connected: false,
          model: "compare-engine",
          partial: false
        }));
        controller.close();
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
  if (!context.compare?.name && isProductRiskQuery(message)) {
    const answer = generateAnswer(context);
    rememberDialog(context, answer);
    if (answer.length > 60) {
      saveMemory({
        query: message,
        intent: context.intent,
        location: context.location.geoHint || undefined,
        answer,
        score: scoreMemory(answer, Boolean(context.history.lastIntent), Boolean(memoryMatches.length))
      });
    }
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(streamEvent({ type: "meta", requestId, model: "product-risk-engine" }));
        controller.enqueue(streamEvent({ type: "delta", text: answer }));
        controller.enqueue(streamEvent({
          type: "done",
          ok: true,
          answer,
          sources: context.sources,
          safety_note: context.language === "ru" ? "Не юридическая консультация." : "Not legal advice.",
          llm_connected: false,
          model: "product-risk-engine",
          partial: false
        }));
        controller.close();
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
  if (isGlobalCultureQuery(message)) {
    const answer = generateAnswer(context);
    rememberDialog(context, answer);
    if (answer.length > 60) {
      saveMemory({
        query: message,
        intent: context.intent,
        location: context.location.geoHint || undefined,
        answer,
        score: scoreMemory(answer, Boolean(context.history.lastIntent), Boolean(memoryMatches.length))
      });
    }
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(streamEvent({ type: "meta", requestId, model: "culture-engine" }));
        controller.enqueue(streamEvent({ type: "delta", text: answer }));
        controller.enqueue(streamEvent({
          type: "done",
          ok: true,
          answer,
          sources: context.sources,
          safety_note: context.language === "ru" ? "Не юридическая консультация." : "Not legal advice.",
          llm_connected: false,
          model: "culture-engine",
          partial: false
        }));
        controller.close();
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
  if (isSmallAmountRiskQuery(message)) {
    const answer = generateAnswer(context);
    rememberDialog(context, answer);
    if (answer.length > 60) {
      saveMemory({
        query: message,
        intent: context.intent,
        location: context.location.geoHint || undefined,
        answer,
        score: scoreMemory(answer, Boolean(context.history.lastIntent), Boolean(memoryMatches.length))
      });
    }
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(streamEvent({ type: "meta", requestId, model: "risk-engine" }));
        controller.enqueue(streamEvent({ type: "delta", text: answer }));
        controller.enqueue(streamEvent({
          type: "done",
          ok: true,
          answer,
          sources: context.sources,
          safety_note: context.language === "ru" ? "Не юридическая консультация." : "Not legal advice.",
          llm_connected: false,
          model: "risk-engine",
          partial: false
        }));
        controller.close();
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
  if (shouldUseNearbyTruth(message, context)) {
    const nearbyContext = { ...context, intent: "nearby" as const };
    const answer = generateAnswer(nearbyContext);
    rememberDialog(nearbyContext, answer);
    if (answer.length > 60) {
      saveMemory({
        query: message,
        intent: nearbyContext.intent,
        location: nearbyContext.location.geoHint || undefined,
        answer,
        score: scoreMemory(answer, Boolean(context.history.lastIntent), Boolean(memoryMatches.length))
      });
    }
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(streamEvent({ type: "meta", requestId, model: "truth-engine" }));
        controller.enqueue(streamEvent({ type: "delta", text: answer }));
        controller.enqueue(streamEvent({
          type: "done",
          ok: true,
          answer,
          sources: nearbyContext.sources,
          safety_note: nearbyContext.language === "ru" ? "Не юридическая консультация." : "Not legal advice.",
          llm_connected: false,
          model: "truth-engine",
          partial: false
        }));
        controller.close();
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
  const messages = buildMessages({ query: message, context });
  const health = await verifyProviderConnection(modelOverride ? [modelOverride] : undefined);
  const model = health.model;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(streamEvent({ type: "meta", requestId, model }));
        let finalResult: { text: string; partial: boolean; model: string } | null = null;
        try {
          let attempt = await generateWithProvider(messages, {
            overrideModels: [model],
            onDelta: (chunk) => controller.enqueue(streamEvent({ type: "delta", text: chunk }))
          });
          let normalizedText = normalizeAnswer(attempt.text);
          if (needsOutputRetry(context, normalizedText)) {
            const retryMessages = [
              ...messages,
              {
                role: "user" as const,
                content: buildDeterministicRetryInstruction(context)
              }
            ];
            attempt = await generateWithProvider(retryMessages, {
              overrideModels: [model],
              onDelta: (chunk) => controller.enqueue(streamEvent({ type: "delta", text: chunk }))
            });
            normalizedText = normalizeAnswer(attempt.text);
          }
          finalResult = {
            text:
              normalizedText && !needsOutputRetry(context, normalizedText)
                ? normalizedText
                : generateAnswer(context),
            partial: attempt.partial,
            model: attempt.model
          };
        } catch {
          finalResult = { text: generateAnswer(context), partial: false, model };
        }
        rememberDialog(context, finalResult.text);
        if (!finalResult.partial && finalResult.text.length > 60) {
          saveMemory({
            query: message,
            intent: context.intent,
            location: context.location.geoHint || undefined,
            answer: finalResult.text,
            score: scoreMemory(finalResult.text, Boolean(context.history.lastIntent), Boolean(memoryMatches.length))
          });
        }
        controller.enqueue(streamEvent({
          type: "done",
          ok: true,
          answer: finalResult.text,
          sources: context.sources,
          safety_note: context.language === "ru" ? "Не юридическая консультация." : "Not legal advice.",
          llm_connected: true,
          model: finalResult.model,
          partial: finalResult.partial
        }));
      } catch (error) {
        const code = error instanceof AIConnectionError ? error.code : "AI_RUNTIME_FAILED";
        const message = error instanceof Error ? error.message : "AI runtime failed.";
        controller.enqueue(streamEvent({
          type: "done",
          ok: false,
          error: { code, message }
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
  const wantsReset = req.headers.get("x-ai-reset") === "1";
  if (wantsReset) {
    resetDialogState();
  }
  let body: AIRequest;
  try {
    body = (await req.json()) as AIRequest;
  } catch {
    return errorResponse(requestId, 400, "INVALID_JSON", "Invalid JSON body.");
  }

  const message = sanitizeMessage(body.message);
  if (wantsReset && (!message || /^reset$/i.test(message))) {
    return okResponse(requestId, {
      reset: true,
      llm_connected: false
    });
  }
  if (!message) {
    return errorResponse(requestId, 400, "MISSING_MESSAGE", "Missing message.");
  }

  if (!checkRateLimit(getClientIp(req))) {
    return errorResponse(requestId, 429, "RATE_LIMITED", "Rate limit exceeded.");
  }

  const geoHint = sanitizeGeoHint(body.geo_hint);
  const coords = {
    lat: sanitizeCoordinate(body.lat),
    lng: sanitizeCoordinate(body.lng)
  };
  const modelOverride = sanitizeModelOverride(body.model);
  const language = sanitizeLanguage(req.headers.get("accept-language"));
  const wantsStream = req.headers.get("x-ai-stream") === "1";
  if (wantsStream && resolveAIProvider() === "ollama") {
    try {
      return await streamOllamaResponse(requestId, message, geoHint, coords, language, modelOverride);
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
    result = await answerWithAssistant(message, geoHint, coords, context, language, modelOverride ? [modelOverride] : undefined);
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
  const url = new URL(req.url);
  const modelOverride = sanitizeModelOverride(url.searchParams.get("model"));
  if (url.searchParams.get("warm") === "1") {
    try {
      const warmed = await warmProviderModel(modelOverride ? [modelOverride] : undefined);
      return okResponse(requestId, {
        llm_connected: true,
        warmed: warmed.warmed,
        model: warmed.model
      });
    } catch (error) {
      if (error instanceof AIConnectionError) {
        return errorResponse(requestId, error.status, error.code, error.message, error.hint);
      }
      return errorResponse(requestId, 500, "AI_RUNTIME_FAILED", "AI runtime failed.");
    }
  }
  try {
    const health = await verifyProviderConnection(modelOverride ? [modelOverride] : undefined);
    const working = loadWorkingModelsStore();
    return okResponse(requestId, {
      llm_connected: true,
      model: health.model,
      host: health.host,
      available_models: health.availableModels,
      working_models: working.workingModels
    });
  } catch (error) {
    if (error instanceof AIConnectionError) {
      return errorResponse(requestId, error.status, error.code, error.message, error.hint);
    }
    return errorResponse(requestId, 500, "AI_RUNTIME_FAILED", "AI runtime failed.");
  }
}
