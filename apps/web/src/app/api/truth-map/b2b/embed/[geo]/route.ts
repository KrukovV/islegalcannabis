import { NextResponse } from "next/server";
import { isLocalAuditHost } from "@/lib/privateAuditHost";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isLocalRequest(request: Request) {
  const host = request.headers.get("host") || new URL(request.url).host;
  return isLocalAuditHost(host);
}

export async function GET(request: Request, { params }: { params: Promise<{ geo: string }> }) {
  if (!isLocalRequest(request)) return new NextResponse(null, { status: 404 });
  const { geo } = await params;
  const { getEvidencePassport, renderEvidencePassportEmbedHtml } = await import("@/truth-map/evidencePassport");
  const passport = getEvidencePassport(geo, new URL(request.url).origin);
  if (!passport) return new NextResponse(null, { status: 404 });
  return new NextResponse(renderEvidencePassportEmbedHtml(passport), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
