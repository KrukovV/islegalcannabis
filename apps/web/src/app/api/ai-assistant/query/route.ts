import { createRequestId, errorResponse, okResponse } from "@/lib/api/response";
import { answerWithAssistant } from "@/ai-assistant/aiRuntime";
import { retrieveTopChunks } from "@/ai-assistant/rag";
import type { AIRequest } from "@/ai-assistant/types";

export const runtime = "nodejs";

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
  return /^[A-Z]{2}$/.test(hint) ? hint : undefined;
}

function sanitizeLanguage(value: string | null | undefined) {
  const hint = String(value || "en").trim().slice(0, 2).toLowerCase();
  return /^[a-z]{2}$/.test(hint) ? hint : "en";
}

export async function POST(req: Request) {
  const requestId = createRequestId(req);
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
  const context = retrieveTopChunks(message, geoHint, 5);
  const language = sanitizeLanguage(req.headers.get("accept-language"));
  const result = await answerWithAssistant(message, geoHint, context, language);

  return okResponse(requestId, result);
}
