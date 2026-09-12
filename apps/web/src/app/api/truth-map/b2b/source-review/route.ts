import { NextResponse } from "next/server";
import { isLocalAuditHost } from "@/lib/privateAuditHost";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isLocalRequest(request: Request) {
  return isLocalAuditHost(request.headers.get("host") || new URL(request.url).host);
}

function isFilterError(message: string) {
  return /^SOURCE_REVIEW_WORKBENCH_(?:UNKNOWN|EMPTY|DUPLICATE)_/.test(message);
}

export async function GET(request: Request) {
  if (!isLocalRequest(request)) return new NextResponse(null, { status: 404 });
  const { buildSourceReviewWorkbench, parseSourceReviewWorkbenchSearchParams } = await import("@/truth-map/sourceReviewWorkbench");
  try {
    const url = new URL(request.url);
    return NextResponse.json(
      buildSourceReviewWorkbench(parseSourceReviewWorkbenchSearchParams(url.searchParams)),
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "SOURCE_REVIEW_WORKBENCH_FAILED";
    return NextResponse.json(
      { error: message },
      { status: isFilterError(message) ? 400 : 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
