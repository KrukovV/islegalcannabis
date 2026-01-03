import { NextResponse } from "next/server";
import { getLawProfile } from "@/lib/lawStore";
import { computeStatus } from "@/lib/status";
import { buildBullets, buildRisks } from "@/lib/summary";
import { paraphrase } from "@/lib/ai/paraphrase";

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
  let body: ParaphraseRequest;
  try {
    body = (await req.json()) as ParaphraseRequest;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const country = (body.country ?? "").trim().toUpperCase();
  const region = body.region?.trim().toUpperCase();
  const locale = body.locale?.trim().toLowerCase() ?? "en";

  if (!country) {
    return NextResponse.json(
      { ok: false, error: "Missing country." },
      { status: 400 }
    );
  }

  const ip = getClientIp(req);
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { ok: false, error: "Rate limit exceeded." },
      { status: 429 }
    );
  }

  const profile = getLawProfile({ country, region });
  if (!profile) {
    return NextResponse.json(
      { ok: false, error: "Unknown jurisdiction." },
      { status: 404 }
    );
  }

  const status = computeStatus(profile);
  const bullets = buildBullets(profile);
  const risksText = buildRisks(profile);

  const result = await paraphrase({
    profile,
    status,
    bullets,
    risksText,
    locale
  });

  const provider = process.env.OPENAI_API_KEY ? "openai" : "disabled";

  return NextResponse.json({
    ok: true,
    text: result.text,
    cached: result.cached,
    provider,
    model: provider === "openai" ? result.model : undefined
  });
}
