import { NextResponse } from "next/server";
import { isLocalAuditHost } from "@/lib/privateAuditHost";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function localHost(request: Request) {
  return isLocalAuditHost(request.headers.get("host") || new URL(request.url).host);
}

export async function GET(request: Request) {
  if (!localHost(request)) return new NextResponse(null, { status: 404 });
  const { buildCorrectionReviewQueue } = await import("@/truth-map/correctionRequest");
  try {
    return NextResponse.json({ schemaVersion: 1, localOnly: true, queue: buildCorrectionReviewQueue() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "CORRECTION_REVIEW_QUEUE_INVALID" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request) {
  if (!localHost(request)) return new NextResponse(null, { status: 404 });
  let input: Record<string, unknown>;
  try {
    input = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "CORRECTION_REVIEW_JSON_INVALID" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const { assignCorrectionRequestReview, decideCorrectionRequestReview } = await import("@/truth-map/correctionRequest");
  try {
    const result = input.action === "ASSIGN"
      ? assignCorrectionRequestReview(input as Parameters<typeof assignCorrectionRequestReview>[0])
      : input.action === "DECIDE"
        ? decideCorrectionRequestReview(input as Parameters<typeof decideCorrectionRequestReview>[0])
        : (() => { throw new Error("CORRECTION_REVIEW_ACTION_INVALID"); })();
    return NextResponse.json(result, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "CORRECTION_REVIEW_INVALID" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}

