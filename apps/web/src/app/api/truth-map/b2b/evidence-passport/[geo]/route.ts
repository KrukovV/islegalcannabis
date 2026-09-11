import { NextResponse } from "next/server";
import { isLocalAuditHost } from "@/lib/privateAuditHost";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isLocalRequest(request: Request) {
  const host = request.headers.get("host") || new URL(request.url).host;
  return isLocalAuditHost(host);
}

export async function GET(request: Request, { params }: { params: Promise<{ geo: string }> }) {
  // API paths are excluded from proxy matching, so this guard must execute
  // before loading any local audit projection or source ledger.
  if (!isLocalRequest(request)) return new NextResponse(null, { status: 404 });
  const { geo } = await params;
  const { getEvidencePassport } = await import("@/truth-map/evidencePassport");
  const passport = getEvidencePassport(geo, new URL(request.url).origin);
  if (!passport) return NextResponse.json({ error: "EVIDENCE_PASSPORT_GEO_NOT_FOUND" }, { status: 404 });
  return NextResponse.json(passport, { headers: { "Cache-Control": "no-store" } });
}
