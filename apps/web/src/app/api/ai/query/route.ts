import { createRequestId, errorResponse, okResponse } from "@/lib/api/response";
import { answerWithSsot } from "../_lib/llm";
import { retrieveAiContext } from "../_lib/retrieval";

export const runtime = "nodejs";

type AiQueryRequest = {
  query?: string;
  geo?:
    | {
        country?: string | null;
        iso2?: string | null;
      }
    | null;
};

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

function sanitizeQuery(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 500);
}

export async function POST(req: Request) {
  const requestId = createRequestId(req);
  let body: AiQueryRequest;
  try {
    body = (await req.json()) as AiQueryRequest;
  } catch {
    return errorResponse(requestId, 400, "INVALID_JSON", "Invalid JSON body.");
  }

  const query = sanitizeQuery(body.query);
  if (!query) {
    return errorResponse(requestId, 400, "MISSING_QUERY", "Missing query.");
  }

  const ip = getClientIp(req);
  if (!checkRateLimit(ip)) {
    return errorResponse(requestId, 429, "RATE_LIMITED", "Rate limit exceeded.");
  }

  const geo = body.geo ?? null;
  if (!geo?.country || !geo?.iso2) {
    return okResponse(requestId, {
      answer: "Unknown. No country context provided.",
      sources: [],
      contextGeo: null,
      model: "ssot-no-geo"
    });
  }

  const context = retrieveAiContext(query, geo);
  const result = await answerWithSsot(query, context);

  return okResponse(requestId, {
    answer: result.answer,
    sources: context?.officialSources || [],
    contextGeo: context?.geo || null,
    model: result.model
  });
}
