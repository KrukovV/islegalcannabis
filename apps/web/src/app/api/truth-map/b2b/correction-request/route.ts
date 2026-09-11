import { NextResponse } from "next/server";
import { isLocalAuditHost } from "@/lib/privateAuditHost";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const host = request.headers.get("host") || new URL(request.url).host;
  if (!isLocalAuditHost(host)) return new NextResponse(null, { status: 404 });
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "CORRECTION_REQUEST_JSON_INVALID" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const { receiveCorrectionRequest } = await import("@/truth-map/correctionRequest");
  try {
    return NextResponse.json(receiveCorrectionRequest(input as Parameters<typeof receiveCorrectionRequest>[0]), {
      status: 202,
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "CORRECTION_REQUEST_INVALID" }, {
      status: 400,
      headers: { "Cache-Control": "no-store" }
    });
  }
}
