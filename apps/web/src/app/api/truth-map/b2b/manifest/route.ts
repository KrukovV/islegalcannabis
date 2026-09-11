import { NextResponse } from "next/server";
import { isLocalAuditHost } from "@/lib/privateAuditHost";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const host = request.headers.get("host") || new URL(request.url).host;
  if (!isLocalAuditHost(host)) return new NextResponse(null, { status: 404 });
  const { buildEvidenceDeliveryManifest } = await import("@/truth-map/evidenceDeliveryManifest");
  return NextResponse.json(buildEvidenceDeliveryManifest(), {
    headers: { "Cache-Control": "no-store" }
  });
}
