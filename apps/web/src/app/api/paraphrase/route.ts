import { getLawProfile } from "@/lib/lawStore";
import { buildExplanationInput } from "@/lib/explanation";
import { paraphrase } from "@/lib/ai/paraphrase";
import { incrementCounter } from "@/lib/metrics";
import { createRequestId, errorJson, okJson } from "@/lib/api/response";

export const runtime = "nodejs";

type ParaphraseRequest = {
  country?: string;
  region?: string;
  locale?: string;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 1000;
const rateLimiter = new Map<string, RateLimitEntry>();

export function resetParaphraseRateLimitForTests() {
  rateLimiter.clear();
}

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip") ?? "unknown";
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimiter.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimiter.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT) return false;
  entry.count += 1;
  return true;
}

export async function POST(req: Request) {
  const requestId = createRequestId(req);
  let body: ParaphraseRequest;
  try {
    body = (await req.json()) as ParaphraseRequest;
  } catch {
    return errorJson(requestId, 400, "INVALID_JSON", "Invalid JSON body.");
  }

  const country = (body.country ?? "").trim().toUpperCase();
  const region = body.region?.trim().toUpperCase();
  const locale = body.locale?.trim().toLowerCase() ?? "en";

  if (!country) {
    return errorJson(
      requestId,
      400,
      "MISSING_COUNTRY",
      "Missing country.",
      "Provide country (and region for US)."
    );
  }

  const ip = getClientIp(req);
  if (!checkRateLimit(ip)) {
    return errorJson(requestId, 429, "RATE_LIMITED", "Rate limit exceeded.");
  }

  const profile = getLawProfile({ country, region });
  if (!profile) {
    return errorJson(
      requestId,
      404,
      "UNKNOWN_JURISDICTION",
      "Unknown jurisdiction."
    );
  }

  const { status, bullets, risksText } = buildExplanationInput(profile);

  const result = await paraphrase({
    profile,
    status,
    bullets,
    risksText,
    locale
  });

  const provider = process.env.OPENAI_API_KEY ? "openai" : "disabled";
  incrementCounter("paraphrase_generated");
  console.info(`[${requestId}] paraphrase_generated`);

  return okJson(requestId, {
    text: result.text,
    cached: result.cached,
    provider,
    model: provider === "openai" ? result.model : undefined
  });
}
