import { NextResponse } from "next/server";
import { isLocalAuditHost } from "@/lib/privateAuditHost";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ geo: string }> }) {
  const host = request.headers.get("host") || new URL(request.url).host;
  if (!isLocalAuditHost(host)) return new NextResponse(null, { status: 404 });
  const { getStoreLeafTransparency } = await import("@/truth-map/storeLeafTransparency");
  const row = getStoreLeafTransparency((await params).geo);
  if (!row) return NextResponse.json({ error: "WHY_NO_LEAF_GEO_NOT_FOUND" }, { status: 404 });
  return NextResponse.json(row, { headers: { "Cache-Control": "no-store" } });
}
